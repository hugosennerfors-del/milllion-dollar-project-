/* ------------------------------------------------------------------
   rank.js — the rank system.

   One set in, one number out: a strength score from 1 to 1000 that
   already accounts for bodyweight and sex, then a tier on the ladder
   Wood -> Iron -> Bronze -> Silver -> Gold -> Platinum -> Diamond ->
   Champion -> Olympian.

   The chain is four steps, and every one of them is visible in the UI
   so a score is never a black box:

     1. load     what was actually moved (see mode in data.js)
     2. e1RM     Epley, with high reps damped so a set of 30 cannot
                 fake a one-rep max
     3. index    e1RM / the Gold standard for this lift at this
                 bodyweight and sex. 1.00 means exactly Gold.
     4. score    the index run through a fixed anchor curve

   Bodyweight is handled allometrically: strength scales with about
   bodyweight^(2/3), so the Gold standard is
       ratio x REF^(1/3) x bodyweight^(2/3)
   which is exactly the listed ratio at the reference bodyweight and
   correctly asks more absolute weight from heavier lifters without
   asking them to match a lighter lifter's ratio.
------------------------------------------------------------------ */

/* data.js supplies the categories. In the browser it is a plain <script>
   whose top-level const is visible here; under node it is a module. A
   hoisted `var` would collide with that const at parse time, so the
   lookup is deferred into a function instead. */
function categoryData(){
  if (typeof CATEGORIES !== 'undefined')
    return { list: CATEGORIES, total: CATEGORY_WEIGHT_TOTAL };
  const d = require('./data.js');
  return { list: d.CATEGORIES, total: d.CATEGORY_WEIGHT_TOTAL };
}

const TIERS = [
  { name:'Wood',     min:0,   color:'#8a6a4a' },
  { name:'Iron',     min:125, color:'#8e97a4' },
  { name:'Bronze',   min:250, color:'#b87333' },
  { name:'Silver',   min:375, color:'#9fb1c4' },
  { name:'Gold',     min:500, color:'#d4a017' },
  { name:'Platinum', min:625, color:'#4fb3a5' },
  { name:'Diamond',  min:750, color:'#4aa3e8' },
  { name:'Champion', min:875, color:'#a855f0' },
  { name:'Olympian', min:975, color:'#e5484d' },
];

/* index -> score. Linear between anchors, flat outside them. */
const CURVE = [
  [0.00,   0], [0.42, 125], [0.58, 250], [0.74, 375], [1.00, 500],
  [1.22, 625], [1.45, 750], [1.70, 875], [1.95, 975], [2.10, 1000],
];

const REF_BW = { male:80, female:65, neutral:72.5 };

function clamp(v, lo, hi){ return v < lo ? lo : v > hi ? hi : v; }

/* Reps beyond 12 add much less: Epley is only honest in the low range. */
function effectiveReps(reps){
  if (reps <= 1) return 0;
  return reps <= 12 ? reps : 12 + (reps - 12) * 0.25;
}

function e1rm(weight, reps){
  if (!(weight > 0) || !(reps > 0)) return 0;
  return weight * (1 + effectiveReps(reps) / 30);
}

/* What the lifter actually moved, in kg. */
function setLoad(ex, weight, bodyweight){
  const w = Number(weight) || 0;
  switch (ex.mode) {
    case 'pair':   return w * 2;
    case 'bw':     return (Number(bodyweight) || 0) * (ex.bwFrac || 1) + w;
    case 'single':
    case 'bar':
    default:       return w;
  }
}

/* The e1RM that earns Gold on this lift, for this lifter. */
function goldStandard(ex, sex, bodyweight){
  const bw = Number(bodyweight) || 0;
  if (bw <= 0) return 0;
  const key = REF_BW[sex] ? sex : 'neutral';
  const ref = REF_BW[key];
  let ratio = ex.ratio;
  if (key === 'female')  ratio *= ex.f;
  if (key === 'neutral') ratio *= (1 + ex.f) / 2;
  return ratio * Math.pow(ref, 1/3) * Math.pow(bw, 2/3);
}

function indexToScore(index){
  if (index <= 0) return 0;
  for (let i = 1; i < CURVE.length; i++) {
    const [x0, y0] = CURVE[i-1], [x1, y1] = CURVE[i];
    if (index <= x1) return clamp(Math.round(y0 + (index - x0) / (x1 - x0) * (y1 - y0)), 1, 1000);
  }
  return 1000;
}

/* The whole chain, kept together so the UI can show its working. */
function scoreSet(ex, set, profile){
  const bw = Number(profile.bodyweight) || 0;
  const reps = Number(set.reps) || 0;
  if (!ex || reps <= 0 || bw <= 0) return null;

  const load = setLoad(ex, set.weight, bw);
  if (load <= 0) return null;

  const est = e1rm(load, reps);
  const gold = goldStandard(ex, profile.sex, bw);
  if (gold <= 0) return null;

  const index = est / gold;
  const score = indexToScore(index);
  return { load, e1rm: est, gold, index, score, tier: tierForScore(score) };
}

function tierForScore(score){
  let t = TIERS[0];
  for (const tier of TIERS) if (score >= tier.min) t = tier;
  return t;
}

