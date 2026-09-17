/* ------------------------------------------------------------------
   data.js — exercise library and strength standards.

   Each exercise carries the numbers the rank system needs:

     group   primary muscle
     cat     push | pull | legs | core   (drives the overall rank)
     eq      equipment, for filtering in the picker
     mode    how a logged set becomes a load on the bar:
               bar    load = weight                      (barbell, machine, cable)
               pair   load = weight x 2                  (weight logged per dumbbell)
               single load = weight                      (one limb at a time)
               bw     load = bodyweight x bwFrac + added (bodyweight movements)
     ratio   e1RM / bodyweight that earns GOLD for a male lifter at 80 kg
     f       female standard as a fraction of the male one
     w       reliability weight — compounds speak louder than isolation
             when a category rank is decided (see rank.js)

   ratio is the only judgement call in here. It is set so that Gold is a
   genuinely strong gym lifter, not an average one, and Olympian (2.10x
   the Gold standard) lands near the raw world record for the lift. The
   numbers are mine; they are in one file precisely so they are easy to
   argue with and easy to change.
------------------------------------------------------------------ */

const EXERCISES = [
  // ---------------- chest ----------------
  { id:'bench',        name:'Bench Press',              group:'Chest',     cat:'push', eq:'barbell',    mode:'bar',    ratio:1.25, f:0.65, w:1.00 },
  { id:'incline_bb',   name:'Incline Bench Press',      group:'Chest',     cat:'push', eq:'barbell',    mode:'bar',    ratio:1.05, f:0.65, w:0.95 },
  { id:'cgbp',         name:'Close-Grip Bench Press',   group:'Triceps',   cat:'push', eq:'barbell',    mode:'bar',    ratio:1.05, f:0.65, w:0.90 },
  { id:'db_bench',     name:'Dumbbell Bench Press',     group:'Chest',     cat:'push', eq:'dumbbell',   mode:'pair',   ratio:1.05, f:0.65, w:0.95 },
  { id:'db_incline',   name:'Incline Dumbbell Press',   group:'Chest',     cat:'push', eq:'dumbbell',   mode:'pair',   ratio:0.90, f:0.65, w:0.90 },
  { id:'chest_press',  name:'Chest Press Machine',      group:'Chest',     cat:'push', eq:'machine',    mode:'bar',    ratio:1.20, f:0.68, w:0.85 },
  { id:'pec_deck',     name:'Pec Deck',                 group:'Chest',     cat:'push', eq:'machine',    mode:'bar',    ratio:0.80, f:0.70, w:0.80 },
  { id:'cable_fly',    name:'Cable Fly',                group:'Chest',     cat:'push', eq:'cable',      mode:'bar',    ratio:0.55, f:0.70, w:0.80 },
  { id:'db_fly',       name:'Dumbbell Fly',             group:'Chest',     cat:'push', eq:'dumbbell',   mode:'pair',   ratio:0.60, f:0.68, w:0.80 },
  { id:'pushup',       name:'Push-Up',                  group:'Chest',     cat:'push', eq:'bodyweight', mode:'bw',     ratio:0.90, f:0.72, w:0.85, bwFrac:0.64 },
  { id:'dip',          name:'Dip',                      group:'Chest',     cat:'push', eq:'bodyweight', mode:'bw',     ratio:1.35, f:0.70, w:0.95, bwFrac:1.00 },

  // ---------------- shoulders ----------------
  { id:'ohp',          name:'Overhead Press',           group:'Shoulders', cat:'push', eq:'barbell',    mode:'bar',    ratio:0.80, f:0.63, w:1.00 },
  { id:'push_press',   name:'Push Press',               group:'Shoulders', cat:'push', eq:'barbell',    mode:'bar',    ratio:1.00, f:0.63, w:0.95 },
  { id:'db_ohp',       name:'Dumbbell Shoulder Press',  group:'Shoulders', cat:'push', eq:'dumbbell',   mode:'pair',   ratio:0.70, f:0.63, w:0.90 },
  { id:'arnold',       name:'Arnold Press',             group:'Shoulders', cat:'push', eq:'dumbbell',   mode:'pair',   ratio:0.65, f:0.63, w:0.85 },
  { id:'machine_ohp',  name:'Shoulder Press Machine',   group:'Shoulders', cat:'push', eq:'machine',    mode:'bar',    ratio:0.85, f:0.65, w:0.85 },
  { id:'lat_raise',    name:'Lateral Raise',            group:'Shoulders', cat:'push', eq:'dumbbell',   mode:'pair',   ratio:0.30, f:0.68, w:0.80 },
  { id:'cable_lat_r',  name:'Cable Lateral Raise',      group:'Shoulders', cat:'push', eq:'cable',      mode:'single', ratio:0.16, f:0.68, w:0.80 },
  { id:'rear_fly',     name:'Rear Delt Fly',            group:'Shoulders', cat:'pull', eq:'dumbbell',   mode:'pair',   ratio:0.28, f:0.70, w:0.80 },
  { id:'face_pull',    name:'Face Pull',                group:'Shoulders', cat:'pull', eq:'cable',      mode:'bar',    ratio:0.55, f:0.72, w:0.80 },
  { id:'front_raise',  name:'Front Raise',              group:'Shoulders', cat:'push', eq:'dumbbell',   mode:'pair',   ratio:0.30, f:0.68, w:0.80 },
  { id:'upright_row',  name:'Upright Row',              group:'Shoulders', cat:'pull', eq:'barbell',    mode:'bar',    ratio:0.65, f:0.68, w:0.80 },

  // ---------------- back ----------------
  { id:'deadlift',     name:'Deadlift',                 group:'Back',      cat:'pull', eq:'barbell',    mode:'bar',    ratio:2.05, f:0.80, w:1.00 },
  { id:'sumo_dl',      name:'Sumo Deadlift',            group:'Back',      cat:'pull', eq:'barbell',    mode:'bar',    ratio:2.05, f:0.82, w:1.00 },
  { id:'trap_bar_dl',  name:'Trap Bar Deadlift',        group:'Back',      cat:'pull', eq:'barbell',    mode:'bar',    ratio:2.20, f:0.80, w:0.95 },
  { id:'bb_row',       name:'Barbell Row',              group:'Back',      cat:'pull', eq:'barbell',    mode:'bar',    ratio:1.15, f:0.68, w:1.00 },
  { id:'pendlay',      name:'Pendlay Row',              group:'Back',      cat:'pull', eq:'barbell',    mode:'bar',    ratio:1.10, f:0.68, w:0.95 },
  { id:'tbar',         name:'T-Bar Row',                group:'Back',      cat:'pull', eq:'machine',    mode:'bar',    ratio:1.20, f:0.68, w:0.90 },
  { id:'db_row',       name:'Dumbbell Row',             group:'Back',      cat:'pull', eq:'dumbbell',   mode:'single', ratio:0.55, f:0.68, w:0.90 },
  { id:'pullup',       name:'Pull-Up',                  group:'Back',      cat:'pull', eq:'bodyweight', mode:'bw',     ratio:1.20, f:0.72, w:1.00, bwFrac:1.00 },
  { id:'chinup',       name:'Chin-Up',                  group:'Back',      cat:'pull', eq:'bodyweight', mode:'bw',     ratio:1.25, f:0.72, w:0.95, bwFrac:1.00 },
  { id:'lat_pulldown', name:'Lat Pulldown',             group:'Back',      cat:'pull', eq:'cable',      mode:'bar',    ratio:1.00, f:0.68, w:0.90 },
  { id:'cable_row',    name:'Seated Cable Row',         group:'Back',      cat:'pull', eq:'cable',      mode:'bar',    ratio:1.05, f:0.70, w:0.90 },
  { id:'inverted_row', name:'Inverted Row',             group:'Back',      cat:'pull', eq:'bodyweight', mode:'bw',     ratio:0.90, f:0.78, w:0.85, bwFrac:0.70 },
  { id:'straight_arm', name:'Straight-Arm Pulldown',    group:'Back',      cat:'pull', eq:'cable',      mode:'bar',    ratio:0.60, f:0.70, w:0.80 },
  { id:'shrug',        name:'Barbell Shrug',            group:'Back',      cat:'pull', eq:'barbell',    mode:'bar',    ratio:1.70, f:0.72, w:0.85 },
  { id:'db_shrug',     name:'Dumbbell Shrug',           group:'Back',      cat:'pull', eq:'dumbbell',   mode:'pair',   ratio:1.40, f:0.72, w:0.85 },

  // ---------------- arms ----------------
  { id:'bb_curl',      name:'Barbell Curl',             group:'Biceps',    cat:'pull', eq:'barbell',    mode:'bar',    ratio:0.60, f:0.62, w:0.85 },
  { id:'db_curl',      name:'Dumbbell Curl',            group:'Biceps',    cat:'pull', eq:'dumbbell',   mode:'pair',   ratio:0.55, f:0.62, w:0.80 },
  { id:'hammer_curl',  name:'Hammer Curl',              group:'Biceps',    cat:'pull', eq:'dumbbell',   mode:'pair',   ratio:0.60, f:0.64, w:0.80 },
  { id:'preacher',     name:'Preacher Curl',            group:'Biceps',    cat:'pull', eq:'barbell',    mode:'bar',    ratio:0.50, f:0.62, w:0.80 },
  { id:'cable_curl',   name:'Cable Curl',               group:'Biceps',    cat:'pull', eq:'cable',      mode:'bar',    ratio:0.60, f:0.65, w:0.80 },
  { id:'pushdown',     name:'Tricep Pushdown',          group:'Triceps',   cat:'push', eq:'cable',      mode:'bar',    ratio:0.65, f:0.68, w:0.80 },
  { id:'skullcrusher', name:'Skull Crusher',            group:'Triceps',   cat:'push', eq:'barbell',    mode:'bar',    ratio:0.50, f:0.65, w:0.80 },
  { id:'oh_ext',       name:'Overhead Tricep Extension',group:'Triceps',   cat:'push', eq:'cable',      mode:'bar',    ratio:0.50, f:0.68, w:0.80 },
  { id:'wrist_curl',   name:'Wrist Curl',               group:'Forearms',  cat:'pull', eq:'barbell',    mode:'bar',    ratio:0.45, f:0.65, w:0.80 },

  // ---------------- legs ----------------
  { id:'squat',        name:'Back Squat',               group:'Quads',     cat:'legs', eq:'barbell',    mode:'bar',    ratio:1.65, f:0.75, w:1.00 },
  { id:'front_squat',  name:'Front Squat',              group:'Quads',     cat:'legs', eq:'barbell',    mode:'bar',    ratio:1.30, f:0.78, w:0.95 },
  { id:'smith_squat',  name:'Smith Machine Squat',      group:'Quads',     cat:'legs', eq:'machine',    mode:'bar',    ratio:1.70, f:0.78, w:0.85 },
  { id:'hack_squat',   name:'Hack Squat',               group:'Quads',     cat:'legs', eq:'machine',    mode:'bar',    ratio:2.00, f:0.80, w:0.90 },
  { id:'leg_press',    name:'Leg Press',                group:'Quads',     cat:'legs', eq:'machine',    mode:'bar',    ratio:3.00, f:0.80, w:0.90 },
  { id:'goblet',       name:'Goblet Squat',             group:'Quads',     cat:'legs', eq:'dumbbell',   mode:'single', ratio:0.55, f:0.78, w:0.85 },
  { id:'bulgarian',    name:'Bulgarian Split Squat',    group:'Quads',     cat:'legs', eq:'dumbbell',   mode:'pair',   ratio:0.80, f:0.80, w:0.90 },
  { id:'lunge',        name:'Walking Lunge',            group:'Quads',     cat:'legs', eq:'dumbbell',   mode:'pair',   ratio:0.90, f:0.80, w:0.85 },
  { id:'leg_ext',      name:'Leg Extension',            group:'Quads',     cat:'legs', eq:'machine',    mode:'bar',    ratio:1.10, f:0.80, w:0.80 },
  { id:'rdl',          name:'Romanian Deadlift',        group:'Hamstrings',cat:'legs', eq:'barbell',    mode:'bar',    ratio:1.60, f:0.80, w:0.95 },
  { id:'db_rdl',       name:'Dumbbell RDL',             group:'Hamstrings',cat:'legs', eq:'dumbbell',   mode:'pair',   ratio:1.30, f:0.80, w:0.90 },
  { id:'leg_curl',     name:'Seated Leg Curl',          group:'Hamstrings',cat:'legs', eq:'machine',    mode:'bar',    ratio:0.90, f:0.82, w:0.80 },
  { id:'lying_curl',   name:'Lying Leg Curl',           group:'Hamstrings',cat:'legs', eq:'machine',    mode:'bar',    ratio:0.85, f:0.82, w:0.80 },
  { id:'good_morning', name:'Good Morning',             group:'Hamstrings',cat:'legs', eq:'barbell',    mode:'bar',    ratio:1.05, f:0.78, w:0.85 },
  { id:'hip_thrust',   name:'Barbell Hip Thrust',       group:'Glutes',    cat:'legs', eq:'barbell',    mode:'bar',    ratio:2.10, f:0.90, w:0.90 },
  { id:'hip_abd',      name:'Hip Abduction Machine',    group:'Glutes',    cat:'legs', eq:'machine',    mode:'bar',    ratio:1.30, f:1.00, w:0.80 },
  { id:'calf_raise',   name:'Standing Calf Raise',      group:'Calves',    cat:'legs', eq:'machine',    mode:'bar',    ratio:2.00, f:0.80, w:0.80 },
  { id:'seated_calf',  name:'Seated Calf Raise',        group:'Calves',    cat:'legs', eq:'machine',    mode:'bar',    ratio:1.40, f:0.80, w:0.80 },

  // ---------------- olympic ----------------
  { id:'power_clean',  name:'Power Clean',              group:'Back',      cat:'pull', eq:'barbell',    mode:'bar',    ratio:1.15, f:0.75, w:0.95 },
  { id:'clean_jerk',   name:'Clean and Jerk',           group:'Back',      cat:'pull', eq:'barbell',    mode:'bar',    ratio:1.15, f:0.75, w:0.95 },
  { id:'snatch',       name:'Snatch',                   group:'Back',      cat:'pull', eq:'barbell',    mode:'bar',    ratio:0.90, f:0.75, w:0.95 },
  { id:'oh_squat',     name:'Overhead Squat',           group:'Quads',     cat:'legs', eq:'barbell',    mode:'bar',    ratio:0.85, f:0.78, w:0.85 },

  // ---------------- core ----------------
  { id:'cable_crunch', name:'Cable Crunch',             group:'Core',      cat:'core', eq:'cable',      mode:'bar',    ratio:0.90, f:0.75, w:1.00 },
  { id:'hang_leg_r',   name:'Hanging Leg Raise',        group:'Core',      cat:'core', eq:'bodyweight', mode:'bw',     ratio:0.70, f:0.80, w:1.00, bwFrac:0.50 },
  { id:'crunch',       name:'Crunch',                   group:'Core',      cat:'core', eq:'bodyweight', mode:'bw',     ratio:0.45, f:0.85, w:0.90, bwFrac:0.35 },
  { id:'back_ext',     name:'Back Extension',           group:'Core',      cat:'core', eq:'bodyweight', mode:'bw',     ratio:0.80, f:0.85, w:0.90, bwFrac:0.55 },
  { id:'ab_wheel',     name:'Ab Wheel Rollout',         group:'Core',      cat:'core', eq:'bodyweight', mode:'bw',     ratio:0.75, f:0.82, w:0.95, bwFrac:0.60 },
  { id:'russian_twist',name:'Russian Twist',            group:'Core',      cat:'core', eq:'dumbbell',   mode:'single', ratio:0.35, f:0.80, w:0.85 },
  { id:'plank',        name:'Plank',                    group:'Core',      cat:'core', eq:'bodyweight', mode:'bw',     ratio:0.55, f:0.85, w:0.85, bwFrac:0.45, timed:true },
];

