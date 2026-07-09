import { Task } from '../model/task-types';

export function initialTasksFromStorage(loaded: Task[] | null): Task[] {
  return loaded ?? [];
}
