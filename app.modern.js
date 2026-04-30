import { recommendSleepPlan } from "./engine.js";

const els = {
  // Form inputs
  planDate: document.getElementById("planDate"),
  calPrevBtn: document.getElementById("calPrevBtn"),
  calNextBtn: document.getElementById("calNextBtn"),
  calMonthLabel: document.getElementById("calMonthLabel"),
  calGrid: document.getElementById("calGrid"),
  orientation: document.getElementById("orientation"),
  ageYears: document.getElementById("ageYears"),
  gender: document.getElementById("gender"),

  wakeHour: document.getElementById("wakeHour"),
  wakeMinute: document.getElementById("wakeMinute"),
  wakeSecond: document.getElementById("wakeSecond"),
  prepBufferMinutes: document.getElementById("prepBufferMinutes"),

  bedHour: document.getElementById("bedHour"),
  bedMinute: document.getElementById("bedMinute"),
  bedSecond: document.getElementById("bedSecond"),
  selfSleepNeed: document.getElementById("selfSleepNeed"),

  // Task builder
  taskKind: document.getElementById("taskKind"),
  taskTitle: document.getElementById("taskTitle"),
  addScheduleBtn: document.getElementById("addScheduleBtn"),
  cancelScheduleBtn: document.getElementById("cancelScheduleBtn"),
  whenNextBtn: document.getElementById("whenNextBtn"),
  infoBackBtn: document.getElementById("infoBackBtn"),
  saveScheduleBtn: document.getElementById("saveScheduleBtn"),
  taskWizard: document.getElementById("taskWizard"),
  taskStepWhen: document.getElementById("taskStepWhen"),
  taskStepInfo: document.getElementById("taskStepInfo"),
  taskList: document.getElementById("taskList"),
  taskHint: document.getElementById("taskHint"),

  fixedFields: document.getElementById("fixedFields"),
  period: document.getElementById("period"),
  isHard: document.getElementById("isHard"),
  weeklyOptions: document.getElementById("weeklyOptions"),
  weekdayChips: document.getElementById("weekdayChips"),
  monthlyOptions: document.getElementById("monthlyOptions"),
  dayOfMonth: document.getElementById("dayOfMonth"),
  yearlyOptions: document.getElementById("yearlyOptions"),
  monthOfYear: document.getElementById("monthOfYear"),
  dayOfYear: document.getElementById("dayOfYear"),
  fixedStartHour: document.getElementById("fixedStartHour"),
  fixedStartMinute: document.getElementById("fixedStartMinute"),
  fixedStartSecond: document.getElementById("fixedStartSecond"),
  fixedEndHour: document.getElementById("fixedEndHour"),
  fixedEndMinute: document.getElementById("fixedEndMinute"),
  fixedEndSecond: document.getElementById("fixedEndSecond"),

  onceFields: document.getElementById("onceFields"),
  onceDate: document.getElementById("onceDate"),
  onceIsHard: document.getElementById("onceIsHard"),
  onceStartHour: document.getElementById("onceStartHour"),
  onceStartMinute: document.getElementById("onceStartMinute"),
  onceStartSecond: document.getElementById("onceStartSecond"),
  onceEndHour: document.getElementById("onceEndHour"),
  onceEndMinute: document.getElementById("onceEndMinute"),
  onceEndSecond: document.getElementById("onceEndSecond"),

  deadlineFields: document.getElementById("deadlineFields"),
  dueDate: document.getElementById("dueDate"),
  dueHour: document.getElementById("dueHour"),
  dueMinute: document.getElementById("dueMinute"),
  dueSecond: document.getElementById("dueSecond"),
  deadlineEstimate: document.getElementById("deadlineEstimate"),
  deadlineUrgency: document.getElementById("deadlineUrgency"),

  // Advanced JSON
  inputJson: document.getElementById("inputJson"),

  // Outputs
  outputJson: document.getElementById("outputJson"),
  status: document.getElementById("status"),
  progressBar: document.getElementById("progressBar"),
  progressText: document.getElementById("progressText"),
  report: document.getElementById("report"),
  runBtn: document.getElementById("runBtn"),
  loadExampleBtn: document.getElementById("loadExampleBtn"),
  downloadJsonBtn: document.getElementById("downloadJsonBtn"),
  copyJsonBtn: document.getElementById("copyJsonBtn"),
  downloadHtmlBtn: document.getElementById("downloadHtmlBtn"),
  vibrationStrength: document.getElementById("vibrationStrength"),
  testWakeBtn: document.getElementById("testWakeBtn"),
  stopWakeBtn: document.getElementById("stopWakeBtn"),
  wakeHint: document.getElementById("wakeHint"),
};

function setStatus(text, kind = "") {
  els.status.classList.remove("status--error", "status--ok");
  if (kind) els.status.classList.add(`status--${kind}`);
  els.status.textContent = text || "";
}

function setProgress(pct, stage = "") {
  const safe = Math.max(0, Math.min(100, Math.round(pct)));
  if (els.progressBar) {
    els.progressBar.style.setProperty("--pct", String(safe));
    els.progressBar.setAttribute("aria-valuenow", String(safe));
  }
  if (els.progressText) {
    els.progressText.textContent = safe ? `Progress: ${safe}%${stage ? ` · ${stage}` : ""}` : "";
  }
}

