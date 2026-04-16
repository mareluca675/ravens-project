import torch
import pytest
from backend.pipeline.prediction_engine import TrajectoryLSTM

def test_lstm_forward_shape():
    """LSTM should produce correction field with expected shape."""
    grid_size = 16  # small for testing
    model = TrajectoryLSTM(grid_size=grid_size, compressed_size=32, hidden_size=64, num_layers=1)

    batch_size = 2
    seq_len = 5
    flat = grid_size * grid_size

    conc_seq = torch.randn(batch_size, seq_len, flat)
    aux_seq = torch.randn(batch_size, seq_len, 4)

    correction = model(conc_seq, aux_seq)

    assert correction.shape == (batch_size, seq_len, grid_size, grid_size)

def test_lstm_gradient_flow():
    """Gradients should flow through the LSTM."""
    grid_size = 8
    model = TrajectoryLSTM(grid_size=grid_size, compressed_size=16, hidden_size=32, num_layers=1)

    conc_seq = torch.randn(1, 3, grid_size * grid_size, requires_grad=True)
    aux_seq = torch.randn(1, 3, 4)

    correction = model(conc_seq, aux_seq)
    loss = correction.sum()
    loss.backward()

    assert conc_seq.grad is not None
    assert conc_seq.grad.abs().sum() > 0
