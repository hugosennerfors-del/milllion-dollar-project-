"""Tests for the model.

The brief was "no mistakes". Nobody can promise that about a business, but the
arithmetic underneath one is a different matter -- that part can genuinely be
made correct, and this file is where that claim is cashed. Every structural
behaviour the plan leans on is pinned here, including a month computed by hand.

Run with:  python3 -m unittest discover -s tests -v
"""

from __future__ import annotations

import math
import random
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from model.engine import (  # noqa: E402
    _binomial,
    concentration_factor,
    _funnel,
    _hires_needed,
    _owner_ops_hours,
    _poisson,
    simulate,
)
from model.montecarlo import _lognormal, draw, monte_carlo, percentile  # noqa: E402
from model.params import WEEKS_PER_MONTH, Params  # noqa: E402
from model.offer import Buyer, min_acv, qualifies, roi, shortlist  # noqa: E402
from model.sensitivity import tornado  # noqa: E402


class TestParams(unittest.TestCase):
    def test_defaults_validate(self):
        Params().validate()

    def test_hours_per_month_uses_real_calendar(self):
        # 4 weeks/month would lose 7% of the year. 52/12 is the honest number.
        self.assertAlmostEqual(Params(hours_per_week=20).hours_per_month, 86.6667, places=3)
        self.assertAlmostEqual(WEEKS_PER_MONTH, 4.33333, places=4)

    def test_rates_must_be_probabilities(self):
        for field in ("reply_rate", "close_rate", "monthly_churn", "exit_probability"):
            with self.assertRaises(ValueError, msg=field):
                Params().with_(**{field: 1.5})
            with self.assertRaises(ValueError, msg=field):
                Params().with_(**{field: -0.1})

    def test_positive_quantities_rejected_when_zero(self):
        for field in ("price", "hours_per_week", "touches_per_hour", "goal"):
            with self.assertRaises(ValueError, msg=field):
                Params().with_(**{field: 0})

    def test_with_returns_a_copy_and_does_not_mutate(self):
        base = Params()
        changed = base.with_(price=9_000.0)
        self.assertEqual(base.price, 6_000.0)
        self.assertEqual(changed.price, 9_000.0)

    def test_unknown_field_rejected(self):
        with self.assertRaises(TypeError):
            Params().with_(nonexistent_field=1)


class TestFunnel(unittest.TestCase):
    def test_hours_conserve_exactly(self):
        """Prospecting hours plus call hours must equal the hours you have.

        This is the check that catches the most common projection error: booking
        calls you have no time left to take.
        """
        p = Params()
        sales_hours = 60.0
        touches, calls, _ = _funnel(sales_hours, p)
        prospect_hours = touches / p.touches_per_hour
        call_hours = calls * p.hours_per_call
        self.assertAlmostEqual(prospect_hours + call_hours, sales_hours, places=9)

    def test_no_hours_means_no_pipeline(self):
        self.assertEqual(_funnel(0.0, Params()), (0.0, 0.0, 0.0))
        self.assertEqual(_funnel(-5.0, Params()), (0.0, 0.0, 0.0))

    def test_conversion_chain_is_applied_in_order(self):
        p = Params()
        touches, calls, new = _funnel(60.0, p)
        self.assertAlmostEqual(calls, touches * p.reply_rate * p.call_rate, places=9)
        self.assertAlmostEqual(new, calls * p.close_rate, places=9)

    def test_more_hours_never_means_fewer_clients(self):
        p = Params()
        prev = -1.0
        for hours in range(0, 120, 5):
            _, _, new = _funnel(float(hours), p)
            self.assertGreaterEqual(new, prev)
            prev = new


