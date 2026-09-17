/* Tests for the rank system. Run: node --test liftoff/test/
   No dependencies — node's built-in runner, node 18+. */

const test = require('node:test');
const assert = require('node:assert');
const R = require('../rank.js');
const { EXERCISES, CATEGORIES } = require('../data.js');

const byId = Object.fromEntries(EXERCISES.map(e => [e.id, e]));
const male = { sex:'male', bodyweight:80 };
const female = { sex:'female', bodyweight:65 };

// ---------------- e1RM ----------------

test('a single is its own one-rep max', () => {
  assert.strictEqual(R.e1rm(100, 1), 100);
});

test('Epley applies in the low rep range', () => {
  assert.strictEqual(Math.round(R.e1rm(100, 5) * 10) / 10, 116.7);
  assert.strictEqual(Math.round(R.e1rm(100, 10) * 10) / 10, 133.3);
});

test('high reps are damped so they cannot fake a max', () => {
  const at12 = R.e1rm(100, 12);
  const at30 = R.e1rm(100, 30);
  assert.ok(at30 > at12, 'more reps is still more');
  assert.ok(at30 < R.e1rm(100, 12) * 1.2, 'but far less than raw Epley');
  assert.strictEqual(R.effectiveReps(30), 16.5);
});

test('a zero or empty set scores nothing', () => {
  assert.strictEqual(R.e1rm(0, 5), 0);
  assert.strictEqual(R.e1rm(100, 0), 0);
  assert.strictEqual(R.scoreSet(byId.bench, { weight:100, reps:0 }, male), null);
  assert.strictEqual(R.scoreSet(byId.bench, { weight:100, reps:5 }, { sex:'male', bodyweight:0 }), null);
});

// ---------------- load modes ----------------

test('load reflects how the exercise is logged', () => {
  assert.strictEqual(R.setLoad(byId.bench, 100, 80), 100, 'barbell: as entered');
  assert.strictEqual(R.setLoad(byId.db_bench, 40, 80), 80, 'dumbbells: per-hand x 2');
  assert.strictEqual(R.setLoad(byId.db_row, 40, 80), 40, 'unilateral: one limb');
  assert.strictEqual(R.setLoad(byId.pullup, 10, 80), 90, 'bodyweight + added');
  assert.strictEqual(R.setLoad(byId.pushup, 0, 80), 80 * 0.64, 'push-up moves part of you');
});

// ---------------- the standard itself ----------------

test('the Gold standard at reference bodyweight is exactly the listed ratio', () => {
  const gold = R.goldStandard(byId.bench, 'male', 80);
  assert.strictEqual(Math.round(gold * 1000) / 1000, Math.round(1.25 * 80 * 1000) / 1000);
});

test('an index of 1.00 scores exactly 500, the bottom of Gold', () => {
  const s = R.scoreSet(byId.bench, { weight:100, reps:1 }, male);
  assert.strictEqual(Math.round(s.index * 1000) / 1000, 1);
  assert.strictEqual(s.score, 500);
  assert.strictEqual(s.tier.name, 'Gold');
});

test('bodyweight scales allometrically, not linearly', () => {
  const light = R.goldStandard(byId.bench, 'male', 80);
  const heavy = R.goldStandard(byId.bench, 'male', 100);
  assert.ok(heavy > light, 'a heavier lifter is asked for more absolute weight');
  assert.ok(heavy / light < 100 / 80, 'but for a lower ratio of bodyweight');
  // bodyweight^(2/3): +25% bodyweight asks for about +16% on the bar.
  assert.strictEqual(Math.round(heavy / light * 1000) / 1000, Math.round(Math.pow(100/80, 2/3) * 1000) / 1000);
});

test('the same absolute lift ranks higher on a lighter lifter', () => {
  const a = R.scoreSet(byId.bench, { weight:120, reps:3 }, { sex:'male', bodyweight:70 });
  const b = R.scoreSet(byId.bench, { weight:120, reps:3 }, { sex:'male', bodyweight:110 });
  assert.ok(a.score > b.score);
});

test('the female standard is scaled, and the neutral one sits between', () => {
  const m = R.goldStandard(byId.bench, 'male', 70);
  const f = R.goldStandard(byId.bench, 'female', 70);
  const n = R.goldStandard(byId.bench, 'neutral', 70);
  assert.ok(f < m);
  assert.ok(n > f && n < m, 'neutral is the midpoint standard');
  assert.strictEqual(Math.round(f / m * 100) / 100, Math.round(byId.bench.f * Math.pow(65/80, 1/3) * 100) / 100);
});