function downloadText(filename, text, mime) {
  const blob = new Blob([text], { type: mime || "text/plain; charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderReport(out) {
  const rec = out.recommended;
  const derived = out.inputsUsed.derived;
  const deadlinePlan = (out.recommendations && out.recommendations.deadlinePlan) || [];
  const napPlan = (out.recommendations && out.recommendations.napPlan) || null;
  const adaptive = (out.recommendations && out.recommendations.adaptiveSleepPlan) || null;
  const adaptiveStatus = getAdaptiveSleepStatus(adaptive);

  const notes = (out.explainability && out.explainability.notes) || [];
  const noteItems = notes.map((n) => `<li>${escapeHtml(n)}</li>`).join("");

  const tasks = ((out.constraints && out.constraints.expandedTasks) || [])
    .slice()
    .sort((a, b) => String(a.start).localeCompare(String(b.start)));
  const taskItems =
    tasks.length === 0
      ? "<li>No fixed/once tasks constrained today.</li>"
      : tasks
          .map(
            (t) =>
              `<li><code>${escapeHtml(t.kind)}</code> ${escapeHtml(t.title)} · ${escapeHtml(
                new Date(t.start).toLocaleString(),
              )} → ${escapeHtml(new Date(t.end).toLocaleString())}${t.isHard ? "" : " <span class=\"muted\">(soft)</span>"}</li>`,
          )
          .join("");
  const deadlineItems =
    deadlinePlan.length === 0
      ? "<li>No deadline work blocks recommended for today.</li>"
      : deadlinePlan
          .map(
            (d) =>
              `<li><strong>${escapeHtml(d.title)}</strong> · ${escapeHtml(new Date(d.start).toLocaleString())} → ${escapeHtml(
                new Date(d.end).toLocaleString(),
              )} (${escapeHtml(String(d.plannedMinutes))}m)</li>`,
          )
          .join("");
  const napItems = !napPlan || !napPlan.recommended
    ? "<li>No nap recommended today.</li>"
    : napPlan.slots
        .map(
          (n) =>
            `<li>${escapeHtml(new Date(n.start).toLocaleString())} → ${escapeHtml(new Date(n.end).toLocaleString())} (${escapeHtml(
              String(n.minutes),
            )}m)</li>`,
        )
        .join("");
  const adaptiveItems = !adaptive || !adaptive.enabled
    ? "<li>Adaptive mode is disabled.</li>"
    : `
      <li>Current target (device clock): <code>${escapeHtml(adaptiveStatus.currentBedtime)}</code> → <code>${escapeHtml(adaptiveStatus.currentWake)}</code> (${escapeHtml(String(adaptiveStatus.currentDurationHours))}h)</li>
      <li>Plan B during planning: <code>${escapeHtml(adaptive.planningMode.bedtimeHHMM)}</code> → <code>${escapeHtml(adaptive.planningMode.wakeHHMM)}</code></li>
      <li>Auto-switch near bedtime at <code>${escapeHtml(adaptive.switchRule.switchAtHHMM)}</code> to recommended <code>${escapeHtml(adaptive.finalMode.bedtimeHHMM)}</code>.</li>
    `;

  return `
    <h3>GRANNY: Mad Sleep Manager — Sleep plan</h3>
    <div class="kpi">
      <div class="kpiCard">
        <div class="kpiLabel">Sleep</div>
        <div class="kpiValue">${escapeHtml(rec.sleepStartHHMM)} → ${escapeHtml(rec.sleepEndHHMM)}</div>
      </div>
      <div class="kpiCard">
        <div class="kpiLabel">Duration</div>
        <div class="kpiValue">${escapeHtml(String(rec.sleepDurationHours))} h</div>
      </div>
      <div class="kpiCard">
        <div class="kpiLabel">Sleep timing preference</div>
        <div class="kpiValue">${escapeHtml(formatOrientation(rec.orientation))}</div>
      </div>
    </div>

    <h4>How it decided (explainable)</h4>
    <ul>
      <li>Target sleep: <code>${escapeHtml(String(derived.targetSleepHours))}h</code> (range <code>${escapeHtml(
    String(derived.sleepNeedRangeHours.min),
  )}–${escapeHtml(String(derived.sleepNeedRangeHours.max))}h</code>)</li>
      <li>Wake anchor: <code>${escapeHtml(derived.anchorWakeTime)}</code></li>
      ${
        derived.habitSummary && derived.habitSummary.estimatedHabitSleepStartMin !== null
          ? `<li>Habit estimate (recent history): ~<code>${escapeHtml(
              minutesToHHMM(derived.habitSummary.estimatedHabitSleepStartMin),
            )}</code> sleep onset</li>`
          : ""
      }
    </ul>

    <h4>Constraints used today</h4>
    <ul>${taskItems}</ul>

    <h4>Notes</h4>
    <ul>${noteItems}</ul>

    <h4>Deadline assignment plan</h4>
    <ul>${deadlineItems}</ul>

    <h4>Nap recommendation</h4>
    <ul>${napItems}</ul>

    <h4>Adaptive bedtime (Plan B)</h4>
    <ul>${adaptiveItems}</ul>
  `;
}

function getAdaptiveSleepStatus(adaptive) {
  if (!adaptive || !adaptive.enabled) {
    return {
      currentBedtime: "--:--",
      currentWake: "--:--",
      currentDurationHours: 0,
    };
  }
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const switchMin = hhmmToMinutes(adaptive.switchRule.switchAtHHMM);
  const finalMin = hhmmToMinutes(adaptive.finalMode.bedtimeHHMM);
  const inNearWindow = isTimeWithinWindow(nowMin, switchMin, finalMin);
  const mode = inNearWindow ? adaptive.finalMode : adaptive.planningMode;
  return {
    currentBedtime: mode.bedtimeHHMM,
    currentWake: mode.wakeHHMM,
    currentDurationHours: Math.round((Number(mode.sleepDurationMinutes || 0) / 60) * 10) / 10,
  };
}

function hhmmToMinutes(hhmm) {
  const [h, m] = String(hhmm || "00:00").split(":");
  return Number(h) * 60 + Number(m);
}

function isTimeWithinWindow(nowMin, startMin, endMin) {
  if (startMin <= endMin) return nowMin >= startMin && nowMin <= endMin;
  return nowMin >= startMin || nowMin <= endMin;
}

function formatOrientation(value) {
  if (value === "early") return "Earlier sleep/wake";
  if (value === "late") return "Later sleep/wake";
  return "Balanced (no strong push)";
}

function minutesToHHMM(mins) {
  const m = ((mins % (24 * 60)) + 24 * 60) % (24 * 60);
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const da = pad2(d.getDate());
  return `${y}-${m}-${da}`;
}

function parseIsoDateSafe(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
}

function buildOptions(select, from, to, formatter) {
  select.innerHTML = "";
  for (let i = from; i <= to; i++) {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = formatter ? formatter(i) : String(i);
    select.appendChild(opt);
  }
}

function getTimeHHMM(hourSel, minSel) {
  const hh = Number(hourSel.value);
  const mm = Number(minSel.value);
  return `${pad2(hh)}:${pad2(mm)}`;
}

function getTimeISO(dateStr, hourSel, minSel, secSel) {
  const hh = pad2(Number(hourSel.value));
  const mm = pad2(Number(minSel.value));
  const ss = pad2(Number(secSel.value));
  // Local datetime string (no timezone) – consistent with existing prototype use.
  return `${dateStr}T${hh}:${mm}:${ss}`;
}

const WEEKDAYS = [
  { idx: 0, label: "Sun" },
  { idx: 1, label: "Mon" },
  { idx: 2, label: "Tue" },
  { idx: 3, label: "Wed" },
  { idx: 4, label: "Thu" },
  { idx: 5, label: "Fri" },
  { idx: 6, label: "Sat" },
];

let state = {
  tasks: [],
  weekdayOn: new Set([1, 2, 3, 4, 5]), // default weekdays
  calendarYear: null,
  calendarMonth: null,
};

function parseDateSafe(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isTaskExpired(task, now) {
  if (!task || !task.type) return false;
  if (task.type === "fixed") return false;
  if (task.type === "once" || task.type === "nap") {
    const end = parseDateSafe(task.end);
    return !!end && end < now;
  }
  if (task.type === "deadline") {
    const due = parseDateSafe(task.due);
    return !!due && due < now;
  }
  return false;
}

function pruneExpiredTasks() {
  if (!Array.isArray(state.tasks) || state.tasks.length === 0) return 0;
  const now = new Date();
  const before = state.tasks.length;
  state.tasks = state.tasks.filter((t) => !isTaskExpired(t, now));
  return before - state.tasks.length;
}

function renderPlanCalendar() {
  if (!els.calGrid || !els.calMonthLabel) return;
  const selected = parseIsoDateSafe(els.planDate.value) || new Date();
  const y = state.calendarYear ?? selected.getFullYear();
  const m = state.calendarMonth ?? selected.getMonth();
  const first = new Date(y, m, 1);
  const last = new Date(y, m + 1, 0);
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  els.calMonthLabel.textContent = `${y}-${pad2(m + 1)}`;
  els.calGrid.innerHTML = "";

  weekday.forEach((d) => {
    const h = document.createElement("div");
    h.className = "calendar__cell";
    h.textContent = d;
    els.calGrid.appendChild(h);
  });

  for (let i = 0; i < first.getDay(); i++) {
    const spacer = document.createElement("div");
    spacer.className = "calendar__cell";
    els.calGrid.appendChild(spacer);
  }

  for (let day = 1; day <= last.getDate(); day++) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "calendar__day";
    b.textContent = String(day);
    const iso = `${y}-${pad2(m + 1)}-${pad2(day)}`;
    if (
      selected.getFullYear() === y &&
      selected.getMonth() === m &&
      selected.getDate() === day
    ) {
      b.classList.add("calendar__day--selected");
    }
    b.addEventListener("click", () => {
      els.planDate.value = iso;
      state.calendarYear = y;
      state.calendarMonth = m;
      renderPlanCalendar();
      syncGeneratedJson();
    });
    els.calGrid.appendChild(b);
  }
}

function renderWeekdayChips() {
  els.weekdayChips.innerHTML = "";
  for (const w of WEEKDAYS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `chip ${state.weekdayOn.has(w.idx) ? "chip--on" : ""}`;
    b.textContent = w.label;
    b.addEventListener("click", () => {
      if (state.weekdayOn.has(w.idx)) state.weekdayOn.delete(w.idx);
      else state.weekdayOn.add(w.idx);
      renderWeekdayChips();
      syncGeneratedJson();
    });
    els.weekdayChips.appendChild(b);
  }
}

function setTaskHint(text, kind = "") {
  els.taskHint.classList.remove("status--error", "status--ok");
  if (kind) els.taskHint.classList.add(`status--${kind}`);
  els.taskHint.textContent = text || "";
}

function renderTaskList() {
  if (!els.taskList) return;
  if (!state.tasks.length) {
    els.taskList.innerHTML = `<div class="muted">No tasks added yet.</div>`;
    return;
  }
  els.taskList.innerHTML = "";
  state.tasks.forEach((t, i) => {
    const row = document.createElement("div");
    row.className = "taskItem";
    const left = document.createElement("div");
    const title = document.createElement("div");
    title.className = "taskTitle";
    title.textContent = t.title || "(untitled)";
    const meta = document.createElement("div");
    meta.className = "taskMeta";
    meta.textContent = taskSummary(t);

    left.appendChild(title);
    left.appendChild(meta);

    const right = document.createElement("div");
    const del = document.createElement("button");
    del.type = "button";
    del.className = "btn btn--secondary";
    del.textContent = "Remove";
    del.addEventListener("click", () => {
      state.tasks.splice(i, 1);
      renderTaskList();
      syncGeneratedJson();
    });
    right.appendChild(del);
    row.appendChild(left);
    row.appendChild(right);
    els.taskList.appendChild(row);
  });
}

function taskSummary(t) {
  if (t.type === "fixed") {
    const period = t.period || "weekly";
    const when =
      period === "weekly"
        ? `weekly on ${(t.weekdays || []).map((d) => WEEKDAYS.find((w) => w.idx === d)?.label || String(d)).join(", ")}`
        : period === "daily"
          ? "daily"
          : period === "monthly"
            ? `monthly on day ${t.dayOfMonth}`
            : `yearly on ${t.monthOfYear}/${t.dayOfYear}`;
    return `${when} · ${t.startTime}–${t.endTime}${t.isHard ? "" : " (soft)"}`;
  }
  if (t.type === "once") {
    return `${new Date(t.start).toLocaleString()} → ${new Date(t.end).toLocaleString()}${t.isHard ? "" : " (soft)"}`;
  }
  if (t.type === "nap") {
    return `nap ${new Date(t.start).toLocaleString()} → ${new Date(t.end).toLocaleString()}`;
  }
  if (t.type === "deadline") {
    return `due ${new Date(t.due).toLocaleString()}`;
  }
  return "";
}

function updateTaskBuilderVisibility() {
  const kind = els.taskKind.value;
  els.fixedFields.style.display = kind === "fixed" ? "" : "none";
  els.onceFields.style.display = kind === "once" || kind === "nap" ? "" : "none";
  els.deadlineFields.style.display = kind === "deadline" ? "" : "none";
}

function updateFixedPeriodVisibility() {
  const p = els.period.value;
  els.weeklyOptions.style.display = p === "weekly" ? "" : "none";
  els.monthlyOptions.style.display = p === "monthly" ? "" : "none";
  els.yearlyOptions.style.display = p === "yearly" ? "" : "none";
}

function showTaskWizard() {
  els.taskWizard.style.display = "";
  els.taskStepWhen.style.display = "";
  els.taskStepInfo.style.display = "none";
  setTaskHint("", "");
}

function hideTaskWizard() {
  els.taskWizard.style.display = "none";
  els.taskStepWhen.style.display = "";
  els.taskStepInfo.style.display = "none";
}

function validateWhenStep() {
  const kind = els.taskKind.value;
  if (kind === "fixed" && els.period.value === "weekly") {
    const weekdays = [...state.weekdayOn].sort((a, b) => a - b);
    if (!weekdays.length) throw new Error("Select at least one weekday.");
  }
}

function buildTaskFromForm() {
  const title = (els.taskTitle.value || "").trim();
  const kind = els.taskKind.value;
  if (!title) throw new Error("Please enter a task title.");

  if (kind === "fixed") {
    const period = els.period.value;
    const t = {
      type: "fixed",
      id: `t_${Math.random().toString(16).slice(2)}`,
      title,
      period,
      startTime: getTimeHHMM(els.fixedStartHour, els.fixedStartMinute),
      endTime: getTimeHHMM(els.fixedEndHour, els.fixedEndMinute),
      isHard: els.isHard.value === "true",
    };
    if (period === "weekly") {
      const weekdays = [...state.weekdayOn].sort((a, b) => a - b);
      if (!weekdays.length) throw new Error("Select at least one weekday.");
      t.weekdays = weekdays;
    } else if (period === "daily") {
      t.weekdays = [0, 1, 2, 3, 4, 5, 6];
    } else if (period === "monthly") {
      t.dayOfMonth = Number(els.dayOfMonth.value);
    } else if (period === "yearly") {
      t.monthOfYear = Number(els.monthOfYear.value);
      t.dayOfYear = Number(els.dayOfYear.value);
    }
    return t;
  }

  if (kind === "once") {
    const d = els.onceDate.value || (els.planDate.value || todayIso());
    return {
      type: "once",
      id: `t_${Math.random().toString(16).slice(2)}`,
      title,
      start: getTimeISO(d, els.onceStartHour, els.onceStartMinute, els.onceStartSecond),
      end: getTimeISO(d, els.onceEndHour, els.onceEndMinute, els.onceEndSecond),
      isHard: els.onceIsHard.value === "true",
    };
  }

  if (kind === "nap") {
    const d = els.onceDate.value || (els.planDate.value || todayIso());
    return {
      type: "nap",
      id: `t_${Math.random().toString(16).slice(2)}`,
      title: title || "Nap",
      start: getTimeISO(d, els.onceStartHour, els.onceStartMinute, els.onceStartSecond),
      end: getTimeISO(d, els.onceEndHour, els.onceEndMinute, els.onceEndSecond),
      isHard: true,
    };
  }

  if (kind === "deadline") {
    const d = els.dueDate.value || (els.planDate.value || todayIso());
    const due = getTimeISO(d, els.dueHour, els.dueMinute, els.dueSecond);
    const t = {
      type: "deadline",
      id: `t_${Math.random().toString(16).slice(2)}`,
      title,
      due,
    };
    if (els.deadlineEstimate.value) t.estimatedMinutes = Number(els.deadlineEstimate.value);
    if (els.deadlineUrgency.value) t.urgency = Number(els.deadlineUrgency.value);
    return t;
  }

  throw new Error("Unsupported task type.");
}

function buildInputFromForm() {
  pruneExpiredTasks();
  const planDate = els.planDate.value || todayIso();
  const ageYears = els.ageYears.value ? Number(els.ageYears.value) : null;
  const gender = els.gender.value || "unspecified";
  const defaultWakeTime = getTimeHHMM(els.wakeHour, els.wakeMinute);
  const prepBufferMinutes = els.prepBufferMinutes.value ? Number(els.prepBufferMinutes.value) : 60;
  const orientation = els.orientation.value || "balanced";

  const preferredBedTime = getTimeHHMM(els.bedHour, els.bedMinute);
  const selfNeed = els.selfSleepNeed.value ? Number(els.selfSleepNeed.value) : null;

  const out = {
    planDate,
    profile: {
      ageYears,
      gender,
    },
    habit: {
      preferredBedTime,
      selfReportedSleepNeedHours: selfNeed,
    },
    preferences: {
      defaultWakeTime,
      prepBufferMinutes,
      orientation,
      searchStepMinutes: 15,
      searchRadiusMinutes: 180,
    },
    tasks: state.tasks.slice(),
    sleepHistory: [],
  };

  // Clean nulls for neat JSON (engine tolerates missing fields).
  if (out.profile.ageYears === null) delete out.profile.ageYears;
  if (!out.profile.gender || out.profile.gender === "unspecified") delete out.profile.gender;
  if (!out.habit.preferredBedTime) delete out.habit.preferredBedTime;
  if (out.habit.selfReportedSleepNeedHours === null) delete out.habit.selfReportedSleepNeedHours;
  if (!Object.keys(out.habit).length) delete out.habit;

  return out;
}

function syncGeneratedJson() {
  const removed = pruneExpiredTasks();
  if (removed > 0) renderTaskList();
  const input = buildInputFromForm();
  els.inputJson.value = JSON.stringify(input, null, 2);
}

async function loadExample() {
  const res = await fetch("./examples/example.input.json", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load example input JSON.");
  const text = await res.text();
  const parsed = JSON.parse(text);
  applyInputToForm(parsed);
  syncGeneratedJson();
}

function getInput() {
  const raw = (els.inputJson.value || "").trim();
  // By default, we recommend from the generated JSON (so Advanced edits still work).
  if (!raw) return buildInputFromForm();
  try {
    return JSON.parse(raw);
  } catch {
    // If Advanced JSON is broken, fall back to form.
    return buildInputFromForm();
  }
}

let lastOutput = null;
let lastHtml = "";
let clockTickHandle = null;
let wakeTickHandle = null;
let wakeVibrationHandle = null;
let wakeAlarmState = {
  enabled: false,
  alarmAt: null,
  active: false,
  startedAt: null,
  escalationLevel: 0,
};

function setWakeHint(text, kind = "") {
  if (!els.wakeHint) return;
  els.wakeHint.classList.remove("status--error", "status--ok");
  if (kind) els.wakeHint.classList.add(`status--${kind}`);
  els.wakeHint.textContent = text || "";
}

function stopWakeVibration() {
  if (wakeVibrationHandle) {
    clearInterval(wakeVibrationHandle);
    wakeVibrationHandle = null;
  }
  if (navigator && typeof navigator.vibrate === "function") {
    navigator.vibrate(0);
  }
  wakeAlarmState.active = false;
  wakeAlarmState.startedAt = null;
  wakeAlarmState.escalationLevel = 0;
}

function strengthToIndex(strength) {
  if (strength === "gentle") return 0;
  if (strength === "medium") return 1;
  return 2;
}

function indexToStrength(idx) {
  if (idx <= 0) return "gentle";
  if (idx === 1) return "medium";
  return "strong";
}

function getBaseVibrationPattern(strength) {
  if (strength === "gentle") return [180, 220, 180, 350];
  if (strength === "strong") return [700, 140, 700, 140, 900];
  return [400, 250, 400, 250, 700];
}

function scalePattern(pattern, scale) {
  return pattern.map((n) => Math.round(n * scale));
}

function getEscalationProfile(startStrength, elapsedMs) {
  const steps = [
    { afterMs: 0, addStrength: 0, scale: 1.0 },
    { afterMs: 45000, addStrength: 0, scale: 1.25 },
    { afterMs: 90000, addStrength: 1, scale: 1.35 },
    { afterMs: 150000, addStrength: 2, scale: 1.55 },
  ];
  let profile = steps[0];
  for (const s of steps) {
    if (elapsedMs >= s.afterMs) profile = s;
  }
  const baseIdx = strengthToIndex(startStrength);
  const effectiveIdx = Math.min(2, baseIdx + profile.addStrength);
  const effectiveStrength = indexToStrength(effectiveIdx);
  const basePattern = getBaseVibrationPattern(effectiveStrength);
  return {
    level: steps.indexOf(profile),
    strength: effectiveStrength,
    pattern: scalePattern(basePattern, profile.scale),
  };
}

function startWakeVibration() {
  stopWakeVibration();
  if (!navigator || typeof navigator.vibrate !== "function") {
    setWakeHint("Vibration is not supported on this device/browser.", "error");
    return;
  }
  wakeAlarmState.active = true;
  wakeAlarmState.startedAt = Date.now();
  const selectedStrength = (els.vibrationStrength && els.vibrationStrength.value) || "medium";
  const initial = getEscalationProfile(selectedStrength, 0);
  wakeAlarmState.escalationLevel = initial.level;
  navigator.vibrate(initial.pattern);
  wakeVibrationHandle = setInterval(() => {
    const elapsed = Date.now() - (wakeAlarmState.startedAt || Date.now());
    const next = getEscalationProfile(selectedStrength, elapsed);
    navigator.vibrate(next.pattern);
    if (next.level !== wakeAlarmState.escalationLevel) {
      wakeAlarmState.escalationLevel = next.level;
      setWakeHint(`Wake stimulation escalated to ${next.strength}.`, "ok");
    }
  }, 2000);
  setWakeHint(`Wake stimulation active (${selectedStrength}).`, "ok");
}

function armWakeAlarm(output) {
  const rec = output && output.recommended;
  if (!rec || !rec.sleepEndLocal) return;
  const dt = new Date(rec.sleepEndLocal);
  if (Number.isNaN(dt.getTime())) return;
  wakeAlarmState.enabled = true;
  wakeAlarmState.alarmAt = dt;
  wakeAlarmState.active = false;
  setWakeHint(`Alarm set for ${dt.toLocaleTimeString()}.`, "ok");
}

function tickWakeAlarm() {
  if (!wakeAlarmState.enabled || !wakeAlarmState.alarmAt || wakeAlarmState.active) return;
  const now = new Date();
  if (now >= wakeAlarmState.alarmAt) startWakeVibration();
}

async function run() {
  setStatus("", "");
  setProgress(0, "");
  els.outputJson.value = "";
  els.report.innerHTML = "";
  lastOutput = null;
  lastHtml = "";

  try {
    const removed = pruneExpiredTasks();
    if (removed > 0) {
      renderTaskList();
      syncGeneratedJson();
      setTaskHint(`Removed ${removed} expired schedule${removed > 1 ? "s" : ""}.`, "ok");
    }
    const input = getInput();
    const out = recommendSleepPlan(input, {
      onProgress: (pct, stage) => setProgress(pct, stage),
    });
    lastOutput = out;
    const outText = JSON.stringify(out, null, 2);
    els.outputJson.value = outText;

    const reportHtml = renderReport(out);
    els.report.innerHTML = reportHtml;
    lastHtml = buildStandaloneHtml(reportHtml);
    if (!clockTickHandle) {
      clockTickHandle = setInterval(() => {
        if (!lastOutput) return;
        const live = renderReport(lastOutput);
        els.report.innerHTML = live;
        lastHtml = buildStandaloneHtml(live);
      }, 60000);
    }
    armWakeAlarm(out);
    if (!wakeTickHandle) wakeTickHandle = setInterval(() => tickWakeAlarm(), 15000);

    els.downloadJsonBtn.disabled = false;
    els.copyJsonBtn.disabled = false;
    els.downloadHtmlBtn.disabled = false;
    setProgress(100, "done");
    setStatus("Recommendation computed.", "ok");
  } catch (e) {
    setProgress(0, "");
    setStatus(e && e.message ? e.message : String(e), "error");
  }
}

function buildStandaloneHtml(innerHtml) {
  // Portable HTML report (no external assets required).
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>GRANNY — Sleep Plan Report</title>
  <style>
    body{ font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; margin:24px; line-height:1.55; color:#0b1220; }
    h3{ margin:0 0 10px; }
    h4{ margin:18px 0 6px; }
    .kpi{ display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; margin:10px 0 6px; }
    .kpiCard{ border:1px solid #d7deee; border-radius:12px; padding:10px 12px; background:#f7f9ff; }
    .kpiLabel{ font-size:12px; color:#4b5b86; }
    .kpiValue{ font-size:16px; font-weight:800; margin-top:4px; }
    code{ background:#eef3ff; border:1px solid #d7deee; padding:2px 6px; border-radius:8px; }
    ul{ margin:8px 0; padding-left:18px; }
    a{ color:#2c5eff; }
    .muted{ color:#4b5b86; }
    @media (max-width: 860px){ .kpi{ grid-template-columns:1fr; } }
  </style>
</head>
<body>
  ${innerHtml}
</body>
</html>`;
}

function applyInputToForm(input) {
  if (!input || typeof input !== "object") return;
  els.planDate.value = input.planDate || input.date || todayIso();
  {
    const d = parseIsoDateSafe(els.planDate.value) || new Date();
    state.calendarYear = d.getFullYear();
    state.calendarMonth = d.getMonth();
  }
  els.orientation.value = (input.preferences && input.preferences.orientation) || "balanced";

  if (input.profile && typeof input.profile === "object") {
    if (typeof input.profile.ageYears === "number") els.ageYears.value = String(input.profile.ageYears);
    if (input.profile.gender) els.gender.value = String(input.profile.gender);
  }

  const prefs = input.preferences || {};
  const wake = (prefs.defaultWakeTime || "07:00").split(":");
  els.wakeHour.value = String(Number(wake[0] || 7));
  els.wakeMinute.value = String(Number(wake[1] || 0));
  els.prepBufferMinutes.value = String(typeof prefs.prepBufferMinutes === "number" ? prefs.prepBufferMinutes : 60);

  const habit = input.habit || {};
  const bed = (habit.preferredBedTime || "23:30").split(":");
  els.bedHour.value = String(Number(bed[0] || 23));
  els.bedMinute.value = String(Number(bed[1] || 30));
  els.selfSleepNeed.value =
    typeof habit.selfReportedSleepNeedHours === "number" ? String(habit.selfReportedSleepNeedHours) : "";

  // Tasks
  state.tasks = Array.isArray(input.tasks) ? input.tasks.slice() : [];
  pruneExpiredTasks();
  renderTaskList();

  // Best-effort weekday chip selection from first fixed weekly task
  const fixed = state.tasks.find((t) => t && t.type === "fixed" && Array.isArray(t.weekdays));
  if (fixed && fixed.weekdays.length) state.weekdayOn = new Set(fixed.weekdays);
  renderWeekdayChips();
  renderPlanCalendar();
}

function wire() {
  els.runBtn.addEventListener("click", () => run());
  els.loadExampleBtn.addEventListener("click", async () => {
    try {
      await loadExample();
      setStatus("Example loaded.", "ok");
    } catch (e) {
      setStatus(e && e.message ? e.message : String(e), "error");
    }
  });

  els.downloadJsonBtn.addEventListener("click", () => {
    if (!lastOutput) return;
    downloadText(`sleep-plan.${lastOutput.planDate}.json`, JSON.stringify(lastOutput, null, 2), "application/json; charset=utf-8");
  });
  els.copyJsonBtn.addEventListener("click", async () => {
    const raw = els.outputJson.value || "";
    await navigator.clipboard.writeText(raw);
    setStatus("JSON copied.", "ok");
  });
  els.downloadHtmlBtn.addEventListener("click", () => {
    if (!lastHtml) return;
    const date = lastOutput && lastOutput.planDate ? lastOutput.planDate : "report";
    downloadText(`sleep-plan.${date}.html`, lastHtml, "text/html; charset=utf-8");
  });
  els.testWakeBtn.addEventListener("click", () => {
    startWakeVibration();
  });
  els.stopWakeBtn.addEventListener("click", () => {
    stopWakeVibration();
    setWakeHint("Wake stimulation stopped.", "ok");
  });

  // Live sync for Advanced JSON
  const syncOn = (el) => {
    if (!el) return;
    el.addEventListener("change", () => syncGeneratedJson());
    el.addEventListener("input", () => syncGeneratedJson());
  };
  [els.planDate, els.orientation, els.ageYears, els.gender, els.prepBufferMinutes, els.selfSleepNeed].forEach(syncOn);
  [els.wakeHour, els.wakeMinute, els.bedHour, els.bedMinute].forEach(syncOn);

  // Task builder interactions
  els.taskKind.addEventListener("change", () => {
    updateTaskBuilderVisibility();
    setTaskHint("", "");
  });
  els.planDate.addEventListener("change", () => {
    const d = parseIsoDateSafe(els.planDate.value) || new Date();
    state.calendarYear = d.getFullYear();
    state.calendarMonth = d.getMonth();
    renderPlanCalendar();
  });
  if (els.calPrevBtn) {
    els.calPrevBtn.addEventListener("click", () => {
      const base = new Date(
        state.calendarYear ?? new Date().getFullYear(),
        state.calendarMonth ?? new Date().getMonth(),
        1,
      );
      base.setMonth(base.getMonth() - 1);
      state.calendarYear = base.getFullYear();
      state.calendarMonth = base.getMonth();
      renderPlanCalendar();
    });
  }
  if (els.calNextBtn) {
    els.calNextBtn.addEventListener("click", () => {
      const base = new Date(
        state.calendarYear ?? new Date().getFullYear(),
        state.calendarMonth ?? new Date().getMonth(),
        1,
      );
      base.setMonth(base.getMonth() + 1);
      state.calendarYear = base.getFullYear();
      state.calendarMonth = base.getMonth();
      renderPlanCalendar();
    });
  }
  els.period.addEventListener("change", () => {
    updateFixedPeriodVisibility();
    syncGeneratedJson();
  });

  els.addScheduleBtn.addEventListener("click", () => {
    showTaskWizard();
  });
  els.cancelScheduleBtn.addEventListener("click", () => {
    hideTaskWizard();
    setTaskHint("", "");
  });
  els.whenNextBtn.addEventListener("click", () => {
    try {
      validateWhenStep();
      els.taskStepWhen.style.display = "none";
      els.taskStepInfo.style.display = "";
      setTaskHint("", "");
    } catch (e) {
      setTaskHint(e && e.message ? e.message : String(e), "error");
    }
  });
  els.infoBackBtn.addEventListener("click", () => {
    els.taskStepInfo.style.display = "none";
    els.taskStepWhen.style.display = "";
    setTaskHint("", "");
  });
  els.saveScheduleBtn.addEventListener("click", () => {
    try {
      const t = buildTaskFromForm();
      state.tasks.push(t);
      els.taskTitle.value = "";
      hideTaskWizard();
      setTaskHint("Schedule added.", "ok");
      renderTaskList();
      syncGeneratedJson();
    } catch (e) {
      setTaskHint(e && e.message ? e.message : String(e), "error");
    }
  });
}

// Initialize with example on first load.
(async () => {
  try {
    // Fill dropdown options
    const hourSels = [
      els.wakeHour,
      els.bedHour,
      els.fixedStartHour,
      els.fixedEndHour,
      els.onceStartHour,
      els.onceEndHour,
      els.dueHour,
    ];
    const minuteSels = [
      els.wakeMinute,
      els.bedMinute,
      els.fixedStartMinute,
      els.fixedEndMinute,
      els.onceStartMinute,
      els.onceEndMinute,
      els.dueMinute,
    ];
    const secondSels = [
      els.wakeSecond,
      els.bedSecond,
      els.fixedStartSecond,
      els.fixedEndSecond,
      els.onceStartSecond,
      els.onceEndSecond,
      els.dueSecond,
    ];
    hourSels.forEach((s) => buildOptions(s, 0, 23, (n) => pad2(n)));
    minuteSels.forEach((s) => buildOptions(s, 0, 59, (n) => pad2(n)));
    secondSels.forEach((s) => buildOptions(s, 0, 59, (n) => pad2(n)));

    buildOptions(els.dayOfMonth, 1, 31, (n) => String(n));
    buildOptions(els.monthOfYear, 1, 12, (n) => String(n));
    buildOptions(els.dayOfYear, 1, 31, (n) => String(n));

    els.planDate.value = todayIso();
    {
      const d = parseIsoDateSafe(els.planDate.value) || new Date();
      state.calendarYear = d.getFullYear();
      state.calendarMonth = d.getMonth();
    }
    els.onceDate.value = todayIso();
    els.dueDate.value = todayIso();

    // Defaults
    els.wakeHour.value = "7";
    els.wakeMinute.value = "0";
    els.bedHour.value = "23";
    els.bedMinute.value = "30";
    els.fixedStartHour.value = "9";
    els.fixedStartMinute.value = "0";
    els.fixedEndHour.value = "10";
    els.fixedEndMinute.value = "0";
    els.onceStartHour.value = "14";
    els.onceStartMinute.value = "30";
    els.onceEndHour.value = "15";
    els.onceEndMinute.value = "30";
    els.dueHour.value = "23";
    els.dueMinute.value = "59";

    renderWeekdayChips();
    updateTaskBuilderVisibility();
    updateFixedPeriodVisibility();
    hideTaskWizard();
    renderTaskList();
    renderPlanCalendar();
    syncGeneratedJson();

    wire();
    await loadExample();
    setProgress(0, "");
    setStatus("Ready. Edit inputs and click Recommend.", "ok");
  } catch (e) {
    setProgress(0, "");
    setStatus(e && e.message ? e.message : String(e), "error");
  }
})();

