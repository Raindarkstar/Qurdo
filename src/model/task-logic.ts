import { dateParts, epochDayToLocalDate, MS_PER_DAY } from './calendar-logic';
import { Quadrant, RepeatRule, Task, TaskDraft, TaskSummary, TimerRange } from './task-types';

export const quadrantMeta: Record<Quadrant, { title: string; action: string; accent: string }> = {
  [Quadrant.URGENT_IMPORTANT]: { title: '急重', action: '立刻处理', accent: '#ef3438' },
  [Quadrant.NOT_URGENT_IMPORTANT]: { title: '重缓', action: '安排', accent: '#111318' },
  [Quadrant.URGENT_NOT_IMPORTANT]: { title: '急轻', action: '快速处理', accent: '#111318' },
  [Quadrant.NOT_URGENT_NOT_IMPORTANT]: { title: '轻缓', action: '削减', accent: '#111318' },
};

export const quadrantOrder = [
  Quadrant.URGENT_IMPORTANT,
  Quadrant.NOT_URGENT_IMPORTANT,
  Quadrant.URGENT_NOT_IMPORTANT,
  Quadrant.NOT_URGENT_NOT_IMPORTANT,
];

export function createTask(
  draft: TaskDraft,
  now: number,
  idFactory: () => string,
): { ok: true; task: Task } | { ok: false; reason: 'EMPTY_TITLE' } {
  const title = draft.title.trim();
  if (!title) return { ok: false, reason: 'EMPTY_TITLE' };

  return {
    ok: true,
    task: {
      id: idFactory(),
      title,
      quadrant: draft.quadrant,
      dueDateEpochDay: draft.dueDateEpochDay,
      completed: false,
      createdAtMillis: now,
      completedAtEpochDay: null,
      elapsedSeconds: 0,
      timerStartedAtMillis: null,
      timerSegments: [],
      plannedMinutes: null,
      repeatRule: draft.repeatRule,
      startMinuteOfDay: draft.startMinuteOfDay,
      endMinuteOfDay: draft.endMinuteOfDay,
      reminderEnabled: draft.endMinuteOfDay !== null ? true : draft.reminderEnabled,
      notificationId: null,
      note: draft.note,
    },
  };
}

export function normalizeTask(raw: Partial<Task>): Task {
  return {
    id: String(raw.id ?? `${Date.now()}`),
    title: String(raw.title ?? '未命名任务'),
    quadrant: raw.quadrant ?? Quadrant.URGENT_IMPORTANT,
    dueDateEpochDay: raw.dueDateEpochDay ?? null,
    completed: Boolean(raw.completed),
    createdAtMillis: Number(raw.createdAtMillis ?? Date.now()),
    completedAtEpochDay: raw.completedAtEpochDay ?? null,
    elapsedSeconds: Number(raw.elapsedSeconds ?? 0),
    timerStartedAtMillis: raw.timerStartedAtMillis ?? null,
    timerSegments: Array.isArray(raw.timerSegments) ? raw.timerSegments : [],
    plannedMinutes: raw.plannedMinutes ?? null,
    repeatRule: raw.repeatRule ?? RepeatRule.NONE,
    startMinuteOfDay: raw.startMinuteOfDay ?? null,
    endMinuteOfDay: raw.endMinuteOfDay ?? null,
    reminderEnabled: Boolean(raw.reminderEnabled),
    notificationId: raw.notificationId ?? null,
    note: String(raw.note ?? ''),
  };
}

export function startTimer(tasks: Task[], taskId: string, now: number): Task[] {
  return tasks.map((task) => {
    if (task.id !== taskId || task.completed) return task;
    return { ...task, timerStartedAtMillis: task.timerStartedAtMillis ?? now };
  });
}

export function pauseOne(task: Task, now: number): Task {
  if (task.timerStartedAtMillis === null) return task;
  const endedAt = Math.max(now, task.timerStartedAtMillis);
  const seconds = Math.floor((endedAt - task.timerStartedAtMillis) / 1000);
  return {
    ...task,
    elapsedSeconds: task.elapsedSeconds + Math.max(0, seconds),
    timerStartedAtMillis: null,
    timerSegments:
      endedAt > task.timerStartedAtMillis
        ? [...task.timerSegments, { startedAtMillis: task.timerStartedAtMillis, endedAtMillis: endedAt }]
        : task.timerSegments,
  };
}

export function toggleComplete(tasks: Task[], taskId: string, now: number, completedDay: number): Task[] {
  return tasks.map((task) => {
    if (task.id !== taskId) return task;
    if (task.completed) return { ...task, completed: false, completedAtEpochDay: null };
    const paused = pauseOne(task, now);
    return { ...paused, completed: true, completedAtEpochDay: completedDay, timerStartedAtMillis: null };
  });
}

