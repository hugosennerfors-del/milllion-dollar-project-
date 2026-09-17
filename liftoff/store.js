/* ------------------------------------------------------------------
   store.js — state, persistence, and the things derived from history.

   Everything lives in localStorage on this device. Weight is stored in
   kilograms always; pounds are a display choice, converted at the edge.
   That keeps every score comparable no matter what unit was typed.
------------------------------------------------------------------ */

const STORAGE_KEY = 'liftoff.v1';
const SCHEMA = 1;

const DEFAULT_STATE = {
  schema: SCHEMA,
  profile: {
    name: '',
    sex: 'male',              // male | female | neutral
    bodyweight: 80,           // kg
    units: 'kg',              // kg | lb
    weeklyGoal: 3,
    restDefault: 120,         // seconds
    theme: 'dark',
  },
  customExercises: [],
  routines: [],
  workouts: [],               // finished workouts, newest last
  active: null,               // the workout in progress, if any
  bodyweightLog: [],          // [{ts, kg}]
  achievements: {},           // id -> unlocked timestamp
  totalXp: 0,
};

const LB = 2.2046226218;
const toKg = lb => lb / LB;
const toLb = kg => kg * LB;

/* ---------- persistence ---------- */

function loadState(){
  let raw = null;
  try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) { /* private mode */ }
  if (!raw) return structuredClone(DEFAULT_STATE);
  try {
    const parsed = JSON.parse(raw);
    return migrate(parsed);
  } catch (e) {
    console.warn('Could not read saved data, starting fresh.', e);
    return structuredClone(DEFAULT_STATE);
  }
}

function migrate(s){
  const out = structuredClone(DEFAULT_STATE);
  Object.assign(out, s);
  out.profile = Object.assign({}, DEFAULT_STATE.profile, s.profile || {});
  for (const k of ['customExercises','routines','workouts','bodyweightLog']) {
    if (!Array.isArray(out[k])) out[k] = [];
  }
  if (typeof out.achievements !== 'object' || !out.achievements) out.achievements = {};
  out.schema = SCHEMA;
  return out;
}

let saveTimer = null;
function saveState(state){
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (e) { console.warn('Could not save.', e); }
  }, 120);
}

function saveNow(state){
  clearTimeout(saveTimer);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch (e) { console.warn('Could not save.', e); }
}

/* ---------- exercises ---------- */

function allExercises(state){
  return EXERCISES.concat(state.customExercises || []);
}
function exerciseMap(state){
  return Object.fromEntries(allExercises(state).map(e => [e.id, e]));
}
function allRoutines(state){
  return STOCK_ROUTINES.filter(r => !(state.deletedStock || []).includes(r.id))
    .concat(state.routines || []);
}

/* ---------- history ---------- */

/* Every scored set ever logged, flattened for the rank engine. */
function scoreHistory(state){
  const out = [];
  for (const w of state.workouts) {
    for (const entry of w.entries) {
      for (const s of entry.sets) {
        if (s.done && s.score) out.push({ exerciseId: entry.exerciseId, score: s.score, ts: w.ts });
      }
    }
  }
  return out;
}

/* Best-ever numbers per exercise, used for PR detection and the
   "previous" hint next to each set. */
function personalBests(state, uptoTs = Infinity){
  const best = {};
  for (const w of state.workouts) {
    if (w.ts >= uptoTs) continue;
    for (const entry of w.entries) {
      const b = best[entry.exerciseId] || (best[entry.exerciseId] = { weight:0, e1rm:0, score:0, reps:0, ts:0 });
      for (const s of entry.sets) {
        if (!s.done) continue;
        b.weight = Math.max(b.weight, s.weight || 0);
        b.e1rm   = Math.max(b.e1rm, s.e1rm || 0);
        b.score  = Math.max(b.score, s.score || 0);
        b.reps   = Math.max(b.reps, s.reps || 0);
        if (w.ts > b.ts) { b.ts = w.ts; b.last = { weight:s.weight, reps:s.reps }; }
      }
    }
  }
  return best;
}

/* The last time this exercise was trained, for the "previous" column. */
function lastSetsFor(state, exerciseId){
  for (let i = state.workouts.length - 1; i >= 0; i--) {
    const entry = state.workouts[i].entries.find(e => e.exerciseId === exerciseId);
    if (entry) {
      const done = entry.sets.filter(s => s.done);
      if (done.length) return done;
    }
  }
  return null;
}

