"""
Waste cluster classifier using extracted point cloud features.

Two-branch architecture:
1. Feature branch: processes 11-dimensional feature vector
   Dense(11, 64, ReLU) -> Dense(64, 32, ReLU)
2. Optional CNN branch: processes 64x64 RGB image patch
   Conv2d(3, 32, 3, padding=1) -> ReLU -> MaxPool2d(2)
   Conv2d(32, 64, 3, padding=1) -> ReLU -> MaxPool2d(2)
   Flatten -> Dense(64*16*16, 64, ReLU)
3. Fusion: concatenate -> Dense(96 or 32, 6, Softmax)

Classes: ["plastic", "metal", "organic", "construction", "liquid", "background"]
"""

import logging

import numpy as np
import torch
import torch.nn as nn

logger = logging.getLogger(__name__)

CATEGORIES = ["plastic", "metal", "organic", "construction", "liquid", "background"]

# Canonical ordering of the 11 features extracted by lidar_pipeline.extract_features.
# num_points is excluded because it is a count, not a geometric/radiometric property.
FEATURE_KEYS = [
    "height",
    "obb_volume",
    "point_density",
    "sphericity",
    "planarity",
    "linearity",
    "mean_intensity",
    "std_intensity",
    "mean_r",
    "mean_g",
    "mean_b",
]


def _feature_dict_to_tensor(feature_dicts):
    """Convert a list of feature dicts to a (N, 11) float tensor."""
    rows = []
    for fd in feature_dicts:
        rows.append([float(fd.get(k, 0.0)) for k in FEATURE_KEYS])
    return torch.tensor(rows, dtype=torch.float32)


class WasteFeatureClassifier(nn.Module):
    """Feature-only branch: 11 -> 64 -> 32 -> 6."""

    def __init__(self):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(11, 64),
            nn.ReLU(),
            nn.Linear(64, 32),
            nn.ReLU(),
            nn.Linear(32, len(CATEGORIES)),
        )

    def forward(self, x):
        logits = self.net(x)
        return torch.softmax(logits, dim=-1)


class WasteFusionClassifier(nn.Module):
    """Two-branch classifier: feature branch + CNN branch on 64x64 RGB patches."""

    def __init__(self):
        super().__init__()

        # Feature branch: 11 -> 64 -> 32
        self.feature_branch = nn.Sequential(
            nn.Linear(11, 64),
            nn.ReLU(),
            nn.Linear(64, 32),
            nn.ReLU(),
        )

        # CNN branch: 64x64 RGB -> 64-dim
        self.cnn_branch = nn.Sequential(
            nn.Conv2d(3, 32, kernel_size=3, padding=1),
            nn.ReLU(),
            nn.MaxPool2d(2),
            nn.Conv2d(32, 64, kernel_size=3, padding=1),
            nn.ReLU(),
            nn.MaxPool2d(2),
            nn.Flatten(),
            nn.Linear(64 * 16 * 16, 64),
            nn.ReLU(),
        )

        # Fusion head: 32 (features) + 64 (cnn) = 96 -> 6
        self.head = nn.Linear(96, len(CATEGORIES))

    def forward(self, features, image_patch):
        """
        Parameters
        ----------
        features : Tensor (N, 11)
        image_patch : Tensor (N, 3, 64, 64)
        """
        feat_out = self.feature_branch(features)
        cnn_out = self.cnn_branch(image_patch)
        fused = torch.cat([feat_out, cnn_out], dim=-1)
        logits = self.head(fused)
        return torch.softmax(logits, dim=-1)


def train_classifier(model, train_features, train_labels, epochs=50, lr=0.001):
    """Train a WasteFeatureClassifier and return the loss history.

    Parameters
    ----------
    model : WasteFeatureClassifier
    train_features : Tensor (N, 11)
    train_labels : Tensor (N,) int64 class indices
    epochs : int
    lr : float

    Returns
    -------
    list[float]
        Per-epoch loss values.
    """
    criterion = nn.CrossEntropyLoss()
    optimizer = torch.optim.Adam(model.parameters(), lr=lr)

    # CrossEntropyLoss expects raw logits, but our model outputs softmax.
    # We apply log to convert softmax probabilities to log-probs, then use
    # NLLLoss-equivalent behavior.  Alternatively, we can bypass the softmax
    # during training.  For simplicity, use log + nll_loss.
    loss_history = []
    model.train()

    for epoch in range(epochs):
        optimizer.zero_grad()
        probs = model(train_features)
        # CrossEntropyLoss on log-probabilities is equivalent to NLLLoss.
        log_probs = torch.log(probs + 1e-8)
        loss = nn.functional.nll_loss(log_probs, train_labels)
        loss.backward()
        optimizer.step()

        loss_val = loss.item()
        loss_history.append(loss_val)
        if (epoch + 1) % 10 == 0 or epoch == 0:
            logger.info("Epoch %d/%d — loss: %.4f", epoch + 1, epochs, loss_val)

    return loss_history