const MUSCLE_GROUPS = ['Chest','Back','Shoulders','Biceps','Triceps','Forearms','Quads','Hamstrings','Glutes','Calves','Core'];
/* Weights are integer parts of 100 so the overall rank is exact
   arithmetic rather than 0.9999999999999999 of the truth. */
const CATEGORIES = [
  { id:'push', name:'Push',  weight:30 },
  { id:'pull', name:'Pull',  weight:30 },
  { id:'legs', name:'Legs',  weight:30 },
  { id:'core', name:'Core',  weight:10 },
];
const CATEGORY_WEIGHT_TOTAL = 100;

/* Starter routines — editable and deletable like any other routine. */
const STOCK_ROUTINES = [
  { id:'r_push', name:'Push Day',   stock:true, items:['bench','db_incline','ohp','lat_raise','pushdown','skullcrusher'] },
  { id:'r_pull', name:'Pull Day',   stock:true, items:['deadlift','pullup','bb_row','lat_pulldown','bb_curl','face_pull'] },
  { id:'r_legs', name:'Leg Day',    stock:true, items:['squat','rdl','leg_press','leg_curl','calf_raise','hang_leg_r'] },
  { id:'r_full', name:'Full Body',  stock:true, items:['squat','bench','bb_row','ohp','rdl','cable_crunch'] },
  { id:'r_upper',name:'Upper Body', stock:true, items:['bench','bb_row','ohp','lat_pulldown','db_curl','pushdown'] },
];

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { EXERCISES, MUSCLE_GROUPS, CATEGORIES, CATEGORY_WEIGHT_TOTAL, STOCK_ROUTINES };
}
