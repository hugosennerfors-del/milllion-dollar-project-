# How this dies

Every one of these is recoverable if you see it coming, and most of them are
fatal if you do not. They are ordered by how likely they are to be the thing
that actually gets you.

## 1. You stack assumptions and believe your own plan

This is the most likely failure, and I demonstrate it rather than describe it,
because I made it in this repository.

The first version of the recommended plan came out at **91.6%** probability of
reaching $1M. It looked wonderful. It was built by nudging six assumptions in
the good direction at once — slightly better reply rate, slightly better close
rate, slightly more touches per hour, slightly lower churn, slightly cheaper
delivery, slightly higher price. Each nudge was individually defensible.

Multiplied together they assumed a **top-2% operator**, and the simulation then
added good luck on top of an already-lucky centre, double-counting the fortune.

The fix is in `model/scenarios.py`:

```python
implied_operator_percentile(p)   # who does this plan secretly assume you are?
```

It back-solves the operator percentile whose funnel matches your plan's, and
flags anything above 85%. The recommended plan now assumes the 56th percentile
and returns **62%**. That is thirty points of pure self-flattery, removed by one
function.

**Counter:** every time you revise an assumption upward, run `python3 run.py
plans` and check the `assumes` column. Three modest nudges multiply into an
heroic claim, and the multiplication is invisible unless something computes it.

## 2. Servicing eats selling and you never notice

The slowest and most common death. You win clients, you service them, you have
less time to sell, you win fewer clients, churn catches up, and you plateau
around 16 clients while working harder than ever. Nothing feels wrong on any
given Tuesday. Run `python3 run.py ceiling` to see the exact crossing point.

**Counter:** track *selling hours per week* as your primary metric — not
revenue, not clients. The week it drops below 25, hire, even if the money feels
tight. Especially if the money feels tight.

## 3. You price at $4,000 because it is easier to sell

It is easier to sell. It is also mathematically disqualified: a $1M business at
$4,000 needs 19 clients, and 19 is past your ceiling. You would spend two years
building something that begins shrinking before it is worth what you need.

**Counter:** $6,000 is a hard floor. Walk away from anything below it. You are
not turning down revenue, you are turning down a two-year detour.

## 4. You build a job instead of an asset

Two-thirds of your odds come from selling the business. A business that requires
you does not sell, or sells at a steep discount. This failure is invisible until
month 20, when you discover the thing you built cannot be handed to anyone.

**Counter:** by month 12, you should be able to disappear for three weeks
without revenue moving. Test it. Actually take the three weeks.

## 5. Client concentration

At four clients, one leaving costs you 25% of revenue, and an acquirer prices
that risk brutally — `concentration_factor` says a four-client business fetches
60% of the headline multiple. This is why seven clients at $10,000 beats four at
$20,000 even though the revenue is identical.

**Counter:** no client above 20% of revenue. If one grows past it, the answer is
to win another client, not to celebrate.

## 6. Deliverability collapse

Your domain gets flagged, reply rates fall 80% overnight, and every number in
the model collapses at once — because in the model `reply_rate` multiplies
everything downstream. Most people diagnose this as "the market changed."

**Counter:** separate sending domains from your main domain, warm inboxes
properly, keep volume per inbox conservative, monitor reply rate weekly as a
health metric rather than a vanity one. A 50% week-over-week drop is an
infrastructure problem until proven otherwise.

## 7. Delivery quality collapses the moment you delegate

You hand delivery to a contractor, quality drops, churn doubles, and you
conclude that delegation does not work and take the work back. Now you are
permanently capped at your own hours.

**Counter:** deliver the first two clients yourself specifically to write the
process down. Delegate the *documented* process, never the vague intention. And
model it honestly: `python3 run.py` at `monthly_churn=0.12` still shows 43%, so
even a bad delegation outcome beats no delegation.

---

# What this model does not know

More important than anything above. These are real risks the numbers do not
contain, so you must hold them yourself.

**The exit is treated as instantaneous.** This is the model's biggest flaw and I
want it stated plainly. Sale proceeds are credited at month 24, but selling a
small agency realistically takes **6–12 months** from decision to wire. If you
need the money in hand at month 24, you must begin the sale process around month
14–16, at a lower SDE than the model's month-24 figure. Alternatively the money
arrives around month 30–36, in which case read the 36-month row and plan for
that instead. Either way, the 62% is optimistic on *timing* even where it is
honest on *magnitude*.

**Nothing here models you.** Not burnout, not motivation over 24 months of
unglamorous outbound, not the specific Tuesday in month seven when you would
rather do anything else. That is the most common real-world failure of this plan
and it has no parameter.

**Nothing here models the world.** B2B marketing budgets are the first line cut
in a downturn. A recession in your niche does not appear anywhere in these
numbers and would be severe.

**Nothing here models people.** A key contractor quitting in month 10, a client
dispute, a reputation problem in a narrow niche where everyone talks to everyone
— all real, none present.

**The elasticities are judgement, not measurement.** `close_elasticity`,
`cycle_elasticity`, `call_hours_elasticity` are my estimates. `python3 run.py
robust` shows the price recommendation reversing between 0.6 and 0.9, and I
assumed 0.6. Measure your own before you lean on it.

A model that told you it had accounted for all of this would be lying, which is
a fifth thing worth watching for.
