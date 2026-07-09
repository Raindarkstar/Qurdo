import { dateParts } from './calendar-logic';

export function formatMinuteOfDay(minute: number | null): string {
  if (minute === null) return '无';
  const hour = Math.floor(minute / 60);
  const min = minute % 60;
  return `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
}

export function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hours > 0) return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
  return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function formatDurationCompact(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export function formatChineseDate(epochDay: number): string {
  const parts = dateParts(epochDay);
  return `${parts.year}年${parts.month}月${parts.day}日`;
}

export function formatShortDate(epochDay: number): string {
  const parts = dateParts(epochDay);
  return `${parts.month}月${parts.day}日`;
}
