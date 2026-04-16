import numpy as np
import pytest
from backend.pipeline.prediction_engine import advection_diffusion_step, generate_velocity_field

def test_mass_conservation():
    """Total mass should approximately be conserved (no sources/sinks)."""
    grid_size = 32
    C = np.zeros((grid_size, grid_size))
    C[16, 16] = 1.0  # point source

    vel = generate_velocity_field(grid_size, base_velocity=0.5)

    initial_mass = C.sum()
    # Run several small steps
    for _ in range(10):
        C = advection_diffusion_step(C, vel, diffusion_coeff=5.0, dt=10.0, dx=50.0)

    # Mass may decrease slightly due to boundary losses, but shouldn't increase
    assert C.sum() <= initial_mass * 1.05  # allow 5% tolerance
    assert C.sum() > 0  # shouldn't vanish completely

def test_no_negative_concentration():
    """Concentration should never go negative."""
    grid_size = 32
    C = np.zeros((grid_size, grid_size))
    C[16, 16] = 1.0

    vel = generate_velocity_field(grid_size, base_velocity=0.3)

    for _ in range(50):
        C = advection_diffusion_step(C, vel, diffusion_coeff=5.0, dt=10.0, dx=50.0)

    assert (C >= 0).all()

def test_diffusion_spreads():
    """Pure diffusion should spread the initial blob."""
    grid_size = 32
    C = np.zeros((grid_size, grid_size))
    C[16, 16] = 1.0

    vel = np.zeros((grid_size, grid_size, 2))  # no advection

    for _ in range(20):
        C = advection_diffusion_step(C, vel, diffusion_coeff=10.0, dt=5.0, dx=50.0)

    # Should have spread beyond the initial point
    assert (C > 1e-6).sum() > 1  # more than one cell has concentration
    # Max should have decreased
    assert C.max() < 1.0

def test_velocity_field_shape():
    """Velocity field should have correct shape."""
    vel = generate_velocity_field(64, base_velocity=0.8)
    assert vel.shape == (64, 64, 2)
