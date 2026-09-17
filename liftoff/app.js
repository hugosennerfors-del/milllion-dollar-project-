/* ------------------------------------------------------------------
   app.js — views and interaction.

   Four tabs, one job each: Train (log), Ranks (where you stand),
   History (what you did), Profile (who you are + your data).
   Rendering is plain string -> innerHTML with delegated events, which
   is fast enough here and keeps the whole UI readable in one file.
------------------------------------------------------------------ */

let state = loadState();
let tab = 'train';
let sheetStack = [];
let restTimer = null, restEnds = 0, tickTimer = null;

const $  = sel => document.querySelector(sel);
const esc = s => String(s == null ? '' : s)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  .replace(/"/g,'&quot;').replace(/'/g,'&#39;');

const uid = () => Math.random().toString(36).slice(2, 10);

/* ---------- units ---------- */
const unit   = () => state.profile.units;
const toDisp = kg => unit() === 'lb' ? toLb(kg) : kg;
const fromDisp = v => unit() === 'lb' ? toKg(v) : v;
const nice = n => {
  const r = Math.round(n * 10) / 10;
  return (Number.isInteger(r) ? r : r.toFixed(1));
};
const fmtW = kg => `${nice(toDisp(kg))} ${unit()}`;
const fmtVol = kg => {
  const v = toDisp(kg);
  return v >= 1000 ? `${nice(v/1000)}k ${unit()}` : `${Math.round(v)} ${unit()}`;
};

/* ---------- misc helpers ---------- */
function toast(msg){
  const host = $('#toast-host');
  host.innerHTML = `<div class="toast">${esc(msg)}</div>`;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => host.innerHTML = '', 2200);
}

function exMap(){ return exerciseMap(state); }
function exById(id){ return exMap()[id]; }

