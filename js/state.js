// Local persistence layer standing in for the future backend/cloud database.
const STORAGE_KEY = "bpt_state_v1";

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
      lastTrainedISODate: null,
      skills: { footwork: 15, smashPower: 10, netControl: 8 },
      completedExerciseIds: [],
      sessionHistory: [], // [{id, exerciseId, exerciseName, categoryId, dateISO, timeLabel, durationSeconds, setsCompleted, totalReps, calories, effort}]
      notes: {}, // exerciseId -> string
      difficultyRatings: {}, // exerciseId -> 1-5
      lastExerciseId: null,
    },
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return { ...defaultState(), ...parsed,
      profile: { ...defaultState().profile, ...(parsed.profile || {}) },
      preferences: { ...defaultState().preferences, ...(parsed.preferences || {}) },
      notifications: { ...defaultState().notifications, ...(parsed.notifications || {}) },
      appSettings: { ...defaultState().appSettings, ...(parsed.appSettings || {}) },
      progress: { ...defaultState().progress, ...(parsed.progress || {}) },
    };
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
