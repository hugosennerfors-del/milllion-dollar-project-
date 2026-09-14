"""The month-by-month simulation.

One idea drives the whole thing: **your hours are the constraint, not your
pipeline.** Hours spent servicing clients are hours not spent selling, so a
part-time service business throttles its own growth long before it runs out of
prospects. Every honest version of this plan is a fight against that ceiling.

Read `_month` top to bottom and you have read the model.
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass, field
from typing import List, Optional

from .params import Params


@dataclass
class MonthState:
    """One month of the business, fully itemised."""

    month: int
    clients_start: int
    new_clients: int
    churned_clients: int
    clients_end: int
    hires: int
    owner_ops_hours: float
    sales_hours: float
    touches: float
    booked_calls: float
    revenue: float
    delivery_cost: float
    ops_cost: float
    fixed_cost: float
    profit_pretax: float
    tax: float
    cash: float


@dataclass
class Run:
    """The outcome of a single simulated life of the business."""

    params: Params
    months: List[MonthState] = field(default_factory=list)
    ruined: bool = False
    ruin_month: Optional[int] = None
    sold: bool = False
    sde: float = 0.0
    exit_value: float = 0.0
    exit_proceeds: float = 0.0
    concentration: float = 1.0

    @property
    def cash(self) -> float:
        return self.months[-1].cash if self.months else self.params.starting_capital

    @property
    def wealth(self) -> float:
        """Cash in hand plus after-tax proceeds from selling the business."""
        return self.cash + self.exit_proceeds

    @property
    def peak_clients(self) -> int:
        return max((m.clients_end for m in self.months), default=0)

    @property
    def final_clients(self) -> int:
        return self.months[-1].clients_end if self.months else 0

    @property
    def hit_goal(self) -> bool:
        return self.wealth >= self.params.goal


def _poisson(rng: random.Random, lam: float) -> int:
    """Knuth's algorithm. Exact, and lambda here is always small (~0-5)."""
    if lam <= 0.0:
        return 0
    if lam > 30.0:  # guard against the underflow Knuth hits on large lambda
        return max(0, round(rng.gauss(lam, math.sqrt(lam))))
    target = math.exp(-lam)
    k, p = 0, 1.0
    while True:
        p *= rng.random()
        if p <= target:
            return k
        k += 1


def _binomial(rng: random.Random, n: int, p: float) -> int:
    """Sum of Bernoullis. n is tiny here (client counts), so exactness is free."""
    if n <= 0 or p <= 0.0:
        return 0
    if p >= 1.0:
        return n
    return sum(1 for _ in range(n) if rng.random() < p)


def concentration_factor(clients: float, p: Params) -> float:
    """How much of the headline multiple a buyer will actually pay.

    A business with four clients is four cancellation clauses wearing a trench
    coat, and acquirers price it accordingly. Ramps linearly from
    `concentration_floor` at one client to full value at `concentration_full_at`.

    This is the correction that stops the model recommending you bet everything
    on three enormous retainers.
    """
    if clients <= 0:
        return 0.0
    if clients >= p.concentration_full_at:
        return 1.0
    span = max(1, p.concentration_full_at - 1)
    progress = (clients - 1) / span
    return p.concentration_floor + (1.0 - p.concentration_floor) * progress


def _hires_needed(clients: int, p: Params) -> int:
    """How many ops people this client count requires."""
    overflow = max(0, clients - p.self_managed_clients)
    return math.ceil(overflow / p.ops_capacity_clients)


def _owner_ops_hours(clients: int, hires: int, p: Params) -> float:
    """Owner hours consumed by servicing, after delegation.

    Delegation is not free: `oversight_factor` of the load stays with you.
    """
    overflow = max(0, clients - p.self_managed_clients)
    delegated = min(overflow, hires * p.ops_capacity_clients)
    direct = clients - delegated
    return (
        direct * p.owner_hours_per_client
        + delegated * p.owner_hours_per_client * p.oversight_factor
    )


def _funnel(sales_hours: float, p: Params) -> tuple:
    """Split sales hours between prospecting and taking the calls it generates.

    Every hour of prospecting creates `k` hours of call obligation. You cannot
    spend the same hour twice, so the split solves:

        prospect + call_time = sales_hours
        call_time = prospect * k

    giving prospect = sales_hours / (1 + k). Forgetting this is the classic way
    a pipeline projection overstates itself by 20%.
    """
    if sales_hours <= 0:
        return 0.0, 0.0, 0.0
    k = p.touches_per_hour * p.reply_rate * p.call_rate * p.hours_per_call
    prospect_hours = sales_hours / (1.0 + k)
    touches = prospect_hours * p.touches_per_hour
    booked_calls = touches * p.reply_rate * p.call_rate
    expected_new = booked_calls * p.close_rate
    return touches, booked_calls, expected_new


