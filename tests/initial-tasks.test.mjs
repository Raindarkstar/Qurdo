import assert from 'node:assert/strict';
import test from 'node:test';

import { initialTasksFromStorage } from '../.tmp-tests/store/initial-tasks.js';

test('initialTasksFromStorage starts empty when local storage has no tasks', () => {
  assert.deepEqual(initialTasksFromStorage(null), []);
});

test('initialTasksFromStorage keeps tasks that already exist in the current storage key', () => {
  const tasks = [{ id: 'real-task', title: '用户自己的任务' }];
  assert.deepEqual(initialTasksFromStorage(tasks), tasks);
});