class TestCapacity(unittest.TestCase):
    def test_hires_needed_boundaries(self):
        p = Params(self_managed_clients=5, ops_capacity_clients=8)
        self.assertEqual(_hires_needed(0, p), 0)
        self.assertEqual(_hires_needed(5, p), 0)
        self.assertEqual(_hires_needed(6, p), 1)
        self.assertEqual(_hires_needed(13, p), 1)
        self.assertEqual(_hires_needed(14, p), 2)

    def test_delegation_leaves_oversight_behind(self):
        p = Params(
            self_managed_clients=5,
            ops_capacity_clients=8,
            owner_hours_per_client=6.0,
            oversight_factor=0.20,
        )
        # 10 clients, one hire: you keep 5 direct, delegate 5 at 20% oversight.
        expected = 5 * 6.0 + 5 * 6.0 * 0.20
        self.assertAlmostEqual(_owner_ops_hours(10, 1, p), expected, places=9)

    def test_without_a_hire_you_carry_every_client(self):
        p = Params(self_managed_clients=5, owner_hours_per_client=6.0)
        self.assertAlmostEqual(_owner_ops_hours(10, 0, p), 60.0, places=9)

    def test_growth_throttles_itself_when_hiring_is_disabled(self):
        """The ceiling that defines a part-time service business.

        With no ops leverage, servicing consumes the hours that selling needs,
        and the client count stalls instead of compounding.
        """
        p = Params(ops_cost_month=10_000_000.0, horizon_months=36)
        run = simulate(p)
        self.assertEqual(run.months[-1].hires, 0)

        # Servicing steadily eats the selling day.
        self.assertGreater(run.months[-1].owner_ops_hours, 0.0)
        self.assertLess(run.months[-1].sales_hours, 0.5 * run.months[0].sales_hours)

        # The naive funnel answer -- new clients per month divided by churn,
        # assuming you never have to service anyone -- is roughly 35 clients.
        # Hours cap it at a small fraction of that. This gap is the whole
        # argument for buying back time before chasing more pipeline.
        _, _, new_per_month = _funnel(p.hours_per_month, p)
        unconstrained = new_per_month / p.monthly_churn
        self.assertGreater(unconstrained, 30.0)
        self.assertLess(run.peak_clients, 0.5 * unconstrained)


