# The arithmetic, before any strategy

Strategy is what you do after the arithmetic says a thing is possible. Most
plans skip this step, which is why most plans fail quietly rather than loudly.

## What a million dollars is made of

There are only two places the money can come from:

1. **Profit you keep** — cash accumulated over 24 months, after tax.
2. **The sale of the business** — a multiple of what it earns.

The baseline plan reaches $518,000 in cash and builds a business a buyer would
pay $1.2M for. But the *expected* value of that sale is only $431,000, because
you have to survive two discounts almost nobody models:

- **You might not find a buyer.** Small agencies sell maybe 45% of the time
  they try, and the process takes 6–12 months you do not have.
- **Capital gains tax.** 20% off the top.

$518,000 + $431,000 = **$949,000.** Three-quarters of the way through the second
year, competent execution lands you five percent short of the goal. That is not
a rounding error you can shrug at — it is the shape of the problem. You are not
trying to build something spectacular. You are trying to clear a bar you will
otherwise miss by a hair.

## Two-thirds of your odds live in the sale, not the profit

Run `python3 run.py odds`:

```
P(reach $1,000,000)         33.4%
P(reach it in cash alone)   11.9%
```

Reaching $1M by banking profit alone is a 12% proposition. Reaching it counting
a sale is 33%. **Two-thirds of your probability mass depends on selling the
business** — which means from day one you are not building an income, you are
building an asset, and those are different jobs:

- **Income thinking**: maximise what you take home this month.
- **Asset thinking**: document every process, get clients on 12-month
  contracts, keep no client above 20% of revenue, make yourself replaceable.

Asset thinking costs you money in year one and roughly triples your odds. Run
`levers` and you will find `exit_probability` — the chance you find a buyer at
all — outranks churn, delivery cost and the exit multiple itself.

## The ceiling nobody mentions

Here is the constraint that decides everything, from `python3 run.py ceiling`:

```
 clients   service   selling   wins/mo  churn/mo   verdict
       8       34h       53h      1.17      0.44   holds
      12       38h       48h      1.06      0.66   holds
      16       43h       43h      0.96      0.88   holds
      18       46h       41h      0.90      0.99   SHRINKS
      24       53h       34h      0.75      1.32   SHRINKS
```

Every hour spent servicing a client is an hour not spent selling. As the client
count rises, servicing eats the selling day, new business slows, and churn
catches up. Somewhere around **17 clients**, the two curves cross and the
business starts shrinking no matter how hard you work.

This is why a naive funnel projection lies. Multiply out the baseline funnel and
it says you win 1.9 clients a month against 5.5% churn, implying a steady state
near 35 clients. You will never see 20. The gap between 35 and 17 is the entire
argument for hiring before you feel ready.

## What the target actually is

From `python3 run.py target` — the smallest business at each price whose sale
clears $1M:

| Retainer | Clients needed | MRR | Annual SDE | Holdable at 20h/wk? |
|---|---|---|---|---|
| $4,000 | 19 | $76,000 | $386,400 | **No** |
| $6,000 | 12 | $72,000 | $414,000 | Yes |
| $8,000 | 9 | $72,000 | $414,000 | Yes |
| $10,000 | 7 | $70,000 | $400,800 | Yes |
| $15,000 | 4 | $60,000 | $388,800 | Yes |

Two things fall out of this table.

**$4,000 retainers are mathematically disqualified.** A $1M business at that
price needs 19 clients, and 19 clients is past your ceiling. You would spend two
years building something that starts shrinking before it is worth what you need.
Not hard — impossible. This is the single most useful line in the whole model,
and it costs nothing to obey.

**Your target is small and specific.** Seven clients at $10,000, or twelve at
$6,000. Around $70,000 a month in revenue. That is the entire mountain. It is
not a hundred customers or a viral launch — it is seven phone calls that go
well, spread over two years.

## The number to keep in your head

**$70,000 MRR.** Everything else in this repository is in service of that one
number. When you are deciding what to do on a given Tuesday, the only question
is whether it moves you toward seven good clients at ten thousand dollars.