test('an unknown sex falls back to the neutral standard rather than crashing', () => {
  const s = R.scoreSet(byId.bench, { weight:100, reps:5 }, { sex:'???', bodyweight:80 });
  assert.ok(s && s.score > 0);
  assert.strictEqual(s.gold, R.goldStandard(byId.bench, 'neutral', 80));
});

// ---------------- the score curve ----------------

test('the curve is monotonic and bounded to 1..1000', () => {
  let prev = -1;
  for (let i = 0; i <= 300; i++) {
    const s = R.indexToScore(i / 100);
    assert.ok(s >= prev, 'never goes down');
    assert.ok(s >= 0 && s <= 1000, 'stays in range');
    prev = s;
  }
  assert.strictEqual(R.indexToScore(5), 1000, 'clamps at the top');
  assert.strictEqual(R.indexToScore(0), 0);
});

test('every tier boundary lands on the tier it names', () => {
  for (const t of R.TIERS) assert.strictEqual(R.tierForScore(t.min).name, t.name);
  assert.strictEqual(R.tierForScore(124).name, 'Wood');
  assert.strictEqual(R.tierForScore(1000).name, 'Olympian');
});

test('tier progress runs 0 to 1 inside a tier', () => {
  assert.strictEqual(R.tierProgress(500), 0, 'bottom of Gold');
  assert.strictEqual(Math.round(R.tierProgress(562.5) * 100) / 100, 0.5);
  assert.strictEqual(R.nextTier(500).name, 'Platinum');
  assert.strictEqual(R.nextTier(1000), null, 'nothing above Olympian');
});

// ---------------- the standards are sane ----------------

test('Olympian on the big three is world-record territory, not gym territory', () => {
  const at = (id, kg) => R.scoreSet(byId[id], { weight:kg, reps:1 }, male).score;
  assert.ok(at('bench', 100) === 500, '100 kg bench at 80 kg bodyweight is Gold');
  assert.ok(at('bench', 140) < 975, '140 kg bench is strong, not Olympian');
  assert.ok(at('bench', 210) >= 975, 'a 210 kg bench at 80 kg is Olympian');
  assert.ok(at('squat', 132) === 500);
  assert.ok(at('deadlift', 164) === 500);
});

test('a first-timer lands in the bottom tiers, not mid-ladder', () => {
  const s = R.scoreSet(byId.bench, { weight:40, reps:8 }, male);
  assert.ok(s.score < 250, `expected Wood or Iron, got ${s.score}`);
  assert.ok(['Wood','Iron'].includes(s.tier.name));
});

test('every exercise gives a plausible Gold standard for a typical lifter', () => {
  for (const ex of EXERCISES) {
    const gold = R.goldStandard(ex, 'male', 80);
    assert.ok(gold > 0, `${ex.id} has no standard`);
    assert.ok(gold < 300, `${ex.id} Gold standard of ${gold} kg is not a real lift`);
    const s = R.scoreSet(ex, { weight: ex.mode === 'pair' ? gold / 2 : gold, reps:1 }, male);
    if (ex.mode !== 'bw') assert.strictEqual(s.score, 500, `${ex.id} should score 500 at its own standard`);
  }
});

// ---------------- aggregates ----------------

const now = Date.UTC(2026, 8, 17);
const day = 86400000;

test('an exercise rank is your best recent set', () => {
  const ranks = R.exerciseRanks([
    { exerciseId:'bench', score:400, ts: now - 5*day },
    { exerciseId:'bench', score:520, ts: now - 2*day },
    { exerciseId:'bench', score:300, ts: now - 1*day },
  ], now);
  assert.strictEqual(ranks.bench.score, 520);
});

test('a recent set outranks a stale personal best, but the best is remembered', () => {
  const ranks = R.exerciseRanks([
    { exerciseId:'squat', score:800, ts: now - 400*day },
    { exerciseId:'squat', score:600, ts: now - 3*day },
  ], now);
  assert.strictEqual(ranks.squat.score, 600, 'your rank is what you can do now');
  assert.strictEqual(ranks.squat.allTime, 800, 'the all-time best is still on the record');
  assert.strictEqual(ranks.squat.recent, true);
});