class TestEngineArithmetic(unittest.TestCase):
    def test_month_one_matches_hand_calculation(self):
        """A golden test computed by hand, independently of the code.

        Carry the full precision through -- rounding `new_clients` to 1.9098
        before multiplying by the price moves revenue by seven cents, and a
        test that tolerates seven cents tolerates seven thousand dollars
        somewhere else.

        hours     = 20 * 52/12                        =    86.6666667
        k         = 12 * 0.02 * 0.55 * 1.5            =     0.198
        prospect  = 86.6666667 / 1.198                =    72.3427935
        touches   = 72.3427935 * 12                   =   868.1135225
        calls     = 868.1135225 * 0.02 * 0.55         =     9.5492488
        new       = 9.5492488 * 0.20                  =     1.9098498
        revenue   = 1.9098498 * (6000 + 2500)         = 16,233.7229
        delivery  = 16,233.7229 * 0.45                =  7,305.1753
        profit    = 16,233.7229 - 7,305.1753 - 600    =  8,328.5476
        tax       = 8,328.5476 * 0.30                 =  2,498.5643
        cash      = 5000 + 8,328.5476 - 2,498.5643    = 10,829.9833
        """
        m = simulate(Params()).months[0]
        self.assertAlmostEqual(m.sales_hours, 86.6666667, places=6)
        self.assertAlmostEqual(m.touches, 868.1135225, places=6)
        self.assertAlmostEqual(m.booked_calls, 9.5492488, places=6)
        self.assertAlmostEqual(m.new_clients, 1.9098498, places=6)
        self.assertAlmostEqual(m.revenue, 16_233.7229, places=3)
        self.assertAlmostEqual(m.delivery_cost, 7_305.1753, places=3)
        self.assertAlmostEqual(m.profit_pretax, 8_328.5476, places=3)
        self.assertAlmostEqual(m.tax, 2_498.5643, places=3)
        self.assertAlmostEqual(m.cash, 10_829.9833, places=3)

    def test_churned_clients_are_not_billed(self):
        """Revenue uses retained + new, never the starting count."""
        p = Params(monthly_churn=0.50, setup_fee=0.0)
        run = simulate(p)
        m = run.months[1]
        retained = m.clients_start - m.churned_clients
        self.assertAlmostEqual(
            m.revenue, (retained + m.new_clients) * p.price, places=6
        )
        self.assertAlmostEqual(m.churned_clients, m.clients_start * 0.50, places=9)

    def test_client_balance_is_conserved_every_month(self):
        run = simulate(Params(horizon_months=24))
        for m in run.months:
            self.assertAlmostEqual(
                m.clients_end, m.clients_start - m.churned_clients + m.new_clients,
                places=9,
            )
        for prev, cur in zip(run.months, run.months[1:]):
            self.assertAlmostEqual(cur.clients_start, prev.clients_end, places=9)

    def test_cash_is_the_running_sum_of_after_tax_profit(self):
        p = Params()
        run = simulate(p)
        expected = p.starting_capital
        for m in run.months:
            expected += m.profit_pretax - m.tax
            self.assertAlmostEqual(m.cash, expected, places=6)

    def test_profit_reconciles_against_its_cost_lines(self):
        run = simulate(Params(horizon_months=24))
        for m in run.months:
            self.assertAlmostEqual(
                m.profit_pretax,
                m.revenue - m.delivery_cost - m.ops_cost - m.fixed_cost,
                places=6,
            )

    def test_losses_carry_forward_against_later_tax(self):
        """A loss-making start must shelter the first profits that follow."""
        p = Params(fixed_costs_month=30_000.0, horizon_months=12)
        run = simulate(p)
        losses = [m for m in run.months if m.profit_pretax < 0]
        self.assertTrue(losses, "expected this configuration to lose money early")
        for m in run.months:
            self.assertGreaterEqual(m.tax, 0.0)
            # Tax can never exceed the statutory rate on that month's profit.
            self.assertLessEqual(m.tax, max(0.0, m.profit_pretax) * p.income_tax_rate + 1e-9)
        total_loss = -sum(m.profit_pretax for m in losses)
        total_profit = sum(m.profit_pretax for m in run.months if m.profit_pretax > 0)
        total_tax = sum(m.tax for m in run.months)
        expected_tax = max(0.0, total_profit - total_loss) * p.income_tax_rate
        self.assertAlmostEqual(total_tax, expected_tax, places=6)

    def test_no_tax_is_charged_on_a_loss(self):
        p = Params(fixed_costs_month=50_000.0, horizon_months=3, starting_capital=500_000.0)
        for m in simulate(p).months:
            if m.profit_pretax < 0:
                self.assertEqual(m.tax, 0.0)

    def test_ruin_stops_the_simulation(self):
        p = Params(
            starting_capital=1_000.0,
            fixed_costs_month=80_000.0,
            horizon_months=24,
        )
        run = simulate(p)
        self.assertTrue(run.ruined)
        self.assertIsNotNone(run.ruin_month)
        self.assertLess(run.months[-1].cash, 0)
        self.assertEqual(len(run.months), run.ruin_month)
        # A dead business is not sold.
        self.assertEqual(run.exit_proceeds, 0.0)
        self.assertEqual(run.exit_value, 0.0)

    def test_an_unaffordable_hire_never_happens(self):
        """You cannot hire your way out of an empty bank account.

        Note the business must actually *need* the hire for this to prove
        anything -- otherwise it passes for the wrong reason.
        """
        p = Params(ops_cost_month=10_000_000.0)
        run = simulate(p)
        self.assertGreater(
            run.peak_clients, p.self_managed_clients,
            "test is vacuous unless the client count outgrows the owner",
        )
        self.assertTrue(all(m.hires == 0 for m in run.months))

    def test_an_affordable_hire_does_happen(self):
        run = simulate(Params())
        self.assertTrue(any(m.hires >= 1 for m in run.months))

    def test_hiring_ratchets_and_never_reverses(self):
        """You do not fire an ops person the month a client churns."""
        counts = [m.hires for m in simulate(Params(horizon_months=36)).months]
        self.assertEqual(counts, sorted(counts))

    def test_deterministic_runs_are_reproducible(self):
        a = simulate(Params())
        b = simulate(Params())
        self.assertEqual(
            [m.cash for m in a.months], [m.cash for m in b.months]
        )


