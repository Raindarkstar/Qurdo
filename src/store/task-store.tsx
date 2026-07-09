import React from 'react';

import { localEpochDay } from '@/src/model/calendar-logic';
import {
  createTask,
  displayElapsedSeconds,
  pauseOne,
  quadrantOrder,
  startTimer,
  summaryForDate,
  toggleComplete,
  updateTaskDraft,
} from '@/src/model/task-logic';
import { Task, TaskDraft, TaskSummary } from '@/src/model/task-types';
import { cancelTaskNotification, scheduleTaskNotification } from '@/src/services/notification-service';
import { loadTasks, saveTasks } from '@/src/services/task-repository';
import { initialTasksFromStorage } from '@/src/store/initial-tasks';

interface TaskStoreValue {
  tasks: Task[];
  nowMillis: number;
  selectedEpochDay: number;
  initialized: boolean;
  pickDate: (day: number) => void;
  addTask: (draft: TaskDraft) => Promise<boolean>;
  updateTask: (taskId: string, draft: TaskDraft) => Promise<boolean>;
  deleteTask: (taskId: string) => Promise<void>;
  moveTask: (taskId: string, quadrant: Task['quadrant']) => Promise<void>;
  toggleTask: (taskId: string) => Promise<void>;
  toggleTaskTimer: (taskId: string) => Promise<void>;
  summary: TaskSummary;
  elapsedForTask: (task: Task) => number;
}

const TaskStoreContext = React.createContext<TaskStoreValue | null>(null);

function idFactory(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function TaskStoreProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [selectedEpochDay, setSelectedEpochDay] = React.useState(() => localEpochDay());
  const [nowMillis, setNowMillis] = React.useState(() => Date.now());
  const [initialized, setInitialized] = React.useState(false);

  React.useEffect(() => {
    let mounted = true;
    loadTasks().then((loaded) => {
      if (!mounted) return;
      setTasks(initialTasksFromStorage(loaded));
      setInitialized(true);
    });
    return () => {
      mounted = false;
    };
  }, []);

  React.useEffect(() => {
    const timer = setInterval(() => setNowMillis(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  React.useEffect(() => {
    if (initialized) void saveTasks(tasks);
  }, [initialized, tasks]);

  const addTask = React.useCallback(async (draft: TaskDraft) => {
    const created = createTask(draft, Date.now(), idFactory);
    if (!created.ok) return false;
    const notificationId = await scheduleTaskNotification(created.task);
    setTasks((current) => [...current, { ...created.task, notificationId }]);
    return true;
  }, []);

  const updateTask = React.useCallback(async (taskId: string, draft: TaskDraft) => {
    const target = tasks.find((task) => task.id === taskId);
    if (!target) return false;
    const updated = updateTaskDraft(target, draft);
    if (!updated) return false;
    await cancelTaskNotification(target.notificationId);
    const notificationId = await scheduleTaskNotification({ ...updated, notificationId: null });
    setTasks((current) => current.map((task) => (task.id === taskId ? { ...updated, notificationId } : task)));
    return true;
  }, [tasks]);

  const deleteTask = React.useCallback(async (taskId: string) => {
    const target = tasks.find((task) => task.id === taskId);
    await cancelTaskNotification(target?.notificationId ?? null);
    setTasks((current) => current.filter((task) => task.id !== taskId));
  }, [tasks]);

  const moveTask = React.useCallback(async (taskId: string, quadrant: Task['quadrant']) => {
    setTasks((current) => current.map((task) => (task.id === taskId ? { ...task, quadrant } : task)));
  }, []);

  const toggleTask = React.useCallback(async (taskId: string) => {
    const target = tasks.find((task) => task.id === taskId);
    if (!target) return;
    if (!target.completed) await cancelTaskNotification(target.notificationId);
    const next = toggleComplete(tasks, taskId, Date.now(), selectedEpochDay);
    const changed = next.find((task) => task.id === taskId);
    if (changed && !changed.completed) {
      const notificationId = await scheduleTaskNotification({ ...changed, notificationId: null });
      setTasks(next.map((task) => (task.id === taskId ? { ...task, notificationId } : task)));
    } else {
      setTasks(next.map((task) => (task.id === taskId ? { ...task, notificationId: null } : task)));
    }
  }, [selectedEpochDay, tasks]);

  const toggleTaskTimer = React.useCallback(async (taskId: string) => {
    setTasks((current) => {
      const target = current.find((task) => task.id === taskId);
      if (!target || target.completed) return current;
      if (target.timerStartedAtMillis === null) return startTimer(current, taskId, Date.now());
      return current.map((task) => (task.id === taskId ? pauseOne(task, Date.now()) : task));
    });
  }, []);

  const summary = React.useMemo(
    () => summaryForDate(tasks, selectedEpochDay, localEpochDay(), nowMillis),
    [nowMillis, selectedEpochDay, tasks],
  );

  const value = React.useMemo<TaskStoreValue>(
    () => ({
      tasks,
      nowMillis,
      selectedEpochDay,
      initialized,
      pickDate: setSelectedEpochDay,
      addTask,
      updateTask,
      deleteTask,
      moveTask,
      toggleTask,
      toggleTaskTimer,
      summary,
      elapsedForTask: (task) => displayElapsedSeconds(task, nowMillis),
    }),
    [addTask, deleteTask, initialized, moveTask, nowMillis, selectedEpochDay, summary, tasks, toggleTask, toggleTaskTimer, updateTask],
  );

  return <TaskStoreContext.Provider value={value}>{children}</TaskStoreContext.Provider>;
}

export function useTaskStore(): TaskStoreValue {
  const value = React.useContext(TaskStoreContext);
  if (!value) throw new Error('useTaskStore must be used inside TaskStoreProvider');
  return value;
}

export { quadrantOrder };
