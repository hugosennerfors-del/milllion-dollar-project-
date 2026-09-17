# Liftoff

A gym tracker that scores every set you log and turns it into a rank, from
**Wood** to **Olympian**. It is a standalone web app: no build step, no
account, no server, no network calls. Open `index.html` and start lifting.

```bash
open liftoff/index.html          # macOS
xdg-open liftoff/index.html      # Linux
```

To use it on a phone — which is where a gym app belongs — serve the folder
over your local network and add it to your home screen:

```bash
cd liftoff && python3 -m http.server 8000
```

## What it collects

Per set: **weight, reps, and RPE**, and from those it derives the load, an
estimated 1RM, a strength score and a tier. Around that:

| | |
|---|---|
| Profile | bodyweight, sex standard, units (kg/lb), weekly goal, rest length |
| Exercises | 75 built in across 11 muscle groups, plus your own custom ones |
| Routines | 5 starter routines, fully editable, plus any you build |
| Workouts | name, notes, duration, every set, volume, XP, personal records |
| Progress | per-exercise rank history, weekly volume, streaks, 15 achievements |

Everything is stored in `localStorage` on that one device. Nothing is ever
uploaded. **Export a backup from the Profile tab before clearing browser
data** — there is no copy anywhere else.

## The rank system

Every completed set gets a score from **1 to 1000** that already accounts for
your bodyweight and sex, and that score lands on a nine-rung ladder:

| Wood | Iron | Bronze | Silver | Gold | Platinum | Diamond | Champion | Olympian |
|---|---|---|---|---|---|---|---|---|
| 0+ | 125+ | 250+ | 375+ | 500+ | 625+ | 750+ | 875+ | 975+ |

The chain from a set to a score is four steps, and the app shows its working
on every one of them:

1. **Load** — what you actually moved. A dumbbell press counts both
   dumbbells; a pull-up counts your bodyweight plus anything you hung off it.
2. **Estimated 1RM** — Epley, with reps above 12 damped so that a set of 30
   cannot masquerade as a max. A single is exactly itself.
3. **Index** — your e1RM divided by *your* Gold standard for that lift.
   An index of 1.00 is exactly Gold, by definition.
4. **Score** — the index run through a fixed curve. Gold sits at 500 in the
   middle of the ladder; Olympian is 2.1x the Gold standard, which lands in
   raw-world-record territory.

Bodyweight is handled **allometrically**: strength scales with roughly
bodyweight^(2/3), so a heavier lifter is asked for more weight on the bar but
a lower multiple of their bodyweight. A 100 kg lifter needs about 16% more
than an 80 kg lifter for the same rank, not 25% more.

### Your overall rank

Four categories — **Push (30%), Pull (30%), Legs (30%), Core (10%)**. Each
one takes your best recent exercise in it, weighted so a compound lift
outranks an isolation lift at the same score. Your overall rank is the
weighted average of the four.

An untrained category counts as **zero**. This is deliberate: you cannot be
an Olympian who has never squatted. The Ranks tab always shows how many of
the four you have ranked.

A rank is your best set in the last 180 days, not your best ever. Older
personal bests are still kept and shown, but marked *stale* — the ladder is
about what you can do now.

### XP, levels and streaks

Every set is worth XP in proportion to its score, so a hard set counts for
more than an easy one. A finished workout adds a flat bonus, each personal
record adds more, and a week streak multiplies the lot by up to 1.5x. Levels
get progressively further apart.

A streak is **weeks that hit your weekly goal**, not days in a row. The week
in progress can never break it — it just has not finished yet.

## Honest limits

- **Standards are judgement calls.** Every number lives in `data.js`, in one
  column, precisely so you can argue with it and change it. Gold is meant to
  be a genuinely strong gym lifter, not an average one.
- **A score is only as good as your bodyweight.** If that field is wrong,
  every rank is wrong. Scores are computed when the set is logged, so history
  keeps the rank you actually earned at the time.
- **No leaderboard, no feed, no friends.** Those need a server and an
  account; this deliberately has neither. The ladder is the same for
  everyone, so two people can still compare scores directly.
- **RPE is collected but does not change your score.** A set is ranked on
  what was moved, not on how it felt.

## The code

| | |
|---|---|
| `data.js` | 75 exercises and their strength standards — the only judgement calls |
| `rank.js` | scoring, tiers, aggregate ranks, XP, levels, streaks |
| `store.js` | state, persistence, personal records, achievements, backup |
| `app.js` | the four tabs and every interaction |
| `app.css` | one stylesheet, dark and light |
| `test/rank.test.js` | 31 tests over the rank arithmetic |

```bash
node --test liftoff/test/*.test.js
```

The tests cover the things that would be embarrassing to get wrong: that a
single is its own 1RM, that high reps cannot fake a max, that the same lift
ranks higher on a lighter lifter, that a bench-only lifter is not an overall
Olympian, that a streak survives an unfinished week, and that Olympian on the
big three is world-record territory rather than something you hit in a year.