class TestExitValue(unittest.TestCase):
    def test_sde_is_the_trailing_twelve_months(self):
        p = Params(horizon_months=24)
        run = simulate(p)
        trailing = sum(m.profit_pretax for m in run.months[-12:])
        self.assertAlmostEqual(run.sde, trailing, places=6)

    def test_short_horizons_are_annualised(self):
        p = Params(horizon_months=6)
        run = simulate(p)
        six = sum(m.profit_pretax for m in run.months)
        self.assertAlmostEqual(run.sde, six * 2.0, places=6)

    def test_deterministic_exit_is_probability_weighted(self):
        p = Params()
        run = simulate(p)
        expected = run.exit_value * p.exit_probability * (1 - p.capital_gains_rate)
        self.assertAlmostEqual(run.exit_proceeds, expected, places=6)
        self.assertFalse(run.sold, "deterministic mode reports an expectation, not a sale")

    def test_no_buyer_means_no_proceeds(self):
        run = simulate(Params(exit_probability=0.0))
        self.assertEqual(run.exit_proceeds, 0.0)
        self.assertAlmostEqual(run.wealth, run.cash, places=9)

    def test_exit_value_is_multiple_times_sde_times_concentration(self):
        p = Params(exit_multiple=3.0)
        run = simulate(p)
        self.assertAlmostEqual(
            run.exit_value, run.sde * 3.0 * run.concentration, places=6
        )
        # The default plan finishes with a diversified book, so no haircut.
        self.assertGreaterEqual(run.final_clients, p.concentration_full_at)
        self.assertAlmostEqual(run.concentration, 1.0, places=9)


class TestConcentration(unittest.TestCase):
    """A buyer pays less for a business that four cancellations could end."""

    def test_ramps_from_floor_to_full(self):
        p = Params(concentration_floor=0.45, concentration_full_at=12)
        self.assertAlmostEqual(concentration_factor(1, p), 0.45, places=9)
        self.assertAlmostEqual(concentration_factor(12, p), 1.0, places=9)
        self.assertAlmostEqual(concentration_factor(100, p), 1.0, places=9)
        self.assertAlmostEqual(concentration_factor(0, p), 0.0, places=9)

    def test_is_monotonic(self):
        p = Params()
        values = [concentration_factor(n, p) for n in range(1, 20)]
        self.assertEqual(values, sorted(values))

    def test_midpoint_is_halfway(self):
        p = Params(concentration_floor=0.40, concentration_full_at=11)
        # Six clients is halfway from 1 to 11, so halfway from 0.40 to 1.00.
        self.assertAlmostEqual(concentration_factor(6, p), 0.70, places=9)

    def test_a_thin_book_is_discounted_in_a_real_run(self):
        """Same profit, fewer clients, materially less money on exit."""
        thin = simulate(Params(price=40_000.0, close_rate=0.05, exit_probability=1.0))
        self.assertLess(thin.final_clients, 12)
        self.assertLess(thin.concentration, 1.0)
        self.assertAlmostEqual(
            thin.exit_value,
            thin.sde * thin.params.exit_multiple * thin.concentration,
            places=6,
        )


class TestSamplers(unittest.TestCase):
    def test_poisson_mean_converges(self):
        rng = random.Random(7)
        for lam in (0.5, 2.0, 5.0):
            draws = [_poisson(rng, lam) for _ in range(40_000)]
            self.assertAlmostEqual(sum(draws) / len(draws), lam, delta=0.06 * lam)

    def test_poisson_variance_matches_mean(self):
        rng = random.Random(11)
        lam = 3.0
        draws = [_poisson(rng, lam) for _ in range(40_000)]
        mean = sum(draws) / len(draws)
        var = sum((d - mean) ** 2 for d in draws) / len(draws)
        self.assertAlmostEqual(var, lam, delta=0.12 * lam)

    def test_poisson_edge_cases(self):
        rng = random.Random(1)
        self.assertEqual(_poisson(rng, 0.0), 0)
        self.assertEqual(_poisson(rng, -1.0), 0)
        self.assertGreaterEqual(_poisson(rng, 50.0), 0)  # large-lambda branch

    def test_binomial_mean_converges(self):
        rng = random.Random(13)
        draws = [_binomial(rng, 20, 0.25) for _ in range(20_000)]
        self.assertAlmostEqual(sum(draws) / len(draws), 5.0, delta=0.12)

    def test_binomial_edge_cases(self):
        rng = random.Random(3)
        self.assertEqual(_binomial(rng, 0, 0.5), 0)
        self.assertEqual(_binomial(rng, 10, 0.0), 0)
        self.assertEqual(_binomial(rng, 10, 1.0), 10)

    def test_lognormal_multiplier_has_mean_one(self):
        rng = random.Random(5)
        draws = [_lognormal(rng, 0.45) for _ in range(80_000)]
        self.assertAlmostEqual(sum(draws) / len(draws), 1.0, delta=0.02)
        self.assertTrue(all(d > 0 for d in draws))
        self.assertEqual(_lognormal(rng, 0.0), 1.0)


