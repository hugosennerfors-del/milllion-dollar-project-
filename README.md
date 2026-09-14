# The Million Dollar Project

You asked for a million dollars with no mistakes.

The first half of that is possible. The second half is not, and anyone who tells
you otherwise is selling something. What *is* possible is to make the mistakes
cheap, find the fatal ones in a spreadsheet instead of in your bank account, and
know the odds before you bet two years of your life on them.

So this repository is not a pitch. It is a model that tries hard to talk you out
of things, and a plan built from whatever survived.

## Your constraints

| | |
|---|---|
| Capital at risk | under $5,000 |
| Time available | ~20 hours/week |
| What you bring | sales and marketing ability |
| Deadline | 1–2 years |

Those four lines eliminate most of the internet's advice. You cannot build
software (no technical skill). You cannot consult (no domain expertise). You
cannot sell to a list (no audience). You cannot buy a business (no capital).
You cannot wait for compounding (no time).

What is left is the thing you are actually good at, sold as a service, delivered
by other people. That is the whole strategy. The rest is arithmetic.

## The answer

Running 20,000 simulated futures per scenario, on a 24-month clock:

| Plan | P(reach $1M) | Downside (p10) | Median |
|---|---|---|---|
| Baseline — obvious thing, done competently | **33%** | $194k | $643k |
| Recommended — craft first, hire early, $10k retainers | **62%** | $414k | $1.36M |
| Recommended, given 36 months instead of 24 | **82%** | $711k | $2.27M |

Three things to take from that table.

**One: the deadline is your most expensive constraint.** The same plan, same
effort, same skill, goes from 62% to 82% on twelve more months. Nothing else in
the model is available that cheaply. If the 24-month deadline is self-imposed,
consider un-imposing it.

**Two: even the bad outcomes are not bad.** The 10th percentile of the
recommended plan is $414,000. The probability of ending with under $100,000 is
roughly zero, because this business takes money up front and pays its costs out
of that money. You are risking two years, not your rent.

**Three: 62% is not 100%.** Four times in ten, you do everything in this
repository and do not get there. That is the honest shape of the thing.

## What "no mistakes" actually bought you

Not certainty. Three narrower and more useful things:

- **The arithmetic is tested.** 63 tests, including a month computed by hand
  and checked against the code. Writing that test caught a rounding error in my
  own hand arithmetic on the first run.
- **Every assumption is in one file.** `model/params.py`. If a number there is
  wrong, the plan is wrong, and there is nowhere for a fudge to hide.
- **The model audits itself for flattery.** The first version of the
  recommended plan came out at 91.6%. It got there by quietly assuming you were
  a top-2% operator, then adding good luck on top. `implied_operator_percentile`
  now catches that, and the number came down to 62%. See
  `strategy/02-failure-modes.md`.

## Run it

No dependencies. Python 3.8+.

```bash
python3 run.py           # everything
python3 run.py odds      # probability of reaching $1M
python3 run.py levers    # which assumption matters most
python3 run.py robust    # where my own advice flips
python3 run.py ceiling   # how many clients you can actually hold
python3 run.py target    # what a $1M business has to look like

python3 -m unittest discover -s tests -v
```

## Read next

| | |
|---|---|
| `strategy/00-the-arithmetic.md` | What $1M requires, before any strategy |
| `strategy/01-the-plan.md` | What to do, starting Monday |
| `strategy/02-failure-modes.md` | How this dies, and the counter to each |
| `strategy/03-rejected.md` | What I considered and threw out, with numbers |
| `strategy/04-kill-criteria.md` | What would prove the plan wrong, and when |

## The disclaimer, stated plainly

This is a model, not a promise, and not financial advice. Its numbers come from
assumptions I made and labelled; several are judgement calls I cannot verify,
and `run.py robust` shows you one that reverses the recommendation if I guessed
wrong. Real businesses fail for reasons no model contains: you get sick, you
lose interest, a client sues you, your co-founder leaves, the market moves.

Use it to think with. Do not use it as a forecast.
