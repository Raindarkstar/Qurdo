export const MS_PER_DAY = 86400000;

export interface DateParts {
  year: number;
  month: number;
  day: number;
  weekday: number;
}

export function localEpochDay(date = new Date()): number {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / MS_PER_DAY);
}

export function epochDayFromDate(year: number, month: number, day: number): number {
  return Math.floor(Date.UTC(year, month - 1, day) / MS_PER_DAY);
}

export function epochDayToLocalDate(epochDay: number): Date {
  const utc = new Date(epochDay * MS_PER_DAY);
  return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate());
}

export function dateParts(epochDay: number): DateParts {
  const date = new Date(epochDay * MS_PER_DAY);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    weekday: date.getUTCDay(),
  };
}

export function weekStartEpochDay(epochDay: number): number {
  const weekday = dateParts(epochDay).weekday;
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  return epochDay + mondayOffset;
}

export function weekCalendarDays(epochDay: number): number[] {
  const start = weekStartEpochDay(epochDay);
  return Array.from({ length: 7 }, (_, index) => start + index);
}

export function weekPageDays(pageIndex: number, centerDay: number, radius: number): number[] {
  const centerWeekStart = weekStartEpochDay(centerDay);
  const pageStart = centerWeekStart + (pageIndex - radius) * 7;
  return Array.from({ length: 7 }, (_, index) => pageStart + index);
}

export function monthCalendarDays(epochDay: number): number[] {
  const selected = dateParts(epochDay);
  const firstOfMonth = epochDayFromDate(selected.year, selected.month, 1);
  const start = weekStartEpochDay(firstOfMonth);
  return Array.from({ length: 42 }, (_, index) => start + index);
}

export function addMonths(epochDay: number, amount: number): number {
  const parts = dateParts(epochDay);
  return epochDayFromDate(parts.year, parts.month + amount, Math.min(parts.day, 28));
}

export function minuteOfDay(hour: number, minute: number): number {
  return hour * 60 + minute;
}

export function epochDayAndMinuteToMillis(epochDay: number, minute: number): number {
  return epochDayToLocalDate(epochDay).getTime() + minute * 60000;
}