def simulate(p: Params, rng: Optional[random.Random] = None) -> Run:
    """Run the business for `p.horizon_months`.

    With `rng` omitted the model is deterministic and every quantity is an
    expected value -- good for sensitivity analysis, and a lie about any single
    future. With `rng` supplied, client arrivals are Poisson and churn is
    binomial, which is what actually matters when you have four clients and two
    of them leave in the same month.
    """
    p.validate()
    run = Run(params=p)

    clients = 0
    hires = 0
    cash = p.starting_capital
    loss_carryforward = 0.0
    pretax_history: List[float] = []

    # Deals worked in month t are signed in month t + lag. Anything scheduled
    # past the horizon is pipeline you built and never got paid for -- which is
    # exactly what a long sales cycle costs you against a fixed deadline.
    lag = max(0, int(round(p.sales_cycle_months)) - 1)
    arrivals = [0.0] * (p.horizon_months + lag + 2)

    for month in range(1, p.horizon_months + 1):
        clients_start = clients

        # --- staffing -------------------------------------------------------
        # Ratchet: you do not fire an ops person the month a client churns.
        # Gated on affordability -- you cannot hire your way out of a cash hole,
        # which is exactly the trap a thin balance sheet sets.
        needed = _hires_needed(clients_start, p)
        if needed > hires:
            affordable = cash >= (needed - hires) * p.ops_cost_month * 2.0
            if affordable:
                hires = needed
        hires = max(hires, 0)

        # --- capacity -------------------------------------------------------
        ops_hours = _owner_ops_hours(clients_start, hires, p)
        sales_hours = max(0.0, p.hours_per_month - ops_hours)

        # --- pipeline -------------------------------------------------------
        touches, booked_calls, expected_new = _funnel(sales_hours, p)

        arrivals[month + lag] += expected_new
        landing = arrivals[month]

        if rng is None:
            new_clients = landing
            churned = clients_start * p.monthly_churn
        else:
            new_clients = _poisson(rng, landing)
            churned = _binomial(rng, clients_start, p.monthly_churn)

        retained = clients_start - churned
        clients_end = retained + new_clients

        # --- money ----------------------------------------------------------
        # Clients who churned this month are not billed again; new clients pay
        # their first retainer plus the setup fee on signature.
        revenue = retained * p.price + new_clients * (p.price + p.setup_fee)
        delivery_cost = revenue * p.delivery_cost_pct
        ops_cost = hires * p.ops_cost_month
        fixed_cost = p.fixed_costs_month
        profit_pretax = revenue - delivery_cost - ops_cost - fixed_cost

        # Tax on profit, with losses carried forward to offset later profits.
        if profit_pretax > 0:
            offset = min(loss_carryforward, profit_pretax)
            loss_carryforward -= offset
            tax = (profit_pretax - offset) * p.income_tax_rate
        else:
            loss_carryforward += -profit_pretax
            tax = 0.0

        cash += profit_pretax - tax
        pretax_history.append(profit_pretax)

        run.months.append(
            MonthState(
                month=month,
                clients_start=int(clients_start) if rng is not None else clients_start,
                new_clients=new_clients,
                churned_clients=churned,
                clients_end=clients_end,
                hires=hires,
                owner_ops_hours=ops_hours,
                sales_hours=sales_hours,
                touches=touches,
                booked_calls=booked_calls,
                revenue=revenue,
                delivery_cost=delivery_cost,
                ops_cost=ops_cost,
                fixed_cost=fixed_cost,
                profit_pretax=profit_pretax,
                tax=tax,
                cash=cash,
            )
        )

        clients = clients_end

        # --- ruin -----------------------------------------------------------
        # Out of cash means contractors go unpaid, which means clients leave.
        # There is no recovering from it inside this model, and rarely outside.
        if cash < 0:
            run.ruined = True
            run.ruin_month = month
            break

    # --- what the business is worth on the way out --------------------------
    if not run.ruined:
        trailing = pretax_history[-12:]
        if trailing:
            # Annualise if the horizon is shorter than a buyer's lookback.
            run.sde = sum(trailing) * (12.0 / len(trailing))
        run.concentration = concentration_factor(clients, p)
        run.exit_value = max(0.0, run.sde) * p.exit_multiple * run.concentration

        if rng is None:
            # Deterministic mode reports the *expected* exit: the value times
            # the odds you actually close a sale. It is not money you have.
            run.sold = False
            run.exit_proceeds = (
                run.exit_value * p.exit_probability * (1.0 - p.capital_gains_rate)
            )
        else:
            run.sold = rng.random() < p.exit_probability
            run.exit_proceeds = (
                run.exit_value * (1.0 - p.capital_gains_rate) if run.sold else 0.0
            )

    return run
