"""A financial model for one specific question: can this person reach $1,000,000?

The model is deliberately small and dependency-free. Every number it produces
should be traceable by hand from `params.py` and `engine.py`.
"""

from .params import Params
from .engine import simulate, MonthState, Run, concentration_factor
from .montecarlo import monte_carlo, MonteCarloResult
from .sensitivity import tornado, Swing

__all__ = [
    "Params",
    "simulate",
    "MonthState",
    "Run",
    "concentration_factor",
    "monte_carlo",
    "MonteCarloResult",
    "tornado",
    "Swing",
]