class TestPercentile(unittest.TestCase):
    def test_known_values(self):
        data = [1, 2, 3, 4, 5]
        self.assertEqual(percentile(data, 0), 1)
        self.assertEqual(percentile(data, 100), 5)
        self.assertEqual(percentile(data, 50), 3)
        self.assertEqual(percentile(data, 25), 2)

    def test_interpolates_between_points(self):
        self.assertAlmostEqual(percentile([0, 10], 50), 5.0)
        self.assertAlmostEqual(percentile([0, 10], 90), 9.0)

    def test_unsorted_input_is_handled(self):
        self.assertEqual(percentile([5, 1, 4, 2, 3], 50), 3)

    def test_single_value(self):
        self.assertEqual(percentile([42], 99), 42)

    def test_rejects_bad_input(self):
        with self.assertRaises(ValueError):
            percentile([], 50)
        with self.assertRaises(ValueError):
            percentile([1, 2], 101)


class TestMonteCarlo(unittest.TestCase):
    def test_same_seed_same_answer(self):
        a = monte_carlo(Params(), trials=300, seed=42)
        b = monte_carlo(Params(), trials=300, seed=42)
        self.assertEqual(a.p_goal, b.p_goal)
        self.assertEqual(a.wealth, b.wealth)

    def test_different_seed_different_draws(self):
        a = monte_carlo(Params(), trials=300, seed=1)
        b = monte_carlo(Params(), trials=300, seed=2)
        self.assertNotEqual(a.wealth, b.wealth)

    def test_probabilities_are_well_formed(self):
        r = monte_carlo(Params(), trials=400, seed=3)
        for value in (r.p_goal, r.p_ruin, r.p_goal_cash_only):
            self.assertGreaterEqual(value, 0.0)
            self.assertLessEqual(value, 1.0)
        # Reaching the goal in cash alone is strictly harder than reaching it
        # counting a sale, so it can never be the more likely of the two.
        self.assertLessEqual(r.p_goal_cash_only, r.p_goal)
        self.assertEqual(len(r.wealth), 400)

    def test_draw_keeps_every_parameter_legal(self):
        rng = random.Random(99)
        p = Params()
        for _ in range(2_000):
            d = draw(p, rng)
            d.validate()  # raises if any rate escaped [0, 1]
            self.assertGreater(d.price, 0)
            self.assertGreater(d.monthly_churn, 0)

    def test_operator_factor_correlates_the_funnel(self):
        """Good operators must be good at everything at once.

        Independent draws would let luck cancel across stages and quietly
        shrink both tails -- the flaw that makes most business models useless.
        """
        rng = random.Random(17)
        p = Params()
        samples = [draw(p, rng) for _ in range(3_000)]
        best = [s for s in samples if s.close_rate > p.close_rate]
        worst = [s for s in samples if s.close_rate < p.close_rate]
        mean_reply_best = sum(s.reply_rate for s in best) / len(best)
        mean_reply_worst = sum(s.reply_rate for s in worst) / len(worst)
        self.assertGreater(mean_reply_best, mean_reply_worst)

    def test_an_impossible_goal_is_never_reached(self):
        r = monte_carlo(Params(goal=10_000_000_000.0), trials=200, seed=4)
        self.assertEqual(r.p_goal, 0.0)

    def test_a_trivial_goal_is_always_reached(self):
        r = monte_carlo(Params(goal=1.0), trials=200, seed=4)
        self.assertEqual(r.p_goal, 1.0)


