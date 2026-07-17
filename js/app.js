// ---------- Utilities ----------

function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function stars(value, max = 5) {
  let s = "";
  for (let i = 1; i <= max; i++) s += i <= value ? "★" : "☆";
  return s;
}

function interactiveStars(value, onSet, max = 5) {
  const wrap = el(`<div class="star-input"></div>`);
  for (let i = 1; i <= max; i++) {
    const star = el(`<span class="star-input__star ${i <= value ? "is-filled" : ""}">★</span>`);
    star.addEventListener("click", () => onSet(i));
    wrap.appendChild(star);
  }
  return wrap;
}

function showConfirm(message) {
  const overlay = document.getElementById("confirm-overlay");
  document.getElementById("confirm-message").textContent = message;
  overlay.classList.add("is-open");

  return new Promise((resolve) => {
    const cancelBtn = document.getElementById("confirm-cancel");
    const okBtn = document.getElementById("confirm-ok");
    function cleanup(result) {
      overlay.classList.remove("is-open");
      cancelBtn.removeEventListener("click", onCancel);
      okBtn.removeEventListener("click", onOk);
      resolve(result);
    }
    function onCancel() { cleanup(false); }
    function onOk() { cleanup(true); }
    cancelBtn.addEventListener("click", onCancel);
    okBtn.addEventListener("click", onOk);
  });
}

function toast(message) {
  const host = document.getElementById("toast-host");
  const node = el(`<div class="toast">${message}</div>`);
  host.appendChild(node);
  requestAnimationFrame(() => node.classList.add("is-visible"));
  setTimeout(() => {
    node.classList.remove("is-visible");
    setTimeout(() => node.remove(), 250);
  }, 2200);
}

