"""Named plans, and the two analyses that actually decide what you do Monday.

`price_ladder` exists to stop the model giving naive advice. A one-at-a-time
tornado will always shout "charge more", because it raises price while holding
conversion fixed -- which is not a thing that happens. Here, raising price costs
you close rate and prospecting throughput, and the question becomes the real
one: how far up does it pay to go before the funnel starves?

`steady_state` answers the question in the other direction: forget the path,
what does the business have to *look like* to be worth a million dollars, and
can you even hold it at twenty hours a week?
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Dict, List, Optional, Sequence

from .engine import _funnel, _hires_needed, _owner_ops_hours, simulate
from .montecarlo import monte_carlo, percentile
from .params import Params


# ---------------------------------------------------------------- scenarios --

def with_craft(
    p: Params,
    reply_mult: float = 1.0,
    close_mult: float = 1.0,
    touch_mult: float = 1.0,
) -> Params:
    """Apply sales-craft improvements as multipliers on whatever you have.

    Multipliers rather than absolute values, for two reasons. They compose
    correctly with a price change that has already moved the close rate, and
    they keep the size of the claim visible: `reply_mult=1.2` is obviously a
    20% improvement, while `reply_rate=0.024` hides that it is the same thing.

    Note what is *not* operator luck: `touch_mult` is tooling, list hygiene and
    sequencing. It is a purchase, not a talent, so it does not count against
    your implied operator percentile.
    """
    return p.with_(
        reply_rate=min(0.5, p.reply_rate * reply_mult),
        close_rate=min(0.85, p.close_rate * close_mult),
        touches_per_hour=max(1.0, p.touches_per_hour * touch_mult),
    )


def scenarios() -> Dict[str, Params]:
    """The plans worth comparing, all on the same 24-month clock.

    Ordered roughly by how much of the answer they get right. The interesting
    result is that the scenario built on *sales craft* beats the one built on
    *price*, which is the opposite of what the one-at-a-time tornado suggests
    and the reason `elasticity_sweep` exists.
    """
    base = Params()
    return {
        # Exactly the intake answers, executed competently.
        "baseline": base,

        # The reflex move: more volume at the same craft. Included because it
        # is what most people actually do, and it deserves to be measured
        # rather than dismissed.
        "grind_harder": base.with_(touches_per_hour=20.0, hours_per_week=25.0),

        # Move upmarket, paying the full cost in conversion, cycle and meeting
        # load. Fragile: see `elasticity_sweep`.
        "premium_12k": price_adjusted(base, 12_000.0),

        # Delegate at three clients instead of five. Costs money early, buys
        # back the selling hours that compound.
        "hire_early": base.with_(self_managed_clients=3),

        # Retention instead of acquisition: same funnel, half the churn.
        "keep_clients": base.with_(monthly_churn=0.027),

        # Lean on the one asset actually declared at intake. Better targeting,
        # better copy, better call control, better tooling. Costs nothing but
        # skill, and moves three multiplicative terms at once.
        "sales_craft": with_craft(base, reply_mult=1.20, close_mult=1.10, touch_mult=1.33),

        # The recommendation. Craft first, delegate early, defend retention,
        # and only a modest move upmarket -- because the price lever is the one
        # that breaks if the elasticity guess is wrong.
        "recommended": with_craft(
            price_adjusted(base, 10_000.0),
            reply_mult=1.20, close_mult=1.10, touch_mult=1.30,
        ).with_(
            self_managed_clients=3,
            monthly_churn=0.045,
            delivery_cost_pct=0.42,
        ),

        # The same plan with twelve more months. Time is the cheapest variable
        # in the entire model, and the only one the deadline forbids.
        "recommended_36mo": with_craft(
            price_adjusted(base, 10_000.0),
            reply_mult=1.20, close_mult=1.10, touch_mult=1.30,
        ).with_(
            self_managed_clients=3,
            monthly_churn=0.045,
            delivery_cost_pct=0.42,
            horizon_months=36,
        ),
    }


# ------------------------------------------------------------- price ladder --

def price_adjusted(
    p: Params,
    price: float,
    close_elasticity: float = 0.60,
    touch_elasticity: float = 0.35,
    cycle_elasticity: float = 0.45,
    call_hours_elasticity: float = 0.50,
) -> Params:
    """Re-price the offer and charge it for what higher prices really cost.

    Doubling your price does not leave the funnel untouched. Fewer companies
    can write the cheque, buying committees get larger, and each prospect needs
    real research rather than a merge field. Both effects are modelled as power
    laws in the price ratio:

        close_rate         *= ratio ** -0.60
        touches_per_hour   *= ratio ** -0.35
        sales_cycle_months *= ratio ** +0.45
        hours_per_call     *= ratio ** +0.50

    The last two are the ones people forget. A bigger deal is not just harder
    to win, it is *slower* to win and takes more meetings to win -- and against
    a fixed 24-month deadline, slow is a cost that compounds.

    The elasticities are judgement, not measurement -- which is precisely why
    they are arguments you can override once you have your own numbers, and why
    `elasticity_sweep` exists to show you where the advice would flip.
    """
    if price <= 0:
        raise ValueError("price must be > 0")
    ratio = price / p.price
    return p.with_(
        price=price,
        close_rate=min(0.85, p.close_rate * ratio ** -close_elasticity),
        touches_per_hour=max(1.0, p.touches_per_hour * ratio ** -touch_elasticity),
        sales_cycle_months=max(1.0, p.sales_cycle_months * ratio ** cycle_elasticity),
        hours_per_call=max(0.25, p.hours_per_call * ratio ** call_hours_elasticity),
    )


@dataclass
class LadderRung:
    price: float
    close_rate: float
    touches_per_hour: float
    cycle_months: float
    p_goal: float
    median_wealth: float
    median_clients: float


def price_ladder(
    p: Params,
    prices: Sequence[float] = (3_000, 4_500, 6_000, 8_000, 10_000, 12_000, 15_000, 20_000, 30_000),
    close_elasticity: float = 0.60,
    touch_elasticity: float = 0.35,
    trials: int = 4_000,
    seed: int = 20260914,
) -> List[LadderRung]:
    """Walk the price up, paying the conversion penalty at every rung."""
    rungs: List[LadderRung] = []
    for price in prices:
        variant = price_adjusted(p, float(price), close_elasticity, touch_elasticity)
        mc = monte_carlo(variant, trials=trials, seed=seed)
        rungs.append(
            LadderRung(
                price=float(price),
                close_rate=variant.close_rate,
                touches_per_hour=variant.touches_per_hour,
                cycle_months=variant.sales_cycle_months,
                p_goal=mc.p_goal,
                median_wealth=percentile(mc.wealth, 50),
                median_clients=percentile(mc.final_clients, 50),
            )
        )
    return rungs


# -------------------------------------------------------------- steady state --

@dataclass
class SteadyState:
    """What the business looks like parked at a given client count."""

    clients: int
    price: float
    hires: int
    monthly_revenue: float
    monthly_profit: float
    annual_sde: float
    exit_value: float
    owner_ops_hours: float
    sales_hours: float
    churn_replacement_needed: float
    new_clients_possible: float

    @property
    def holdable(self) -> bool:
        """Can you win new clients at least as fast as you lose them?

        If not, this client count is a peak you pass through on the way back
        down -- not a business you can hold. This is the check that separates a
        target from a fantasy, and almost nothing on the internet runs it.
        """
        return self.new_clients_possible >= self.churn_replacement_needed

    @property
    def headroom(self) -> float:
        """New clients per month above what churn takes. Negative means shrinking."""
        return self.new_clients_possible - self.churn_replacement_needed


def steady_state(p: Params, clients: int) -> SteadyState:
    """Economics and feasibility of holding exactly `clients` clients."""
    if clients < 0:
        raise ValueError("clients cannot be negative")

    hires = _hires_needed(clients, p)
    ops_hours = _owner_ops_hours(clients, hires, p)
    sales_hours = max(0.0, p.hours_per_month - ops_hours)
    _, _, new_possible = _funnel(sales_hours, p)

    revenue = clients * p.price
    profit = (
        revenue
        - revenue * p.delivery_cost_pct
        - hires * p.ops_cost_month
        - p.fixed_costs_month
    )
    sde = profit * 12.0

    return SteadyState(
        clients=clients,
        price=p.price,
        hires=hires,
        monthly_revenue=revenue,
        monthly_profit=profit,
        annual_sde=sde,
        exit_value=max(0.0, sde) * p.exit_multiple,
        owner_ops_hours=ops_hours,
        sales_hours=sales_hours,
        churn_replacement_needed=clients * p.monthly_churn,
        new_clients_possible=new_possible,
    )


def million_dollar_business(
    p: Params,
    prices: Sequence[float] = (4_000, 6_000, 8_000, 10_000, 15_000, 20_000),
    max_clients: int = 60,
) -> List[dict]:
    """For each price, the smallest client count whose sale clears the goal.

    Reports whether that client count is holdable at your hours. A target you
    cannot hold is not a target.
    """
    out = []
    for price in prices:
        variant = p.with_(price=float(price))
        found: Optional[SteadyState] = None
        for n in range(1, max_clients + 1):
            ss = steady_state(variant, n)
            if ss.exit_value >= p.goal:
                found = ss
                break
        out.append(
            {
                "price": float(price),
                "clients_needed": found.clients if found else None,
                "monthly_revenue": found.monthly_revenue if found else None,
                "annual_sde": found.annual_sde if found else None,
                "exit_value": found.exit_value if found else None,
                "owner_ops_hours": found.owner_ops_hours if found else None,
                "sales_hours": found.sales_hours if found else None,
                "holdable": found.holdable if found else None,
                "headroom": found.headroom if found else None,
            }
        )
    return out


# ------------------------------------------------------- robustness checks --

def elasticity_sweep(
    p: Params,
    prices: Sequence[float] = (6_000, 12_000, 20_000, 30_000),
    close_elasticities: Sequence[float] = (0.3, 0.6, 0.9, 1.2, 1.5),
    trials: int = 3_000,
    seed: int = 20260914,
) -> List[dict]:
    """Where does the "move upmarket" advice stop being true?

    The price recommendation rests on an elasticity I guessed. That is the
    weakest joint in the whole model, so it gets tested rather than defended:
    if the answer only holds at the elasticity I happened to pick, it is not an
    answer, it is a preference.
    """
    rows = []
    for e in close_elasticities:
        row = {"close_elasticity": e}
        for price in prices:
            variant = price_adjusted(p, float(price), close_elasticity=e)
            row[f"p{int(price)}"] = monte_carlo(variant, trials=trials, seed=seed).p_goal
        rows.append(row)
    return rows


def compare(
    named: Optional[Dict[str, Params]] = None,
    trials: int = 8_000,
    seed: int = 20260914,
) -> List[dict]:
    """Run every scenario on the same seed and line the results up."""
    named = named if named is not None else scenarios()
    out = []
    for name, p in named.items():
        mc = monte_carlo(p, trials=trials, seed=seed)
        out.append(
            {
                "name": name,
                "price": p.price,
                "months": p.horizon_months,
                "p_goal": mc.p_goal,
                "p10": percentile(mc.wealth, 10),
                "median": percentile(mc.wealth, 50),
                "p90": percentile(mc.wealth, 90),
                "p_under_100k": sum(1 for w in mc.wealth if w < 100_000) / len(mc.wealth),
                "median_clients": percentile(mc.final_clients, 50),
                "implied_operator": implied_operator_percentile(p),
            }
        )
    return out


# --------------------------------------------------------- honesty checks --

def _normal_cdf(z: float) -> float:
    return 0.5 * (1.0 + math.erf(z / math.sqrt(2.0)))


def implied_operator_percentile(p: Params, base: Optional[Params] = None) -> float:
    """How good do you have to be for this scenario's funnel to be your median?

    The trap this catches: a plan built by nudging reply rate, close rate and
    call rate each "just a little" in the good direction. Multiplied together,
    three modest nudges become an assumption that you are a once-in-a-cohort
    operator -- and the Monte Carlo then adds luck *on top of* that, which
    double-counts the good fortune and prints a comfortable, false number.

    Returns the percentile of the operator distribution whose funnel matches
    this one. Anything past ~85% should be argued for out loud, not assumed.
    """
    base = base if base is not None else Params()
    ratio = (
        (p.reply_rate / base.reply_rate)
        * (p.call_rate / base.call_rate)
        * (p.close_rate / base.close_rate)
    )
    if ratio <= 0:
        return 0.0
    sigma = base.operator_sigma
    z = (math.log(ratio) + 0.5 * sigma * sigma) / sigma
    return _normal_cdf(z)


def audit(named: Optional[Dict[str, Params]] = None) -> List[dict]:
    """Report the operator percentile every scenario quietly assumes."""
    named = named if named is not None else scenarios()
    base = Params()
    rows = []
    for name, p in named.items():
        pct = implied_operator_percentile(p, base)
        rows.append(
            {
                "name": name,
                "implied_operator_percentile": pct,
                "verdict": (
                    "stacked" if pct >= 0.95
                    else "optimistic" if pct >= 0.85
                    else "fair"
                ),
            }
        )
    return rows