class TestDirectionalSanity(unittest.TestCase):
    """Things that must move the right way, or the model is lying."""

    def _wealth(self, **kwargs) -> float:
        return simulate(Params().with_(**kwargs)).wealth

    def test_higher_price_is_better(self):
        self.assertGreater(self._wealth(price=9_000.0), self._wealth(price=6_000.0))

    def test_higher_churn_is_worse(self):
        self.assertLess(self._wealth(monthly_churn=0.12), self._wealth(monthly_churn=0.03))

    def test_more_hours_is_better(self):
        self.assertGreater(self._wealth(hours_per_week=30.0), self._wealth(hours_per_week=10.0))

    def test_cheaper_delivery_is_better(self):
        self.assertGreater(
            self._wealth(delivery_cost_pct=0.30), self._wealth(delivery_cost_pct=0.60)
        )

    def test_higher_tax_is_worse(self):
        self.assertLess(self._wealth(income_tax_rate=0.45), self._wealth(income_tax_rate=0.20))

    def test_wealth_rises_monotonically_with_price(self):
        prices = [3_000, 4_500, 6_000, 7_500, 9_000, 12_000]
        wealths = [self._wealth(price=float(x)) for x in prices]
        self.assertEqual(wealths, sorted(wealths))

    def test_longer_horizon_is_better(self):
        self.assertGreater(self._wealth(horizon_months=36), self._wealth(horizon_months=24))


class TestSensitivity(unittest.TestCase):
    def test_tornado_is_ranked_by_magnitude(self):
        swings = tornado(Params(), trials=120, seed=8)
        magnitudes = [s.magnitude for s in swings]
        self.assertEqual(magnitudes, sorted(magnitudes, reverse=True))
        self.assertEqual(len(swings), 14)

    def test_tornado_rejects_unknown_parameters(self):
        with self.assertRaises(ValueError):
            tornado(Params(), ranges={"not_a_field": (1, 2)}, trials=10)

    def test_swing_arithmetic(self):
        swings = tornado(Params(), ranges={"price": (3_000.0, 12_000.0)}, trials=120, seed=8)
        s = swings[0]
        self.assertAlmostEqual(s.swing, s.metric_high - s.metric_low, places=12)
        self.assertAlmostEqual(s.magnitude, abs(s.swing), places=12)


if __name__ == "__main__":
    unittest.main(verbosity=2)


class TestOfferEconomics(unittest.TestCase):
    """Who can afford you is arithmetic, not taste."""

    def test_meeting_value_chains_the_rates(self):
        b = Buyer("x", 100_000, 0.5, 0.2)
        self.assertAlmostEqual(b.meeting_value, 10_000.0, places=9)

    def test_roi_is_pipeline_over_fee(self):
        b = Buyer("x", 100_000, 0.5, 0.2)          # $10k per meeting
        self.assertAlmostEqual(roi(b, 10_000, 10), 10.0, places=9)
        self.assertAlmostEqual(roi(b, 20_000, 10), 5.0, places=9)

    def test_min_acv_round_trips_through_roi(self):
        """The inverse must actually invert -- the property that matters.

        A deal size at exactly the threshold has to produce exactly the target
        ROI, or the list-building filter is quietly wrong.
        """
        for fee, meetings, target in ((10_000, 10, 5.0), (6_000, 8, 3.0), (15_000, 12, 4.0)):
            acv = min_acv(fee, meetings, target)
            b = Buyer("threshold", acv)
            self.assertAlmostEqual(roi(b, fee, meetings), target, places=6)

    def test_the_forty_thousand_dollar_rule(self):
        """The single number that sorts the market. Guard it."""
        self.assertAlmostEqual(min_acv(10_000, 10, 5.0), 40_000.0, places=6)

    def test_qualifies_tracks_the_threshold(self):
        cheap = Buyer("small", 18_000, 0.45, 0.20)
        rich = Buyer("large", 150_000, 0.40, 0.18)
        self.assertFalse(qualifies(cheap, 10_000, 10))
        self.assertTrue(qualifies(rich, 10_000, 10))

    def test_shortlist_is_ranked_and_labelled(self):
        rows = shortlist()
        self.assertEqual([r["roi"] for r in rows], sorted((r["roi"] for r in rows), reverse=True))
        self.assertTrue(any(r["verdict"] == "easy yes" for r in rows))
        self.assertTrue(any(r["verdict"] == "no" for r in rows))

    def test_rejects_impossible_buyers(self):
        with self.assertRaises(ValueError):
            Buyer("bad", 0)
        with self.assertRaises(ValueError):
            Buyer("bad", 50_000, meeting_to_opp=1.4)
        with self.assertRaises(ValueError):
            roi(Buyer("ok", 50_000), 0, 10)
