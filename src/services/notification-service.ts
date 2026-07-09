import * as Notifications from 'expo-notifications';

import { epochDayAndMinuteToMillis } from '@/src/model/calendar-logic';
import { Task } from '@/src/model/task-types';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export function shouldScheduleTaskReminder(task: Task): boolean {
  return (
    task.reminderEnabled &&
    !task.completed &&
    task.dueDateEpochDay !== null &&
    task.endMinuteOfDay !== null
  );
}

export async function cancelTaskNotification(notificationId: string | null): Promise<void> {
  if (!notificationId) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch {
    // Notification APIs can be unavailable in Expo Go or during simulator tests.
  }
}

export async function scheduleTaskNotification(task: Task): Promise<string | null> {
  if (!shouldScheduleTaskReminder(task)) return null;

  try {
    const current = await Notifications.getPermissionsAsync();
    const permission =
      current.granted || current.status === Notifications.PermissionStatus.GRANTED
        ? current
        : await Notifications.requestPermissionsAsync();
    if (!permission.granted && permission.status !== Notifications.PermissionStatus.GRANTED) return null;

    const reminderMinute = task.endMinuteOfDay!;
    const triggerDate = epochDayAndMinuteToMillis(task.dueDateEpochDay!, reminderMinute);
    if (triggerDate <= Date.now()) return null;

    return await Notifications.scheduleNotificationAsync({
      content: {
        title: '任务提醒',
        body: `${task.title}任务时间快到啦！`,
        sound: 'default',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(triggerDate),
      },
    });
  } catch {
    return null;
  }
}