test('an untrained category counts as zero against the overall rank', () => {
  const benchOnly = R.overallRank([{ exerciseId:'bench', score:1000, ts:now }], byId, now);
  assert.strictEqual(benchOnly.ranked, 1, 'one category of four');
  assert.ok(benchOnly.score <= 300, 'a bench-only Olympian is not an overall Olympian');
  assert.strictEqual(benchOnly.categories.legs.score, 0);
});

test('training everything ranks you where you actually are', () => {
  const o = R.overallRank([
    { exerciseId:'bench',        score:600, ts:now },
    { exerciseId:'deadlift',     score:600, ts:now },
    { exerciseId:'squat',        score:600, ts:now },
    { exerciseId:'cable_crunch', score:600, ts:now },
  ], byId, now);
  assert.strictEqual(o.ranked, 4);
  assert.strictEqual(o.score, 600, 'all four at 600, weights sum to the whole');
  assert.strictEqual(o.tier.name, 'Gold', '600 is inside Gold; Platinum starts at 625');
});

test('category weights sum to exactly the whole, in integers', () => {
  const { CATEGORY_WEIGHT_TOTAL } = require('../data.js');
  assert.strictEqual(CATEGORIES.reduce((n, c) => n + c.weight, 0), CATEGORY_WEIGHT_TOTAL);
  assert.ok(CATEGORIES.every(c => Number.isInteger(c.weight)), 'no floating point in the weighting');
});

test('a compound outranks isolation at the same score', () => {
  const c = R.categoryRanks([
    { exerciseId:'bench',     score:600, ts:now },
    { exerciseId:'lat_raise', score:600, ts:now },
  ], byId, now);
  assert.strictEqual(c.push.exerciseId, 'bench', 'the press defines your push rank');
});

// ---------------- xp, levels, streaks ----------------

test('xp rewards the quality of the set, not just showing up', () => {
  assert.ok(R.setXp(800) > R.setXp(300));
  assert.strictEqual(R.setXp(0), 1, 'a logged set is always worth something');
});

test('a streak multiplies xp, and caps', () => {
  const sets = [500, 500, 500];
  const none = R.workoutXp(sets, 0, 0);
  const five = R.workoutXp(sets, 0, 5);
  const huge = R.workoutXp(sets, 0, 99);
  assert.strictEqual(none, 250);
  assert.strictEqual(five, Math.round(250 * 1.25));
  assert.strictEqual(huge, Math.round(250 * 1.5), 'capped at ten weeks');
});

test('personal records are worth real xp', () => {
  assert.strictEqual(R.workoutXp([500], 1, 0) - R.workoutXp([500], 0, 0), 150);
});

test('levels start at 1 and get further apart', () => {
  assert.strictEqual(R.levelFor(0).level, 1);
  assert.strictEqual(R.xpForLevel(1), 0);
  assert.strictEqual(R.levelFor(250).level, 2);
  assert.strictEqual(R.levelFor(249).level, 1);
  const gap = n => R.xpForLevel(n + 1) - R.xpForLevel(n);
  assert.ok(gap(10) > gap(2), 'later levels cost more');
  const l = R.levelFor(1000);
  assert.ok(l.progress >= 0 && l.progress < 1);
});

test('a streak counts consecutive weeks that hit the goal', () => {
  const w = ts => ({ ts });
  const weeks = n => now - n * 7 * day;
  // three per week for three weeks running, including this one
  const workouts = [];
  for (const k of [0, 1, 2]) for (const d of [0, 1, 2]) workouts.push(w(weeks(k) - d * day));
  assert.strictEqual(R.streakWeeks(workouts, 3, now), 3);
});

test('an unfinished week does not break a streak', () => {
  const workouts = [];
  for (const d of [0, 1, 2]) workouts.push({ ts: now - 7*day - d*day });   // last week: goal hit
  workouts.push({ ts: now });                                              // this week: one so far
  assert.strictEqual(R.streakWeeks(workouts, 3, now), 1, 'last week still counts');
});

test('missing the goal ends the streak', () => {
  const workouts = [{ ts: now - 7*day }, { ts: now - 8*day }];             // only two last week
  assert.strictEqual(R.streakWeeks(workouts, 3, now), 0);
});

test('weeks are Monday-based and stable across a year boundary', () => {
  const mon = Date.UTC(2026, 8, 14, 12);
  const sun = Date.UTC(2026, 8, 20, 12);
  assert.strictEqual(R.weekKey(mon), R.weekKey(sun), 'Monday and Sunday are one week');
  assert.notStrictEqual(R.weekKey(sun), R.weekKey(sun + day), 'the next Monday is a new week');
});
