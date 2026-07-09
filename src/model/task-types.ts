export enum Quadrant {
  URGENT_IMPORTANT = 'URGENT_IMPORTANT',
  NOT_URGENT_IMPORTANT = 'NOT_URGENT_IMPORTANT',
  URGENT_NOT_IMPORTANT = 'URGENT_NOT_IMPORTANT',
  NOT_URGENT_NOT_IMPORTANT = 'NOT_URGENT_NOT_IMPORTANT',
}

export enum RepeatRule {
  NONE = 'NONE',
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  WEEKDAYS = 'WEEKDAYS',
  MONTHLY = 'MONTHLY',
  YEARLY = 'YEARLY',
}

export interface TaskTimerSegment {
  startedAtMillis: number;
  endedAtMillis: number;
}

export interface Task {
  id: string;
  title: string;
  quadrant: Quadrant;
  dueDateEpochDay: number | null;
  completed: boolean;
  createdAtMillis: number;
  completedAtEpochDay: number | null;
  elapsedSeconds: number;
  timerStartedAtMillis: number | null;
  timerSegments: TaskTimerSegment[];
  plannedMinutes: number | null;
  repeatRule: RepeatRule;
  startMinuteOfDay: number | null;
  endMinuteOfDay: number | null;
  reminderEnabled: boolean;
  notificationId: string | null;
  note: string;
}

export interface TaskDraft {
  title: string;
  quadrant: Quadrant;
  dueDateEpochDay: number | null;
  repeatRule: RepeatRule;
  startMinuteOfDay: number | null;
  endMinuteOfDay: number | null;
  reminderEnabled: boolean;
  note: string;
}

export interface TimerRange {
  startMillis: number;
  endMillis: number;
}

export interface TaskSummary {
  completedToday: number;
  openCount: number;
  totalElapsedSeconds: number;
  elapsedByQuadrant: Record<Quadrant, number>;
  completedTasks: Task[];
  openTasks: Task[];
}