def classify_clusters(model, feature_dicts):
    """Run inference on a list of feature dicts from lidar_pipeline.extract_features.

    Parameters
    ----------
    model : WasteFeatureClassifier
    feature_dicts : list[dict]

    Returns
    -------
    list[tuple[str, float]]
        (category_name, confidence) for each input cluster.
    """
    if not feature_dicts:
        return []

    features = _feature_dict_to_tensor(feature_dicts)

    model.eval()
    with torch.no_grad():
        probs = model(features)

    results = []
    for row in probs:
        idx = int(torch.argmax(row))
        results.append((CATEGORIES[idx], float(row[idx])))

    return results


def generate_training_data(n_samples=500):
    """Generate synthetic training data with characteristic distributions per category.

    Returns
    -------
    tuple[Tensor, Tensor]
        (features (N, 11), labels (N,))
    """
    rng = np.random.default_rng(42)
    samples_per_class = n_samples // len(CATEGORIES)

    all_features = []
    all_labels = []

    for class_idx, category in enumerate(CATEGORIES):
        n = samples_per_class
        # Defaults: moderate random values
        height = rng.uniform(0.05, 1.0, n)
        obb_volume = rng.uniform(0.01, 1.0, n)
        point_density = rng.uniform(10, 500, n)
        sphericity = rng.uniform(0.1, 0.5, n)
        planarity = rng.uniform(0.1, 0.5, n)
        linearity = rng.uniform(0.1, 0.5, n)
        mean_intensity = rng.uniform(40, 120, n)
        std_intensity = rng.uniform(5, 30, n)
        mean_r = rng.uniform(50, 200, n)
        mean_g = rng.uniform(50, 200, n)
        mean_b = rng.uniform(50, 200, n)

        if category == "plastic":
            planarity = rng.uniform(0.6, 0.9, n)
            sphericity = rng.uniform(0.05, 0.2, n)
            height = rng.uniform(0.01, 0.05, n)

        elif category == "metal":
            sphericity = rng.uniform(0.4, 0.8, n)
            height = rng.uniform(0.3, 0.8, n)
            mean_intensity = rng.uniform(100, 150, n)

        elif category == "organic":
            sphericity = rng.uniform(0.2, 0.5, n)
            height = rng.uniform(0.05, 0.2, n)
            # Brown color signature
            mean_r = rng.uniform(120, 180, n)
            mean_g = rng.uniform(80, 130, n)
            mean_b = rng.uniform(40, 80, n)

        elif category == "construction":
            sphericity = rng.uniform(0.1, 0.3, n)
            obb_volume = rng.uniform(0.5, 5.0, n)
            # Grey color signature
            grey = rng.uniform(100, 160, n)
            mean_r = grey + rng.uniform(-10, 10, n)
            mean_g = grey + rng.uniform(-10, 10, n)
            mean_b = grey + rng.uniform(-10, 10, n)

        elif category == "liquid":
            height = rng.uniform(0.001, 0.02, n)
            planarity = rng.uniform(0.7, 0.95, n)
            # Blue color signature
            mean_r = rng.uniform(30, 80, n)
            mean_g = rng.uniform(60, 120, n)
            mean_b = rng.uniform(150, 230, n)

        # background: keep random defaults

        features = np.column_stack([
            height, obb_volume, point_density, sphericity, planarity,
            linearity, mean_intensity, std_intensity, mean_r, mean_g, mean_b,
        ])
        all_features.append(features)
        all_labels.append(np.full(n, class_idx, dtype=np.int64))

    all_features = np.concatenate(all_features, axis=0)
    all_labels = np.concatenate(all_labels, axis=0)

    # Shuffle
    perm = rng.permutation(len(all_labels))
    all_features = all_features[perm]
    all_labels = all_labels[perm]

    return (
        torch.tensor(all_features, dtype=torch.float32),
        torch.tensor(all_labels, dtype=torch.long),
    )