function relDate(ts){
  const d = new Date(ts), now = new Date();
  const days = Math.floor((new Date(now.getFullYear(),now.getMonth(),now.getDate()) -
                           new Date(d.getFullYear(),d.getMonth(),d.getDate())) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString(undefined, { day:'numeric', month:'short',
    year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}
function fmtDur(ms){
  const s = Math.max(0, Math.floor(ms/1000));
  const h = Math.floor(s/3600), m = Math.floor(s%3600/60);
  return h ? `${h}h ${m}m` : `${m}m`;
}
function clock(sec){
  const m = Math.floor(sec/60), s = sec % 60;
  return `${m}:${String(s).padStart(2,'0')}`;
}

function persist(){ saveState(state); }

/* ---------- the rank badge ---------- */
function badge(score, tier, progress, small){
  const C = 2 * Math.PI * 52;
  return `<div class="badge ${small ? 'sm' : ''}" style="--c:${tier.color}">
    <svg viewBox="0 0 120 120">
      <circle class="ring-bg" cx="60" cy="60" r="52"></circle>
      <circle class="ring" cx="60" cy="60" r="52"
        stroke-dasharray="${(progress*C).toFixed(1)} ${C.toFixed(1)}"></circle>
    </svg>
    <div>
      <div class="score num">${score}</div>
      ${small ? '' : '<div class="of">/ 1000</div>'}
    </div>
  </div>`;
}

function tierPill(tier){
  return `<span class="pill tier" style="--c:${tier.color}">${tier.name}</span>`;
}

function overall(){
  return overallRank(scoreHistory(state), exMap());
}

/* ================================================================
   ROUTER
================================================================ */
function render(){
  const v = $('#view');
  document.documentElement.dataset.theme = state.profile.theme;
  $('#topbar-actions').innerHTML = '';
  if (state.active) { renderWorkout(v); }
  else if (tab === 'train')   renderTrain(v);
  else if (tab === 'ranks')   renderRanks(v);
  else if (tab === 'history') renderHistory(v);
  else if (tab === 'profile') renderProfile(v);
  for (const b of document.querySelectorAll('.tabbar button'))
    b.classList.toggle('on', b.dataset.tab === tab && !state.active);
  renderRest();
}

$('#tabbar').addEventListener('click', e => {
  const b = e.target.closest('button[data-tab]');
  if (!b) return;
  if (state.active) { toast('Finish or discard your workout first'); return; }
  tab = b.dataset.tab;
  window.scrollTo(0, 0);
  render();
});

/* ================================================================
   TRAIN
================================================================ */
function renderTrain(v){
  $('#title').textContent = state.profile.name ? `Hi, ${state.profile.name}` : 'Liftoff';
  const o = overall();
  const lvl = levelFor(state.totalXp);
  const streak = streakWeeks(state.workouts, state.profile.weeklyGoal);
  const thisWeek = state.workouts.filter(w => weekKey(w.ts) === weekKey(Date.now())).length;
  const routines = allRoutines(state);
  const recent = state.workouts.slice(-3).reverse();

  v.innerHTML = `
    <div class="card rankcard" data-go="ranks">
      ${badge(o.score, o.tier, o.progress)}
      <div class="tiername" style="--c:${o.tier.color}">${o.tier.name}</div>
      <div class="muted tiny" style="margin-top:4px">
        ${o.next ? `${o.next.min - o.score} points to ${o.next.name}` : 'Top of the ladder'}
        &middot; ${o.ranked}/${o.of} categories ranked
      </div>
    </div>

    <div class="card tight">
      <div class="row between" style="margin-bottom:7px">
        <b>Level ${lvl.level}</b>
        <span class="tiny muted num">${lvl.into} / ${lvl.span} XP</span>
      </div>
      <div class="bar"><i style="width:${(lvl.progress*100).toFixed(1)}%"></i></div>
    </div>

    <div class="stats" style="margin-bottom:12px">
      <div class="stat"><b class="num">${streak}🔥</b><span>Streak</span></div>
      <div class="stat"><b class="num">${thisWeek}/${state.profile.weeklyGoal}</b><span>This week</span></div>
      <div class="stat"><b class="num">${state.workouts.length}</b><span>Workouts</span></div>
    </div>

    <button class="btn primary block" data-act="start-empty" style="margin-bottom:16px">
      Start Empty Workout
    </button>

    <div class="row between" style="margin-bottom:9px">
      <h2>Routines</h2>
      <button class="btn sm ghost" data-act="new-routine">New</button>
    </div>
    ${routines.map(r => `
      <div class="item">
        <div class="grow" data-act="edit-routine" data-id="${r.id}">
          <b>${esc(r.name)}</b>
          <div class="meta truncate">${r.items.length} exercises &middot;
            ${esc(r.items.map(i => (exById(i)||{}).name).filter(Boolean).slice(0,3).join(', '))}</div>
        </div>
        <button class="btn sm primary" data-act="start-routine" data-id="${r.id}">Start</button>
      </div>`).join('')}

    ${recent.length ? `
      <div class="row between" style="margin:18px 0 9px">
        <h2>Recent</h2>
        <button class="btn sm ghost" data-go="history">All</button>
      </div>
      ${recent.map(w => workoutItem(w)).join('')}` : ''}
  `;
}

function workoutItem(w){
  const sets = w.entries.reduce((n,e) => n + e.sets.filter(s=>s.done).length, 0);
  return `<button class="item" data-act="view-workout" data-id="${w.id}">
    <div class="grow">
      <b>${esc(w.name)}</b>
      <div class="meta">${relDate(w.ts)} &middot; ${sets} sets &middot; ${fmtVol(workoutVolume(w))}</div>
    </div>
    <span class="pill num">+${w.xp} XP</span>
  </button>`;
}

/* ================================================================
   ACTIVE WORKOUT
================================================================ */
function startWorkout(name, exerciseIds){
  state.active = {
    startedAt: Date.now(),
    name: name || defaultWorkoutName(),
    entries: (exerciseIds || []).map(id => newEntry(id)),
    notes: '',
  };
  persist(); render();
  if (!exerciseIds || !exerciseIds.length) openExercisePicker();
}

function defaultWorkoutName(){
  const h = new Date().getHours();
  return h < 12 ? 'Morning Workout' : h < 17 ? 'Afternoon Workout' : 'Evening Workout';
}

function newEntry(id){
  const prev = lastSetsFor(state, id);
  const n = prev ? prev.length : 3;
  return {
    exerciseId: id,
    sets: Array.from({length: Math.min(Math.max(n,1),6)}, (_, i) => ({
      weight: prev && prev[i] ? prev[i].weight : (prev && prev.length ? prev[prev.length-1].weight : ''),
      reps: '', rpe: '', done: false,
    })),
  };
}

function renderWorkout(v){
  const a = state.active;
  $('#title').textContent = a.name;
  $('#topbar-actions').innerHTML =
    `<button class="btn sm primary" data-act="finish">Finish</button>`;

  const elapsed = fmtDur(Date.now() - a.startedAt);
  const doneSets = a.entries.reduce((n,e) => n + e.sets.filter(s=>s.done).length, 0);
  const vol = a.entries.reduce((n,e) => n + e.sets.reduce((m,s) =>
    m + (s.done ? (s.load||0) * (s.reps||0) : 0), 0), 0);

  v.innerHTML = `
    <div class="stats" style="margin-bottom:13px">
      <div class="stat"><b class="num" id="elapsed">${elapsed}</b><span>Elapsed</span></div>
      <div class="stat"><b class="num">${doneSets}</b><span>Sets</span></div>
      <div class="stat"><b class="num">${fmtVol(vol)}</b><span>Volume</span></div>
    </div>

    ${a.entries.map((entry, ei) => exerciseBlock(entry, ei)).join('')}

    <button class="btn block ghost" data-act="add-exercise" style="margin:4px 0 12px">
      + Add Exercise
    </button>
    <div class="field">
      <label class="label">Workout notes</label>
      <textarea data-act="notes" placeholder="How did it go?">${esc(a.notes)}</textarea>
    </div>
    <button class="btn block danger ghost" data-act="discard" style="margin-bottom:10px">
      Discard Workout
    </button>
  `;

  clearInterval(tickTimer);
  tickTimer = setInterval(() => {
    const el = $('#elapsed');
    if (el && state.active) el.textContent = fmtDur(Date.now() - state.active.startedAt);
    else clearInterval(tickTimer);
  }, 10000);
}

function exerciseBlock(entry, ei){
  const ex = exById(entry.exerciseId);
  if (!ex) return '';
  const prev = lastSetsFor(state, entry.exerciseId);
  const wLabel = ex.mode === 'pair' ? `${unit()} ea.`
               : ex.mode === 'bw'   ? `+${unit()}`
               : unit();

  return `<div class="exblock" data-ei="${ei}">
    <div class="exhead">
      <h3 class="truncate">${esc(ex.name)}</h3>
      <button class="btn sm ghost" data-act="ex-info" data-ei="${ei}">?</button>
      <button class="btn sm ghost" data-act="remove-ex" data-ei="${ei}">✕</button>
    </div>
    <div class="setgrid">
      <div class="head">#</div><div class="head">${wLabel}</div>
      <div class="head">Reps</div><div class="head">RPE</div><div class="head"></div>
      ${entry.sets.map((s, si) => setRow(ex, entry, s, si, prev)).join('')}
    </div>
    <button class="btn sm ghost block" data-act="add-set" data-ei="${ei}" style="margin-top:9px">
      + Add Set
    </button>
  </div>`;
}

function setRow(ex, entry, s, si, prev){
  const p = prev && prev[si];
  const wVal = s.weight === '' || s.weight == null ? '' : nice(toDisp(s.weight));
  const scoreLine = s.done && s.score
    ? `<span class="pill tier" style="--c:${s.tier.color}">${s.tier.name} ${s.score}</span>
       <span class="prev num">e1RM ${fmtW(s.e1rm)}</span>
       ${s.pr && s.pr.length ? `<span class="pill" style="background:var(--warn);color:#2A1D00">🏆 ${s.pr.join(' + ')} PR</span>` : ''}`
    : p ? `<span class="prev">Last: ${nice(toDisp(p.weight))} × ${p.reps}</span>` : '';

  return `<div class="setrow">
    <div class="setno">${si+1}</div>
    <input type="number" inputmode="decimal" step="0.5" value="${wVal}"
           data-f="weight" data-si="${si}" placeholder="${ex.mode==='bw' ? '0' : '—'}">
    <input type="number" inputmode="numeric" value="${s.reps ?? ''}"
           data-f="reps" data-si="${si}" placeholder="—">
    <input type="number" inputmode="decimal" step="0.5" min="1" max="10" class="rpe"
           value="${s.rpe ?? ''}" data-f="rpe" data-si="${si}" placeholder="—">
    <button class="done-btn ${s.done ? 'on' : ''}" data-act="toggle-set" data-si="${si}"
            aria-label="Complete set ${si+1}">
      <svg viewBox="0 0 24 24"><path d="M5 13l4.5 4.5L19 7"/></svg>
    </button>
    ${scoreLine ? `<div class="setmeta">${scoreLine}</div>` : ''}
  </div>`;
}

/* ---------- set editing ---------- */
function entryAt(ei){ return state.active.entries[ei]; }

function onSetInput(e){
  const input = e.target.closest('input[data-f]');
  if (!input) return;
  const block = input.closest('.exblock');
  const entry = entryAt(+block.dataset.ei);
  const s = entry.sets[+input.dataset.si];
  const f = input.dataset.f;
  const raw = input.value === '' ? '' : Number(input.value);

  if (f === 'weight')    s.weight = raw === '' ? '' : fromDisp(raw);
  else if (f === 'reps') s.reps = raw === '' ? '' : Math.max(0, Math.round(raw));
  else                   s.rpe = raw === '' ? '' : raw;

  if (s.done) { scoreThisSet(entry, s); refreshSetMeta(block, entry); }
  persist();
}

function scoreThisSet(entry, s){
  const ex = exById(entry.exerciseId);
  const r = scoreSet(ex, { weight: s.weight, reps: s.reps }, state.profile);
  if (r) { s.score = r.score; s.e1rm = r.e1rm; s.load = r.load; s.tier = r.tier; s.index = r.index; }
  else   { s.score = 0; s.e1rm = 0; s.load = 0; s.tier = TIERS[0]; s.index = 0; }
}

function refreshSetMeta(block, entry){
  const ex = exById(entry.exerciseId);
  const prev = lastSetsFor(state, entry.exerciseId);
  const grid = block.querySelector('.setgrid');
  const rows = grid.querySelectorAll('.setrow');
  entry.sets.forEach((s, si) => {
    const row = rows[si]; if (!row) return;
    const meta = row.querySelector('.setmeta');
    const html = setRow(ex, entry, s, si, prev);
    const tmp = document.createElement('div'); tmp.innerHTML = html;
    const fresh = tmp.querySelector('.setmeta');
    if (fresh && meta) meta.replaceWith(fresh);
    else if (fresh && !meta) row.appendChild(fresh);
    else if (!fresh && meta) meta.remove();
    row.querySelector('.done-btn').classList.toggle('on', !!s.done);
  });
}

function toggleSet(ei, si){
  const entry = entryAt(ei);
  const s = entry.sets[si];
  if (!s.done) {
    if (!(Number(s.reps) > 0)) { toast('Enter reps first'); return; }
    const ex = exById(entry.exerciseId);
    if (ex.mode !== 'bw' && !(Number(s.weight) > 0)) { toast('Enter a weight first'); return; }
    s.done = true; s.ts = Date.now();
    scoreThisSet(entry, s);
    startRest(state.profile.restDefault);
  } else {
    s.done = false;
  }
  persist();
  render();
}

/* ---------- rest timer ---------- */
function startRest(seconds){
  if (!seconds) return;
  restEnds = Date.now() + seconds * 1000;
  clearInterval(restTimer);
  restTimer = setInterval(renderRest, 250);
  renderRest();
}
function stopRest(){ clearInterval(restTimer); restTimer = null; restEnds = 0; renderRest(); }

function renderRest(){
  const el = $('#rest');
  if (!restEnds || !state.active) { el.classList.add('hide'); return; }
  const left = Math.ceil((restEnds - Date.now()) / 1000);
  if (left <= 0) { beep(); stopRest(); return; }
  el.classList.remove('hide');
  el.innerHTML = `
    <b class="num">${clock(left)}</b>
    <span class="grow">Rest</span>
    <button data-act="rest-add">+30s</button>
    <button data-act="rest-skip">Skip</button>`;
}

function beep(){
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = 880; o.type = 'sine';
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
    o.start(); o.stop(ctx.currentTime + 0.5);
  } catch (e) { /* audio blocked — the banner is enough */ }
  if (navigator.vibrate) navigator.vibrate(180);
}

/* ---------- finishing ---------- */
function finishWorkout(){
  const a = state.active;
  const before = overall();
  const bests = personalBests(state);

  const entries = a.entries
    .map(e => ({ exerciseId: e.exerciseId, sets: e.sets.filter(s => s.done) }))
    .filter(e => e.sets.length);

  if (!entries.length) { toast('No completed sets to save'); return; }

  // Personal records, judged against everything before this workout.
  let prCount = 0;
  const prList = [];
  for (const entry of entries) {
    const b = bests[entry.exerciseId] || { weight:0, e1rm:0, score:0 };
    let bw = b.weight, be = b.e1rm, bs = b.score;
    for (const s of entry.sets) {
      const tags = [];
      if ((s.weight||0) > bw) { tags.push('weight'); bw = s.weight; }
      if ((s.e1rm||0)  > be)  { tags.push('e1RM');   be = s.e1rm; }
      if ((s.score||0) > bs)  { tags.push('rank');   bs = s.score; }
      s.pr = tags;
      if (tags.length) { prCount++; prList.push({ exerciseId: entry.exerciseId, set: s, tags }); }
    }
  }

  const streak = streakWeeks(state.workouts, state.profile.weeklyGoal);
  const scored = entries.flatMap(e => e.sets.map(s => s.score || 0));
  const xp = workoutXp(scored, prCount, streak);

  const workout = {
    id: uid(), ts: Date.now(), name: a.name, notes: a.notes,
    durationMs: Date.now() - a.startedAt, entries, xp,
  };

  state.workouts.push(workout);
  state.totalXp += xp;
  state.active = null;
  stopRest();

  const after = overall();
  const fresh = checkAchievements(state, after);
  saveNow(state);

  tab = 'train';
  render();
  openSummary(workout, before, after, prList, fresh);
}

function openSummary(w, before, after, prs, achievements){
  const lvl = levelFor(state.totalXp);
  const moved = after.score - before.score;
  const rankUp = after.tier.name !== before.tier.name;
  const sets = w.entries.reduce((n,e) => n + e.sets.length, 0);

  openSheet({
    title: 'Workout Complete',
    body: `
      <div class="card rankcard" style="margin-bottom:12px">
        ${badge(after.score, after.tier, after.progress)}
        <div class="tiername" style="--c:${after.tier.color}">${after.tier.name}</div>
        <div class="muted tiny" style="margin-top:4px">
          ${rankUp ? `⬆ Promoted from ${before.tier.name}` :
            moved > 0 ? `+${moved} overall rank points` :
            'Overall rank held'}
        </div>
      </div>
      <div class="stats" style="margin-bottom:12px">
        <div class="stat"><b class="num">+${w.xp}</b><span>XP</span></div>
        <div class="stat"><b class="num">${sets}</b><span>Sets</span></div>
        <div class="stat"><b class="num">${fmtVol(workoutVolume(w))}</b><span>Volume</span></div>
        <div class="stat"><b class="num">${fmtDur(w.durationMs)}</b><span>Time</span></div>
      </div>
      <div class="card tight">
        <div class="row between" style="margin-bottom:7px">
          <b>Level ${lvl.level}</b>
          <span class="tiny muted num">${lvl.into} / ${lvl.span} XP</span>
        </div>
        <div class="bar"><i style="width:${(lvl.progress*100).toFixed(1)}%"></i></div>
      </div>
      ${prs.length ? `<h3 style="margin:16px 0 8px">🏆 Personal Records</h3>
        ${prs.map(p => `<div class="item">
          <div class="grow"><b>${esc((exById(p.exerciseId)||{}).name || '')}</b>
          <div class="meta">${nice(toDisp(p.set.weight))} × ${p.set.reps} &middot; ${p.tags.join(' + ')}</div></div>
          ${tierPill(p.set.tier || TIERS[0])}
        </div>`).join('')}` : ''}
      ${achievements.length ? `<h3 style="margin:16px 0 8px">Unlocked</h3>
        ${achievements.map(a => `<div class="ach"><span class="ic">${a.icon}</span>
          <div><b>${esc(a.name)}</b><div class="tiny muted">${esc(a.desc)}</div></div></div>`).join('')}` : ''}
    `,
    footer: `<button class="btn primary block" data-act="close-sheet">Done</button>`,
  });
}

/* ================================================================
   RANKS
================================================================ */
let rankFilter = 'all';

function renderRanks(v){
  $('#title').textContent = 'Ranks';
  const o = overall();
  const best = exerciseRanks(scoreHistory(state));
  const map = exMap();

  let rows = Object.entries(best)
    .map(([id, r]) => ({ id, ...r, ex: map[id] }))
    .filter(r => r.ex)
    .filter(r => rankFilter === 'all' || r.ex.cat === rankFilter)
    .sort((a,b) => b.score - a.score);

  v.innerHTML = `
    <div class="card rankcard">
      ${badge(o.score, o.tier, o.progress)}
      <div class="tiername" style="--c:${o.tier.color}">${o.tier.name}</div>
      <div class="muted tiny" style="margin-top:4px">
        ${o.next ? `${o.next.min - o.score} points to ${o.next.name}` : 'Top of the ladder'}
      </div>
    </div>

    <div class="card">
      <div class="row between" style="margin-bottom:11px">
        <h2>Categories</h2>
        <span class="tiny muted">${o.ranked}/${o.of} ranked</span>
      </div>
      ${CATEGORIES.map(c => {
        const cat = o.categories[c.id];
        const t = tierForScore(cat.score);
        const src = cat.exerciseId ? (map[cat.exerciseId]||{}).name : null;
        return `<div style="margin-bottom:12px">
          <div class="row between tiny" style="margin-bottom:5px">
            <b style="font-size:14px">${c.name} <span class="muted" style="font-weight:400">${c.weight}%</span></b>
            <span>${cat.score ? `${t.name} · ${cat.score}` : '<span class="muted">Not ranked</span>'}</span>
          </div>
          <div class="bar thin"><i style="width:${(cat.score/1000*100).toFixed(1)}%;background:${t.color}"></i></div>
          <div class="tiny muted" style="margin-top:4px">
            ${src ? `Set by ${esc(src)}` : 'Log a set in this category to rank it'}
          </div>
        </div>`;
      }).join('')}
      <div class="tiny muted" style="margin-top:2px">
        Your overall rank is the weighted average of all four. An untrained
        category counts as zero — you cannot be an Olympian who never squats.
      </div>
    </div>

    <div class="card">
      <h2 style="margin-bottom:11px">The Ladder</h2>
      <div class="ladder">
        ${TIERS.slice().reverse().map(t => `
          <div class="rung ${t.name === o.tier.name ? 'on' : ''}" style="--c:${t.color}">
            <span class="nm">${t.name}</span>
            <span class="tiny muted num">${t.min}+</span>
            ${t.name === o.tier.name ? '<span class="pill">You</span>' : ''}
          </div>`).join('')}
      </div>
    </div>

    <h2 style="margin:18px 0 4px">Exercise Ranks</h2>
    <div class="chips">
      <button class="chip ${rankFilter==='all'?'on':''}" data-filter="all">All</button>
      ${CATEGORIES.map(c => `<button class="chip ${rankFilter===c.id?'on':''}" data-filter="${c.id}">${c.name}</button>`).join('')}
    </div>
    ${rows.length ? rows.map(r => `
      <button class="item" data-act="ex-detail" data-id="${r.id}">
        ${badge(r.score, tierForScore(r.score), tierProgress(r.score), true)}
        <div class="grow">
          <b class="truncate">${esc(r.ex.name)}</b>
          <div class="meta">${tierForScore(r.score).name} &middot; ${r.ex.group}
            ${!r.recent ? ' &middot; <span style="color:var(--warn)">stale</span>' : ''}</div>
        </div>
      </button>`).join('')
    : `<div class="empty"><h3>Nothing ranked yet</h3>
        <div class="tiny">Log a set and it gets a score straight away.</div></div>`}
  `;
}

function openExerciseDetail(id){
  const ex = exById(id);
  const hist = scoreHistory(state).filter(h => h.exerciseId === id).sort((a,b) => a.ts - b.ts);
  const r = exerciseRanks(scoreHistory(state))[id];
  const best = personalBests(state)[id];
  const cur = r ? r.score : 0;
  const t = tierForScore(cur);
  const gold = goldStandard(ex, state.profile.sex, state.profile.bodyweight);
  const next = nextTier(cur);

  // What the next tier costs, as a single.
  let needed = null;
  if (next) {
    const anchor = CURVE.find(c => c[1] >= next.min);
    const lower = CURVE.filter(c => c[1] <= next.min).pop();
    const idx = lower ? lower[0] + (next.min - lower[1]) / ((anchor[1]-lower[1])||1) * ((anchor[0]-lower[0])||0) : 0;
    let kg = idx * gold;
    if (ex.mode === 'bw') kg -= state.profile.bodyweight * (ex.bwFrac || 1);
    if (ex.mode === 'pair') kg /= 2;
    needed = kg;
  }

  const spark = hist.slice(-24);
  const max = Math.max(1000, ...spark.map(h => h.score));

  openSheet({
    title: ex.name,
    body: `
      <div class="card rankcard">
        ${badge(cur, t, tierProgress(cur))}
        <div class="tiername" style="--c:${t.color}">${t.name}</div>
        <div class="muted tiny" style="margin-top:4px">${esc(ex.group)} &middot; ${esc(ex.eq)}</div>
      </div>

      ${best ? `<div class="stats" style="margin-bottom:12px">
        <div class="stat"><b class="num">${nice(toDisp(best.weight))}</b><span>Best ${unit()}</span></div>
        <div class="stat"><b class="num">${nice(toDisp(best.e1rm))}</b><span>Best e1RM</span></div>
        <div class="stat"><b class="num">${best.score}</b><span>Best score</span></div>
      </div>` : ''}

      <div class="card">
        <div class="label" style="margin-bottom:8px">Your standards, at ${fmtW(state.profile.bodyweight)} bodyweight</div>
        <div class="working">
          <b>Gold</b> needs an estimated 1RM of ${fmtW(gold)}.<br>
          ${needed != null ? `<b>${next.name}</b> needs about ${fmtW(Math.max(0,needed))}${
            ex.mode === 'pair' ? ' per dumbbell' : ex.mode === 'bw' ? ' added' : ''} for a single.` :
            'You are at the top of the ladder on this lift.'}
        </div>
      </div>

      ${spark.length > 1 ? `<div class="card">
        <div class="label">Score over time</div>
        <div class="spark">
          ${spark.map(h => `<i style="height:${Math.max(3,(h.score/max*100)).toFixed(1)}%"></i>`).join('')}
        </div>
        <div class="row between tiny muted" style="margin-top:6px">
          <span>${relDate(spark[0].ts)}</span><span>${relDate(spark[spark.length-1].ts)}</span>
        </div>
      </div>` : ''}

      <div class="card">
        <div class="label" style="margin-bottom:8px">How this lift is scored</div>
        <div class="working">
          Logged as <b>${ex.mode === 'pair' ? 'weight per dumbbell, doubled'
            : ex.mode === 'bw' ? `bodyweight × ${ex.bwFrac} plus any added weight`
            : ex.mode === 'single' ? 'one limb at a time' : 'the weight on the bar'}</b>.<br>
          Estimated 1RM ÷ your Gold standard gives an index; 1.00 is exactly Gold.<br>
          Counts toward your <b>${(CATEGORIES.find(c=>c.id===ex.cat)||{}).name}</b> rank.
        </div>
      </div>
    `,
    footer: `<button class="btn block" data-act="close-sheet">Close</button>`,
  });
}

/* ================================================================
   HISTORY
================================================================ */
function renderHistory(v){
  $('#title').textContent = 'History';
  const ws = state.workouts.slice().reverse();
  const sets = state.workouts.reduce((n,w) =>
    n + w.entries.reduce((m,e) => m + e.sets.length, 0), 0);

  // Volume for the last 12 weeks.
  const weeks = [];
  for (let i = 11; i >= 0; i--) {
    const start = weekStart(Date.now() - i * 7 * 86400000);
    const key = weekKey(start);
    const vol = state.workouts.filter(w => weekKey(w.ts) === key)
      .reduce((n,w) => n + workoutVolume(w), 0);
    weeks.push({ key, vol, start });
  }
  const maxVol = Math.max(1, ...weeks.map(w => w.vol));

  v.innerHTML = `
    <div class="stats" style="margin-bottom:12px">
      <div class="stat"><b class="num">${state.workouts.length}</b><span>Workouts</span></div>
      <div class="stat"><b class="num">${sets}</b><span>Sets</span></div>
      <div class="stat"><b class="num">${fmtVol(totalVolume(state))}</b><span>Volume</span></div>
      <div class="stat"><b class="num">${state.totalXp}</b><span>Total XP</span></div>
    </div>

    ${state.workouts.length ? `<div class="card">
      <div class="label">Weekly volume &middot; last 12 weeks</div>
      <div class="spark">
        ${weeks.map(w => `<i style="height:${Math.max(2,(w.vol/maxVol*100)).toFixed(1)}%"
           title="${fmtVol(w.vol)}"></i>`).join('')}
      </div>
      <div class="row between tiny muted" style="margin-top:6px">
        <span>12 weeks ago</span><span>This week</span>
      </div>
    </div>` : ''}

    ${ws.length ? ws.map(w => workoutItem(w)).join('')
      : `<div class="empty"><h3>No workouts yet</h3>
         <div class="tiny">Your first one is the hardest to start and the easiest to finish.</div></div>`}
  `;
}

function openWorkoutDetail(id){
  const w = state.workouts.find(x => x.id === id);
  if (!w) return;
  openSheet({
    title: w.name,
    body: `
      <div class="stats" style="margin-bottom:13px">
        <div class="stat"><b class="num">+${w.xp}</b><span>XP</span></div>
        <div class="stat"><b class="num">${fmtVol(workoutVolume(w))}</b><span>Volume</span></div>
        <div class="stat"><b class="num">${fmtDur(w.durationMs)}</b><span>Time</span></div>
      </div>
      <div class="tiny muted" style="margin-bottom:12px">${new Date(w.ts).toLocaleString()}</div>
      ${w.entries.map(e => {
        const ex = exById(e.exerciseId);
        return `<div class="card tight">
          <b>${esc(ex ? ex.name : 'Unknown exercise')}</b>
          <div style="margin-top:7px">
          ${e.sets.map((s,i) => `<div class="row between tiny" style="padding:4px 0">
            <span class="muted">Set ${i+1}</span>
            <span class="num grow" style="text-align:right;padding-right:9px">
              ${nice(toDisp(s.weight))} ${unit()} × ${s.reps}${s.rpe ? ` @${s.rpe}` : ''}</span>
            ${s.score ? `<span class="pill tier" style="--c:${(s.tier||TIERS[0]).color}">${s.score}</span>` : ''}
            ${s.pr && s.pr.length ? '<span title="Personal record">🏆</span>' : ''}
          </div>`).join('')}
          </div>
        </div>`;
      }).join('')}
      ${w.notes ? `<div class="card tight"><div class="label">Notes</div>
        <div class="tiny" style="margin-top:5px">${esc(w.notes)}</div></div>` : ''}
    `,
    footer: `<div class="row">
      <button class="btn danger grow" data-act="delete-workout" data-id="${w.id}">Delete</button>
      <button class="btn primary grow" data-act="repeat-workout" data-id="${w.id}">Repeat</button>
    </div>`,
  });
}

/* ================================================================
   PROFILE
================================================================ */
function renderProfile(v){
  $('#title').textContent = 'Profile';
  const p = state.profile;
  const lvl = levelFor(state.totalXp);
  const unlocked = ACHIEVEMENTS.filter(a => state.achievements[a.id]).length;

  v.innerHTML = `
    <div class="card">
      <div class="field">
        <label class="label">Name</label>
        <input data-p="name" value="${esc(p.name)}" placeholder="Your name">
      </div>
      <div class="field">
        <label class="label">Bodyweight — every rank depends on this</label>
        <input type="number" inputmode="decimal" step="0.1" data-p="bodyweight"
               value="${nice(toDisp(p.bodyweight))}">
      </div>
      <div class="field">
        <label class="label">Strength standard</label>
        <div class="seg" data-seg="sex">
          <button data-val="male"    class="${p.sex==='male'?'on':''}">Male</button>
          <button data-val="female"  class="${p.sex==='female'?'on':''}">Female</button>
          <button data-val="neutral" class="${p.sex==='neutral'?'on':''}">Neutral</button>
        </div>
        <div class="tiny muted" style="margin-top:6px">
          Strength standards differ by sex; neutral uses the midpoint of the two.
        </div>
      </div>
      <div class="field">
        <label class="label">Units</label>
        <div class="seg" data-seg="units">
          <button data-val="kg" class="${p.units==='kg'?'on':''}">Kilograms</button>
          <button data-val="lb" class="${p.units==='lb'?'on':''}">Pounds</button>
        </div>
      </div>
      <div class="row">
        <div class="field grow">
          <label class="label">Workouts per week</label>
          <input type="number" inputmode="numeric" min="1" max="14" data-p="weeklyGoal" value="${p.weeklyGoal}">
        </div>
        <div class="field grow">
          <label class="label">Rest timer (sec)</label>
          <input type="number" inputmode="numeric" min="0" max="900" step="15" data-p="restDefault" value="${p.restDefault}">
        </div>
      </div>
      <div class="field" style="margin-bottom:0">
        <label class="label">Theme</label>
        <div class="seg" data-seg="theme">
          <button data-val="dark"  class="${p.theme==='dark'?'on':''}">Dark</button>
          <button data-val="light" class="${p.theme==='light'?'on':''}">Light</button>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="row between" style="margin-bottom:9px">
        <h2>Achievements</h2>
        <span class="tiny muted">${unlocked}/${ACHIEVEMENTS.length}</span>
      </div>
      ${ACHIEVEMENTS.map(a => `
        <div class="ach ${state.achievements[a.id] ? '' : 'locked'}">
          <span class="ic">${a.icon}</span>
          <div class="grow"><b>${esc(a.name)}</b>
            <div class="tiny muted">${esc(a.desc)}</div></div>
          ${state.achievements[a.id] ? '<span class="pill">✓</span>' : ''}
        </div>`).join('')}
    </div>

    <div class="card">
      <h2 style="margin-bottom:9px">Your data</h2>
      <div class="tiny muted" style="margin-bottom:11px">
        Everything is stored on this device only — nothing is uploaded anywhere.
        Level ${lvl.level} &middot; ${state.totalXp} XP &middot; ${state.workouts.length} workouts.
        Export before clearing your browser data.
      </div>
      <div class="stack">
        <button class="btn block" data-act="export">Export backup (.json)</button>
        <button class="btn block" data-act="import">Import backup</button>
        <button class="btn block ghost" data-act="new-exercise">Add custom exercise</button>
        <button class="btn block danger" data-act="reset">Erase everything</button>
      </div>
      <input type="file" id="importfile" accept="application/json,.json" class="hide">
    </div>
  `;
}

/* ================================================================
   SHEETS
================================================================ */
function openSheet({ title, body, footer }){
  sheetStack.push({ title, body, footer });
  drawSheet();
}
function closeSheet(){
  sheetStack.pop();
  drawSheet();
}
function drawSheet(){
  const host = $('#sheet-host');
  if (!sheetStack.length) { host.innerHTML = ''; document.body.style.overflow = ''; return; }
  const s = sheetStack[sheetStack.length - 1];
  document.body.style.overflow = 'hidden';
  host.innerHTML = `<div class="sheet" data-sheet>
    <div class="sheet-inner">
      <div class="sheet-head">
        <h2 class="truncate">${esc(s.title)}</h2>
        <button class="btn sm ghost" data-act="close-sheet">✕</button>
      </div>
      <div class="sheet-body">${s.body}</div>
      ${s.footer ? `<div class="sheet-foot">${s.footer}</div>` : ''}
    </div>
  </div>`;
}

/* ---------- exercise picker ---------- */
let pickerQuery = '', pickerGroup = 'All', pickerTarget = null;

function openExercisePicker(target){
  pickerQuery = ''; pickerGroup = 'All';
  pickerTarget = target || null;   // null => add to the active workout
  openSheet({ title:'Add Exercise', body: pickerBody(), footer:'' });
}

function pickerBody(){
  const list = allExercises(state)
    .filter(e => pickerGroup === 'All' || e.group === pickerGroup)
    .filter(e => !pickerQuery || e.name.toLowerCase().includes(pickerQuery.toLowerCase())
                              || e.group.toLowerCase().includes(pickerQuery.toLowerCase()))
    .sort((a,b) => a.name.localeCompare(b.name));
  const best = exerciseRanks(scoreHistory(state));

  return `
    <input class="search" id="picker-search" placeholder="Search 75+ exercises…"
           value="${esc(pickerQuery)}" autocomplete="off">
    <div class="chips">
      ${['All', ...MUSCLE_GROUPS].map(g =>
        `<button class="chip ${pickerGroup===g?'on':''}" data-group="${esc(g)}">${esc(g)}</button>`).join('')}
    </div>
    <div id="picker-list">
      ${list.length ? list.map(e => {
        const r = best[e.id];
        const t = r ? tierForScore(r.score) : null;
        return `<button class="item" data-act="pick-ex" data-id="${e.id}">
          <div class="grow">
            <b class="truncate">${esc(e.name)}</b>
            <div class="meta">${esc(e.group)} &middot; ${esc(e.eq)}</div>
          </div>
          ${t ? `<span class="pill tier" style="--c:${t.color}">${t.name}</span>` : ''}
        </button>`;
      }).join('') : `<div class="empty"><h3>No match</h3>
        <div class="tiny">Add it as a custom exercise from your profile.</div></div>`}
    </div>`;
}

function refreshPicker(){
  const host = $('#sheet-host');
  const body = host.querySelector('.sheet-body');
  if (!body) return;
  const active = document.activeElement;
  const keepFocus = active && active.id === 'picker-search';
  const pos = keepFocus ? active.selectionStart : null;
  body.innerHTML = pickerBody();
  if (keepFocus) {
    const input = $('#picker-search');
    input.focus();
    try { input.setSelectionRange(pos, pos); } catch (e) {}
  }
}

/* ---------- routine editor ---------- */
let editingRoutine = null;

function openRoutineEditor(id){
  const existing = allRoutines(state).find(r => r.id === id);
  editingRoutine = existing
    ? { id: existing.id, name: existing.name, items: existing.items.slice(), stock: existing.stock }
    : { id: uid(), name: '', items: [] };
  drawRoutineEditor(!!existing);
}

function drawRoutineEditor(isEdit){
  const r = editingRoutine;
  const body = `
    <div class="field">
      <label class="label">Routine name</label>
      <input id="routine-name" value="${esc(r.name)}" placeholder="Push Day">
    </div>
    <div class="label" style="margin-bottom:7px">Exercises (${r.items.length})</div>
    ${r.items.length ? r.items.map((id, i) => {
      const ex = exById(id);
      return `<div class="item">
        <div class="grow"><b class="truncate">${esc(ex ? ex.name : 'Removed')}</b>
          <div class="meta">${esc(ex ? ex.group : '')}</div></div>
        <button class="btn sm ghost" data-act="ritem-up" data-i="${i}" ${i===0?'disabled':''}>↑</button>
        <button class="btn sm ghost" data-act="ritem-del" data-i="${i}">✕</button>
      </div>`;
    }).join('') : `<div class="tiny muted" style="padding:8px 0 12px">Nothing added yet.</div>`}
    <button class="btn block ghost" data-act="routine-add-ex">+ Add Exercise</button>
  `;
  const footer = `<div class="row">
    ${isEdit ? `<button class="btn danger" data-act="routine-delete">Delete</button>` : ''}
    <button class="btn primary grow" data-act="routine-save">Save</button>
  </div>`;
  if (sheetStack.length) sheetStack[sheetStack.length-1] = { title: isEdit ? 'Edit Routine' : 'New Routine', body, footer };
  else sheetStack.push({ title: isEdit ? 'Edit Routine' : 'New Routine', body, footer });
  drawSheet();
}

function saveRoutine(){
  const name = ($('#routine-name').value || '').trim();
  if (!name) { toast('Give the routine a name'); return; }
  if (!editingRoutine.items.length) { toast('Add at least one exercise'); return; }
  editingRoutine.name = name;

  // Editing a stock routine makes your own copy and hides the original.
  if (editingRoutine.stock) {
    state.deletedStock = state.deletedStock || [];
    if (!state.deletedStock.includes(editingRoutine.id)) state.deletedStock.push(editingRoutine.id);
    editingRoutine = { ...editingRoutine, id: uid(), stock: false };
  }
  const i = state.routines.findIndex(r => r.id === editingRoutine.id);
  const clean = { id: editingRoutine.id, name: editingRoutine.name, items: editingRoutine.items };
  if (i >= 0) state.routines[i] = clean; else state.routines.push(clean);

  saveNow(state);
  editingRoutine = null;
  closeSheet();
  render();
  toast('Routine saved');
}

/* ---------- custom exercise ---------- */
function openCustomExercise(){
  openSheet({
    title: 'Custom Exercise',
    body: `
      <div class="field">
        <label class="label">Name</label>
        <input id="cx-name" placeholder="Reverse Nordic Curl">
      </div>
      <div class="field">
        <label class="label">Muscle group</label>
        <select id="cx-group">${MUSCLE_GROUPS.map(g => `<option>${g}</option>`).join('')}</select>
      </div>
      <div class="field">
        <label class="label">Counts toward</label>
        <select id="cx-cat">${CATEGORIES.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}</select>
      </div>
      <div class="field">
        <label class="label">How it is loaded</label>
        <select id="cx-mode">
          <option value="bar">One weight (barbell, machine, cable)</option>
          <option value="pair">Per dumbbell (counted twice)</option>
          <option value="single">One limb at a time</option>
          <option value="bw">Bodyweight, plus any added weight</option>
        </select>
      </div>
      <div class="field">
        <label class="label">Gold standard — the 1RM a strong lifter your size hits</label>
        <input type="number" inputmode="decimal" id="cx-gold" placeholder="e.g. ${Math.round(toDisp(state.profile.bodyweight))}">
        <div class="tiny muted" style="margin-top:6px">
          This sets the rank scale for the lift: hitting it scores exactly 500,
          the bottom of Gold. For a per-dumbbell exercise, give the combined
          weight of both dumbbells.
        </div>
      </div>
    `,
    footer: `<button class="btn primary block" data-act="cx-save">Add Exercise</button>`,
  });
}

function saveCustomExercise(){
  const name = ($('#cx-name').value || '').trim();
  const goldDisp = Number($('#cx-gold').value);
  if (!name) { toast('Name it first'); return; }
  if (!(goldDisp > 0)) { toast('Enter a Gold standard weight'); return; }

  const bw = state.profile.bodyweight;
  const mode = $('#cx-mode').value;
  const goldKg = fromDisp(goldDisp);
  // Invert goldStandard() so the number typed is the standard for this lifter.
  const sex = REF_BW[state.profile.sex] ? state.profile.sex : 'neutral';
  const ref = REF_BW[sex];
  const base = goldKg / (Math.pow(ref, 1/3) * Math.pow(bw, 2/3));
  const ratio = sex === 'female' ? base / 0.72 : sex === 'neutral' ? base / 0.86 : base;

  state.customExercises.push({
    id: 'cx_' + uid(), name, group: $('#cx-group').value, cat: $('#cx-cat').value,
    eq: 'custom', mode, ratio, f: 0.72, w: 0.9, bwFrac: mode === 'bw' ? 1 : undefined,
    custom: true,
  });
  saveNow(state);
  closeSheet();
  render();
  toast(`${name} added`);
}

/* ================================================================
   EVENTS
================================================================ */
document.addEventListener('click', e => {
  const t = e.target.closest('[data-act], [data-go], [data-filter], [data-group], [data-val], [data-sheet]');
  if (!t) return;

  if (t.dataset.go) { tab = t.dataset.go; window.scrollTo(0,0); render(); return; }

  if (t.dataset.filter) { rankFilter = t.dataset.filter; render(); return; }

  if (t.dataset.group) { pickerGroup = t.dataset.group; refreshPicker(); return; }

  if (t.dataset.val && t.closest('[data-seg]')) {
    const key = t.closest('[data-seg]').dataset.seg;
    state.profile[key] = t.dataset.val;
    saveNow(state); render();
    return;
  }

  // Tapping the dimmed backdrop closes the sheet.
  if (t.hasAttribute('data-sheet') && e.target === t) { closeSheet(); return; }

  const act = t.dataset.act;
  const ei = t.dataset.ei != null ? +t.dataset.ei : null;
  const si = t.dataset.si != null ? +t.dataset.si : null;

  switch (act) {
    case 'close-sheet': closeSheet(); break;

    case 'start-empty': startWorkout(); break;
    case 'start-routine': {
      const r = allRoutines(state).find(x => x.id === t.dataset.id);
      if (r) startWorkout(r.name, r.items);
      break;
    }
    case 'new-routine':  openRoutineEditor(null); break;
    case 'edit-routine': openRoutineEditor(t.dataset.id); break;

    case 'add-exercise': openExercisePicker(); break;
    case 'pick-ex': {
      const id = t.dataset.id;
      if (pickerTarget === 'routine') {
        editingRoutine.items.push(id);
        closeSheet();
        drawRoutineEditor(true);
      } else {
        state.active.entries.push(newEntry(id));
        persist(); closeSheet(); render();
      }
      break;
    }
    case 'remove-ex':
      state.active.entries.splice(ei, 1);
      persist(); render();
      break;
    case 'ex-info': openExerciseDetail(state.active.entries[ei].exerciseId); break;
    case 'ex-detail': openExerciseDetail(t.dataset.id); break;

    case 'add-set': {
      const entry = entryAt(ei);
      const last = entry.sets[entry.sets.length - 1];
      entry.sets.push({ weight: last ? last.weight : '', reps:'', rpe:'', done:false });
      persist(); render();
      break;
    }
    case 'toggle-set': {
      const block = t.closest('.exblock');
      toggleSet(+block.dataset.ei, si);
      break;
    }

    case 'rest-add':  restEnds += 30000; renderRest(); break;
    case 'rest-skip': stopRest(); break;

    case 'finish': finishWorkout(); break;
    case 'discard':
      if (confirm('Discard this workout? Nothing will be saved.')) {
        state.active = null; stopRest(); saveNow(state); render();
      }
      break;

    case 'view-workout': openWorkoutDetail(t.dataset.id); break;
    case 'delete-workout':
      if (confirm('Delete this workout? Your XP and ranks will be recalculated.')) {
        const w = state.workouts.find(x => x.id === t.dataset.id);
        if (w) {
          state.totalXp = Math.max(0, state.totalXp - (w.xp || 0));
          state.workouts = state.workouts.filter(x => x.id !== w.id);
          saveNow(state);
        }
        closeSheet(); render();
      }
      break;
    case 'repeat-workout': {
      const w = state.workouts.find(x => x.id === t.dataset.id);
      if (w) { closeSheet(); startWorkout(w.name, w.entries.map(e => e.exerciseId)); }
      break;
    }

    case 'routine-add-ex':
      pickerTarget = 'routine';
      pickerQuery = ''; pickerGroup = 'All';
      openSheet({ title:'Add to Routine', body: pickerBody(), footer:'' });
      break;
    case 'ritem-up': {
      const i = +t.dataset.i;
      [editingRoutine.items[i-1], editingRoutine.items[i]] = [editingRoutine.items[i], editingRoutine.items[i-1]];
      drawRoutineEditor(true);
      break;
    }
    case 'ritem-del':
      editingRoutine.items.splice(+t.dataset.i, 1);
      drawRoutineEditor(true);
      break;
    case 'routine-save': saveRoutine(); break;
    case 'routine-delete':
      if (confirm('Delete this routine?')) {
        if (editingRoutine.stock) {
          state.deletedStock = state.deletedStock || [];
          state.deletedStock.push(editingRoutine.id);
        }
        state.routines = state.routines.filter(r => r.id !== editingRoutine.id);
        saveNow(state); closeSheet(); render();
      }
      break;

    case 'new-exercise': openCustomExercise(); break;
    case 'cx-save': saveCustomExercise(); break;

    case 'export': doExport(); break;
    case 'import': $('#importfile').click(); break;
    case 'reset':
      if (confirm('Erase all workouts, ranks and settings on this device? This cannot be undone.') &&
          confirm('Really erase everything? Export a backup first if you might want it back.')) {
        state = structuredClone(DEFAULT_STATE);
        saveNow(state); render(); toast('Everything erased');
      }
      break;
  }
});

/* typing in set fields and profile fields */
document.addEventListener('input', e => {
  if (e.target.closest('input[data-f]')) { onSetInput(e); return; }

  if (e.target.id === 'picker-search') { pickerQuery = e.target.value; refreshPicker(); return; }

  if (e.target.dataset.act === 'notes' && state.active) {
    state.active.notes = e.target.value; persist(); return;
  }

  const p = e.target.dataset.p;
  if (p) {
    let v = e.target.value;
    if (p === 'bodyweight') {
      const n = Number(v);
      if (!(n > 0)) return;
      state.profile.bodyweight = fromDisp(n);   // logged on blur, not per keystroke
    }
    else if (p === 'weeklyGoal')  state.profile.weeklyGoal = Math.max(1, Math.min(14, Number(v) || 3));
    else if (p === 'restDefault') state.profile.restDefault = Math.max(0, Math.min(900, Number(v) || 0));
    else state.profile[p] = v;
    persist();
  }
});

/* ---------- export / import ---------- */
function doExport(){
  const blob = new Blob([exportState(state)], { type:'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `liftoff-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('Backup downloaded');
}

document.addEventListener('change', e => {
  if (e.target.dataset && e.target.dataset.p === 'bodyweight') {
    const kg = state.profile.bodyweight;
    const last = state.bodyweightLog[state.bodyweightLog.length - 1];
    if (kg > 0 && (!last || Math.abs(last.kg - kg) > 0.01)) {
      state.bodyweightLog.push({ ts: Date.now(), kg });
      saveNow(state);
    }
    return;
  }
  if (e.target.id !== 'importfile') return;
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const next = importState(reader.result);
      if (!confirm(`Replace everything on this device with this backup (${next.workouts.length} workouts)?`)) return;
      state = next;
      saveNow(state); render(); toast('Backup restored');
    } catch (err) {
      alert('Could not import that file.\n\n' + err.message);
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

/* Don't lose an in-progress workout to a stray refresh. */
window.addEventListener('beforeunload', e => {
  saveNow(state);
  if (state.active) { e.preventDefault(); e.returnValue = ''; }
});

render();
