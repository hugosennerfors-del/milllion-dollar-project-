"""Every assumption in the plan, in one place, with a source or a reason.

If a number here is wrong, the plan is wrong. That is the point of putting them
all in one file: there is nowhere for a fudge to hide.

Units: money is whole dollars. Time is months. Rates are per month unless the
name says otherwise.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from typing import Any

# 52 weeks / 12 months. Using 4.0 would quietly delete 7% of your year.
WEEKS_PER_MONTH = 52.0 / 12.0


@dataclass(frozen=True)
class Params:
    """Inputs to the model.

    Defaults describe the intake answers: under $5k of capital, ~20 hours a
    week, sales ability as the primary asset, a 1-2 year horizon. They also
    describe a *competent* operator, not a lucky or a gifted one. Monte Carlo
    handles the spread around that.
    """

    # ---------------------------------------------------------------- goal --
    goal: float = 1_000_000.0
    horizon_months: int = 24

    # --------------------------------------------------------- constraints --
    hours_per_week: float = 20.0
    starting_capital: float = 5_000.0

    # ----------------------------------------------------------- the offer --
    # A productized service sold on a monthly retainer. Price is the single
    # most important number in this file and the cheapest one to change.
    price: float = 6_000.0
    setup_fee: float = 2_500.0
    # What you pay contractors to deliver the work, as a share of the retainer.
    # Below ~0.35 you are probably delivering it yourself and have no business,
    # only a job. Above ~0.60 there is no margin left to buy back your time.
    delivery_cost_pct: float = 0.45

    # ---------------------------------------------------------- the funnel --
    # Cold outbound. `reply_rate` is the *positive* reply rate, not the raw
    # reply rate -- counting "unsubscribe" as a reply is how plans lie.
    touches_per_hour: float = 12.0
    reply_rate: float = 0.020
    call_rate: float = 0.55       # positive replies that become a booked call
    close_rate: float = 0.20      # booked calls that become paying clients
    hours_per_call: float = 1.5   # prep + call + follow-up, per booked call
    # Months from first booked call to a signed client. At $6k/month a deal can
    # close in-month; at $30k/month it cannot, and pretending otherwise is how
    # a model talks you into an enterprise motion you have no runway for.
    sales_cycle_months: float = 1.0

    # -------------------------------------------------------- retention ----
    monthly_churn: float = 0.055  # ~49% annual. Agencies churn. Plan for it.

    # --------------------------------------------------------- capacity -----
    # The constraint that actually kills part-time businesses: hours spent
    # servicing clients are hours not spent selling, so growth eats itself.
    owner_hours_per_client: float = 6.0
    self_managed_clients: int = 5      # how many you run before your first hire
    ops_capacity_clients: int = 8      # clients one ops hire absorbs
    ops_cost_month: float = 4_500.0
    # Delegation is not free. You still review, escalate, and keep the client
    # warm. This is the fraction of your per-client hours that survives a hire.
    oversight_factor: float = 0.20

    # --------------------------------------------------- overhead and tax --
    fixed_costs_month: float = 600.0   # tooling, data, email infra, accounting
    income_tax_rate: float = 0.30
    capital_gains_rate: float = 0.20

    # ------------------------------------------------------------- exit -----
    # Small agencies trade on a multiple of SDE (seller's discretionary
    # earnings). Client concentration and owner-dependence push it down.
    exit_multiple: float = 2.6
    exit_probability: float = 0.45     # you find a buyer AND the deal closes
    # Client concentration wrecks multiples. A buyer looking at four clients is
    # buying four cancellation clauses, and prices it that way. The discount
    # ramps linearly from `concentration_floor` up to full value at
    # `concentration_full_at` clients.
    concentration_floor: float = 0.45
    concentration_full_at: int = 12

    # ------------------------------------------------------- uncertainty ---
    # Monte Carlo multiplies the funnel rates by a shared lognormal factor, so
    # a good operator is good at everything at once. Independent draws would
    # cancel out and understate both tails -- which is the failure mode that
    # makes most business models useless.
    operator_sigma: float = 0.45
    # Per-parameter spread, as a multiplicative coefficient of variation.
    price_sigma: float = 0.20
    churn_sigma: float = 0.30
    delivery_sigma: float = 0.15
    multiple_sigma: float = 0.25

    def with_(self, **kwargs: Any) -> "Params":
        """Return a copy with fields replaced. Validates the result."""
        out = replace(self, **kwargs)
        out.validate()
        return out

    @property
    def hours_per_month(self) -> float:
        return self.hours_per_week * WEEKS_PER_MONTH

    def validate(self) -> None:
        """Fail loudly on impossible inputs rather than quietly on absurd ones."""
        rates = {
            "reply_rate": self.reply_rate,
            "call_rate": self.call_rate,
            "close_rate": self.close_rate,
            "monthly_churn": self.monthly_churn,
            "delivery_cost_pct": self.delivery_cost_pct,
            "income_tax_rate": self.income_tax_rate,
            "capital_gains_rate": self.capital_gains_rate,
            "exit_probability": self.exit_probability,
            "oversight_factor": self.oversight_factor,
        }
        for name, value in rates.items():
            if not 0.0 <= value <= 1.0:
                raise ValueError(f"{name} must be a rate in [0, 1], got {value!r}")

        positives = {
            "price": self.price,
            "hours_per_week": self.hours_per_week,
            "touches_per_hour": self.touches_per_hour,
            "hours_per_call": self.hours_per_call,
            "owner_hours_per_client": self.owner_hours_per_client,
            "ops_cost_month": self.ops_cost_month,
            "goal": self.goal,
        }
        for name, value in positives.items():
            if value <= 0:
                raise ValueError(f"{name} must be > 0, got {value!r}")

        if self.ops_capacity_clients < 1:
            raise ValueError("ops_capacity_clients must be at least 1")
        if self.self_managed_clients < 0:
            raise ValueError("self_managed_clients cannot be negative")
        if self.horizon_months < 1:
            raise ValueError("horizon_months must be at least 1")
        if self.sales_cycle_months < 1:
            raise ValueError("sales_cycle_months must be at least 1")
        if self.setup_fee < 0 or self.fixed_costs_month < 0:
            raise ValueError("fees and fixed costs cannot be negative")
        if self.starting_capital < 0:
            raise ValueError("starting_capital cannot be negative")
        if self.exit_multiple < 0:
            raise ValueError("exit_multiple cannot be negative")
        if self.concentration_full_at < 1:
            raise ValueError("concentration_full_at must be at least 1")

    def __post_init__(self) -> None:
        self.validate()
