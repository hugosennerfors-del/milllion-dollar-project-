# The plan

## What you are selling

**Outbound lead generation for B2B companies, at $10,000/month.**

This falls out of your constraints rather than my preferences. You have no
technical skill, no domain expertise, and no audience. You have one asset: you
can get strangers to buy things. There is exactly one business where that asset
*is* the product, and this is it.

The structural advantages are unusual:

- **Your sales process is your case study.** You acquire clients using the
  method you sell. Every close is proof the thing works, and the demo is the
  conversation you are already having.
- **Delivery is contractor-able.** Trained SDRs and VAs cost $2,000–4,000 a
  month. You are not the bottleneck, which is the only way twenty hours a week
  ever becomes a million dollars.
- **The buyer has budget and a number.** B2B companies have a pipeline target
  and a person whose job depends on it. You are not creating demand, you are
  redirecting a line item that already exists.
- **Zero inventory, paid up front.** This is why `P(run out of money)` is
  approximately zero at under $5k of capital.

And the honest disadvantages, because you should hear them from me rather than
discover them in month four:

- **The market is crowded and the average operator is bad.** Which cuts both
  ways: the noise is loud, and the bar is on the floor.
- **Results are attributable, so failure is visible.** If you do not produce
  meetings, the client knows precisely whose fault it is.
- **Churn is genuinely worse here than in most services.** Typical lead-gen
  client lifetime runs 8–14 months. I tested this: at 12% monthly churn — an
  8-month lifetime, about as bad as it gets — P($1M) is still 43%. Churn hurts,
  but it is not what kills you.

If you would rather sell something else, the model does not care. Any service
where the buyer is a business, delivery is contractor-able, and the retainer
clears $6,000 will run through it. Change `price` in `params.py` and re-run.

## Pick a niche in week one, and make it narrow

Not "B2B companies." Something like *Series A vertical SaaS companies in
logistics with 10–50 employees and no SDR team.* Narrow enough that:

- you can name 500 of them by hand,
- one case study is credible to all of the others,
- your cold email can reference something specific and true.

Narrowness is what moves `reply_rate`, and `reply_rate` is the third-biggest
lever in the model. It is also free. The cost of a narrow niche is that you feel
like you are turning away business in month two; the benefit is that the whole
funnel converts two to three times better for the rest of the project.

## The first 90 days

**Weeks 1–2 — build the list and the offer.**
500 named companies, with a named human at each. Write the offer as a specific
promise with a number in it ("20 qualified meetings in 90 days or you stop
paying"). Set up email infrastructure properly: separate sending domain, warmed
inboxes, SPF/DKIM/DMARC. Skipping this puts you in spam, and everything
downstream reads as a market rejection when it was a DNS record.

**Weeks 3–8 — sell before you can deliver.**
Target roughly 870 touches a month — about 50 hours of prospecting at 12 an
hour. At baseline rates that is ~9 booked calls and ~2 clients a month. Take
every call yourself. You are not delegating this, ever.

Deliver the first two clients personally, badly and expensively in terms of your
own hours. You are not making money on them; you are learning the delivery
process well enough to write it down.

**Weeks 9–12 — write it down and hand it over.**
The moment you have a repeatable delivery process, hire your first contractor
and give it to them. The model is unambiguous here and it is counterintuitive:
`self_managed_clients` is the one parameter whose sensitivity runs *backwards*.
Handling more clients yourself makes you **worse off**, not better.

> Going from managing 8 clients yourself to managing 3 raises P($1M) from 28.6%
> to 37.9%.

You are not buying labour when you hire. You are buying back selling hours, and
selling hours are the only thing that compounds.

## The two-price experiment, run in your first 60 days

This is the most valuable thing in the repository and it costs nothing.

The single most load-bearing assumption in the model is **price elasticity** —
how far your close rate falls when you charge more. I assumed 0.6. Run
`python3 run.py robust` and watch the recommendation reverse between 0.6 and
0.9. My guess sits right next to the cliff.

So do not take my number. Measure yours:

1. Quote $6,000 to the next 15 qualified prospects.
2. Quote $12,000 to the 15 after that. Same offer, same deck, same you.
3. Compare close rates.

If the $12,000 close rate is more than 66% of the $6,000 rate, elasticity is
below 0.6 — go upmarket and do not look back. If it is below half, stay at
$6,000 and win on volume. Thirty conversations resolve the biggest unknown in
your entire plan, and you were going to have those conversations anyway.

## Price where the downside is best, not where the odds are best

Run `python3 run.py price` and you will see P($1M) keep rising all the way to
$30,000 retainers. Ignore it. Look at the 10th percentile instead:

| Retainer | P($1M) | p10 outcome | P(under $100k) |
|---|---|---|---|
| $6,000 | 33.0% | $198,531 | 1.9% |
| $10,000 | 36.0% | $230,604 | **1.3%** |
| $15,000 | 38.1% | $231,210 | 2.5% |
| $30,000 | 42.1% | $128,159 | **9.0%** |

At $30,000 you gain nine points of upside and *triple* your chance of ending
with nothing. Four enormous clients is four ways to lose everything, and the
concentration discount means a buyer pays you 60 cents on the dollar for the
privilege. **$10,000 is where the downside is best defended.** With under $5,000
of capital and no cushion, defending the downside is the whole game.

## Build for the sale from day one

Two-thirds of your odds come from selling the business. That is not a month-20
activity. Starting now:

- **Document every process** as you invent it. The buyer is purchasing a
  machine, not your talent.
- **12-month contracts, not month-to-month.** Contracted revenue is worth
  materially more than hopeful revenue.
- **No client above 20% of revenue.** At seven clients you are already at 14%,
  which is why seven-at-$10k beats four-at-$20k even though the revenue matches.
- **Get yourself out of delivery entirely by month 12.** An agency that needs
  its founder is a job with extra steps, and it sells at a discount that shows
  up directly in `concentration_factor`.

## What the plan looks like if it works

```
 mo  clients    revenue     profit        cash
  3      4.6    $49,514    $23,618     $44,961
  6      7.9    $82,522    $42,763    $122,010
  9     10.6   $109,065    $58,157    $233,886
 12     12.7   $130,408    $66,036    $367,467
 18     15.9   $161,370    $83,995    $691,474
 24     17.9   $181,390    $95,606   $1,074,417
```

That is the median path of the recommended plan. Note that it clears $1M in cash
alone by month 24 — the sale is upside, not the plan. Note also that month 3 is
unremarkable and month 6 is merely fine. The shape of this is boring for a long
time and then works, which is the shape of most things that work.

## If you only remember four things

1. **Seven clients at $10,000.** That is the mountain. It is smaller than it sounds.
2. **Never sell below $6,000.** Below that, the business you need is bigger than the one you can staff.
3. **Hire before you feel ready.** The one lever that runs backwards from intuition.
4. **Run the price experiment in your first 60 days.** It resolves the biggest unknown in the plan for free.
