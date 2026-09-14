"""Which lever actually moves the outcome?

You have roughly 2,000 working hours before the deadline. This module exists to
stop you spending them on the wrong variable. It walks each assumption from a
pessimistic to an optimistic value -- real alternatives, not a lazy plus-or-
minus-twenty-percent -- and re-measures the probability of reaching the goal.

The ranking it produces is the plan. Everything below the top few lines is
noise you can safely ignore for a year.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Dict, List, Optional, Tuple

from .montecarlo import monte_carlo, percentile
from .params import Params

# (pessimistic, optimistic) -- each end a value you could plausibly wake up to.
DEFAULT_RANGES: Dict[str, Tuple[float, float]] = {
    "price": (3_000.0, 12_000.0),
    "setup_fee": (0.0, 6_000.0),
    "delivery_cost_pct": (0.60, 0.30),
    "reply_rate": (0.008, 0.045),
    "call_rate": (0.35, 0.75),
    "close_rate": (0.10, 0.35),
    "touches_per_hour": (6.0, 25.0),
    "monthly_churn": (0.10, 0.02),
    "hours_per_week": (10.0, 30.0),
    "owner_hours_per_client": (10.0, 3.0),
    "self_managed_clients": (3, 8),
    "ops_cost_month": (6_500.0, 3_000.0),
    "exit_multiple": (1.5, 4.0),
    "exit_probability": (0.20, 0.70),
}


@dataclass
class Swing:
    name: str
    low_value: float
    high_value: float
    metric_low: float
    metric_high: float

    @property
    def swing(self) -> float:
        return self.metric_high - self.metric_low

    @property
    def magnitude(self) -> float:
        return abs(self.swing)


def p_goal_metric(p: Params, trials: int, seed: int) -> float:
    return monte_carlo(p, trials=trials, seed=seed).p_goal


def median_wealth_metric(p: Params, trials: int, seed: int) -> float:
    return percentile(monte_carlo(p, trials=trials, seed=seed).wealth, 50)


def tornado(
    p: Params,
    ranges: Optional[Dict[str, Tuple[float, float]]] = None,
    trials: int = 2_500,
    seed: int = 20260914,
    metric: Callable[[Params, int, int], float] = p_goal_metric,
) -> List[Swing]:
    """One-at-a-time sensitivity, ranked by how much each assumption matters.

    The same seed is used for every variant so the differences are the
    parameters talking, not the random number generator.
    """
    p.validate()
    ranges = ranges if ranges is not None else DEFAULT_RANGES

    swings: List[Swing] = []
    for name, (low, high) in ranges.items():
        if not hasattr(p, name):
            raise ValueError(f"unknown parameter {name!r}")
        m_low = metric(p.with_(**{name: low}), trials, seed)
        m_high = metric(p.with_(**{name: high}), trials, seed)
        swings.append(
            Swing(
                name=name,
                low_value=low,
                high_value=high,
                metric_low=m_low,
                metric_high=m_high,
            )
        )

    swings.sort(key=lambda s: s.magnitude, reverse=True)
    return swings


def render_tornado(swings: List[Swing], width: int = 34, as_pct: bool = True) -> str:
    """A text tornado chart. Ugly, fast, and readable over SSH."""
    if not swings:
        return "(no parameters)"
    top = max(s.magnitude for s in swings) or 1.0

    def fmt(v: float) -> str:
        return f"{v:6.1%}" if as_pct else f"{v:>10,.0f}"

    def num(v: float) -> str:
        return f"{v:g}"

    name_w = max(len(s.name) for s in swings)
    lines = []
    for s in swings:
        bar = "#" * max(1, int(round(width * s.magnitude / top)))
        lines.append(
            f"{s.name:<{name_w}}  {num(s.low_value):>7} -> {num(s.high_value):<7} "
            f"{fmt(s.metric_low)} -> {fmt(s.metric_high)}  {bar}"
        )
    return "\n".join(lines)
