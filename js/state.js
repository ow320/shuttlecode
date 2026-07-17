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
      skills: { control: 12, power: 10, footwork: 15, netGame: 8, speed: 10 },
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
      progress: {
        ...defaultState().progress,
        ...(parsed.progress || {}),
        skills: { ...defaultState().progress.skills, ...((parsed.progress && parsed.progress.skills) || {}) },
      },
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
