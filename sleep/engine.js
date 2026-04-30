// Sleep Schedule Planner "brain" (dependency-free).
//
// Design goals:
// - Deterministic, explainable optimization (not an opaque ML model).
// - Hard constraints: don't overlap sleep with scheduled tasks.
// - Soft constraints: align with habitual sleep timing, keep regularity, allow catch-up for recent sleep debt.
//
// All times are interpreted in the client's local timezone, using ISO strings or "HH:MM".

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function isFiniteNumber(x) {
  return typeof x === "number" && Number.isFinite(x);
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toIsoDate(d) {
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `${y}-${m}-${day}`;
}

function parseIsoDate(dateStr) {
  // dateStr: YYYY-MM-DD in local time
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || "").trim());
  if (!m) throw new Error(`Invalid date (expected YYYY-MM-DD): ${dateStr}`);
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const da = Number(m[3]);
  const d = new Date(y, mo, da, 0, 0, 0, 0);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${dateStr}`);
  return d;
}

function parseHHMM(str) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(str || "").trim());
  if (!m) throw new Error(`Invalid time (expected HH:MM): ${str}`);
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) throw new Error(`Invalid time: ${str}`);
  return { hh, mm };
}

function minutesSinceMidnight(hhmm) {
  const { hh, mm } = typeof hhmm === "string" ? parseHHMM(hhmm) : hhmm;
  return hh * 60 + mm;
}

function dateWithMinutes(baseDate, mins) {
  const d = new Date(baseDate);
  d.setHours(0, 0, 0, 0);
  const m = ((mins % (24 * 60)) + 24 * 60) % (24 * 60);
  d.setMinutes(m);
  // If mins indicates next day, caller should add day explicitly; we keep it same-day here.
  return d;
}

function formatLocalIsoWithOffset(d) {
  // YYYY-MM-DDTHH:MM:SS±HH:MM in local timezone
  const y = d.getFullYear();
  const mo = pad2(d.getMonth() + 1);
  const da = pad2(d.getDate());
  const hh = pad2(d.getHours());
  const mm = pad2(d.getMinutes());
  const ss = pad2(d.getSeconds());
  const offMin = -d.getTimezoneOffset(); // local - UTC, in minutes
  const sign = offMin >= 0 ? "+" : "-";
  const abs = Math.abs(offMin);
  const offH = pad2(Math.floor(abs / 60));
  const offM = pad2(abs % 60);
  return `${y}-${mo}-${da}T${hh}:${mm}:${ss}${sign}${offH}:${offM}`;
}

function addMinutes(d, minutes) {
  return new Date(d.getTime() + minutes * 60 * 1000);
}

function diffMinutes(a, b) {
  return Math.round((a.getTime() - b.getTime()) / (60 * 1000));
}

function overlapMinutes(aStart, aEnd, bStart, bEnd) {
  const s = Math.max(aStart.getTime(), bStart.getTime());
  const e = Math.min(aEnd.getTime(), bEnd.getTime());
  return Math.max(0, Math.round((e - s) / (60 * 1000)));
}

function roundToStep(mins, step) {
  return Math.round(mins / step) * step;
}

function circularDistanceMinutes(a, b) {
  // a,b in [0,1440)
  const d = Math.abs(a - b) % (24 * 60);
  return Math.min(d, 24 * 60 - d);
}

function weekdayIndex(d) {
  // JS: 0=Sun ... 6=Sat
  return d.getDay();
}

function normalizeGender(g) {
  if (!g) return "unspecified";
  const s = String(g).toLowerCase().trim();
  if (["m", "male", "man"].includes(s)) return "male";
  if (["f", "female", "woman"].includes(s)) return "female";
  if (["nonbinary", "non-binary", "nb"].includes(s)) return "nonbinary";
  return "unspecified";
}

function sleepNeedRangeHoursByAge(ageYears) {
  // Evidence-backed ranges (AASM 2015/2016) where available; otherwise reasonable mapping.
  // Returns {min, max, sourceKey}
  const a = ageYears;
  if (!isFiniteNumber(a) || a < 0) return { min: 7, max: 9, sourceKey: "AASM_ADULT_2015" };

  if (a < 0.33) return { min: 14, max: 17, sourceKey: "AASM_PED_2016" }; // ~0-4 months (note: AASM starts at 4mo)
  if (a < 1) return { min: 12, max: 16, sourceKey: "AASM_PED_2016" }; // 4-12 months
  if (a < 2) return { min: 11, max: 14, sourceKey: "AASM_PED_2016" };
  if (a < 5) return { min: 10, max: 13, sourceKey: "AASM_PED_2016" };
  if (a < 13) return { min: 9, max: 12, sourceKey: "AASM_PED_2016" };
  if (a < 18) return { min: 8, max: 10, sourceKey: "AASM_PED_2016" };
  if (a <= 60) return { min: 7, max: 9, sourceKey: "AASM_ADULT_2015" };
  // For 60+, evidence is less "consensus range"; keep adult baseline but allow slightly wider.
  return { min: 7, max: 9, sourceKey: "AASM_ADULT_2015" };
}

function computeTargetSleepHours(profile, habit, sleepHistory) {
  const age = profile && isFiniteNumber(profile.ageYears) ? profile.ageYears : undefined;
  const gender = normalizeGender(profile && profile.gender);
  const range = sleepNeedRangeHoursByAge(age);

  // Base target = midpoint.
  let target = (range.min + range.max) / 2;

  // If user self-reports "needs more/less", nudge within range.
  if (habit && isFiniteNumber(habit.selfReportedSleepNeedHours)) {
    target = clamp(habit.selfReportedSleepNeedHours, range.min, range.max);
  }

  // Light personalization: if recent sleep is consistently below target, allow catch-up a bit.
  const recentDays = 7;
  const recent = summarizeSleepHistory(sleepHistory, recentDays);
  if (recent && isFiniteNumber(recent.avgSleepHours) && isFiniteNumber(recent.medianSleepHours)) {
    const deficit = clamp(target - recent.avgSleepHours, 0, 2.0); // cap "debt" effect
    target = clamp(target + deficit * 0.35, range.min, range.max + 1.0);
  }

  // Gender currently not used in formula (sleep need variation is individual; we keep explainability).
  // Keep target within sane bounds.
  target = clamp(target, 5, 16);

  return { targetHours: target, rangeHours: range, inputs: { ageYears: age, gender } };
}

function summarizeSleepHistory(sleepHistory, lastNDays) {
  if (!Array.isArray(sleepHistory) || sleepHistory.length === 0) return null;
  const now = new Date();
  const since = addMinutes(now, -lastNDays * 24 * 60);
  const episodes = sleepHistory
    .map((e) => {
      if (!e || !e.start || !e.end) return null;
      const s = new Date(e.start);
      const en = new Date(e.end);
      if (Number.isNaN(s.getTime()) || Number.isNaN(en.getTime())) return null;
      if (en <= s) return null;
      if (en < since) return null;
      const mins = diffMinutes(en, s);
      return { start: s, end: en, minutes: mins };
    })
    .filter(Boolean);
  if (episodes.length === 0) return null;

  // Aggregate by "sleep end date" (rough daily sleep total).
  const totalsByDate = new Map();
  for (const ep of episodes) {
    const key = toIsoDate(ep.end);
    totalsByDate.set(key, (totalsByDate.get(key) || 0) + ep.minutes);
  }
  const totals = [...totalsByDate.values()].map((m) => m / 60);
  totals.sort((a, b) => a - b);
  const sum = totals.reduce((a, b) => a + b, 0);
  const avg = sum / totals.length;
  const median = totals.length % 2 ? totals[(totals.length - 1) / 2] : (totals[totals.length / 2 - 1] + totals[totals.length / 2]) / 2;

  // Habit midpoint estimate (from main sleep episode start times).
  const startMins = episodes.map((ep) => {
    const mins = ep.start.getHours() * 60 + ep.start.getMinutes();
    return mins;
  });
  const midpointMins = circularMeanMinutes(startMins);

  return {
    daysIncluded: totals.length,
    avgSleepHours: avg,
    medianSleepHours: median,
    estimatedHabitSleepStartMin: midpointMins,
  };
}

function circularMeanMinutes(values) {
  if (!Array.isArray(values) || values.length === 0) return null;
  // Convert minutes to angle on unit circle
  const angles = values.map((m) => (m / (24 * 60)) * 2 * Math.PI);
  const sx = angles.reduce((a, t) => a + Math.cos(t), 0) / angles.length;
  const sy = angles.reduce((a, t) => a + Math.sin(t), 0) / angles.length;
  if (!Number.isFinite(sx) || !Number.isFinite(sy)) return null;
  const ang = Math.atan2(sy, sx);
  const norm = (ang + 2 * Math.PI) % (2 * Math.PI);
  return Math.round((norm / (2 * Math.PI)) * (24 * 60));
}

function expandTasksForDate(date, tasks) {
  const day = parseIsoDate(toIsoDate(date));
  const w = weekdayIndex(day);
  const list = [];
  for (const t of Array.isArray(tasks) ? tasks : []) {
    if (!t || !t.type) continue;
    if (t.type === "fixed") {
      // fixed: repeats by a period (daily/weekly/monthly/yearly), with start/end local times.
      const period = (t.period || "weekly").toLowerCase();
      let applies = false;
      if (period === "daily") {
        applies = true;
      } else if (period === "weekly") {
        if (!Array.isArray(t.weekdays) || t.weekdays.length === 0) continue;
        applies = t.weekdays.includes(w);
      } else if (period === "monthly") {
        const dom = Number(t.dayOfMonth);
        if (!Number.isFinite(dom) || dom < 1 || dom > 31) continue;
        applies = day.getDate() === dom;
      } else if (period === "yearly") {
        const mo = Number(t.monthOfYear);
        const da = Number(t.dayOfYear);
        if (!Number.isFinite(mo) || mo < 1 || mo > 12) continue;
        if (!Number.isFinite(da) || da < 1 || da > 31) continue;
        applies = day.getMonth() + 1 === mo && day.getDate() === da;
      } else {
        // Unknown period: ignore task.
        continue;
      }
      if (!applies) continue;
      if (!t.startTime || !t.endTime) continue;
      const startMin = minutesSinceMidnight(t.startTime);
      const endMin = minutesSinceMidnight(t.endTime);
      const start = dateWithMinutes(day, startMin);
      let end = dateWithMinutes(day, endMin);
      if (end <= start) end = addMinutes(end, 24 * 60); // crosses midnight
      list.push({
        id: t.id || null,
        title: t.title || "Fixed task",
        kind: "fixed",
        start,
        end,
        priority: isFiniteNumber(t.priority) ? t.priority : 0.5,
        isHard: t.isHard !== false,
      });
    } else if (t.type === "once") {
      // once: scheduled appointment with explicit date/time range
      if (!t.start || !t.end) continue;
      const start = new Date(t.start);
      const end = new Date(t.end);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
      // include if it overlaps the planning day (00:00..24:00)
      const dayEnd = addMinutes(day, 24 * 60);
      if (end <= day || start >= dayEnd) continue;
      list.push({
        id: t.id || null,
        title: t.title || "Once task",
        kind: "once",
        start,
        end,
        priority: isFiniteNumber(t.priority) ? t.priority : 0.7,
        isHard: t.isHard !== false,
      });
    } else if (t.type === "nap") {
      if (!t.start || !t.end) continue;
      const start = new Date(t.start);
      const end = new Date(t.end);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
      const dayEnd = addMinutes(day, 24 * 60);
      if (end <= day || start >= dayEnd) continue;
      list.push({
        id: t.id || null,
        title: t.title || "Nap",
        kind: "nap",
        start,
        end,
        priority: 0.8,
        isHard: t.isHard !== false,
      });
    } else if (t.type === "deadline") {
      // deadline: no fixed time; due at a timestamp. For the "brain" we only use it to influence earliest wake
      // if user marked it as "morning critical", otherwise it doesn't constrain sleep directly.
      if (!t.due) continue;
      const due = new Date(t.due);
      if (Number.isNaN(due.getTime())) continue;
      list.push({
        id: t.id || null,
        title: t.title || "Deadline task",
        kind: "deadline",
        due,
        estimatedMinutes: isFiniteNumber(t.estimatedMinutes) ? t.estimatedMinutes : null,
        urgency: isFiniteNumber(t.urgency) ? t.urgency : 0.5,
      });
    }
  }
  return list;
}

function inferAnchorWakeTime(date, expandedTasks, prefs) {
  const day = parseIsoDate(toIsoDate(date));
  const defaultWake = prefs && prefs.defaultWakeTime ? minutesSinceMidnight(prefs.defaultWakeTime) : 7 * 60;
  const bufferMin = prefs && isFiniteNumber(prefs.prepBufferMinutes) ? clamp(prefs.prepBufferMinutes, 0, 240) : 60;

  // Find earliest "hard" task start on this planning day.
  let earliestHard = null;
  const dayEnd = addMinutes(day, 24 * 60);
  for (const t of expandedTasks) {
    if (!t || !t.start || !t.isHard) continue;
    // Consider tasks that start within the day window
    if (t.start >= day && t.start < dayEnd) {
      if (!earliestHard || t.start < earliestHard) earliestHard = t.start;
    }
  }

  if (earliestHard) {
    const wake = diffMinutes(earliestHard, day) - bufferMin;
    return clamp(wake, 0, 23 * 60 + 59);
  }

  // If no hard tasks, use default wake time but allow habit if present.
  return clamp(defaultWake, 0, 23 * 60 + 59);
}

function buildSleepCandidates(anchorWakeMin, targetSleepMin, stepMin, prefs) {
  const preferredBedMin =
    prefs && prefs.preferredBedTime ? minutesSinceMidnight(prefs.preferredBedTime) : null;

  // Candidate bedtimes are around:
  // - exact (wake - target)
  // - preferred bedtime
  // Search +/- 3 hours around the best guess.
  const idealBedMin = ((anchorWakeMin - targetSleepMin) % (24 * 60) + 24 * 60) % (24 * 60);
  const centers = [idealBedMin];
  if (preferredBedMin !== null) centers.push(preferredBedMin);

  const radius = prefs && isFiniteNumber(prefs.searchRadiusMinutes) ? clamp(prefs.searchRadiusMinutes, 60, 6 * 60) : 3 * 60;
  const set = new Set();

  for (const c of centers) {
    for (let delta = -radius; delta <= radius; delta += stepMin) {
      const m = ((c + delta) % (24 * 60) + 24 * 60) % (24 * 60);
      set.add(roundToStep(m, stepMin));
    }
  }

  return [...set].sort((a, b) => a - b);
}

function scoreCandidate({ bedMin, wakeMin, targetSleepMin, expandedTasks, prefs, habitSummary }) {
  // Lower is better.
  let score = 0;
  const components = [];

  const day = parseIsoDate(prefs.planDate);
  // Interpret planDate as the date the client wakes up and begins the day.
  // Sleep end is on planDate at wakeMin. Sleep start can be on planDate (after midnight)
  // or on the previous day (bedtime before midnight).
  const sleepEnd = dateWithMinutes(day, wakeMin);
  const sleepStart = bedMin <= wakeMin ? dateWithMinutes(day, bedMin) : dateWithMinutes(addMinutes(day, -24 * 60), bedMin);

  // Hard constraint: no overlap with hard tasks (large penalty).
  let hardOverlap = 0;
  for (const t of expandedTasks) {
    if (!t || !t.isHard || !t.start || !t.end) continue;
    hardOverlap += overlapMinutes(sleepStart, sleepEnd, t.start, t.end);
  }
  if (hardOverlap > 0) {
    score += 1e6 + hardOverlap * 1e3;
    components.push({ key: "hard_overlap_minutes", value: hardOverlap, penalty: 1e6 + hardOverlap * 1e3 });
  }

  // Soft: keep sleep duration close to target.
  const actualSleepMin = diffMinutes(sleepEnd, sleepStart);
  const durDelta = Math.abs(actualSleepMin - targetSleepMin);
  const durPenalty = durDelta * 2; // 2 points per minute
  score += durPenalty;
  components.push({ key: "duration_delta_minutes", value: durDelta, penalty: durPenalty });

  // Soft: align bedtime to preferred bedtime and/or habit-inferred bedtime.
  const preferred = prefs.preferredBedTime ? minutesSinceMidnight(prefs.preferredBedTime) : null;
  const habitBed = habitSummary && isFiniteNumber(habitSummary.estimatedHabitSleepStartMin) ? habitSummary.estimatedHabitSleepStartMin : null;
  const alignTargets = [];
  if (preferred !== null) alignTargets.push({ label: "preferred", min: preferred, weight: 1.0 });
  if (habitBed !== null) alignTargets.push({ label: "habit", min: habitBed, weight: 0.8 });

  if (alignTargets.length) {
    let alignPenalty = 0;
    for (const t of alignTargets) {
      const dist = circularDistanceMinutes(bedMin, t.min);
      alignPenalty += dist * 0.9 * t.weight;
    }
    score += alignPenalty;
    components.push({ key: "bedtime_alignment", value: alignTargets.map((t) => ({ label: t.label, distanceMinutes: circularDistanceMinutes(bedMin, t.min) })), penalty: alignPenalty });
  }

  // Soft: avoid extremely late bedtimes if user wants earlier orientation.
  const orientation = (prefs && prefs.orientation) || "balanced"; // "early" | "balanced" | "late"
  const lateThreshold = orientation === "early" ? 24 : orientation === "balanced" ? 1.5 : 4; // hours past midnight
  const lateCutoffMin = lateThreshold * 60;
  const minutesPastMidnight = bedMin; // bedMin is minutes since same-day midnight
  const latePenalty = minutesPastMidnight > lateCutoffMin ? (minutesPastMidnight - lateCutoffMin) * 0.6 : 0;
  score += latePenalty;
  if (latePenalty) components.push({ key: "late_bedtime_penalty", value: minutesPastMidnight, penalty: latePenalty });

  // Soft: if wake time is very late, nudge earlier (to reduce social jetlag risk) if "early" orientation.
  const wakePenalty =
    orientation === "early" && wakeMin > 9 * 60 ? (wakeMin - 9 * 60) * 0.4 : 0;
  score += wakePenalty;
  if (wakePenalty) components.push({ key: "late_wake_penalty", value: wakeMin, penalty: wakePenalty });

  return {
    score,
    components,
    sleepStart,
    sleepEnd,
    actualSleepMin,
  };
}

function buildAwakeWindow(planDate, bedMin, wakeMin) {
  const day = parseIsoDate(toIsoDate(planDate));
  const wake = dateWithMinutes(day, wakeMin);
  let nextBed = dateWithMinutes(day, bedMin);
  if (nextBed <= wake) nextBed = addMinutes(nextBed, 24 * 60);
  return { wake, nextBed };
}

function collectBusyIntervals(tasks, from, to) {
  return tasks
    .filter((t) => t && t.start && t.end)
    .map((t) => ({ start: new Date(t.start), end: new Date(t.end) }))
    .filter((x) => x.end > from && x.start < to)
    .map((x) => ({
      start: x.start < from ? from : x.start,
      end: x.end > to ? to : x.end,
    }))
    .sort((a, b) => a.start - b.start);
}

function mergeIntervals(intervals) {
  if (!intervals.length) return [];
  const sorted = intervals.slice().sort((a, b) => a.start - b.start);
  const merged = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i];
    const last = merged[merged.length - 1];
    if (cur.start <= last.end) {
      if (cur.end > last.end) last.end = cur.end;
    } else {
      merged.push(cur);
    }
  }
  return merged;
}

function getFreeIntervals(from, to, busyIntervals) {
  const merged = mergeIntervals(busyIntervals);
  const free = [];
  let cursor = from;
  for (const b of merged) {
    if (b.start > cursor) free.push({ start: cursor, end: b.start });
    if (b.end > cursor) cursor = b.end;
  }
  if (cursor < to) free.push({ start: cursor, end: to });
  return free;
}

function recommendDeadlineBlocks(deadlines, freeIntervals) {
  const plans = [];
  const slots = freeIntervals.map((f) => ({ start: new Date(f.start), end: new Date(f.end) }));
  const ordered = deadlines
    .slice()
    .sort((a, b) => {
      if (a.due.getTime() !== b.due.getTime()) return a.due - b.due;
      return (b.urgency || 0.5) - (a.urgency || 0.5);
    });

  for (const d of ordered) {
    let remaining = isFiniteNumber(d.estimatedMinutes) ? clamp(d.estimatedMinutes, 25, 8 * 60) : 90;
    for (let i = 0; i < slots.length && remaining > 0; i++) {
      const slot = slots[i];
      if (slot.start >= d.due) continue;
      const endCap = slot.end > d.due ? d.due : slot.end;
      const available = diffMinutes(endCap, slot.start);
      if (available < 25) continue;
      const blockMin = clamp(remaining, 25, Math.min(120, available));
      const start = new Date(slot.start);
      const end = addMinutes(start, blockMin);
      plans.push({
        id: d.id,
        title: d.title,
        start: formatLocalIsoWithOffset(start),
        end: formatLocalIsoWithOffset(end),
        plannedMinutes: blockMin,
        due: formatLocalIsoWithOffset(d.due),
      });
      slot.start = end;
      remaining -= blockMin;
    }
  }
  return plans.sort((a, b) => String(a.start).localeCompare(String(b.start)));
}

function recommendNapPlan({ targetSleepMin, actualSleepMin, freeIntervals }) {
  const deficit = Math.max(0, targetSleepMin - actualSleepMin);
  if (deficit < 45) {
    return {
      recommended: false,
      reason: "Night sleep is close to target; nap is optional.",
      slots: [],
    };
  }
  const targetNapMin = deficit >= 120 ? 40 : 20;
  for (const f of freeIntervals) {
    const mins = diffMinutes(f.end, f.start);
    const hour = f.start.getHours();
    if (mins >= targetNapMin && hour >= 12 && hour <= 18) {
      const end = addMinutes(f.start, targetNapMin);
      return {
        recommended: true,
        reason: `Sleep deficit is about ${Math.round(deficit)} minutes.`,
        slots: [
          {
            start: formatLocalIsoWithOffset(f.start),
            end: formatLocalIsoWithOffset(end),
            minutes: targetNapMin,
          },
        ],
      };
    }
  }
  return {
    recommended: false,
    reason: "Sleep deficit detected, but no suitable midday free slot was found.",
    slots: [],
  };
}

function buildAdaptiveSleepPlan(best, targetSleepMin) {
  const extensionMinutes = 30;
  const planBBedMin = ((best.bedMin - extensionMinutes) % (24 * 60) + 24 * 60) % (24 * 60);
  const nearSwitchMinutes = 90;
  const switchAtMin = ((best.bedMin - nearSwitchMinutes) % (24 * 60) + 24 * 60) % (24 * 60);
  return {
    enabled: true,
    nearWindowMinutes: nearSwitchMinutes,
    planningMode: {
      bedtimeHHMM: minutesToHHMM(planBBedMin),
      wakeHHMM: minutesToHHMM(best.wakeMin),
      sleepDurationMinutes: best.actualSleepMin + extensionMinutes,
      rationale: "Plan with extra sleep buffer in case the daytime schedule shifts.",
    },
    finalMode: {
      bedtimeHHMM: minutesToHHMM(best.bedMin),
      wakeHHMM: minutesToHHMM(best.wakeMin),
      sleepDurationMinutes: best.actualSleepMin,
      rationale: "Near bedtime, switch to the optimized recommendation.",
    },
    switchRule: {
      switchAtHHMM: minutesToHHMM(switchAtMin),
      targetBedtimeHHMM: minutesToHHMM(best.bedMin),
    },
    targetSleepMinutes: targetSleepMin,
  };
}

export function recommendSleepPlan(input, options = {}) {
  if (!input || typeof input !== "object") throw new Error("Input must be a JSON object.");
  const onProgress = typeof options.onProgress === "function" ? options.onProgress : null;
  const progress = (pct, stage) => {
    if (!onProgress) return;
    try {
      onProgress(clamp(Math.round(pct), 0, 100), stage || "");
    } catch {
      // ignore progress callback failures
    }
  };

  progress(5, "parse_input");
  const planDate = input.planDate || input.date;
  if (!planDate) throw new Error("Missing required field: planDate (YYYY-MM-DD).");
  const date = parseIsoDate(planDate);

  const profile = input.profile || {};
  const habit = input.habit || {};
  const prefs = input.preferences || {};
  const tasks = Array.isArray(input.tasks) ? input.tasks : [];
  const sleepHistory = Array.isArray(input.sleepHistory) ? input.sleepHistory : [];

  progress(18, "expand_tasks");
  const expandedTasks = expandTasksForDate(date, tasks);
  progress(28, "summarize_history");
  const habitSummary = summarizeSleepHistory(sleepHistory, 14);
  progress(40, "compute_sleep_need");
  const sleepNeed = computeTargetSleepHours(profile, habit, sleepHistory);
  const targetSleepMin = Math.round(sleepNeed.targetHours * 60);

  progress(48, "anchor_wake_time");
  const anchorWakeMin = inferAnchorWakeTime(date, expandedTasks, prefs);
  const stepMin = prefs && isFiniteNumber(prefs.searchStepMinutes) ? clamp(prefs.searchStepMinutes, 5, 60) : 15;

  const scoringPrefs = {
    planDate: toIsoDate(date),
    defaultWakeTime: prefs.defaultWakeTime || "07:00",
    prepBufferMinutes: isFiniteNumber(prefs.prepBufferMinutes) ? prefs.prepBufferMinutes : 60,
    preferredBedTime: habit.preferredBedTime || prefs.preferredBedTime || null,
    searchRadiusMinutes: prefs.searchRadiusMinutes,
    searchStepMinutes: stepMin,
    orientation: prefs.orientation || "balanced",
  };

  progress(58, "build_candidates");
  const candidates = buildSleepCandidates(anchorWakeMin, targetSleepMin, stepMin, scoringPrefs);

  progress(68, "evaluate_candidates");
  const evaluations = candidates.map((bedMin) => {
    const wakeMin = anchorWakeMin;
    const ev = scoreCandidate({
      bedMin,
      wakeMin,
      targetSleepMin,
      expandedTasks,
      prefs: scoringPrefs,
      habitSummary,
    });
    return { bedMin, wakeMin, ...ev };
  });

  progress(84, "select_best");
  evaluations.sort((a, b) => a.score - b.score);
  const best = evaluations[0];
  if (!best) throw new Error("Unable to compute plan (no candidates).");

  const sleepStart = best.sleepStart;
  const sleepEnd = best.sleepEnd;
  const awakeWindow = buildAwakeWindow(date, best.bedMin, best.wakeMin);
  const scheduledBlocks = expandedTasks.filter((t) => t.kind !== "deadline");
  const busyIntervals = collectBusyIntervals(scheduledBlocks, awakeWindow.wake, awakeWindow.nextBed);
  const freeIntervals = getFreeIntervals(awakeWindow.wake, awakeWindow.nextBed, busyIntervals);
  const deadlineTasks = expandedTasks.filter((t) => t.kind === "deadline");
  const deadlinePlan = recommendDeadlineBlocks(deadlineTasks, freeIntervals);
  const freeAfterDeadlineAllocation = getFreeIntervals(
    awakeWindow.wake,
    awakeWindow.nextBed,
    busyIntervals.concat(
      deadlinePlan.map((d) => ({ start: new Date(d.start), end: new Date(d.end) })),
    ),
  );
  const napPlan = recommendNapPlan({
    targetSleepMin,
    actualSleepMin: best.actualSleepMin,
    freeIntervals: freeAfterDeadlineAllocation,
  });
  const adaptiveSleepPlan = buildAdaptiveSleepPlan(best, targetSleepMin);

  const output = {
    version: "sleep-planner-v1",
    planDate: toIsoDate(date),
    inputsUsed: {
      profile: {
        ageYears: isFiniteNumber(profile.ageYears) ? profile.ageYears : null,
        gender: normalizeGender(profile.gender),
      },
      derived: {
        sleepNeedRangeHours: sleepNeed.rangeHours,
        targetSleepHours: Math.round(sleepNeed.targetHours * 10) / 10,
        anchorWakeTime: minutesToHHMM(anchorWakeMin),
        habitSummary,
      },
    },
    recommended: {
      sleepStartLocal: formatLocalIsoWithOffset(sleepStart),
      sleepEndLocal: formatLocalIsoWithOffset(sleepEnd),
      sleepStartHHMM: minutesToHHMM(best.bedMin),
      sleepEndHHMM: minutesToHHMM(best.wakeMin),
      sleepDurationMinutes: best.actualSleepMin,
      sleepDurationHours: Math.round((best.actualSleepMin / 60) * 10) / 10,
      orientation: scoringPrefs.orientation,
    },
    constraints: {
      expandedTasks: expandedTasks
        .filter((t) => t.kind !== "deadline")
        .map((t) => ({
          id: t.id,
          title: t.title,
          kind: t.kind,
          isHard: !!t.isHard,
          start: formatLocalIsoWithOffset(t.start),
          end: formatLocalIsoWithOffset(t.end),
        })),
      deadlines: expandedTasks
        .filter((t) => t.kind === "deadline")
        .map((t) => ({
          id: t.id,
          title: t.title,
          due: formatLocalIsoWithOffset(t.due),
          estimatedMinutes: t.estimatedMinutes,
          urgency: t.urgency,
        })),
    },
    explainability: {
      optimization: {
        stepMinutes: stepMin,
        candidatesEvaluated: evaluations.length,
        bestScore: best.score,
        scoreComponents: best.components,
      },
      notes: buildHumanNotes({ anchorWakeMin, targetSleepMin, sleepNeed, best, scoringPrefs, habitSummary }),
    },
    recommendations: {
      deadlinePlan,
      napPlan,
      adaptiveSleepPlan,
    },
  };

  progress(100, "done");
  return output;
}

function minutesToHHMM(mins) {
  const m = ((mins % (24 * 60)) + 24 * 60) % (24 * 60);
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  return `${pad2(hh)}:${pad2(mm)}`;
}

function buildHumanNotes({ anchorWakeMin, targetSleepMin, sleepNeed, best, scoringPrefs, habitSummary }) {
  const notes = [];
  notes.push(
    `Target sleep duration was set to ${Math.round(sleepNeed.targetHours * 10) / 10}h (range ${sleepNeed.rangeHours.min}–${sleepNeed.rangeHours.max}h) based on age-based consensus guidance.`,
  );
  notes.push(`Wake time anchor was ${minutesToHHMM(anchorWakeMin)} (earliest hard task minus buffer, otherwise default).`);
  if (scoringPrefs.preferredBedTime) notes.push(`Preferred bedtime input: ${scoringPrefs.preferredBedTime}.`);
  if (habitSummary && isFiniteNumber(habitSummary.estimatedHabitSleepStartMin)) {
    notes.push(`Habit estimate from recent sleep history suggests sleep onset around ${minutesToHHMM(habitSummary.estimatedHabitSleepStartMin)}.`);
  }
  notes.push(
    `Chosen plan: sleep ${minutesToHHMM(best.bedMin)}–${minutesToHHMM(best.wakeMin)} (score ${Math.round(best.score)}; step ${scoringPrefs.searchStepMinutes}m).`,
  );
  notes.push(
    "This is a planning recommendation, not a medical diagnosis. Persistent insomnia, snoring/OSA symptoms, excessive sleepiness, or mood concerns should be discussed with a clinician.",
  );
  return notes;
}