function workoutVolume(workout){
  let v = 0;
  for (const e of workout.entries)
    for (const s of e.sets)
      if (s.done) v += (s.load || s.weight || 0) * (s.reps || 0);
  return v;
}

function totalVolume(state){
  return state.workouts.reduce((n, w) => n + workoutVolume(w), 0);
}

/* ---------- achievements ---------- */

const ACHIEVEMENTS = [
  { id:'first',      icon:'🎬', name:'Liftoff',          desc:'Finish your first workout',
    test:s => s.workouts.length >= 1 },
  { id:'ten',        icon:'🔟', name:'Ten Under the Belt', desc:'Finish 10 workouts',
    test:s => s.workouts.length >= 10 },
  { id:'fifty',      icon:'🏋️', name:'Regular',          desc:'Finish 50 workouts',
    test:s => s.workouts.length >= 50 },
  { id:'streak4',    icon:'🔥', name:'Month On',          desc:'Hit your weekly goal 4 weeks running',
    test:s => streakWeeks(s.workouts, s.profile.weeklyGoal) >= 4 },
  { id:'streak12',   icon:'🧱', name:'Quarter Built',     desc:'Hit your weekly goal 12 weeks running',
    test:s => streakWeeks(s.workouts, s.profile.weeklyGoal) >= 12 },
  { id:'silver',     icon:'🥈', name:'Silver Overall',    desc:'Reach Silver overall',
    test:(s,o) => o.score >= 375 },
  { id:'gold',       icon:'🥇', name:'Gold Overall',      desc:'Reach Gold overall',
    test:(s,o) => o.score >= 500 },
  { id:'diamond',    icon:'💎', name:'Diamond Overall',   desc:'Reach Diamond overall',
    test:(s,o) => o.score >= 750 },
  { id:'olympian',   icon:'🏛️', name:'Olympian',          desc:'Reach Olympian on any lift',
    test:s => scoreHistory(s).some(h => h.score >= 975) },
  { id:'rounded',    icon:'🧭', name:'Well Rounded',      desc:'Rank in all four categories',
    test:(s,o) => o.ranked === 4 },
  { id:'vol100',     icon:'📦', name:'100 Tonnes',        desc:'Move 100,000 kg in total',
    test:s => totalVolume(s) >= 100000 },
  { id:'vol1m',      icon:'🚚', name:'A Million Kilos',   desc:'Move 1,000,000 kg in total',
    test:s => totalVolume(s) >= 1000000 },
  { id:'century',    icon:'💯', name:'Century Set',       desc:'Log a set of 100 reps or more',
    test:s => s.workouts.some(w => w.entries.some(e => e.sets.some(x => x.done && x.reps >= 100))) },
  { id:'level10',    icon:'⭐', name:'Level 10',          desc:'Reach level 10',
    test:s => levelFor(s.totalXp).level >= 10 },
  { id:'explorer',   icon:'🗺️', name:'Explorer',          desc:'Log 25 different exercises',
    test:s => new Set(scoreHistory(s).map(h => h.exerciseId)).size >= 25 },
];

/* Returns the achievements newly unlocked by whatever just happened. */
function checkAchievements(state, overall){
  const fresh = [];
  for (const a of ACHIEVEMENTS) {
    if (state.achievements[a.id]) continue;
    let ok = false;
    try { ok = a.test(state, overall); } catch (e) { ok = false; }
    if (ok) { state.achievements[a.id] = Date.now(); fresh.push(a); }
  }
  return fresh;
}

/* ---------- export / import ---------- */

function exportState(state){
  return JSON.stringify({ app:'liftoff', schema:SCHEMA, exportedAt:new Date().toISOString(), state }, null, 2);
}

function importState(text){
  const parsed = JSON.parse(text);
  const raw = parsed && parsed.state ? parsed.state : parsed;
  if (!raw || typeof raw !== 'object') throw new Error('That file does not look like a Liftoff backup.');
  if (!Array.isArray(raw.workouts)) throw new Error('No workout history in that file.');
  return migrate(raw);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { STORAGE_KEY, DEFAULT_STATE, toKg, toLb, migrate, ACHIEVEMENTS,
                     scoreHistory, personalBests, workoutVolume, totalVolume,
                     exportState, importState };
}
