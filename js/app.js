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

function formatTimeLabel(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

function addDaysISO(dateISO, days) {
  const d = new Date(dateISO + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const REPEAT_OPTIONS = [
  { value: "", label: "Does not repeat" },
  { value: "1", label: "Daily" },
  { value: "2", label: "Every 2 days" },
  { value: "3", label: "Every 3 days" },
  { value: "7", label: "Weekly" },
  { value: "14", label: "Every 2 weeks" },
  { value: "30", label: "Monthly" },
];

function repeatLabel(repeatDays) {
  const opt = REPEAT_OPTIONS.find((o) => o.value === String(repeatDays || ""));
  return opt ? opt.label : "Does not repeat";
}

// Whether a scheduled entry lands on the given date (expanding its repeat rule).
function scheduleOccursOn(sched, dateISO) {
  if (dateISO < sched.startDate) return false;
  if (!sched.repeatDays) return dateISO === sched.startDate;
  const diff = daysBetween(sched.startDate, dateISO);
  return diff >= 0 && diff % sched.repeatDays === 0;
}

// Soonest occurrence of a single schedule on or after fromDateISO.
function nextOccurrenceOf(sched, fromDateISO) {
  if (sched.startDate >= fromDateISO) return sched.startDate;
  if (!sched.repeatDays) return null;
  const diff = daysBetween(sched.startDate, fromDateISO);
  const stepsNeeded = Math.ceil(diff / sched.repeatDays);
  return addDaysISO(sched.startDate, stepsNeeded * sched.repeatDays);
}

// The single soonest upcoming occurrence across every scheduled session.
function nextScheduledOccurrence() {
  const fromDateISO = todayISO();
  let best = null;
  STATE.progress.scheduledSessions.forEach((sched) => {
    const occ = nextOccurrenceOf(sched, fromDateISO);
    if (occ && (!best || occ < best.dateISO || (occ === best.dateISO && (sched.time || "") < (best.sched.time || "")))) {
      best = { dateISO: occ, sched };
    }
  });
  return best;
}

// Levels 1-10 cost 100 exp each; every 10 levels after that, the cost per
// level in that tier rises by another 10% (compounding), so leveling up
// gets progressively harder at higher levels.
const SKILL_BASE_EXP_PER_LEVEL = 100;
const SKILL_TIER_SIZE = 10;
const SKILL_TIER_GROWTH = 1.1;

function computeSkillLevel(totalExp) {
  let remaining = Math.max(0, totalExp || 0);
  let tier = 0;
  while (true) {
    // Rounded to avoid floating-point drift (e.g. 100 * 1.1 !== 110 exactly)
    // creating off-by-one glitches right at tier/level boundaries.
    const costPerLevel = Math.round(SKILL_BASE_EXP_PER_LEVEL * Math.pow(SKILL_TIER_GROWTH, tier) * 100) / 100;
    const tierCost = Math.round(costPerLevel * SKILL_TIER_SIZE * 100) / 100;
    if (remaining < tierCost) {
      const levelsIntoTier = Math.floor(remaining / costPerLevel);
      const level = tier * SKILL_TIER_SIZE + levelsIntoTier + 1;
      const expIntoLevel = remaining - levelsIntoTier * costPerLevel;
      const pct = (expIntoLevel / costPerLevel) * 100;
      return { level, pct, costPerLevel };
    }
    remaining -= tierCost;
    tier++;
  }
}

function workoutSummaryShort(ex) {
  const w = ex.workout;
  return w.mode === "time" ? `${w.sets}×${w.durationSeconds}s` : `${w.sets}×${w.shuttles}`;
}

function workoutSummaryLong(ex) {
  const w = ex.workout;
  return w.mode === "time" ? `${w.sets} sets × ${w.durationSeconds}s` : `${w.sets} sets × ${w.shuttles} shuttles`;
}

// Mirrors the live timer's own math (work-phase duration + rest between sets,
// no rest after the final set) so the estimate matches what actually happens.
function estimateExerciseSeconds(ex) {
  const w = ex.workout;
  const workSeconds = w.mode === "time" ? w.durationSeconds : Math.max(20, Math.min(90, w.shuttles * 3));
  return w.sets * workSeconds + Math.max(0, w.sets - 1) * w.restSeconds;
}

function formatDurationLong(totalSeconds) {
  const totalMinutes = Math.round(totalSeconds / 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
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
  if (parts[0] === "training" && parts[1] === "session" && parts[2] === "builder") return { view: "sessionBuilder" };
  if (parts[0] === "training" && parts[1] === "session") return { view: "session", id: parts[2] };
  if (parts[0] === "training") return { view: "training" };
  if (parts[0] === "history" && parts[1]) return { view: "historyDetail", id: parts[1] };
  if (parts[0] === "history") return { view: "history" };
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
  else if (route.view === "sessionBuilder") screen.replaceChildren(renderSessionBuilder());
  else if (route.view === "session") screen.replaceChildren(renderSessionPage(route.id));
  else if (route.view === "history") screen.replaceChildren(renderHistoryPage());
  else if (route.view === "historyDetail") screen.replaceChildren(renderHistoryDetailPage(route.id));
  else if (route.view === "settings") screen.replaceChildren(renderSettings());

  updateNavActive(route.view);
}

function updateNavActive(view) {
  const map = {
    overview: "overview",
    training: "training",
    category: "training",
    shot: "training",
    shotDirection: "training",
    exercise: "training",
    sessionBuilder: "training",
    session: "training",
    history: "overview",
    historyDetail: "overview",
    settings: "settings",
  };
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
        <div class="continue-card__label">Continue last training</div>
        <div class="continue-card__name">${lastExercise.name}</div>
        <div class="continue-card__cta">Resume →</div>
      </button>
    `);
    continueCard.addEventListener("click", () => navigate(`/training/exercise/${lastExercise.id}`));
    wrap.appendChild(continueCard);
  }

  const statRow = el(`
    <div class="stat-row">
      <button class="stat-card">
        <div class="stat-card__value">${p.sessionsCompleted}</div>
        <div class="stat-card__label">Sessions completed</div>
      </button>
      <div class="stat-card stat-card--accent">
        <div class="stat-card__value">${p.streak}🔥</div>
        <div class="stat-card__label">Current streak</div>
      </div>
    </div>
  `);
  statRow.querySelector(".stat-card").addEventListener("click", () => navigate("/history"));
  wrap.appendChild(statRow);

  const calSection = el(`<div class="section"><div class="section__title">Training Calendar</div></div>`);
  const next = nextScheduledOccurrence();
  const nextSession = next ? STATE.progress.trainingSessions.find((s) => s.id === next.sched.sessionId) : null;
  if (next && nextSession) {
    const nextLabel = new Date(next.dateISO + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
    const nextCard = el(`
      <button class="next-session-card">
        <div class="next-session-card__label">Next training session</div>
        <div class="next-session-card__name">${nextSession.name}</div>
        <div class="next-session-card__when">${nextLabel}${next.sched.time ? " · " + formatTimeLabel(next.sched.time) : ""}</div>
      </button>
    `);
    nextCard.addEventListener("click", () => navigate(`/training/session/${nextSession.id}`));
    calSection.appendChild(nextCard);
  } else {
    calSection.appendChild(el(`<div class="empty-state">No upcoming sessions scheduled. Build a training session and add it to your calendar.</div>`));
  }
  calSection.appendChild(renderCalendarWidget());
  wrap.appendChild(calSection);

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
    p.sessionHistory.slice(0, 5).forEach((rec) => list.appendChild(activityCard(rec, () => navigate(`/history/${rec.id}`))));
    recentSection.appendChild(list);
    if (p.sessionHistory.length > 5) {
      const seeAll = el(`<button class="see-all-btn">See all training history →</button>`);
      seeAll.addEventListener("click", () => navigate("/history"));
      recentSection.appendChild(seeAll);
    }
  }
  wrap.appendChild(recentSection);

  return wrap;
}

function skillBar(label, exp) {
  const { level, pct } = computeSkillLevel(exp);
  return el(`
    <div class="skill-bar">
      <div class="skill-bar__top">
        <span>${label}</span>
        <span class="skill-bar__pct">Lv ${level} · ${Math.round(pct)}%</span>
      </div>
      <div class="skill-bar__track"><div class="skill-bar__fill" style="width:${pct}%"></div></div>
    </div>
  `);
}

function activityCard(rec, onClick) {
  const cat = getCategory(rec.categoryId) || { photo: "assets/categories/technique.jpg" };
  const card = el(`
    <button class="activity-card">
      <div class="activity-card__header">
        <span class="activity-card__icon" style="background-image:url('${cat.photo}')"></span>
        <div>
          <div class="activity-card__title">${rec.exerciseName}</div>
          <div class="activity-card__date">${relativeDateLabel(rec.dateISO)} · ${rec.timeLabel}</div>
        </div>
        ${rec.effort ? `<div class="activity-card__effort">${stars(rec.effort)}</div>` : ""}
      </div>
      <div class="activity-card__stats">
        <span>⏱ ${formatMMSS(rec.durationSeconds)}</span>
        ${
          rec.mode === "session"
            ? `<span>📋 ${rec.setsCompleted} exercise${rec.setsCompleted === 1 ? "" : "s"} done</span>`
            : `<span>🔁 ${rec.setsCompleted} sets · ${
                rec.mode === "time" ? `${formatMMSS(rec.totalWorkSeconds || 0)} training` : `${rec.totalShuttles ?? rec.totalReps ?? "—"} shuttles`
              }</span>`
        }
        <span>🔥 ${rec.calories} cal</span>
        ${rec.expGained != null ? `<span>✨ +${rec.expGained % 1 === 0 ? rec.expGained : rec.expGained.toFixed(1)} exp</span>` : ""}
      </div>
    </button>
  `);
  card.addEventListener("click", onClick);
  return card;
}

// ---------- Training History ----------

function renderHistoryPage() {
  const wrap = el(`<div class="view view--history"></div>`);
  const back = el(`<button class="back-button">← Overview</button>`);
  back.addEventListener("click", () => navigate("/overview"));
  wrap.appendChild(back);

  const history = STATE.progress.sessionHistory;
  wrap.appendChild(el(`
    <div class="page-header">
      <div class="page-header__title">Training History</div>
      <div class="page-header__subtitle">${history.length} session${history.length === 1 ? "" : "s"} logged</div>
    </div>
  `));

  if (history.length === 0) {
    wrap.appendChild(el(`<div class="empty-state">No training sessions logged yet. Complete a drill or technique to see it here.</div>`));
    return wrap;
  }

  const list = el(`<div class="activity-list"></div>`);
  history.forEach((rec) => list.appendChild(activityCard(rec, () => navigate(`/history/${rec.id}`))));
  wrap.appendChild(list);

  return wrap;
}

function renderHistoryDetailPage(entryId) {
  const wrap = el(`<div class="view view--history-detail"></div>`);
  const rec = STATE.progress.sessionHistory.find((r) => r.id === entryId);
  if (!rec) {
    wrap.appendChild(el(`<div class="empty-state">Session not found.</div>`));
    return wrap;
  }

  const back = el(`<button class="back-button">← Training History</button>`);
  back.addEventListener("click", () => navigate("/history"));
  wrap.appendChild(back);

  const cat = getCategory(rec.categoryId) || { photo: "assets/categories/technique.jpg", name: "Training" };
  const dateLabel = new Date(rec.dateISO + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  wrap.appendChild(el(`
    <div class="category-banner" style="background-image:linear-gradient(to top, rgba(6,8,12,0.92), rgba(6,8,12,0.1) 65%), url('${cat.photo}')">
      <div class="category-banner__name">${rec.exerciseName}</div>
      <div class="category-banner__tagline">${dateLabel} · ${rec.timeLabel}</div>
    </div>
  `));

  const grid = el(`<div class="summary-grid"></div>`);
  grid.appendChild(el(`
    <div class="summary-stat">
      <div class="summary-stat__value">${formatMMSS(rec.durationSeconds)}</div>
      <div class="summary-stat__label">Duration</div>
    </div>
  `));
  grid.appendChild(el(`
    <div class="summary-stat">
      <div class="summary-stat__value">${rec.setsCompleted}</div>
      <div class="summary-stat__label">${rec.mode === "session" ? "Exercises" : "Sets"}</div>
    </div>
  `));
  if (rec.mode === "time" || rec.mode === "session") {
    grid.appendChild(el(`
      <div class="summary-stat">
        <div class="summary-stat__value">${formatMMSS(rec.totalWorkSeconds || 0)}</div>
        <div class="summary-stat__label">${rec.mode === "session" ? "Session Time" : "Training Time"}</div>
      </div>
    `));
  } else {
    grid.appendChild(el(`
      <div class="summary-stat">
        <div class="summary-stat__value">${rec.totalShuttles ?? rec.totalReps ?? "—"}</div>
        <div class="summary-stat__label">Shuttles</div>
      </div>
    `));
  }
  grid.appendChild(el(`
    <div class="summary-stat">
      <div class="summary-stat__value">${rec.calories}</div>
      <div class="summary-stat__label">Est. calories</div>
    </div>
  `));
  wrap.appendChild(grid);

  if (rec.expGained != null) {
    wrap.appendChild(el(`<div class="exp-pill">✨ +${rec.expGained % 1 === 0 ? rec.expGained : rec.expGained.toFixed(1)} exp</div>`));
  }

  if (rec.effort) {
    wrap.appendChild(el(`
      <div class="info-block">
        <div class="info-block__title">How it felt</div>
        <div class="info-block__text">${stars(rec.effort)}</div>
      </div>
    `));
  }

  if (rec.exerciseId && getExercise(rec.exerciseId)) {
    const exBtn = el(`<button class="start-btn">View Exercise</button>`);
    exBtn.addEventListener("click", () => navigate(`/training/exercise/${rec.exerciseId}`));
    wrap.appendChild(exBtn);
  } else if (rec.sessionId && STATE.progress.trainingSessions.some((s) => s.id === rec.sessionId)) {
    const sessBtn = el(`<button class="start-btn">View Training Session</button>`);
    sessBtn.addEventListener("click", () => navigate(`/training/session/${rec.sessionId}`));
    wrap.appendChild(sessBtn);
  }

  return wrap;
}

// ---------- Calendar ----------

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

function buildMonthGrid(year, month) {
  const startWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  const cells = [];
  for (let i = startWeekday - 1; i >= 0; i--) {
    cells.push({ day: daysInPrevMonth - i, inMonth: false, dateISO: null });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, inMonth: true, dateISO: `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}` });
  }
  let trailing = 1;
  while (cells.length % 7 !== 0) {
    cells.push({ day: trailing++, inMonth: false, dateISO: null });
  }
  return cells;
}

function renderCalendarWidget() {
  const now = new Date();
  let viewYear = now.getFullYear();
  let viewMonth = now.getMonth();
  let selectedDateISO = null;

  const wrap = el(`<div class="calendar-card"></div>`);
  const header = el(`
    <div class="calendar-card__header">
      <button class="calendar-nav" id="cal-prev" type="button">‹</button>
      <div class="calendar-card__title" id="cal-title"></div>
      <button class="calendar-nav" id="cal-next" type="button">›</button>
    </div>
  `);
  wrap.appendChild(header);
  const grid = el(`<div class="calendar-grid"></div>`);
  wrap.appendChild(grid);
  const dayDetail = el(`<div class="calendar-day-detail" style="display:none"></div>`);
  wrap.appendChild(dayDetail);

  function paintDayDetail() {
    if (!selectedDateISO) {
      dayDetail.style.display = "none";
      return;
    }
    dayDetail.style.display = "";
    dayDetail.replaceChildren();
    const label = new Date(selectedDateISO + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
    dayDetail.appendChild(el(`<div class="calendar-day-detail__title">${label}</div>`));
    const occurring = STATE.progress.scheduledSessions.filter((sc) => scheduleOccursOn(sc, selectedDateISO));
    if (occurring.length === 0) {
      dayDetail.appendChild(el(`<div class="empty-state">No sessions scheduled.</div>`));
    } else {
      occurring.forEach((sc) => {
        const session = STATE.progress.trainingSessions.find((s) => s.id === sc.sessionId);
        if (!session) return;
        const row = el(`
          <button class="exercise-row">
            <div class="exercise-row__main">
              <div class="exercise-row__name">${session.name}</div>
              <div class="exercise-row__meta">${sc.time ? formatTimeLabel(sc.time) : "All day"} · ${repeatLabel(sc.repeatDays)}</div>
            </div>
            <div class="exercise-row__arrow">→</div>
          </button>
        `);
        row.addEventListener("click", () => navigate(`/training/session/${session.id}`));
        dayDetail.appendChild(row);
      });
    }
  }

  function paint() {
    header.querySelector("#cal-title").textContent = `${MONTH_NAMES[viewMonth]} ${viewYear}`;
    grid.replaceChildren();
    WEEKDAY_LABELS.forEach((w) => grid.appendChild(el(`<div class="calendar-grid__weekday">${w}</div>`)));
    const todayStr = todayISO();
    buildMonthGrid(viewYear, viewMonth).forEach((cell) => {
      const isToday = cell.dateISO === todayStr;
      const isSelected = cell.inMonth && cell.dateISO === selectedDateISO;
      const hasEvent = cell.inMonth && STATE.progress.scheduledSessions.some((sc) => scheduleOccursOn(sc, cell.dateISO));
      const dayEl = el(`
        <button class="calendar-day ${cell.inMonth ? "" : "calendar-day--muted"} ${isToday ? "calendar-day--today" : ""} ${isSelected ? "calendar-day--selected" : ""}" ${cell.inMonth ? "" : "disabled"}>
          <span>${cell.day}</span>
          ${hasEvent ? '<span class="calendar-day__dot"></span>' : ""}
        </button>
      `);
      if (cell.inMonth) {
        dayEl.addEventListener("click", () => {
          selectedDateISO = selectedDateISO === cell.dateISO ? null : cell.dateISO;
          paint();
          paintDayDetail();
        });
      }
      grid.appendChild(dayEl);
    });
  }

  header.querySelector("#cal-prev").addEventListener("click", () => {
    viewMonth -= 1;
    if (viewMonth < 0) {
      viewMonth = 11;
      viewYear -= 1;
    }
    selectedDateISO = null;
    paint();
    paintDayDetail();
  });
  header.querySelector("#cal-next").addEventListener("click", () => {
    viewMonth += 1;
    if (viewMonth > 11) {
      viewMonth = 0;
      viewYear += 1;
    }
    selectedDateISO = null;
    paint();
    paintDayDetail();
  });

  paint();
  paintDayDetail();
  return wrap;
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
              <div class="exercise-row__name">${ex.name} ${done ? '<span class="badge-done">✓ done</span>' : ""}</div>
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
    const countLabel =
      cat.id === "sessions" ? `${STATE.progress.trainingSessions.length} sessions` : `${getExercisesForCategory(cat.id).length} exercises`;
    const card = el(`
      <button class="category-card" style="background-image:linear-gradient(to top, rgba(6,8,12,0.92), rgba(6,8,12,0.15) 65%), url('${cat.photo}')">
        <div class="category-card__name">${cat.name}</div>
        <div class="category-card__tagline">${cat.tagline}</div>
        <div class="category-card__count">${countLabel}</div>
      </button>
    `);
    card.addEventListener("click", () => navigate(`/training/category/${cat.id}`));
    grid.appendChild(card);
  });
  wrap.appendChild(grid);
  wrap.appendChild(searchResults);
  return wrap;
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
    <div class="category-banner" style="background-image:linear-gradient(to top, rgba(6,8,12,0.92), rgba(6,8,12,0.1) 65%), url('${cat.photo}')">
      <div class="category-banner__name">${cat.name}</div>
      <div class="category-banner__tagline">${cat.tagline}</div>
    </div>
  `));

  const list = el(`<div class="exercise-list"></div>`);

  if (categoryId === "sessions") {
    const addBtn = el(`<button class="add-drill-btn">+ Build Training Session</button>`);
    addBtn.addEventListener("click", () => navigate("/training/session/builder"));
    wrap.appendChild(addBtn);

    if (STATE.progress.trainingSessions.length === 0) {
      list.appendChild(el(`<div class="empty-state">No training sessions yet. Build one to compile drills, strength work, and feeding drills into a single timed practice.</div>`));
    } else {
      STATE.progress.trainingSessions.forEach((session) => {
        const isRunning = STATE.progress.activeSessionRun && STATE.progress.activeSessionRun.sessionId === session.id;
        const row = el(`
          <button class="exercise-row">
            <div class="exercise-row__main">
              <div class="exercise-row__name">${session.name} ${isRunning ? '<span class="badge-custom">Running</span>' : ""}</div>
              <div class="exercise-row__meta">${session.exerciseIds.length} exercises · ${session.targetMinutes} min target</div>
            </div>
            <div class="exercise-row__arrow">→</div>
          </button>
        `);
        row.addEventListener("click", () => navigate(`/training/session/${session.id}`));
        list.appendChild(row);
      });
    }
  } else if (categoryId === "technique") {
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
    if (categoryId === "drills") {
      const addBtn = el(`<button class="add-drill-btn">+ Add Custom Drill</button>`);
      addBtn.addEventListener("click", () => openDrillForm());
      wrap.appendChild(addBtn);
    }
    getExercisesForCategory(categoryId).forEach((ex) => {
      const done = STATE.progress.completedExerciseIds.includes(ex.id);
      const row = el(`
        <button class="exercise-row">
          <div class="exercise-row__main">
            <div class="exercise-row__name">${ex.name} ${done ? '<span class="badge-done">✓ done</span>' : ""} ${ex.isCustom ? '<span class="badge-custom">Custom</span>' : ""}</div>
            <div class="exercise-row__meta">${ex.difficulty > 0 ? `${stars(ex.difficulty)} · ` : ""}${workoutSummaryLong(ex)}</div>
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
    <div class="category-banner" style="background-image:linear-gradient(to top, rgba(6,8,12,0.92), rgba(6,8,12,0.1) 65%), url('${cat.photo}')">
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
          <div class="exercise-row__meta">${stars(ex.difficulty)} · ${workoutSummaryLong(ex)}</div>
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

// ---------- Training Sessions ----------

function getAllExercisesIncludingCustom() {
  return [...EXERCISES, ...STATE.progress.customDrills];
}

function renderSessionBuilder() {
  const wrap = el(`<div class="view view--session-builder"></div>`);
  const back = el(`<button class="back-button">← Training Sessions</button>`);
  back.addEventListener("click", () => navigate("/training/category/sessions"));
  wrap.appendChild(back);

  wrap.appendChild(el(`
    <div class="page-header">
      <div class="page-header__title">Build Training Session</div>
      <div class="page-header__subtitle">Compile drills, strength work, and feeding drills into one timed practice</div>
    </div>
  `));

  const selectedIds = [];

  wrap.appendChild(el(`
    <div class="field">
      <label class="field__label">Session name</label>
      <input class="field__input" id="session-name" type="text" placeholder="e.g. Saturday morning practice" />
    </div>
  `));
  wrap.appendChild(el(`
    <div class="field">
      <label class="field__label">Target duration (minutes)</label>
      <input class="field__input" id="session-target" type="number" min="10" value="120" />
    </div>
  `));

  const estimateRow = el(`
    <div class="stat-row">
      <div class="stat-card">
        <div class="stat-card__value" id="session-estimate-duration">—</div>
        <div class="stat-card__label">Estimated time to complete</div>
      </div>
      <div class="stat-card">
        <div class="stat-card__value" id="session-estimate-finish">—</div>
        <div class="stat-card__label">Estimated finish time</div>
      </div>
    </div>
  `);
  wrap.appendChild(estimateRow);

  function updateEstimate() {
    const totalSeconds = selectedIds.reduce((sum, id) => {
      const ex = getExercise(id);
      return ex ? sum + estimateExerciseSeconds(ex) : sum;
    }, 0);
    const durationEl = estimateRow.querySelector("#session-estimate-duration");
    const finishEl = estimateRow.querySelector("#session-estimate-finish");
    if (selectedIds.length === 0) {
      durationEl.textContent = "—";
      finishEl.textContent = "—";
      return;
    }
    durationEl.textContent = formatDurationLong(totalSeconds);
    finishEl.textContent = new Date(Date.now() + totalSeconds * 1000).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }

  const selectedSection = el(`<div class="section"><div class="section__title">In this session</div></div>`);
  const selectedList = el(`<div class="exercise-list"></div>`);
  selectedSection.appendChild(selectedList);
  const selectedEmpty = el(`<div class="empty-state">No exercises added yet — search below to add some.</div>`);
  selectedSection.appendChild(selectedEmpty);
  wrap.appendChild(selectedSection);

  let draggedId = null;

  function renderSelected() {
    selectedList.replaceChildren();
    selectedEmpty.style.display = selectedIds.length === 0 ? "" : "none";
    selectedIds.forEach((id) => {
      const ex = getExercise(id);
      if (!ex) return;
      const row = el(`
        <div class="exercise-row exercise-row--draggable" draggable="true">
          <span class="drag-handle">☰</span>
          <div class="exercise-row__main">
            <div class="exercise-row__name">${ex.name} ${ex.isCustom ? '<span class="edit-hint">✎ edit</span>' : ""}</div>
            <div class="exercise-row__meta">${getCategory(ex.categoryId).name} · ${workoutSummaryShort(ex)}</div>
          </div>
          <button class="remove-btn" type="button">✕</button>
        </div>
      `);

      const mainEl = row.querySelector(".exercise-row__main");
      mainEl.addEventListener("click", () => {
        if (ex.isCustom) {
          openDrillForm(() => {
            renderSelected();
          }, ex);
        } else {
          toast("Built-in exercises can't be edited — create a custom drill to set your own numbers.");
        }
      });

      row.querySelector(".remove-btn").addEventListener("click", () => {
        const idx = selectedIds.indexOf(id);
        if (idx >= 0) selectedIds.splice(idx, 1);
        renderSelected();
        updateEstimate();
      });

      row.addEventListener("dragstart", (e) => {
        draggedId = id;
        row.classList.add("is-dragging");
        e.dataTransfer.effectAllowed = "move";
      });
      row.addEventListener("dragend", () => {
        row.classList.remove("is-dragging");
        draggedId = null;
      });
      row.addEventListener("dragover", (e) => {
        e.preventDefault();
        if (draggedId && draggedId !== id) row.classList.add("drag-over");
      });
      row.addEventListener("dragleave", () => row.classList.remove("drag-over"));
      row.addEventListener("drop", (e) => {
        e.preventDefault();
        row.classList.remove("drag-over");
        if (!draggedId || draggedId === id) return;
        const fromIdx = selectedIds.indexOf(draggedId);
        const toIdx = selectedIds.indexOf(id);
        if (fromIdx === -1 || toIdx === -1) return;
        selectedIds.splice(fromIdx, 1);
        selectedIds.splice(toIdx, 0, draggedId);
        renderSelected();
      });

      selectedList.appendChild(row);
    });
    updateEstimate();
  }
  renderSelected();

  const searchSection = el(`<div class="section"><div class="section__title">Add exercises</div></div>`);
  const searchWrap = el(`
    <div class="search-bar">
      <span class="search-bar__icon">🔍</span>
      <input class="search-bar__input" type="text" placeholder="Search drills, strength work, techniques…" id="session-search" />
    </div>
  `);
  searchSection.appendChild(searchWrap);
  const searchResults = el(`<div class="exercise-list"></div>`);
  searchSection.appendChild(searchResults);
  wrap.appendChild(searchSection);

  const searchInput = searchWrap.querySelector("#session-search");
  searchInput.addEventListener("input", () => {
    const query = searchInput.value.trim().toLowerCase();
    searchResults.replaceChildren();
    if (!query) return;
    const matches = getAllExercisesIncludingCustom()
      .filter((ex) => !selectedIds.includes(ex.id))
      .filter((ex) => `${ex.name} ${ex.shotGroup || ""}`.toLowerCase().includes(query))
      .slice(0, 30);
    matches.forEach((ex) => {
      const row = el(`
        <button class="exercise-row">
          <div class="exercise-row__main">
            <div class="exercise-row__name">${ex.name}</div>
            <div class="exercise-row__meta">${getCategory(ex.categoryId).name}</div>
          </div>
          <div class="exercise-row__arrow">+</div>
        </button>
      `);
      row.addEventListener("click", () => {
        selectedIds.push(ex.id);
        renderSelected();
        searchInput.value = "";
        searchResults.replaceChildren();
      });
      searchResults.appendChild(row);
    });
  });

  const createExerciseBtn = el(`<button class="add-drill-btn">+ Create Custom Exercise or Drill</button>`);
  createExerciseBtn.addEventListener("click", () => {
    openDrillForm((drill) => {
      selectedIds.push(drill.id);
      renderSelected();
    });
  });
  wrap.appendChild(createExerciseBtn);

  const repeatSection = el(`<div class="section"><div class="section__title">Repeat</div></div>`);
  let scheduleEnabled = false;
  let repeatDays = "";
  const scheduleFields = el(`
    <div style="display:none">
      <div class="field">
        <label class="field__label">Start date</label>
        <input class="field__input" id="session-sched-date" type="date" value="${todayISO()}" />
      </div>
      <div class="field">
        <label class="field__label">Time (optional)</label>
        <input class="field__input" id="session-sched-time" type="time" />
      </div>
      <div class="field">
        <label class="field__label">Repeat</label>
        <div class="chip-row" id="session-sched-repeat-row"></div>
      </div>
    </div>
  `);
  const scheduleToggle = toggleRow("Schedule this session", false, (val) => {
    scheduleEnabled = val;
    scheduleFields.style.display = val ? "" : "none";
  });
  repeatSection.appendChild(scheduleToggle);
  repeatSection.appendChild(scheduleFields);

  const repeatRow = scheduleFields.querySelector("#session-sched-repeat-row");
  REPEAT_OPTIONS.forEach((opt) => {
    const chip = el(`<button class="chip ${opt.value === "" ? "is-active" : ""}" type="button">${opt.label}</button>`);
    chip.addEventListener("click", () => {
      repeatDays = opt.value;
      repeatRow.querySelectorAll(".chip").forEach((c) => c.classList.remove("is-active"));
      chip.classList.add("is-active");
    });
    repeatRow.appendChild(chip);
  });
  wrap.appendChild(repeatSection);

  const createBtn = el(`<button class="start-btn">Create Session</button>`);
  createBtn.addEventListener("click", () => {
    const name = wrap.querySelector("#session-name").value.trim();
    if (!name) {
      toast("Give your session a name");
      return;
    }
    if (selectedIds.length === 0) {
      toast("Add at least one exercise to the session");
      return;
    }
    if (scheduleEnabled && !scheduleFields.querySelector("#session-sched-date").value) {
      toast("Pick a start date for the schedule");
      return;
    }
    const targetMinutes = Math.max(10, parseInt(wrap.querySelector("#session-target").value, 10) || 120);
    const session = {
      id: `session-${slugify(name)}-${Date.now()}`,
      name,
      targetMinutes,
      exerciseIds: [...selectedIds],
      createdAt: Date.now(),
    };
    updateState((s) => {
      s.progress.trainingSessions.push(session);
      if (scheduleEnabled) {
        s.progress.scheduledSessions.push({
          id: `sched-${Date.now()}`,
          sessionId: session.id,
          startDate: scheduleFields.querySelector("#session-sched-date").value,
          time: scheduleFields.querySelector("#session-sched-time").value || null,
          repeatDays: repeatDays ? parseInt(repeatDays, 10) : null,
          createdAt: Date.now(),
        });
      }
    });
    toast(scheduleEnabled ? "Training session created and scheduled" : "Training session created");
    navigate(`/training/session/${session.id}`);
  });
  wrap.appendChild(createBtn);

  return wrap;
}

function renderSessionPage(sessionId) {
  const wrap = el(`<div class="view view--session"></div>`);
  const session = STATE.progress.trainingSessions.find((s) => s.id === sessionId);
  if (!session) {
    wrap.appendChild(el(`<div class="empty-state">Training session not found.</div>`));
    return wrap;
  }

  const back = el(`<button class="back-button">← Training Sessions</button>`);
  back.addEventListener("click", () => navigate("/training/category/sessions"));
  wrap.appendChild(back);

  const cat = getCategory("sessions");
  wrap.appendChild(el(`
    <div class="category-banner" style="background-image:linear-gradient(to top, rgba(6,8,12,0.92), rgba(6,8,12,0.1) 65%), url('${cat.photo}')">
      <div class="category-banner__name">${session.name}</div>
      <div class="category-banner__tagline">${session.exerciseIds.length} exercises · ${session.targetMinutes} min target</div>
    </div>
  `));

  const isRunning = STATE.progress.activeSessionRun && STATE.progress.activeSessionRun.sessionId === sessionId;

  const clockBlock = el(`<div class="session-clock"></div>`);
  wrap.appendChild(clockBlock);

  let clockInterval = null;
  function paintClock() {
    if (!isRunning) {
      clockBlock.replaceChildren(el(`<button class="start-btn" id="session-start-btn">Start Session</button>`));
      clockBlock.querySelector("#session-start-btn").addEventListener("click", () => startSession(sessionId));
      return;
    }
    const elapsedSeconds = Math.floor((Date.now() - STATE.progress.activeSessionRun.startedAt) / 1000);
    const targetSeconds = session.targetMinutes * 60;
    const pct = Math.min(100, (elapsedSeconds / targetSeconds) * 100);
    clockBlock.replaceChildren(el(`
      <div class="session-clock__box">
        <div class="session-clock__time">${formatMMSS(elapsedSeconds)}</div>
        <div class="session-clock__target">of ${session.targetMinutes} min target</div>
        <div class="skill-bar__track"><div class="skill-bar__fill" style="width:${pct}%"></div></div>
        <button class="reset-btn" id="session-end-btn">End Session</button>
      </div>
    `));
    clockBlock.querySelector("#session-end-btn").addEventListener("click", async () => {
      const ok = await showConfirm("End this training session? Elapsed time will be logged.");
      if (ok) {
        clearInterval(clockInterval);
        endSession(sessionId);
      }
    });
  }
  paintClock();
  if (isRunning) clockInterval = setInterval(paintClock, 1000);

  const scheduleSection = el(`<div class="section"><div class="section__title">Scheduled</div></div>`);
  const scheduleList = el(`<div class="exercise-list"></div>`);
  const schedules = STATE.progress.scheduledSessions.filter((s) => s.sessionId === sessionId);
  if (schedules.length === 0) {
    scheduleList.appendChild(el(`<div class="empty-state">Not scheduled yet.</div>`));
  } else {
    schedules.forEach((sched) => {
      const dateLabel = new Date(sched.startDate + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
      const timeLabel = sched.time ? ` · ${formatTimeLabel(sched.time)}` : "";
      const row = el(`
        <button class="exercise-row">
          <div class="exercise-row__main">
            <div class="exercise-row__name">${dateLabel}${timeLabel}</div>
            <div class="exercise-row__meta">${repeatLabel(sched.repeatDays)}</div>
          </div>
          <div class="exercise-row__arrow">✕</div>
        </button>
      `);
      row.addEventListener("click", async () => {
        const ok = await showConfirm("Remove this schedule?");
        if (ok) {
          updateState((s) => (s.progress.scheduledSessions = s.progress.scheduledSessions.filter((sc) => sc.id !== sched.id)));
          render();
        }
      });
      scheduleList.appendChild(row);
    });
  }
  scheduleSection.appendChild(scheduleList);
  const scheduleBtn = el(`<button class="add-drill-btn">+ Schedule This Session</button>`);
  scheduleBtn.addEventListener("click", () => openScheduleForm(sessionId));
  scheduleSection.appendChild(scheduleBtn);
  wrap.appendChild(scheduleSection);

  const section = el(`<div class="section"><div class="section__title">Exercises in this session</div></div>`);
  const list = el(`<div class="exercise-list"></div>`);
  session.exerciseIds.forEach((id) => {
    const ex = getExercise(id);
    if (!ex) return;
    const done = STATE.progress.completedExerciseIds.includes(id);
    const row = el(`
      <button class="exercise-row">
        <div class="exercise-row__main">
          <div class="exercise-row__name">${ex.name} ${done ? '<span class="badge-done">✓ done</span>' : ""}</div>
          <div class="exercise-row__meta">${getCategory(ex.categoryId).name} · ${workoutSummaryLong(ex)}</div>
        </div>
        <div class="exercise-row__arrow">→</div>
      </button>
    `);
    row.addEventListener("click", () => navigate(`/training/exercise/${id}`));
    list.appendChild(row);
  });
  section.appendChild(list);
  wrap.appendChild(section);

  const deleteBtn = el(`<button class="reset-btn">Delete session</button>`);
  deleteBtn.addEventListener("click", async () => {
    const ok = await showConfirm(`Delete "${session.name}"? This can't be undone.`);
    if (ok) {
      if (isRunning) {
        clearInterval(clockInterval);
        updateState((s) => (s.progress.activeSessionRun = null));
      }
      updateState((s) => (s.progress.trainingSessions = s.progress.trainingSessions.filter((sess) => sess.id !== sessionId)));
      toast("Training session deleted");
      navigate("/training/category/sessions");
    }
  });
  wrap.appendChild(deleteBtn);

  return wrap;
}

function startSession(sessionId) {
  updateState((s) => (s.progress.activeSessionRun = { sessionId, startedAt: Date.now() }));
  paintSessionBanner();
  render();
}

function endSession(sessionId) {
  const session = STATE.progress.trainingSessions.find((s) => s.id === sessionId);
  const run = STATE.progress.activeSessionRun;
  if (!session || !run) return;
  const elapsedSeconds = Math.max(1, Math.floor((Date.now() - run.startedAt) / 1000));
  const expGained = elapsedSeconds / 60;
  const doneCount = session.exerciseIds.filter((id) => STATE.progress.completedExerciseIds.includes(id)).length;

  updateState((s) => {
    const today = todayISO();
    if (s.progress.lastTrainedISODate !== today) {
      if (s.progress.lastTrainedISODate && daysBetween(s.progress.lastTrainedISODate, today) === 1) {
        s.progress.streak += 1;
      } else {
        s.progress.streak = s.progress.lastTrainedISODate ? 1 : s.progress.streak || 1;
      }
      s.progress.lastTrainedISODate = today;
    }
    s.progress.sessionsCompleted += 1;
    s.progress.sessionHistory.unshift({
      id: `${Date.now()}`,
      exerciseId: null,
      sessionId: session.id,
      exerciseName: `${session.name} (Training Session)`,
      categoryId: "sessions",
      dateISO: today,
      timeLabel: new Date().toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
      durationSeconds: elapsedSeconds,
      setsCompleted: doneCount,
      mode: "session",
      totalWorkSeconds: elapsedSeconds,
      expGained,
      calories: Math.round((elapsedSeconds / 60) * getCategory("sessions").calPerMin),
      effort: 0,
    });
    s.progress.sessionHistory = s.progress.sessionHistory.slice(0, 300);
    s.progress.activeSessionRun = null;
  });
  paintSessionBanner();
  toast(`Session logged — ${formatMMSS(elapsedSeconds)} trained`);
  render();
}

function paintSessionBanner() {
  const banner = document.getElementById("session-banner");
  const frame = document.getElementById("app-frame");
  const run = STATE.progress.activeSessionRun;
  if (!run) {
    banner.style.display = "none";
    frame.classList.remove("has-session");
    return;
  }
  const session = STATE.progress.trainingSessions.find((s) => s.id === run.sessionId);
  if (!session) {
    banner.style.display = "none";
    frame.classList.remove("has-session");
    return;
  }
  const elapsedSeconds = Math.floor((Date.now() - run.startedAt) / 1000);
  banner.textContent = `⏱ ${session.name} — ${formatMMSS(elapsedSeconds)}`;
  banner.style.display = "flex";
  frame.classList.add("has-session");
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("session-banner").addEventListener("click", () => {
    const run = STATE.progress.activeSessionRun;
    if (run) navigate(`/training/session/${run.sessionId}`);
  });
  paintSessionBanner();
  setInterval(paintSessionBanner, 1000);
});

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
        <div class="exercise-header__name">${ex.name} ${done ? '<span class="badge-done">✓ Completed</span>' : ""} ${ex.isCustom ? '<span class="badge-custom">Custom</span>' : ""}</div>
      </div>
      <div class="exercise-header__difficulty">${ex.difficulty > 0 ? `${stars(ex.difficulty)} ${difficultyLabel(ex.difficulty)}` : "Custom drill"}</div>
    </div>
  `));

  wrap.appendChild(el(`
    <div class="info-block">
      <div class="info-block__title">Training Goal</div>
      <div class="info-block__text">${ex.goal}</div>
    </div>
  `));

  if (ex.description) {
    wrap.appendChild(el(`
      <div class="info-block">
        <div class="info-block__title">Description</div>
        <div class="info-block__text">${ex.description}</div>
      </div>
    `));
  }

  if (ex.coachingPoints.length > 0) {
    const pointsBlock = el(`<div class="info-block"><div class="info-block__title">Key Coaching Points</div></div>`);
    const pointsList = el(`<div class="point-list point-list--good"></div>`);
    ex.coachingPoints.forEach((p) => pointsList.appendChild(el(`<div class="point-item">✓ ${p}</div>`)));
    pointsBlock.appendChild(pointsList);
    wrap.appendChild(pointsBlock);
  }

  if (ex.commonMistakes.length > 0) {
    const mistakesBlock = el(`<div class="info-block"><div class="info-block__title">Common Mistakes</div></div>`);
    const mistakesList = el(`<div class="point-list point-list--bad"></div>`);
    ex.commonMistakes.forEach((m) => mistakesList.appendChild(el(`<div class="point-item">❌ ${m}</div>`)));
    mistakesBlock.appendChild(mistakesList);
    wrap.appendChild(mistakesBlock);
  }

  const isTimeMode = ex.workout.mode === "time";
  wrap.appendChild(el(`
    <div class="workout-box">
      <div class="workout-box__title">Training</div>
      <div class="workout-box__stats">
        <div class="workout-stat"><div class="workout-stat__value">${ex.workout.sets}</div><div class="workout-stat__label">sets</div></div>
        ${
          isTimeMode
            ? `<div class="workout-stat"><div class="workout-stat__value">${ex.workout.durationSeconds}s</div><div class="workout-stat__label">per set</div></div>`
            : `<div class="workout-stat"><div class="workout-stat__value">${ex.workout.shuttles}</div><div class="workout-stat__label">shuttles</div></div>`
        }
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

  if (ex.isCustom) {
    const deleteBtn = el(`<button class="reset-btn">Delete custom drill</button>`);
    deleteBtn.addEventListener("click", async () => {
      const ok = await showConfirm(`Delete "${ex.name}"? This can't be undone.`);
      if (ok) {
        updateState((s) => {
          s.progress.customDrills = s.progress.customDrills.filter((d) => d.id !== ex.id);
        });
        toast("Custom drill deleted");
        navigate("/training/category/drills");
      }
    });
    wrap.appendChild(deleteBtn);
  }

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

  const mode = ex.workout.mode === "time" ? "time" : "shuttles";
  const workDuration = mode === "time" ? ex.workout.durationSeconds : Math.max(20, Math.min(90, ex.workout.shuttles * 3));
  const timerCtx = {
    ex,
    mode,
    set: 1,
    totalSets: ex.workout.sets,
    phase: "work",
    shuttles: 0,
    totalShuttlesHit: 0,
    totalWorkSeconds: 0,
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
      if (ctx.mode === "time") {
        ctx.totalWorkSeconds += ctx.workDuration;
      } else {
        ctx.totalShuttlesHit += ctx.shuttles;
      }
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
          ? ctx.mode === "shuttles"
            ? `<div class="timer-reps">
                 <button class="rep-btn" id="shuttle-minus">−</button>
                 <div class="timer-reps__value">${ctx.shuttles} <span>/ ${ctx.targetShuttles} shuttles</span></div>
                 <button class="rep-btn" id="shuttle-plus">+</button>
               </div>`
            : `<div class="timer-rest-note">Keep training for the full set</div>`
          : `<div class="timer-rest-note">Rest up — next: Set ${ctx.set + 1}</div>`
      }
      <div class="timer-actions">
        <button class="timer-action" id="timer-pause">${ctx.paused ? "Resume" : "Pause"}</button>
        <button class="timer-action" id="timer-skip">Skip</button>
      </div>
    </div>
  `));

  if (ctx.phase === "work" && ctx.mode === "shuttles") {
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
  const expGained = ctx.mode === "time" ? ctx.totalWorkSeconds / 60 : ctx.totalShuttlesHit * 0.5;

  const view = el(`
    <div class="timer-done">
      <div class="timer-done__check">✓</div>
      <div class="timer-done__title">Training Complete!</div>
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
        ${
          ctx.mode === "time"
            ? `<div class="summary-stat">
                 <div class="summary-stat__value">${formatMMSS(ctx.totalWorkSeconds)}</div>
                 <div class="summary-stat__label">Training Time</div>
               </div>`
            : `<div class="summary-stat">
                 <div class="summary-stat__value">${ctx.totalShuttlesHit}</div>
                 <div class="summary-stat__label">Shuttles</div>
               </div>`
        }
        <div class="summary-stat">
          <div class="summary-stat__value">${calories}</div>
          <div class="summary-stat__label">Est. calories</div>
        </div>
      </div>
      <div class="exp-pill">✨ +${expGained % 1 === 0 ? expGained : expGained.toFixed(1)} exp</div>

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
        mode: ctx.mode,
        totalShuttles: ctx.mode === "shuttles" ? ctx.totalShuttlesHit : null,
        totalWorkSeconds: ctx.mode === "time" ? ctx.totalWorkSeconds : null,
        expGained,
        calories,
        effort: localRating,
      });
      s.progress.sessionHistory = s.progress.sessionHistory.slice(0, 300);
      s.progress.notes[ctx.ex.id] = notes;
      if (localRating) s.progress.difficultyRatings[ctx.ex.id] = localRating;
      s.progress.lastExerciseId = ctx.ex.id;

      // 1 shuttle hit = 0.5 exp; 1 minute of timed training = 1 exp. Levels stack indefinitely.
      const bump = skillBumpFor(ctx.ex);
      if (bump) s.progress.skills[bump] = (s.progress.skills[bump] || 0) + expGained;
    });
    closeTimer();
    toast("Nice work! Session saved.");
    render();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("timer-close").addEventListener("click", async () => {
    const ok = await showConfirm("End this training session early? Progress for this session won't be saved.");
    if (ok) closeTimer();
  });
  document.getElementById("drill-form-close").addEventListener("click", closeDrillForm);
  document.getElementById("schedule-form-close").addEventListener("click", closeScheduleForm);
});

