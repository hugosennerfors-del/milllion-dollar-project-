#!/usr/bin/env python3
"""The whole analysis, on one command.

    python3 run.py              # everything
    python3 run.py baseline     # the month-by-month trace
    python3 run.py odds         # probability of reaching $1M
    python3 run.py levers       # which assumption matters most
    python3 run.py price        # the price ladder, penalties included
    python3 run.py robust       # where the price advice flips
    python3 run.py target       # what the business has to look like
    python3 run.py ceiling      # how many clients you can actually hold
    python3 run.py plans        # scenario comparison, with assumption audit

No dependencies. If it runs at all, it runs.
"""

from __future__ import annotations

import sys

from model import Params, monte_carlo, simulate, tornado
from model.montecarlo import percentile
from model.scenarios import (
    audit,
    compare,
    elasticity_sweep,
    million_dollar_business,
    price_ladder,
    steady_state,
)
from model.sensitivity import render_tornado

RULE = "=" * 78


def head(title: str) -> None:
    print(f"\n{RULE}\n{title}\n{RULE}")


def money(x: float) -> str:
    return f"${x:,.0f}"


def baseline() -> None:
    head("BASELINE -- the intake answers, executed competently")
    p = Params()
    r = simulate(p)
    print(
        f"\n{'mo':>3} {'clients':>8} {'hires':>6} {'service':>8} {'selling':>8} "
        f"{'revenue':>10} {'profit':>10} {'cash':>12}"
    )
    for m in r.months:
        if m.month <= 2 or m.month % 3 == 0:
            print(
                f"{m.month:>3} {m.clients_end:>8.1f} {m.hires:>6} "
                f"{m.owner_ops_hours:>7.0f}h {m.sales_hours:>7.0f}h "
                f"{money(m.revenue):>10} {money(m.profit_pretax):>10} {money(m.cash):>12}"
            )
    print(f"\n  cash after {p.horizon_months} months     {money(r.cash):>14}")
    print(f"  trailing-year SDE          {money(r.sde):>14}")
    print(f"  what a buyer would pay     {money(r.exit_value):>14}"
          f"   ({r.concentration:.0%} of headline multiple, {r.final_clients:.0f} clients)")
    print(f"  expected sale proceeds     {money(r.exit_proceeds):>14}"
          f"   ({p.exit_probability:.0%} odds of a sale, less {p.capital_gains_rate:.0%} tax)")
    print(f"  TOTAL                      {money(r.wealth):>14}"
          f"   {'GOAL MET' if r.hit_goal else 'short of $1M'}")


def odds() -> None:
    head("THE ODDS -- 20,000 simulated futures")
    print()
    print(monte_carlo(Params(), trials=20_000).summary())
    print(
        "\nNote: P(run out of money) is near zero because clients pay up front and\n"
        "contractors are paid out of that money. This business is hard to kill, which\n"
        "is exactly why it suits someone with under $5k. It assumes your living costs\n"
        "are covered elsewhere -- the model has no opinion on your rent."
    )


def levers() -> None:
    head("LEVERS -- one at a time, ranked by how much each moves P($1M)")
    print()
    print(render_tornado(tornado(Params(), trials=6_000)))
    print(
        "\nRead this with `robust` before acting on the price line. One-at-a-time\n"
        "analysis raises price while holding conversion fixed, which never happens."
    )


def price() -> None:
    head("PRICE LADDER -- every rung pays for itself in conversion, cycle and meetings")
    rungs = price_ladder(Params(), trials=6_000)
    best = max(r.p_goal for r in rungs)
    print(f"\n{'price':>8} {'close':>7} {'cycle':>7} {'P($1M)':>8} {'p10':>11} {'median':>12} {'clients':>8}")
    for r in rungs:
        mc = monte_carlo(
            Params().with_(
                price=r.price, close_rate=r.close_rate, touches_per_hour=r.touches_per_hour
            ),
            trials=4_000,
        )
        star = "  <-- highest P" if r.p_goal == best else ""
        print(
            f"${r.price:>7,.0f} {r.close_rate:>7.1%} {r.cycle_months:>5.1f}mo {r.p_goal:>8.1%} "
            f"{money(percentile(mc.wealth, 10)):>11} {money(r.median_wealth):>12} "
            f"{r.median_clients:>8.0f}{star}"
        )
    print(
        "\nHighest P($1M) is not the recommendation. The downside peaks around\n"
        "$10-15k and falls away above it -- four giant clients is four ways to lose."
    )


