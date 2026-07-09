import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createTask,
  pauseOne,
  summaryForDate,
  tasksForDate,
  toggleComplete,
  unionSeconds,
} from '../.tmp-tests/model/task-logic.js';
import {
  epochDayFromDate,
  epochDayToLocalDate,
  monthCalendarDays,
  weekCalendarDays,
  weekStartEpochDay,
} from '../.tmp-tests/model/calendar-logic.js';
import { Quadrant, RepeatRule } from '../.tmp-tests/model/task-types.js';

test('createTask trims title and rejects empty titles', () => {
  const day = epochDayFromDate(2026, 7, 8);
  const created = createTask(
    {
      title: '  背单词  ',
      quadrant: Quadrant.URGENT_IMPORTANT,
      dueDateEpochDay: day,
      repeatRule: RepeatRule.NONE,
      startMinuteOfDay: null,
      endMinuteOfDay: 600,
      reminderEnabled: false,
      note: '',
    },
    1000,
    () => 'task-1',
  );

  assert.equal(created.ok, true);
  assert.equal(created.task.title, '背单词');
  assert.equal(created.task.timerStartedAtMillis, null);
  assert.equal(created.task.elapsedSeconds, 0);
  assert.equal(created.task.reminderEnabled, true);

  const empty = createTask(
    {
      title: '   ',
      quadrant: Quadrant.URGENT_IMPORTANT,
      dueDateEpochDay: day,
      repeatRule: RepeatRule.NONE,
      startMinuteOfDay: null,
      endMinuteOfDay: null,
      reminderEnabled: false,
      note: '',
    },
    1000,
    () => 'task-2',
  );

  assert.equal(empty.ok, false);
});

test('pauseOne records elapsed seconds and timer segments from real timestamps', () => {
  const task = createTask(
    {
      title: '开发APP',
      quadrant: Quadrant.NOT_URGENT_IMPORTANT,
      dueDateEpochDay: null,
      repeatRule: RepeatRule.NONE,
      startMinuteOfDay: null,
      endMinuteOfDay: null,
      reminderEnabled: false,
      note: '',
    },
    1000,
    () => 'task-1',
  ).task;

  const paused = pauseOne({ ...task, timerStartedAtMillis: 1000 }, 61000);
  assert.equal(paused.elapsedSeconds, 60);
  assert.equal(paused.timerStartedAtMillis, null);
  assert.deepEqual(paused.timerSegments, [{ startedAtMillis: 1000, endedAtMillis: 61000 }]);
});

test('toggleComplete pauses active timers and restores open state when toggled again', () => {
  const day = epochDayFromDate(2026, 7, 8);
  const task = createTask(
    {
      title: '数学作业',
      quadrant: Quadrant.URGENT_NOT_IMPORTANT,
      dueDateEpochDay: day,
      repeatRule: RepeatRule.NONE,
      startMinuteOfDay: null,
      endMinuteOfDay: null,
      reminderEnabled: false,
      note: '',
    },
    0,
    () => 'task-1',
  ).task;

  const completed = toggleComplete([{ ...task, timerStartedAtMillis: 0 }], 'task-1', 120000, day)[0];
  assert.equal(completed.completed, true);
  assert.equal(completed.completedAtEpochDay, day);
  assert.equal(completed.elapsedSeconds, 120);
  assert.equal(completed.timerStartedAtMillis, null);

  const reopened = toggleComplete([completed], 'task-1', 130000, day)[0];
  assert.equal(reopened.completed, false);
  assert.equal(reopened.completedAtEpochDay, null);
});

test('tasksForDate shows undated tasks only today and supports virtual repeats', () => {
  const today = epochDayFromDate(2026, 7, 8);
  const tomorrow = today + 1;
  const dated = createTask(
    {
      title: '日期任务',
      quadrant: Quadrant.URGENT_IMPORTANT,
      dueDateEpochDay: tomorrow,
      repeatRule: RepeatRule.NONE,
      startMinuteOfDay: null,
      endMinuteOfDay: null,
      reminderEnabled: false,
      note: '',
    },
    0,
    () => 'dated',
  ).task;
  const undated = { ...dated, id: 'undated', dueDateEpochDay: null, title: '无日期' };
  const daily = { ...dated, id: 'daily', dueDateEpochDay: today, repeatRule: RepeatRule.DAILY };

  assert.deepEqual(
    tasksForDate([dated, undated, daily], today, today).map((task) => task.id),
    ['undated', 'daily'],
  );
  assert.deepEqual(
    tasksForDate([dated, undated, daily], tomorrow, today).map((task) => task.id),
    ['dated', 'daily'],
  );
});

test('calendar helpers start weeks on Monday and month grids contain 42 days', () => {
  const day = epochDayFromDate(2026, 7, 8);
  const week = weekCalendarDays(day);
  assert.equal(week.length, 7);
  assert.equal(week[0], weekStartEpochDay(day));

  const month = monthCalendarDays(day);
  assert.equal(month.length, 42);
  assert.equal(month[0], weekStartEpochDay(epochDayFromDate(2026, 7, 1)));
});

test('summaryForDate merges overlapping timer ranges instead of summing tasks', () => {
  const day = epochDayFromDate(2026, 7, 8);
  const start = epochDayToLocalDate(day).getTime();
  const taskA = createTask(
    {
      title: 'A',
      quadrant: Quadrant.URGENT_IMPORTANT,
      dueDateEpochDay: day,
      repeatRule: RepeatRule.NONE,
      startMinuteOfDay: null,
      endMinuteOfDay: null,
      reminderEnabled: false,
      note: '',
    },
    0,
    () => 'a',
  ).task;
  const taskB = { ...taskA, id: 'b', quadrant: Quadrant.NOT_URGENT_IMPORTANT };

  assert.equal(
    unionSeconds([
      { startMillis: start + 8 * 3600000, endMillis: start + 14 * 3600000 },
      { startMillis: start + 10 * 3600000, endMillis: start + 20 * 3600000 },
    ]),
    12 * 3600,
  );

  const summary = summaryForDate(
    [
      {
        ...taskA,
        timerSegments: [{ startedAtMillis: start + 8 * 3600000, endedAtMillis: start + 14 * 3600000 }],
      },
      {
        ...taskB,
        timerSegments: [{ startedAtMillis: start + 10 * 3600000, endedAtMillis: start + 20 * 3600000 }],
      },
    ],
    day,
    day,
    start + 21 * 3600000,
  );

  assert.equal(summary.totalElapsedSeconds, 12 * 3600);
  assert.equal(summary.elapsedByQuadrant[Quadrant.URGENT_IMPORTANT], 6 * 3600);
  assert.equal(summary.elapsedByQuadrant[Quadrant.NOT_URGENT_IMPORTANT], 10 * 3600);
});