// ---------- Custom Drills ----------

function openDrillForm(onCreated, existingDrill) {
  document.getElementById("drill-form-overlay").classList.add("is-open");
  renderDrillForm(onCreated, existingDrill);
}

function closeDrillForm() {
  document.getElementById("drill-form-overlay").classList.remove("is-open");
}

function renderDrillForm(onCreated, existingDrill) {
  const body = document.getElementById("drill-form-body");
  const isEdit = !!existingDrill;
  const w = existingDrill ? existingDrill.workout : null;
  let mode = w ? w.mode || "shuttles" : "shuttles";

  const view = el(`
    <div class="drill-form">
      <div class="drill-form__title">${isEdit ? "Edit Drill" : "New Custom Drill"}</div>
      <div class="field">
        <label class="field__label">Drill name</label>
        <input class="field__input" id="drill-name" type="text" placeholder="e.g. Multi-shuttle feeding" value="${isEdit ? existingDrill.name : ""}" />
      </div>
      <div class="field">
        <label class="field__label">Sets</label>
        <input class="field__input" id="drill-sets" type="number" min="1" value="${isEdit ? w.sets : 5}" />
      </div>
      <div class="field">
        <label class="field__label">Set type</label>
        <div class="chip-row">
          <button class="chip ${mode === "shuttles" ? "is-active" : ""}" id="drill-mode-shuttles" type="button">Shuttles</button>
          <button class="chip ${mode === "time" ? "is-active" : ""}" id="drill-mode-time" type="button">Time</button>
        </div>
      </div>
      <div class="field" id="drill-shuttles-field" style="${mode === "time" ? "display:none" : ""}">
        <label class="field__label">Shuttles per set</label>
        <input class="field__input" id="drill-shuttles" type="number" min="1" value="${isEdit && mode === "shuttles" ? w.shuttles : 15}" />
      </div>
      <div class="field" id="drill-duration-field" style="${mode === "time" ? "" : "display:none"}">
        <label class="field__label">Seconds per set</label>
        <input class="field__input" id="drill-duration" type="number" min="5" value="${isEdit && mode === "time" ? w.durationSeconds : 30}" />
      </div>
      <div class="field">
        <label class="field__label">Rest between sets (seconds)</label>
        <input class="field__input" id="drill-rest" type="number" min="0" value="${isEdit ? w.restSeconds : 60}" />
      </div>
      <button class="start-btn" id="drill-save">${isEdit ? "Save Changes" : "Add Drill"}</button>
    </div>
  `);
  body.replaceChildren(view);

  const modeShuttlesBtn = view.querySelector("#drill-mode-shuttles");
  const modeTimeBtn = view.querySelector("#drill-mode-time");
  const shuttlesField = view.querySelector("#drill-shuttles-field");
  const durationField = view.querySelector("#drill-duration-field");

  modeShuttlesBtn.addEventListener("click", () => {
    mode = "shuttles";
    modeShuttlesBtn.classList.add("is-active");
    modeTimeBtn.classList.remove("is-active");
    shuttlesField.style.display = "";
    durationField.style.display = "none";
  });
  modeTimeBtn.addEventListener("click", () => {
    mode = "time";
    modeTimeBtn.classList.add("is-active");
    modeShuttlesBtn.classList.remove("is-active");
    shuttlesField.style.display = "none";
    durationField.style.display = "";
  });

  view.querySelector("#drill-save").addEventListener("click", () => {
    const name = view.querySelector("#drill-name").value.trim();
    if (!name) {
      toast("Give your drill a name");
      return;
    }
    const sets = Math.max(1, parseInt(view.querySelector("#drill-sets").value, 10) || 1);
    const restSeconds = Math.max(0, parseInt(view.querySelector("#drill-rest").value, 10) || 0);
    const workout =
      mode === "shuttles"
        ? { sets, mode: "shuttles", shuttles: Math.max(1, parseInt(view.querySelector("#drill-shuttles").value, 10) || 1), restSeconds }
        : { sets, mode: "time", durationSeconds: Math.max(5, parseInt(view.querySelector("#drill-duration").value, 10) || 5), restSeconds };

    if (isEdit) {
      let updated = null;
      updateState((s) => {
        const idx = s.progress.customDrills.findIndex((d) => d.id === existingDrill.id);
        if (idx >= 0) {
          s.progress.customDrills[idx] = { ...s.progress.customDrills[idx], name, workout };
          updated = s.progress.customDrills[idx];
        }
      });
      closeDrillForm();
      toast("Drill updated");
      if (onCreated) onCreated(updated);
      else render();
      return;
    }

    const drill = {
      id: `custom-${slugify(name)}-${Date.now()}`,
      categoryId: "drills",
      name,
      isCustom: true,
      difficulty: 0,
      goal: "Custom drill — add your own notes and technique cues as you train.",
      description: "",
      coachingPoints: [],
      commonMistakes: [],
      workout,
    };
    updateState((s) => s.progress.customDrills.push(drill));
    closeDrillForm();
    toast("Custom drill added");
    if (onCreated) onCreated(drill);
    else render();
  });
}