def robust() -> None:
    head("ROBUSTNESS -- where the price advice flips")
    print("\nclose_elasticity = how far close rate falls when you double your price.")
    print("I assumed 0.6. I cannot verify it. Neither can you, yet.\n")
    rows = elasticity_sweep(Params(), trials=4_000)
    print(f"{'elasticity':>11} {'$6k':>8} {'$12k':>8} {'$20k':>8} {'$30k':>8}   best")
    for r in rows:
        cells = {k: v for k, v in r.items() if k != "close_elasticity"}
        best = max(cells, key=cells.get)
        label = {"p6000": "$6k", "p12000": "$12k", "p20000": "$20k", "p30000": "$30k"}[best]
        note = "   <-- my assumption" if abs(r["close_elasticity"] - 0.6) < 1e-9 else ""
        print(
            f"{r['close_elasticity']:>11.1f} {r['p6000']:>8.1%} {r['p12000']:>8.1%} "
            f"{r['p20000']:>8.1%} {r['p30000']:>8.1%}   {label}{note}"
        )
    print(
        "\nThe advice reverses between 0.6 and 0.9, and 0.6 is what I guessed.\n"
        "So do not bet the plan on it -- measure it. Two price points, sixty days,\n"
        "costs nothing but discipline. Then come back and set the number yourself."
    )


def target() -> None:
    head("THE TARGET -- what a $1M business has to look like")
    print(f"\n{'price':>8} {'clients':>8} {'MRR':>10} {'annual SDE':>12} {'service':>8} {'selling':>8} {'holdable':>9}")
    for r in million_dollar_business(Params()):
        if r["clients_needed"] is None:
            print(f"${r['price']:>7,.0f} {'--':>8}   no client count below 60 gets there")
            continue
        print(
            f"${r['price']:>7,.0f} {r['clients_needed']:>8} {money(r['monthly_revenue']):>10} "
            f"{money(r['annual_sde']):>12} {r['owner_ops_hours']:>7.0f}h {r['sales_hours']:>7.0f}h "
            f"{('YES' if r['holdable'] else 'NO'):>9}"
        )
    print(
        "\n'Holdable' asks whether you can win clients faster than churn takes them,\n"
        "at your hours. $4k retainers fail this test: the business you would need is\n"
        "bigger than the one you can staff. That is arithmetic, not ambition."
    )


def ceiling() -> None:
    head("THE CEILING -- servicing eats selling, and then growth stops")
    p = Params()
    print(f"\n{'clients':>8} {'service':>9} {'selling':>9} {'wins/mo':>9} {'churn/mo':>9}   verdict")
    for n in range(4, 32, 2):
        ss = steady_state(p, n)
        print(
            f"{n:>8} {ss.owner_ops_hours:>8.0f}h {ss.sales_hours:>8.0f}h "
            f"{ss.new_clients_possible:>9.2f} {ss.churn_replacement_needed:>9.2f}   "
            f"{'holds' if ss.holdable else 'SHRINKS'}"
        )
    print(
        "\nThis is the wall every part-time service business hits, and the reason\n"
        "`hire_early` beats `grind_harder` over a long enough clock. You are not\n"
        "buying labour when you hire. You are buying back selling hours."
    )


def plans() -> None:
    head("PLANS -- same seed, same clock, audited for stacked assumptions")
    rows = compare(trials=12_000)
    print(
        f"\n{'scenario':<18} {'price':>8} {'mo':>3} {'P($1M)':>8} {'p10':>11} "
        f"{'median':>12} {'p90':>13} {'assumes':>8}"
    )
    for r in sorted(rows, key=lambda x: x["p_goal"]):
        flag = " !" if r["implied_operator"] >= 0.85 else ""
        print(
            f"{r['name']:<18} ${r['price']:>7,.0f} {r['months']:>3} {r['p_goal']:>8.1%} "
            f"{money(r['p10']):>11} {money(r['median']):>12} {money(r['p90']):>13} "
            f"{r['implied_operator']:>7.0%}{flag}"
        )
    print("\n'assumes' = the operator percentile a plan needs you to be, for its funnel")
    print("to be your *median* outcome. Anything at or above 85% is marked ! and should")
    print("be argued for out loud. Three modest nudges multiply into an heroic claim.\n")
    for a in audit():
        if a["verdict"] != "fair":
            print(f"  ! {a['name']}: {a['verdict']}")
    print("  (grind_harder needs 25h/wk, which is above the 20h you said you have.)")


COMMANDS = {
    "baseline": baseline,
    "odds": odds,
    "levers": levers,
    "price": price,
    "robust": robust,
    "target": target,
    "ceiling": ceiling,
    "plans": plans,
}


def main(argv) -> int:
    if len(argv) > 1:
        name = argv[1]
        if name in ("-h", "--help", "help"):
            print(__doc__)
            return 0
        if name not in COMMANDS:
            print(f"unknown command {name!r}\n")
            print(__doc__)
            return 1
        COMMANDS[name]()
        return 0
    for fn in COMMANDS.values():
        fn()
    print(f"\n{RULE}")
    print("Read strategy/ next. The model says what is possible; the strategy says")
    print("what to do on Monday, and what would tell you the plan is wrong.")
    print(RULE)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