/* How far through the current tier a score sits, 0..1. */
function tierProgress(score){
  const i = TIERS.findIndex(t => t === tierForScore(score));
  const lo = TIERS[i].min;
  const hi = i + 1 < TIERS.length ? TIERS[i+1].min : 1001;
  return clamp((score - lo) / (hi - lo), 0, 1);
}

function nextTier(score){
  const i = TIERS.findIndex(t => t === tierForScore(score));
  return i + 1 < TIERS.length ? TIERS[i+1] : null;
}

/* ---------------- aggregate ranks ----------------

   An exercise's rank is the best set you have scored on it recently.
   A category's rank is the best exercise in it, nudged by that
   exercise's reliability weight so a lateral raise cannot out-rank a
   press. Your overall rank is the weighted mean of the four
   categories — and an untrained category counts as zero, because you
   cannot be an Olympian who has never squatted.                       */

const RECENT_DAYS = 180;

function isRecent(ts, now, days = RECENT_DAYS){
  return (now - ts) <= days * 86400000;
}

/* history: [{exerciseId, score, ts}] — every scored set ever logged. */
function exerciseRanks(history, now = Date.now()){
  const best = {};
  for (const h of history) {
    if (!h.score) continue;
    const cur = best[h.exerciseId];
    const recent = isRecent(h.ts, now);
    if (!cur) { best[h.exerciseId] = { score:h.score, ts:h.ts, recent, allTime:h.score }; continue; }
    cur.allTime = Math.max(cur.allTime, h.score);
    // A recent set always beats a stale one; otherwise higher wins.
    if ((recent && !cur.recent) || (recent === cur.recent && h.score > cur.score)) {
      cur.score = h.score; cur.ts = h.ts; cur.recent = recent;
    }
  }
  return best;
}

function categoryRanks(history, exerciseById, now = Date.now()){
  const { list } = categoryData();
  const best = exerciseRanks(history, now);
  const out = {};
  for (const c of list) out[c.id] = { score:0, exerciseId:null, weight:c.weight, name:c.name };
  for (const [id, rec] of Object.entries(best)) {
    const ex = exerciseById[id];
    if (!ex) continue;
    const slot = out[ex.cat];
    if (!slot) continue;
    const weighted = rec.score * (ex.w != null ? ex.w : 1);
    if (weighted > slot.score) { slot.score = Math.round(weighted); slot.exerciseId = id; }
  }
  return out;
}

function overallRank(history, exerciseById, now = Date.now()){
  const { list, total: weightTotal } = categoryData();
  const cats = categoryRanks(history, exerciseById, now);
  let total = 0;
  for (const c of list) total += cats[c.id].score * c.weight;
  const score = Math.round(total / weightTotal);
  const ranked = list.filter(c => cats[c.id].score > 0).length;
  return { score, tier: tierForScore(score), progress: tierProgress(score),
           next: nextTier(score), categories: cats, ranked, of: list.length };
}

/* ---------------- XP, levels, streaks ---------------- */

const XP = { perSetDivisor:10, workout:100, pr:150, streakStep:0.05, streakCap:10 };

function setXp(score){ return Math.max(1, Math.round((score || 0) / XP.perSetDivisor)); }

function workoutXp(scoredSets, prCount, streakWeeks){
  const base = scoredSets.reduce((n, s) => n + setXp(s), 0) + XP.workout + prCount * XP.pr;
  const mult = 1 + XP.streakStep * Math.min(streakWeeks || 0, XP.streakCap);
  return Math.round(base * mult);
}

/* Cumulative XP needed to be level n. Level 1 is free. */
function xpForLevel(n){ return n <= 1 ? 0 : Math.round(250 * Math.pow(n - 1, 1.6)); }

function levelFor(totalXp){
  let n = 1;
  while (xpForLevel(n + 1) <= totalXp) n++;
  const cur = xpForLevel(n), next = xpForLevel(n + 1);
  return { level:n, into:totalXp - cur, span:next - cur, progress:(totalXp - cur) / (next - cur), next };
}

/* Monday-start week key, e.g. 2026-W38. */
function weekKey(ts){
  const d = new Date(ts);
  d.setHours(0,0,0,0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));       // Thursday of this week
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d - jan1) / 86400000 + 1) / 7);
  return d.getFullYear() + '-W' + String(week).padStart(2, '0');
}

function weekStart(ts){
  const d = new Date(ts);
  d.setHours(0,0,0,0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

/* Weeks in a row that hit the weekly goal. The week in progress cannot
   break a streak — it just has not finished yet. */
function streakWeeks(workouts, goal = 3, now = Date.now()){
  const counts = {};
  for (const w of workouts) counts[weekKey(w.ts)] = (counts[weekKey(w.ts)] || 0) + 1;
  let streak = 0;
  let cursor = weekStart(now);
  if ((counts[weekKey(cursor)] || 0) >= goal) streak++;          // this week already counts
  cursor -= 7 * 86400000;
  while ((counts[weekKey(cursor)] || 0) >= goal) { streak++; cursor -= 7 * 86400000; }
  return streak;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    TIERS, CURVE, REF_BW, RECENT_DAYS, XP, categoryData,
    effectiveReps, e1rm, setLoad, goldStandard, indexToScore, scoreSet,
    tierForScore, tierProgress, nextTier,
    exerciseRanks, categoryRanks, overallRank,
    setXp, workoutXp, xpForLevel, levelFor, weekKey, weekStart, streakWeeks,
  };
}
