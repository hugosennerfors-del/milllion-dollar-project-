"""Run the business ten thousand times and count how often it works.

A single projection is a story. The only number worth acting on is the share of
plausible futures in which you actually end up with the money -- and the share
in which you end up with nothing, which most plans never print at all.

Correlation is the thing to get right here. Draws are tied to one latent
`operator` factor, because a person who writes good cold email also runs good
calls and keeps clients longer. Drawing those independently would let the good
and bad luck cancel, compress both tails, and produce a comfortable, useless
distribution.
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass
from typing import Callable, List, Optional, Sequence

from .engine import Run, simulate
from .params import Params


def percentile(values: Sequence[float], q: float) -> float:
    """Linear-interpolated percentile. `q` in [0, 100]."""
    if not values:
        raise ValueError("percentile of an empty sequence")
    if not 0.0 <= q <= 100.0:
        raise ValueError(f"q must be in [0, 100], got {q!r}")
    ordered = sorted(values)
    if len(ordered) == 1:
        return float(ordered[0])
    pos = (q / 100.0) * (len(ordered) - 1)
    low = math.floor(pos)
    high = math.ceil(pos)
    if low == high:
        return float(ordered[low])
    return float(ordered[low] + (ordered[high] - ordered[low]) * (pos - low))


def _lognormal(rng: random.Random, sigma: float) -> float:
    """A positive multiplier with mean 1.0 and spread `sigma`."""
    if sigma <= 0:
        return 1.0
    return math.exp(rng.gauss(-0.5 * sigma * sigma, sigma))


def _clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


def draw(p: Params, rng: random.Random) -> Params:
    """Sample one plausible version of reality."""
    operator = _lognormal(rng, p.operator_sigma)
    # Spread the operator effect across the three funnel stages so that the
    # *overall* touch-to-client conversion scales by `operator`, not its cube.
    stage = operator ** (1.0 / 3.0)

    # Better operators also hold price and lose fewer clients, but only partly:
    # half the variance is the operator, half is the market and plain luck.
    price_mult = (operator ** 0.5) * _lognormal(rng, p.price_sigma)
    churn_mult = _lognormal(rng, p.churn_sigma) / (operator ** 0.5)

    return p.with_(
        reply_rate=_clamp(p.reply_rate * stage, 0.0005, 0.5),
        call_rate=_clamp(p.call_rate * stage, 0.02, 0.95),
        close_rate=_clamp(p.close_rate * stage, 0.01, 0.85),
        price=max(500.0, p.price * price_mult),
        monthly_churn=_clamp(p.monthly_churn * churn_mult, 0.005, 0.40),
        delivery_cost_pct=_clamp(
            p.delivery_cost_pct * _lognormal(rng, p.delivery_sigma), 0.05, 0.90
        ),
        exit_multiple=max(0.0, p.exit_multiple * _lognormal(rng, p.multiple_sigma)),
    )


@dataclass
class MonteCarloResult:
    trials: int
    goal: float
    p_goal: float
    p_goal_cash_only: float
    p_ruin: float
    wealth: List[float]
    cash: List[float]
    final_clients: List[float]
    sde: List[float]

    def pct(self, q: float) -> float:
        return percentile(self.wealth, q)

    def summary(self) -> str:
        lines = [
            f"trials                      {self.trials:,}",
            f"P(reach ${self.goal:,.0f})        {self.p_goal:6.1%}",
            f"P(reach it in cash alone)   {self.p_goal_cash_only:6.1%}",
            f"P(run out of money)         {self.p_ruin:6.1%}",
            "",
            "outcome distribution (cash + after-tax sale proceeds)",
            f"  p10   ${self.pct(10):>12,.0f}",
            f"  p25   ${self.pct(25):>12,.0f}",
            f"  p50   ${self.pct(50):>12,.0f}",
            f"  p75   ${self.pct(75):>12,.0f}",
            f"  p90   ${self.pct(90):>12,.0f}",
            f"  p99   ${self.pct(99):>12,.0f}",
            "",
            f"median clients at horizon   {percentile(self.final_clients, 50):.0f}",
            f"median trailing-year SDE    ${percentile(self.sde, 50):,.0f}",
        ]
        return "\n".join(lines)


def monte_carlo(
    p: Params,
    trials: int = 10_000,
    seed: int = 20260914,
    on_run: Optional[Callable[[Run], None]] = None,
) -> MonteCarloResult:
    """Sample `trials` futures. Seeded, so results are reproducible."""
    p.validate()
    rng = random.Random(seed)

    wealth: List[float] = []
    cash: List[float] = []
    finals: List[float] = []
    sdes: List[float] = []
    hits = 0
    hits_cash = 0
    ruins = 0

    for _ in range(trials):
        run = simulate(draw(p, rng), rng)
        wealth.append(run.wealth)
        cash.append(run.cash)
        finals.append(run.final_clients)
        sdes.append(run.sde)
        hits += run.wealth >= p.goal
        hits_cash += run.cash >= p.goal
        ruins += run.ruined
        if on_run is not None:
            on_run(run)

    return MonteCarloResult(
        trials=trials,
        goal=p.goal,
        p_goal=hits / trials,
        p_goal_cash_only=hits_cash / trials,
        p_ruin=ruins / trials,
        wealth=wealth,
        cash=cash,
        final_clients=finals,
        sde=sdes,
    )