function formatMMSS(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(isoA, isoB) {
  const a = new Date(isoA);
  const b = new Date(isoB);
  return Math.round((b - a) / 86400000);
}

function skillBumpFor(ex) {
  if (ex.categoryId === "footwork") return "footwork";
  if (ex.categoryId === "strength") return "speed";
  const shot = ex.shotGroup || "";
  if (shot.includes("Smash")) return "power";
  if (shot.includes("Drive")) return "speed";
  if (shot.includes("Net Shot")) return "netGame";
  if (shot.includes("Clear") || shot.includes("Drop Shot") || shot.includes("Lift") || shot.includes("Defence")) return "control";
  if (ex.categoryId === "drills") {
    if (ex.id === "net-kill" || ex.id === "net-recovery") return "netGame";
    if (ex.id === "fast-interceptions" || ex.id === "attack-positioning") return "speed";
    return "control";
  }
  return null;
}

function slugify(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Splits an exercise's shortLabel ("Forehand Position, Straight, Early" /
// "Straight, Early" / "Middle Position, Forehand Position") into its parts.
function parseVariation(ex) {
  const parts = (ex.shortLabel || "").split(", ");
  if (parts[0] === "Middle Position") {
    return { position: "Middle Position", direction: "Middle Position", variation: parts[1], rowLabel: parts[1] };
  }
  if (parts.length === 3) {
    return { position: parts[0], direction: parts[1], variation: parts[2], rowLabel: `${parts[0]} — ${parts[2]}` };
  }
  return { position: null, direction: parts[0], variation: parts[1], rowLabel: parts[1] };
}

const DIRECTION_ORDER = ["Straight", "Cross", "Middle Position"];

function getShotGroups() {
  const map = new Map();
  EXERCISES.forEach((ex) => {
    if (!ex.shotGroup) return;
    if (!map.has(ex.shotGroup)) map.set(ex.shotGroup, []);
    map.get(ex.shotGroup).push(ex);
  });
  return [...map.entries()].map(([name, exercises]) => ({ name, slug: slugify(name), exercises }));
}

function getShotGroup(shotSlug) {
  return getShotGroups().find((g) => g.slug === shotSlug);
}

function relativeDateLabel(dateISO) {
  const diff = daysBetween(dateISO, todayISO());
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return new Date(dateISO).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

// ---------- Router ----------

function parseHash() {
  const hash = location.hash.replace(/^#\/?/, "");
  const parts = hash.split("/").filter(Boolean);
  if (parts.length === 0) return { view: "overview" };
  if (parts[0] === "training" && parts[1] === "category") return { view: "category", id: parts[2] };
  if (parts[0] === "training" && parts[1] === "exercise") return { view: "exercise", id: parts[2] };
  if (parts[0] === "training" && parts[1] === "shot" && parts[3]) return { view: "shotDirection", shot: parts[2], direction: parts[3] };
  if (parts[0] === "training" && parts[1] === "shot") return { view: "shot", shot: parts[2] };
  if (parts[0] === "training") return { view: "training" };
  if (parts[0] === "settings") return { view: "settings" };
  return { view: "overview" };
}

function navigate(path) {
  location.hash = path;
}

window.addEventListener("hashchange", render);
window.addEventListener("DOMContentLoaded", () => {
  applyTheme();
  render();
});

function render() {
  const route = parseHash();
  const screen = document.getElementById("app-screen");
  screen.scrollTop = 0;

  if (route.view === "overview") screen.replaceChildren(renderOverview());
  else if (route.view === "training") screen.replaceChildren(renderTraining());
  else if (route.view === "category") screen.replaceChildren(renderCategoryPage(route.id));
  else if (route.view === "shot") screen.replaceChildren(renderShotPage(route.shot));
  else if (route.view === "shotDirection") screen.replaceChildren(renderShotDirectionPage(route.shot, route.direction));
  else if (route.view === "exercise") screen.replaceChildren(renderExercisePage(route.id));
  else if (route.view === "settings") screen.replaceChildren(renderSettings());

  updateNavActive(route.view);
}

function updateNavActive(view) {
  const map = { overview: "overview", training: "training", category: "training", shot: "training", shotDirection: "training", exercise: "training", settings: "settings" };
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.nav === map[view]);
  });
}

// ---------- Theme ----------

function applyTheme() {
  document.documentElement.setAttribute("data-theme", STATE.appSettings.theme);
}

// ---------- Overview ----------

function renderOverview() {
  const p = STATE.progress;
  const recommended = EXERCISES.filter((e) => !p.completedExerciseIds.includes(e.id)).slice(0, 4);
  const lastExercise = p.lastExerciseId ? getExercise(p.lastExerciseId) : null;

  const wrap = el(`<div class="view view--overview"></div>`);

  wrap.appendChild(el(`
    <div class="hero">
      <div class="hero__eyebrow">${greeting()},</div>
      <div class="hero__name">${STATE.profile.name}</div>
      <div class="hero__goal">🎯 Your goal today: <strong>${lastExercise ? lastExercise.goal : "Improve your backhand consistency"}</strong></div>
    </div>
  `));

  if (lastExercise) {
    const continueCard = el(`
      <button class="continue-card">
        <div class="continue-card__label">Continue last workout</div>
        <div class="continue-card__name">${lastExercise.name}</div>
        <div class="continue-card__cta">Resume →</div>
      </button>
    `);
    continueCard.addEventListener("click", () => navigate(`/training/exercise/${lastExercise.id}`));
    wrap.appendChild(continueCard);
  }

  wrap.appendChild(el(`
    <div class="stat-row">
      <div class="stat-card">
        <div class="stat-card__value">${p.sessionsCompleted}</div>
        <div class="stat-card__label">Sessions completed</div>
      </div>
      <div class="stat-card stat-card--accent">
        <div class="stat-card__value">${p.streak}🔥</div>
        <div class="stat-card__label">Current streak</div>
      </div>
    </div>
  `));

  const skillsSection = el(`<div class="section"><div class="section__title">Stats</div></div>`);
  skillsSection.appendChild(skillBar("Control", p.skills.control));
  skillsSection.appendChild(skillBar("Power", p.skills.power));
  skillsSection.appendChild(skillBar("Footwork", p.skills.footwork));
  skillsSection.appendChild(skillBar("Net Game", p.skills.netGame));
  skillsSection.appendChild(skillBar("Speed", p.skills.speed));
  wrap.appendChild(skillsSection);

  const recentSection = el(`<div class="section"><div class="section__title">Recent Activity</div></div>`);
  if (p.sessionHistory.length === 0) {
    recentSection.appendChild(el(`<div class="empty-state">No exercises completed yet. Start your first session below.</div>`));
  } else {
    const list = el(`<div class="activity-list"></div>`);
    p.sessionHistory.slice(0, 5).forEach((rec) => {
      const cat = getCategory(rec.categoryId) || { emoji: "🏸", gradient: "linear-gradient(135deg,#2b3350,#171b2b)" };
      const card = el(`
        <button class="activity-card">
          <div class="activity-card__header">
            <span class="activity-card__icon" style="background:${cat.gradient}">${cat.emoji}</span>
            <div>
              <div class="activity-card__title">${rec.exerciseName}</div>
              <div class="activity-card__date">${relativeDateLabel(rec.dateISO)} · ${rec.timeLabel}</div>
            </div>
            ${rec.effort ? `<div class="activity-card__effort">${stars(rec.effort)}</div>` : ""}
          </div>
          <div class="activity-card__stats">
            <span>⏱ ${formatMMSS(rec.durationSeconds)}</span>
            <span>🔁 ${rec.setsCompleted} sets · ${rec.totalShuttles ?? rec.totalReps ?? "—"} shuttles</span>
            <span>🔥 ${rec.calories} cal</span>
          </div>
        </button>
      `);
      card.addEventListener("click", () => navigate(`/training/exercise/${rec.exerciseId}`));
      list.appendChild(card);
    });
    recentSection.appendChild(list);
  }
  wrap.appendChild(recentSection);

  const recSection = el(`<div class="section"><div class="section__title">Recommended for you</div></div>`);
  const recGrid = el(`<div class="exercise-card-grid"></div>`);
  recommended.forEach((ex) => recGrid.appendChild(exerciseCard(ex)));
  recSection.appendChild(recGrid);
  wrap.appendChild(recSection);

  return wrap;
}

function skillBar(label, exp) {
  const safeExp = Math.max(0, exp || 0);
  const level = Math.floor(safeExp / 100) + 1;
  const pct = safeExp % 100;
  return el(`
    <div class="skill-bar">
      <div class="skill-bar__top">
        <span>${label}</span>
        <span class="skill-bar__pct">Lv ${level} · ${pct}%</span>
      </div>
      <div class="skill-bar__track"><div class="skill-bar__fill" style="width:${pct}%"></div></div>
    </div>
  `);
}

// ---------- Training ----------

function renderTraining() {
  const wrap = el(`<div class="view view--training"></div>`);
  wrap.appendChild(el(`
    <div class="page-header">
      <div class="page-header__title">Training</div>
      <div class="page-header__subtitle">Pick a category to start building skill</div>
    </div>
  `));

  const searchWrap = el(`
    <div class="search-bar">
      <span class="search-bar__icon">🔍</span>
      <input class="search-bar__input" type="text" placeholder="Search techniques…" id="training-search" />
    </div>
  `);
  wrap.appendChild(searchWrap);

  const grid = el(`<div class="category-grid"></div>`);
  const searchResults = el(`<div class="search-results" style="display:none"></div>`);

  const input = searchWrap.querySelector("#training-search");
  input.addEventListener("input", () => {
    const query = input.value.trim().toLowerCase();
    if (!query) {
      grid.style.display = "";
      searchResults.style.display = "none";
      return;
    }
    grid.style.display = "none";
    searchResults.style.display = "";
    const matches = EXERCISES.filter((ex) => {
      const haystack = `${ex.name} ${ex.shotGroup || ""} ${ex.shortLabel || ""}`.toLowerCase();
      return haystack.includes(query);
    });
    searchResults.replaceChildren();
    if (matches.length === 0) {
      searchResults.appendChild(el(`<div class="empty-state">No techniques match "${query}".</div>`));
    } else {
      const list = el(`<div class="exercise-list"></div>`);
      matches.slice(0, 60).forEach((ex) => {
        const cat = getCategory(ex.categoryId);
        const done = STATE.progress.completedExerciseIds.includes(ex.id);
        const row = el(`
          <button class="exercise-row">
            <div class="exercise-row__main">
              <div class="exercise-row__name">${cat.emoji} ${ex.name} ${done ? '<span class="badge-done">✓ done</span>' : ""}</div>
              <div class="exercise-row__meta">${stars(ex.difficulty)} · ${cat.name}</div>
            </div>
            <div class="exercise-row__arrow">→</div>
          </button>
        `);
        row.addEventListener("click", () => navigate(`/training/exercise/${ex.id}`));
        list.appendChild(row);
      });
      searchResults.appendChild(list);
    }
  });

  CATEGORIES.forEach((cat) => {
    const count = getExercisesForCategory(cat.id).length;
    const card = el(`
      <button class="category-card" style="background:${cat.gradient}">
        <div class="category-card__emoji">${cat.emoji}</div>
        <div class="category-card__name">${cat.name}</div>
        <div class="category-card__tagline">${cat.tagline}</div>
        <div class="category-card__count">${count} exercises</div>
      </button>
    `);
    card.addEventListener("click", () => navigate(`/training/category/${cat.id}`));
    grid.appendChild(card);
  });
  wrap.appendChild(grid);
  wrap.appendChild(searchResults);
  return wrap;
}

function exerciseCard(ex) {
  const cat = getCategory(ex.categoryId);
  const done = STATE.progress.completedExerciseIds.includes(ex.id);
  const card = el(`
    <button class="exercise-card">
      <div class="exercise-card__thumb" style="background:${cat.gradient}">
        <span>${cat.emoji}</span>
        ${done ? '<span class="exercise-card__done">✓</span>' : ""}
      </div>
      <div class="exercise-card__body">
        <div class="exercise-card__name">${ex.name}</div>
        <div class="exercise-card__meta">${stars(ex.difficulty)} · ${ex.workout.sets}×${ex.workout.shuttles}</div>
      </div>
    </button>
  `);
  card.addEventListener("click", () => navigate(`/training/exercise/${ex.id}`));
  return card;
}

function renderCategoryPage(categoryId) {
  const cat = getCategory(categoryId);
  const wrap = el(`<div class="view view--category"></div>`);
  if (!cat) {
    wrap.appendChild(el(`<div class="empty-state">Category not found.</div>`));
    return wrap;
  }

  const back = el(`<button class="back-button">← Training</button>`);
  back.addEventListener("click", () => navigate("/training"));
  wrap.appendChild(back);

  wrap.appendChild(el(`
    <div class="category-banner" style="background:${cat.gradient}">
      <div class="category-banner__emoji">${cat.emoji}</div>
      <div class="category-banner__name">${cat.name}</div>
      <div class="category-banner__tagline">${cat.tagline}</div>
    </div>
  `));

  const list = el(`<div class="exercise-list"></div>`);

  if (categoryId === "technique") {
    getShotGroups().forEach((group) => {
      const doneCount = group.exercises.filter((e) => STATE.progress.completedExerciseIds.includes(e.id)).length;
      const row = el(`
        <button class="exercise-row">
          <div class="exercise-row__main">
            <div class="exercise-row__name">${group.name} ${doneCount === group.exercises.length ? '<span class="badge-done">✓ done</span>' : ""}</div>
            <div class="exercise-row__meta">${group.exercises.length} variations · ${doneCount}/${group.exercises.length} done</div>
          </div>
          <div class="exercise-row__arrow">→</div>
        </button>
      `);
      row.addEventListener("click", () => navigate(`/training/shot/${group.slug}`));
      list.appendChild(row);
    });
  } else {
    getExercisesForCategory(categoryId).forEach((ex) => {
      const done = STATE.progress.completedExerciseIds.includes(ex.id);
      const row = el(`
        <button class="exercise-row">
          <div class="exercise-row__main">
            <div class="exercise-row__name">${ex.name} ${done ? '<span class="badge-done">✓ done</span>' : ""}</div>
            <div class="exercise-row__meta">${stars(ex.difficulty)} · ${ex.workout.sets} sets × ${ex.workout.shuttles} shuttles</div>
          </div>
          <div class="exercise-row__arrow">→</div>
        </button>
      `);
      row.addEventListener("click", () => navigate(`/training/exercise/${ex.id}`));
      list.appendChild(row);
    });
  }
  wrap.appendChild(list);

  return wrap;
}

// ---------- Shot drill-down (Technique category) ----------

function renderShotPage(shotSlug) {
  const wrap = el(`<div class="view view--shot"></div>`);
  const group = getShotGroup(shotSlug);
  if (!group) {
    wrap.appendChild(el(`<div class="empty-state">Technique not found.</div>`));
    return wrap;
  }

  const back = el(`<button class="back-button">← Technique</button>`);
  back.addEventListener("click", () => navigate("/training/category/technique"));
  wrap.appendChild(back);

  const cat = getCategory("technique");
  const doneCount = group.exercises.filter((e) => STATE.progress.completedExerciseIds.includes(e.id)).length;
  wrap.appendChild(el(`
    <div class="category-banner" style="background:${cat.gradient}">
      <div class="category-banner__emoji">${cat.emoji}</div>
      <div class="category-banner__name">${group.name}</div>
      <div class="category-banner__tagline">${group.exercises.length} variations · ${doneCount}/${group.exercises.length} done</div>
    </div>
  `));

  const section = el(`<div class="section"><div class="section__title">Choose the direction</div></div>`);

  const directions = [...new Set(group.exercises.map((e) => parseVariation(e).direction))].sort(
    (a, b) => DIRECTION_ORDER.indexOf(a) - DIRECTION_ORDER.indexOf(b)
  );

  const directionGrid = el(`<div class="direction-grid"></div>`);
  directions.forEach((direction) => {
    const items = group.exercises.filter((e) => parseVariation(e).direction === direction);
    const done = items.filter((e) => STATE.progress.completedExerciseIds.includes(e.id)).length;
    const isMiddle = direction === "Middle Position";
    const card = el(`
      <button class="direction-card">
        <div class="direction-card__icon">${isMiddle ? "⬤" : direction === "Straight" ? "↑" : "↗"}</div>
        <div class="direction-card__name">${direction}</div>
        <div class="direction-card__meta">${items.length} variations · ${done}/${items.length} done</div>
      </button>
    `);
    card.addEventListener("click", () => navigate(`/training/shot/${shotSlug}/${slugify(direction)}`));
    directionGrid.appendChild(card);
  });
  section.appendChild(directionGrid);
  wrap.appendChild(section);

  return wrap;
}

function renderShotDirectionPage(shotSlug, directionSlug) {
  const wrap = el(`<div class="view view--shot-direction"></div>`);
  const group = getShotGroup(shotSlug);
  if (!group) {
    wrap.appendChild(el(`<div class="empty-state">Technique not found.</div>`));
    return wrap;
  }
  const items = group.exercises.filter((e) => slugify(parseVariation(e).direction) === directionSlug);
  const directionName = items.length ? parseVariation(items[0]).direction : "";

  const back = el(`<button class="back-button">← ${group.name}</button>`);
  back.addEventListener("click", () => navigate(`/training/shot/${shotSlug}`));
  wrap.appendChild(back);

  wrap.appendChild(el(`
    <div class="page-header">
      <div class="page-header__title">${group.name}</div>
      <div class="page-header__subtitle">${directionName}</div>
    </div>
  `));

  const list = el(`<div class="exercise-list"></div>`);
  items.forEach((ex) => {
    const done = STATE.progress.completedExerciseIds.includes(ex.id);
    const { rowLabel } = parseVariation(ex);
    const row = el(`
      <button class="exercise-row">
        <div class="exercise-row__main">
          <div class="exercise-row__name">${rowLabel} ${done ? '<span class="badge-done">✓ done</span>' : ""}</div>
          <div class="exercise-row__meta">${stars(ex.difficulty)} · ${ex.workout.sets} sets × ${ex.workout.shuttles} shuttles</div>
        </div>
        <div class="exercise-row__arrow">→</div>
      </button>
    `);
    row.addEventListener("click", () => navigate(`/training/exercise/${ex.id}`));
    list.appendChild(row);
  });
  wrap.appendChild(list);

  return wrap;
}

// ---------- Exercise detail ----------

function renderExercisePage(exerciseId) {
  const ex = getExercise(exerciseId);
  const wrap = el(`<div class="view view--exercise"></div>`);
  if (!ex) {
    wrap.appendChild(el(`<div class="empty-state">Exercise not found.</div>`));
    return wrap;
  }
  const cat = getCategory(ex.categoryId);
  const done = STATE.progress.completedExerciseIds.includes(ex.id);

  const back = el(`<button class="back-button">← ${cat.name}</button>`);
  back.addEventListener("click", () => navigate(`/training/category/${cat.id}`));
  wrap.appendChild(back);

  // Video section
  const videoSection = el(`
    <div class="video-card">
      <video id="exercise-video" src="${PLACEHOLDER_VIDEO}" playsinline muted controls poster=""></video>
      <div class="video-controls">
        <button class="video-btn" id="btn-slowmo">🐢 Slow-mo</button>
        <button class="video-btn" id="btn-loop">🔁 Loop</button>
        <div class="video-angles">
          <button class="video-btn video-btn--pill is-active" data-angle="Front">Front</button>
          <button class="video-btn video-btn--pill" data-angle="Side">Side</button>
          <button class="video-btn video-btn--pill" data-angle="Slow-Mo Replay">Slow-Mo Replay</button>
        </div>
      </div>
      <div class="video-note">Demo footage — placeholder until real instructional video is uploaded.</div>
    </div>
  `);
  wrap.appendChild(videoSection);

  wrap.appendChild(el(`
    <div class="exercise-header">
      <div class="exercise-header__top">
        <div class="exercise-header__name">${ex.name} ${done ? '<span class="badge-done">✓ Completed</span>' : ""}</div>
      </div>
      <div class="exercise-header__difficulty">${stars(ex.difficulty)} ${difficultyLabel(ex.difficulty)}</div>
    </div>
  `));

  wrap.appendChild(el(`
    <div class="info-block">
      <div class="info-block__title">Training Goal</div>
      <div class="info-block__text">${ex.goal}</div>
    </div>
  `));

  wrap.appendChild(el(`
    <div class="info-block">
      <div class="info-block__title">Description</div>
      <div class="info-block__text">${ex.description}</div>
    </div>
  `));

  const pointsBlock = el(`<div class="info-block"><div class="info-block__title">Key Coaching Points</div></div>`);
  const pointsList = el(`<div class="point-list point-list--good"></div>`);
  ex.coachingPoints.forEach((p) => pointsList.appendChild(el(`<div class="point-item">✓ ${p}</div>`)));
  pointsBlock.appendChild(pointsList);
  wrap.appendChild(pointsBlock);

  const mistakesBlock = el(`<div class="info-block"><div class="info-block__title">Common Mistakes</div></div>`);
  const mistakesList = el(`<div class="point-list point-list--bad"></div>`);
  ex.commonMistakes.forEach((m) => mistakesList.appendChild(el(`<div class="point-item">❌ ${m}</div>`)));
  mistakesBlock.appendChild(mistakesList);
  wrap.appendChild(mistakesBlock);

  wrap.appendChild(el(`
    <div class="workout-box">
      <div class="workout-box__title">Workout</div>
      <div class="workout-box__stats">
        <div class="workout-stat"><div class="workout-stat__value">${ex.workout.sets}</div><div class="workout-stat__label">sets</div></div>
        <div class="workout-stat"><div class="workout-stat__value">${ex.workout.shuttles}</div><div class="workout-stat__label">shuttles</div></div>
        <div class="workout-stat"><div class="workout-stat__value">${ex.workout.restSeconds}s</div><div class="workout-stat__label">rest</div></div>
      </div>
      <button class="start-btn" id="start-training-btn">Start Training</button>
    </div>
  `));

  const yourRating = STATE.progress.difficultyRatings[ex.id] || 0;
  const ratingBlock = el(`<div class="info-block"><div class="info-block__title">Your difficulty rating</div></div>`);
  ratingBlock.appendChild(interactiveStars(yourRating, (val) => {
    updateState((s) => (s.progress.difficultyRatings[ex.id] = val));
    toast("Rating saved");
    render();
  }));
  wrap.appendChild(ratingBlock);

  const notesBlock = el(`
    <div class="info-block">
      <div class="info-block__title">Your Notes</div>
      <textarea class="notes-input" placeholder="Add notes about your form, cues, or reminders...">${STATE.progress.notes[ex.id] || ""}</textarea>
    </div>
  `);
  const textarea = notesBlock.querySelector("textarea");
  let noteTimeout;
  textarea.addEventListener("input", () => {
    clearTimeout(noteTimeout);
    noteTimeout = setTimeout(() => {
      updateState((s) => (s.progress.notes[ex.id] = textarea.value));
      toast("Notes saved");
    }, 600);
  });
  wrap.appendChild(notesBlock);

  // Wire up video controls after mount
  queueMicrotask(() => {
    const video = wrap.querySelector("#exercise-video");
    const slowBtn = wrap.querySelector("#btn-slowmo");
    const loopBtn = wrap.querySelector("#btn-loop");
    slowBtn.addEventListener("click", () => {
      const isSlow = video.playbackRate === 0.5;
      video.playbackRate = isSlow ? 1 : 0.5;
      slowBtn.classList.toggle("is-active", !isSlow);
    });
    loopBtn.addEventListener("click", () => {
      video.loop = !video.loop;
      loopBtn.classList.toggle("is-active", video.loop);
    });
    wrap.querySelectorAll("[data-angle]").forEach((btn) => {
      btn.addEventListener("click", () => {
        wrap.querySelectorAll("[data-angle]").forEach((b) => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        toast(`Viewing: ${btn.dataset.angle} (demo)`);
      });
    });
    wrap.querySelector("#start-training-btn").addEventListener("click", () => openTimer(ex));
  });

  return wrap;
}

function difficultyLabel(n) {
  return ["", "Beginner", "Easy", "Intermediate", "Advanced", "Elite"][n] || "";
}

// ---------- Workout Timer Overlay ----------

let timerHandle = null;

function openTimer(ex) {
  const overlay = document.getElementById("timer-overlay");
  overlay.classList.add("is-open");

  const workDuration = Math.max(20, Math.min(90, ex.workout.shuttles * 3));
  const timerCtx = {
    ex,
    set: 1,
    totalSets: ex.workout.sets,
    phase: "work",
    shuttles: 0,
    totalShuttlesHit: 0,
    targetShuttles: ex.workout.shuttles,
    remaining: workDuration,
    workDuration,
    restDuration: ex.workout.restSeconds,
    paused: false,
    startedAt: Date.now(),
  };

  renderTimer(timerCtx);
  clearInterval(timerHandle);
  timerHandle = setInterval(() => tickTimer(timerCtx), 1000);
}

function closeTimer() {
  clearInterval(timerHandle);
  timerHandle = null;
  document.getElementById("timer-overlay").classList.remove("is-open");
}

function tickTimer(ctx) {
  if (ctx.paused || ctx.phase === "done") return;
  ctx.remaining -= 1;
  if (ctx.remaining <= 0) {
    if (ctx.phase === "work") {
      ctx.totalShuttlesHit += ctx.shuttles;
      if (ctx.set >= ctx.totalSets) {
        ctx.phase = "done";
        clearInterval(timerHandle);
        finishWorkout(ctx);
        return;
      }
      ctx.phase = "rest";
      ctx.remaining = ctx.restDuration;
    } else if (ctx.phase === "rest") {
      ctx.set += 1;
      ctx.phase = "work";
      ctx.remaining = ctx.workDuration;
      ctx.shuttles = 0;
    }
  }
  renderTimer(ctx);
}

function renderTimer(ctx) {
  const body = document.getElementById("timer-body");
  if (ctx.phase === "done") return;

  body.replaceChildren(el(`
    <div class="timer-content">
      <div class="timer-set">Set ${ctx.set} of ${ctx.totalSets}</div>
      <div class="timer-phase timer-phase--${ctx.phase}">${ctx.phase === "work" ? "Work" : "Rest"}</div>
      <div class="timer-clock">${formatMMSS(Math.max(0, ctx.remaining))}</div>
      ${
        ctx.phase === "work"
          ? `<div class="timer-reps">
               <button class="rep-btn" id="shuttle-minus">−</button>
               <div class="timer-reps__value">${ctx.shuttles} <span>/ ${ctx.targetShuttles} shuttles</span></div>
               <button class="rep-btn" id="shuttle-plus">+</button>
             </div>`
          : `<div class="timer-rest-note">Rest up — next: Set ${ctx.set + 1}</div>`
      }
      <div class="timer-actions">
        <button class="timer-action" id="timer-pause">${ctx.paused ? "Resume" : "Pause"}</button>
        <button class="timer-action" id="timer-skip">Skip</button>
      </div>
    </div>
  `));

  if (ctx.phase === "work") {
    body.querySelector("#shuttle-minus").addEventListener("click", () => {
      ctx.shuttles = Math.max(0, ctx.shuttles - 1);
      renderTimer(ctx);
    });
    body.querySelector("#shuttle-plus").addEventListener("click", () => {
      ctx.shuttles = Math.min(ctx.targetShuttles, ctx.shuttles + 1);
      renderTimer(ctx);
    });
  }
  body.querySelector("#timer-pause").addEventListener("click", () => {
    ctx.paused = !ctx.paused;
    renderTimer(ctx);
  });
  body.querySelector("#timer-skip").addEventListener("click", () => {
    ctx.remaining = 0;
    tickTimer(ctx);
  });
}

function finishWorkout(ctx) {
  const body = document.getElementById("timer-body");
  let localRating = STATE.progress.difficultyRatings[ctx.ex.id] || 0;

  const cat = getCategory(ctx.ex.categoryId);
  const durationSeconds = Math.max(1, Math.round((Date.now() - ctx.startedAt) / 1000));
  const calories = Math.round((durationSeconds / 60) * cat.calPerMin);

  const view = el(`
    <div class="timer-done">
      <div class="timer-done__check">✓</div>
      <div class="timer-done__title">Workout Complete!</div>
      <div class="timer-done__subtitle">${ctx.ex.name}</div>

      <div class="summary-grid">
        <div class="summary-stat">
          <div class="summary-stat__value">${formatMMSS(durationSeconds)}</div>
          <div class="summary-stat__label">Duration</div>
        </div>
        <div class="summary-stat">
          <div class="summary-stat__value">${ctx.totalSets}</div>
          <div class="summary-stat__label">Sets</div>
        </div>
        <div class="summary-stat">
          <div class="summary-stat__value">${ctx.totalShuttlesHit}</div>
          <div class="summary-stat__label">Shuttles</div>
        </div>
        <div class="summary-stat">
          <div class="summary-stat__value">${calories}</div>
          <div class="summary-stat__label">Est. calories</div>
        </div>
      </div>

      <div class="timer-done__label">How hard did that feel?</div>
      <div id="timer-done-stars"></div>
      <textarea class="notes-input" id="timer-done-notes" placeholder="Add notes about this session...">${STATE.progress.notes[ctx.ex.id] || ""}</textarea>
      <button class="start-btn" id="timer-done-save">Save & Finish</button>
    </div>
  `);
  body.replaceChildren(view);

  const starsHost = view.querySelector("#timer-done-stars");
  function paintStars() {
    starsHost.replaceChildren(interactiveStars(localRating, (val) => {
      localRating = val;
      paintStars();
    }));
  }
  paintStars();

  view.querySelector("#timer-done-save").addEventListener("click", () => {
    const notes = view.querySelector("#timer-done-notes").value;
    updateState((s) => {
      const today = todayISO();
      if (s.progress.lastTrainedISODate !== today) {
        if (s.progress.lastTrainedISODate && daysBetween(s.progress.lastTrainedISODate, today) === 1) {
          s.progress.streak += 1;
        } else if (s.progress.lastTrainedISODate !== today) {
          s.progress.streak = s.progress.lastTrainedISODate ? 1 : s.progress.streak || 1;
        }
        s.progress.lastTrainedISODate = today;
        s.progress.sessionsCompleted += 1;
      }
      if (!s.progress.completedExerciseIds.includes(ctx.ex.id)) {
        s.progress.completedExerciseIds.push(ctx.ex.id);
      }
      s.progress.sessionHistory.unshift({
        id: `${Date.now()}`,
        exerciseId: ctx.ex.id,
        exerciseName: ctx.ex.name,
        categoryId: ctx.ex.categoryId,
        dateISO: today,
        timeLabel: new Date().toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
        durationSeconds,
        setsCompleted: ctx.totalSets,
        totalShuttles: ctx.totalShuttlesHit,
        calories,
        effort: localRating,
      });
      s.progress.sessionHistory = s.progress.sessionHistory.slice(0, 30);
      s.progress.notes[ctx.ex.id] = notes;
      if (localRating) s.progress.difficultyRatings[ctx.ex.id] = localRating;
      s.progress.lastExerciseId = ctx.ex.id;

      // Each shuttle hit is worth 1% exp toward the relevant stat; levels stack indefinitely.
      const bump = skillBumpFor(ctx.ex);
      if (bump) s.progress.skills[bump] = (s.progress.skills[bump] || 0) + ctx.totalShuttlesHit;
    });
    closeTimer();
    toast("Nice work! Session saved.");
    render();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("timer-close").addEventListener("click", async () => {
    const ok = await showConfirm("End this workout early? Progress for this session won't be saved.");
    if (ok) closeTimer();
  });
});

// ---------- Settings ----------

const GOAL_OPTIONS = ["Improve technique", "Increase power", "Improve speed", "Prepare for competition"];
const SKILL_LEVELS = ["Beginner", "Intermediate", "Advanced", "Competitive"];

function renderSettings() {
  const wrap = el(`<div class="view view--settings"></div>`);
  wrap.appendChild(el(`
    <div class="page-header">
      <div class="page-header__title">Settings</div>
      <div class="page-header__subtitle">Your profile & preferences</div>
    </div>
  `));

  // Profile
  const profileSection = el(`<div class="section"><div class="section__title">Profile</div></div>`);
  const nameField = el(`
    <div class="field">
      <label class="field__label">Name</label>
      <input class="field__input" id="name-input" type="text" value="${STATE.profile.name}" />
    </div>
  `);
  nameField.querySelector("input").addEventListener("change", (e) => {
    updateState((s) => (s.profile.name = e.target.value || "Player"));
    toast("Name updated");
  });
  profileSection.appendChild(nameField);

  const skillField = el(`<div class="field"><label class="field__label">Skill level</label></div>`);
  const skillChips = el(`<div class="chip-row"></div>`);
  SKILL_LEVELS.forEach((lvl) => {
    const chip = el(`<button class="chip ${STATE.profile.skillLevel === lvl ? "is-active" : ""}">${lvl}</button>`);
    chip.addEventListener("click", () => {
      updateState((s) => (s.profile.skillLevel = lvl));
      render();
    });
    skillChips.appendChild(chip);
  });
  skillField.appendChild(skillChips);
  profileSection.appendChild(skillField);
  wrap.appendChild(profileSection);

  // Training preferences
  const prefSection = el(`<div class="section"><div class="section__title">Training Preferences</div><div class="field__label">Training goals</div></div>`);
  const goalChips = el(`<div class="chip-row"></div>`);
  GOAL_OPTIONS.forEach((goal) => {
    const active = STATE.preferences.goals.includes(goal);
    const chip = el(`<button class="chip ${active ? "is-active" : ""}">${goal}</button>`);
    chip.addEventListener("click", () => {
      updateState((s) => {
        if (s.preferences.goals.includes(goal)) {
          s.preferences.goals = s.preferences.goals.filter((g) => g !== goal);
        } else {
          s.preferences.goals.push(goal);
        }
      });
      render();
    });
    goalChips.appendChild(chip);
  });
  prefSection.appendChild(goalChips);
  wrap.appendChild(prefSection);

  // Notifications
  const notifSection = el(`<div class="section"><div class="section__title">Notifications</div></div>`);
  notifSection.appendChild(toggleRow("Daily reminders", STATE.notifications.dailyReminders, (val) => {
    updateState((s) => (s.notifications.dailyReminders = val));
  }));
  notifSection.appendChild(toggleRow("Training schedule", STATE.notifications.trainingSchedule, (val) => {
    updateState((s) => (s.notifications.trainingSchedule = val));
  }));
  notifSection.appendChild(toggleRow("Progress updates", STATE.notifications.progressUpdates, (val) => {
    updateState((s) => (s.notifications.progressUpdates = val));
  }));
  wrap.appendChild(notifSection);

  // App settings
  const appSection = el(`<div class="section"><div class="section__title">App Settings</div></div>`);
  appSection.appendChild(toggleRow("Dark mode", STATE.appSettings.theme === "dark", (val) => {
    updateState((s) => (s.appSettings.theme = val ? "dark" : "light"));
    applyTheme();
  }));

  const langField = el(`<div class="field"><label class="field__label">Language</label></div>`);
  const langSelect = el(`<select class="field__input"></select>`);
  ["English", "Spanish", "French", "Mandarin", "Indonesian"].forEach((lang) => {
    const opt = el(`<option value="${lang}" ${STATE.appSettings.language === lang ? "selected" : ""}>${lang}</option>`);
    langSelect.appendChild(opt);
  });
  langSelect.addEventListener("change", (e) => {
    updateState((s) => (s.appSettings.language = e.target.value));
    toast("Language updated");
  });
  langField.appendChild(langSelect);
  appSection.appendChild(langField);

  const vidField = el(`<div class="field"><label class="field__label">Video quality</label></div>`);
  const vidSelect = el(`<select class="field__input"></select>`);
  ["Auto", "High", "Medium", "Data saver"].forEach((q) => {
    const opt = el(`<option value="${q}" ${STATE.appSettings.videoQuality === q ? "selected" : ""}>${q}</option>`);
    vidSelect.appendChild(opt);
  });
  vidSelect.addEventListener("change", (e) => {
    updateState((s) => (s.appSettings.videoQuality = e.target.value));
    toast("Video quality updated");
  });
  vidField.appendChild(vidSelect);
  appSection.appendChild(vidField);

  wrap.appendChild(appSection);

  const resetBtn = el(`<button class="reset-btn">Reset progress</button>`);
  resetBtn.addEventListener("click", async () => {
    const ok = await showConfirm("Reset all training progress? This can't be undone.");
    if (ok) {
      updateState((s) => (s.progress = defaultState().progress));
      toast("Progress reset");
      render();
    }
  });
  wrap.appendChild(resetBtn);

  return wrap;
}

function toggleRow(label, checked, onChange) {
  const row = el(`
    <div class="toggle-row">
      <span>${label}</span>
      <button class="toggle ${checked ? "is-on" : ""}" role="switch" aria-checked="${checked}"><span class="toggle__knob"></span></button>
    </div>
  `);
  const btn = row.querySelector(".toggle");
  btn.addEventListener("click", () => {
    const next = !btn.classList.contains("is-on");
    btn.classList.toggle("is-on", next);
    btn.setAttribute("aria-checked", String(next));
    onChange(next);
  });
  return row;
}

// ---------- Bottom nav wiring ----------

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => navigate(`/${btn.dataset.nav}`));
  });
});
