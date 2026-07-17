// Local persistence layer standing in for the future backend/cloud database.
const STORAGE_KEY = "bpt_state_v1";

function seedDateISO(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

// Sample training history so a fresh install's "sessions completed" / streak
// numbers are backed by real entries instead of floating unexplained stats.
// Most recent 5 days are consecutive (today back through 4 days ago) to
// match a 5-day streak; older entries have gaps, like real practice does.
function buildSeedHistory() {
  const plan = [
    { daysAgo: 0, id: "serve-fundamentals", time: "6:30 PM", effort: 3 },
    { daysAgo: 1, id: "six-point-footwork", time: "7:05 PM", effort: 4 },
    { daysAgo: 2, id: "explosive-leg-training", time: "6:45 PM", effort: 5 },
    { daysAgo: 3, id: "basic-grip", time: "5:50 PM", effort: 2 },
    { daysAgo: 4, id: "split-step-training", time: "6:15 PM", effort: 3 },
    { daysAgo: 6, id: "core-stability", time: "7:20 PM", effort: 3 },
    { daysAgo: 7, id: "fast-interceptions", time: "6:00 PM", effort: 4 },
    { daysAgo: 9, id: "direction-change", time: "6:40 PM", effort: 3 },
    { daysAgo: 10, id: "shoulder-strengthening", time: "5:30 PM", effort: 2 },
    { daysAgo: 12, id: "attack-positioning", time: "7:10 PM", effort: 4 },
    { daysAgo: 14, id: "recovery-positioning", time: "6:25 PM", effort: 3 },
    { daysAgo: 16, id: "agility-drills", time: "6:50 PM", effort: 4 },
  ];

  return plan.map(({ daysAgo, id, time, effort }, i) => {
    const ex = getExercise(id);
    const cat = getCategory(ex.categoryId);
    const durationSeconds = 480 + (i % 4) * 90; // 8-12ish minutes, varied
    const totalShuttles = 75;
    return {
      id: `seed-${daysAgo}-${id}`,
      exerciseId: id,
      exerciseName: ex.name,
      categoryId: ex.categoryId,
      dateISO: seedDateISO(daysAgo),
      timeLabel: time,
      durationSeconds,
      setsCompleted: 5,
      mode: "shuttles",
      totalShuttles,
      calories: Math.round((durationSeconds / 60) * cat.calPerMin),
      expGained: totalShuttles * 0.5,
      effort,
    };
  });
}

function defaultState() {
  return {
    profile: {
      name: "Player",
      skillLevel: "Intermediate", // Beginner | Intermediate | Advanced | Competitive
    },
    preferences: {
      goals: ["Improve technique", "Increase power"],
    },
    notifications: {
      dailyReminders: true,
      trainingSchedule: true,
      progressUpdates: false,
    },
    appSettings: {
      theme: "dark", // dark | light
      language: "English",
      videoQuality: "Auto",
    },
    progress: {
      sessionsCompleted: 12,
      streak: 5,
      lastTrainedISODate: seedDateISO(0),
      skills: { control: 12, power: 10, footwork: 15, netGame: 8, speed: 10 },
      completedExerciseIds: [
        "serve-fundamentals", "six-point-footwork", "explosive-leg-training", "basic-grip",
        "split-step-training", "core-stability", "fast-interceptions", "direction-change",
        "shoulder-strengthening", "attack-positioning", "recovery-positioning", "agility-drills",
      ],
      sessionHistory: buildSeedHistory(), // [{id, exerciseId, exerciseName, categoryId, dateISO, timeLabel, durationSeconds, setsCompleted, totalReps, calories, effort}]
      notes: {}, // exerciseId -> string
      difficultyRatings: {}, // exerciseId -> 1-5
      lastExerciseId: null,
      customDrills: [], // user-created drills, same shape as EXERCISES entries plus isCustom: true
      trainingSessions: [], // [{id, name, targetMinutes, exerciseIds: [...], createdAt}]
      activeSessionRun: null, // {sessionId, startedAt} | null — at most one running session at a time
      scheduledSessions: [], // [{id, sessionId, startDate: "YYYY-MM-DD", time: "HH:MM"|null, repeatDays: number|null, createdAt}]
    },
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    const merged = { ...defaultState(), ...parsed,
      profile: { ...defaultState().profile, ...(parsed.profile || {}) },
      preferences: { ...defaultState().preferences, ...(parsed.preferences || {}) },
      notifications: { ...defaultState().notifications, ...(parsed.notifications || {}) },
      appSettings: { ...defaultState().appSettings, ...(parsed.appSettings || {}) },
      progress: {
        ...defaultState().progress,
        ...(parsed.progress || {}),
        skills: { ...defaultState().progress.skills, ...((parsed.progress && parsed.progress.skills) || {}) },
      },
    };

    // One-time repair: earlier builds seeded sessionsCompleted/streak without
    // matching history entries. If nothing real has happened yet in this
    // browser, refresh the whole progress block with the current seed data
    // instead of leaving stats with nothing behind them.
    const p = merged.progress;
    const looksUntouched =
      p.sessionHistory.length === 0 &&
      p.completedExerciseIds.length === 0 &&
      p.customDrills.length === 0 &&
      p.trainingSessions.length === 0;
    if (looksUntouched && (p.sessionsCompleted > 0 || p.streak > 0)) {
      merged.progress = defaultState().progress;
    }

    return merged;
  } catch (e) {
    console.warn("Failed to load state, resetting", e);
    return defaultState();
  }
}

let STATE = loadState();

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(STATE));
}

function updateState(mutator) {
  mutator(STATE);
  saveState();
}