export function updateTaskDraft(task: Task, draft: TaskDraft): Task | null {
  const title = draft.title.trim();
  if (!title) return null;
  return {
    ...task,
    title,
    quadrant: draft.quadrant,
    dueDateEpochDay: draft.dueDateEpochDay,
    repeatRule: draft.repeatRule,
    startMinuteOfDay: draft.startMinuteOfDay,
    endMinuteOfDay: draft.endMinuteOfDay,
    reminderEnabled: draft.endMinuteOfDay !== null ? true : draft.reminderEnabled,
    note: draft.note,
  };
}

export function repeatsOn(task: Task, selectedDay: number): boolean {
  if (task.repeatRule === RepeatRule.NONE || task.dueDateEpochDay === null || selectedDay <= task.dueDateEpochDay) {
    return false;
  }

  const base = dateParts(task.dueDateEpochDay);
  const selected = dateParts(selectedDay);
  switch (task.repeatRule) {
    case RepeatRule.DAILY:
      return true;
    case RepeatRule.WEEKLY:
      return (selectedDay - task.dueDateEpochDay) % 7 === 0;
    case RepeatRule.WEEKDAYS:
      return selected.weekday >= 1 && selected.weekday <= 5;
    case RepeatRule.MONTHLY:
      return selected.day === base.day;
    case RepeatRule.YEARLY:
      return selected.month === base.month && selected.day === base.day;
    default:
      return false;
  }
}

export function tasksForDate(tasks: Task[], selectedDay: number, currentDay: number): Task[] {
  return tasks.filter(
    (task) =>
      task.dueDateEpochDay === selectedDay ||
      (task.dueDateEpochDay === null && selectedDay === currentDay) ||
      repeatsOn(task, selectedDay),
  );
}

export function unionSeconds(ranges: TimerRange[]): number {
  if (ranges.length === 0) return 0;
  const sorted = [...ranges]
    .filter((range) => range.endMillis > range.startMillis)
    .sort((a, b) => a.startMillis - b.startMillis);
  if (sorted.length === 0) return 0;

  let total = 0;
  let activeStart = sorted[0].startMillis;
  let activeEnd = sorted[0].endMillis;

  for (let index = 1; index < sorted.length; index += 1) {
    const range = sorted[index];
    if (range.startMillis <= activeEnd) {
      activeEnd = Math.max(activeEnd, range.endMillis);
    } else {
      total += activeEnd - activeStart;
      activeStart = range.startMillis;
      activeEnd = range.endMillis;
    }
  }

  total += activeEnd - activeStart;
  return Math.floor(total / 1000);
}

function rangesForTask(task: Task, day: number, now: number): TimerRange[] {
  const dayStart = epochDayToLocalDate(day).getTime();
  const dayEnd = dayStart + MS_PER_DAY;
  const segments = [...task.timerSegments];
  if (task.timerStartedAtMillis !== null) {
    segments.push({ startedAtMillis: task.timerStartedAtMillis, endedAtMillis: now });
  }

  return segments
    .map((segment) => ({
      startMillis: Math.max(segment.startedAtMillis, dayStart),
      endMillis: Math.min(segment.endedAtMillis, dayEnd),
    }))
    .filter((range) => range.endMillis > range.startMillis);
}

export function displayElapsedSeconds(task: Task, now: number): number {
  if (task.timerStartedAtMillis === null) return task.elapsedSeconds;
  return task.elapsedSeconds + Math.max(0, Math.floor((now - task.timerStartedAtMillis) / 1000));
}

export function summaryForDate(tasks: Task[], selectedDay: number, currentDay: number, now: number): TaskSummary {
  const visible = tasksForDate(tasks, selectedDay, currentDay);
  const completedTasks = visible.filter((task) => task.completed);
  const openTasks = visible.filter((task) => !task.completed);
  const elapsedByQuadrant = Object.fromEntries(quadrantOrder.map((quadrant) => [quadrant, 0])) as Record<
    Quadrant,
    number
  >;

  const allRanges: TimerRange[] = [];
  for (const quadrant of quadrantOrder) {
    const quadrantRanges = visible.flatMap((task) => (task.quadrant === quadrant ? rangesForTask(task, selectedDay, now) : []));
    elapsedByQuadrant[quadrant] = unionSeconds(quadrantRanges);
    allRanges.push(...quadrantRanges);
  }

  return {
    completedToday: visible.filter((task) => task.completedAtEpochDay === selectedDay).length,
    openCount: openTasks.length,
    totalElapsedSeconds: unionSeconds(allRanges),
    elapsedByQuadrant,
    completedTasks,
    openTasks,
  };
}