// ---------- Scheduling ----------

function openScheduleForm(sessionId) {
  document.getElementById("schedule-form-overlay").classList.add("is-open");
  renderScheduleForm(sessionId);
}

function closeScheduleForm() {
  document.getElementById("schedule-form-overlay").classList.remove("is-open");
}

function renderScheduleForm(sessionId) {
  const body = document.getElementById("schedule-form-body");
  let repeatDays = "";

  const view = el(`
    <div class="drill-form">
      <div class="drill-form__title">Schedule This Session</div>
      <div class="field">
        <label class="field__label">Date</label>
        <input class="field__input" id="sched-date" type="date" value="${todayISO()}" />
      </div>
      <div class="field">
        <label class="field__label">Time (optional)</label>
        <input class="field__input" id="sched-time" type="time" />
      </div>
      <div class="field">
        <label class="field__label">Repeat</label>
        <div class="chip-row" id="sched-repeat-row"></div>
      </div>
      <button class="start-btn" id="sched-save">Add to Calendar</button>
    </div>
  `);
  body.replaceChildren(view);

  const repeatRow = view.querySelector("#sched-repeat-row");
  REPEAT_OPTIONS.forEach((opt) => {
    const chip = el(`<button class="chip ${opt.value === "" ? "is-active" : ""}" type="button">${opt.label}</button>`);
    chip.addEventListener("click", () => {
      repeatDays = opt.value;
      repeatRow.querySelectorAll(".chip").forEach((c) => c.classList.remove("is-active"));
      chip.classList.add("is-active");
    });
    repeatRow.appendChild(chip);
  });

  view.querySelector("#sched-save").addEventListener("click", () => {
    const startDate = view.querySelector("#sched-date").value;
    if (!startDate) {
      toast("Pick a date");
      return;
    }
    const time = view.querySelector("#sched-time").value || null;
    const scheduled = {
      id: `sched-${Date.now()}`,
      sessionId,
      startDate,
      time,
      repeatDays: repeatDays ? parseInt(repeatDays, 10) : null,
      createdAt: Date.now(),
    };
    updateState((s) => s.progress.scheduledSessions.push(scheduled));
    closeScheduleForm();
    toast("Added to your calendar");
    render();
  });
}

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
