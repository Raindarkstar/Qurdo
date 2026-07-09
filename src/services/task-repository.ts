import AsyncStorage from '@react-native-async-storage/async-storage';

import { normalizeTask } from '@/src/model/task-logic';
import { Task } from '@/src/model/task-types';

const LEGACY_TASKS_KEYS = ['quanto.tasks.v1', 'quanto.tasks.v2'];
const CURRENT_TASKS_KEY = 'quanto.tasks.v3';

export async function loadTasks(): Promise<Task[] | null> {
  try {
    await AsyncStorage.multiRemove(LEGACY_TASKS_KEYS);
    const raw = await AsyncStorage.getItem(CURRENT_TASKS_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((item) => normalizeTask(item)) : [];
  } catch {
    return [];
  }
}

export async function saveTasks(tasks: Task[]): Promise<void> {
  await AsyncStorage.setItem(CURRENT_TASKS_KEY, JSON.stringify(tasks));
}
