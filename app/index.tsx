import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import React from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Pressable as NativePressable,
  type PressableProps,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  addMonths,
  dateParts,
  localEpochDay,
  monthCalendarDays,
  weekPageDays,
} from '@/src/model/calendar-logic';
import { formatChineseDate, formatDuration, formatDurationCompact, formatMinuteOfDay, formatShortDate } from '@/src/model/formatters';
import { quadrantMeta, quadrantOrder, tasksForDate } from '@/src/model/task-logic';
import { Quadrant, RepeatRule, Task, TaskDraft } from '@/src/model/task-types';
import { TaskStoreProvider, useTaskStore } from '@/src/store/task-store';

const RED = '#ef3438';
const INK = '#111318';
const MUTED = '#69707d';
const PAPER = '#f4f4f2';
const LINE = '#e5e5e2';
const CARD = '#ffffff';
let lastTapHapticAt = 0;

type FloatingTaskDrag = {
  task: Task;
  accent: string;
  compact?: boolean;
  originX: number;
  originY: number;
  width: number;
  height: number;
  touchOffsetX: number;
  touchOffsetY: number;
  touchX: number;
  touchY: number;
} | null;

const repeatLabels: Record<RepeatRule, string> = {
  [RepeatRule.NONE]: '不重复',
  [RepeatRule.DAILY]: '每天',
  [RepeatRule.WEEKLY]: '每周',
  [RepeatRule.WEEKDAYS]: '工作日',
  [RepeatRule.MONTHLY]: '每月',
  [RepeatRule.YEARLY]: '每年',
};

function minuteToClockDate(minuteOfDay: number | null, fallbackMinute = 540): Date {
  const minute = Math.max(0, Math.min(1439, minuteOfDay ?? fallbackMinute));
  const date = new Date(2000, 0, 1, Math.floor(minute / 60), minute % 60, 0, 0);
  return date;
}

function clockDateToMinute(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

function triggerTapHaptic() {
  if (process.env.EXPO_OS === 'web') return;
  const now = Date.now();
  if (now - lastTapHapticAt < 80) return;
  lastTapHapticAt = now;
  void Haptics.selectionAsync();
}

function Pressable({ onPress, onLongPress, disabled, ...props }: PressableProps) {
  const press = React.useCallback<NonNullable<PressableProps['onPress']>>(
    (event) => {
      if (!disabled) triggerTapHaptic();
      onPress?.(event);
    },
    [disabled, onPress],
  );
  const longPress = React.useCallback<NonNullable<PressableProps['onLongPress']>>(
    (event) => {
      if (!disabled) triggerTapHaptic();
      onLongPress?.(event);
    },
    [disabled, onLongPress],
  );

  return <NativePressable {...props} disabled={disabled} onPress={onPress ? press : undefined} onLongPress={onLongPress ? longPress : undefined} />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <TaskStoreProvider>
        <Dashboard />
      </TaskStoreProvider>
    </SafeAreaProvider>
  );
}

function Dashboard() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const availablePageHeight = height - insets.top - 10;
  const [detailQuadrant, setDetailQuadrant] = React.useState<Quadrant | null>(null);
  const [taskDetail, setTaskDetail] = React.useState<Task | null>(null);
  const [formOpen, setFormOpen] = React.useState(false);
  const [editingTask, setEditingTask] = React.useState<Task | null>(null);
  const [formQuadrant, setFormQuadrant] = React.useState<Quadrant>(Quadrant.URGENT_IMPORTANT);
  const [monthOpen, setMonthOpen] = React.useState(false);
  const [draggingHomeTask, setDraggingHomeTask] = React.useState(false);
  const [floatingTaskDrag, setFloatingTaskDrag] = React.useState<FloatingTaskDrag>(null);

  const openForm = (quadrant: Quadrant, task?: Task) => {
    if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync();
    setFormQuadrant(quadrant);
    setEditingTask(task ?? null);
    setFormOpen(true);
  };

  return (
    <View style={[styles.app, { paddingTop: insets.top + 10 }]}>
      <ScrollView
        horizontal
        pagingEnabled
        scrollEnabled={!draggingHomeTask}
        showsHorizontalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        style={{ width, flex: 1 }}>
        <HomePage
          width={width}
          height={availablePageHeight}
          onOpenMonth={() => setMonthOpen(true)}
          onOpenQuadrant={setDetailQuadrant}
          onAddTask={openForm}
          onOpenTask={setTaskDetail}
          onTaskDragStateChange={setDraggingHomeTask}
          onFloatingTaskDragChange={setFloatingTaskDrag}
        />
        <ReviewPage width={width} height={availablePageHeight} />
      </ScrollView>
      <DetailModal
        quadrant={detailQuadrant}
        onClose={() => setDetailQuadrant(null)}
        onAddTask={(quadrant) => {
          setDetailQuadrant(null);
          setTimeout(() => openForm(quadrant), 250);
        }}
        onEditTask={(task) => {
          setDetailQuadrant(null);
          setTimeout(() => openForm(task.quadrant, task), 250);
        }}
      />
      <TaskFormModal
        visible={formOpen}
        task={editingTask}
        initialQuadrant={formQuadrant}
        onClose={() => {
          setEditingTask(null);
          setFormOpen(false);
        }}
      />
      <TaskDetailModal task={taskDetail} onClose={() => setTaskDetail(null)} />
      <MonthCalendarSheet visible={monthOpen} onClose={() => setMonthOpen(false)} />
      <FloatingTaskLayer drag={floatingTaskDrag} />
    </View>
  );
}

function HomePage({
  width,
  height,
  onOpenMonth,
  onOpenQuadrant,
  onAddTask,
  onOpenTask,
  onTaskDragStateChange,
  onFloatingTaskDragChange,
}: {
  width: number;
  height: number;
  onOpenMonth: () => void;
  onOpenQuadrant: (quadrant: Quadrant) => void;
  onAddTask: (quadrant: Quadrant) => void;
  onOpenTask: (task: Task) => void;
  onTaskDragStateChange: (dragging: boolean) => void;
  onFloatingTaskDragChange: React.Dispatch<React.SetStateAction<FloatingTaskDrag>>;
}) {
  const { selectedEpochDay, pickDate, summary, tasks, toggleTask, moveTask } = useTaskStore();
  const today = localEpochDay();
  const selected = dateParts(selectedEpochDay);
  const visibleTasks = tasksForDate(tasks, selectedEpochDay, today);
  const fit = getFitMetrics(height);
  const matrixRef = React.useRef<View>(null);
  const [matrixFrame, setMatrixFrame] = React.useState<{ x: number; y: number; width: number; height: number } | null>(null);

  const measureMatrix = React.useCallback(() => {
    requestAnimationFrame(() => {
      matrixRef.current?.measureInWindow((x, y, frameWidth, frameHeight) => {
        setMatrixFrame({ x, y, width: frameWidth, height: frameHeight });
      });
    });
  }, []);

  const quadrantForPoint = React.useCallback(
    (x: number, y: number): Quadrant | null => {
      if (!matrixFrame) return null;
      if (x < matrixFrame.x || x > matrixFrame.x + matrixFrame.width || y < matrixFrame.y || y > matrixFrame.y + matrixFrame.height) {
        return null;
      }
      const column = x < matrixFrame.x + matrixFrame.width / 2 ? 0 : 1;
      const row = y < matrixFrame.y + matrixFrame.height / 2 ? 0 : 1;
      if (row === 0 && column === 0) return Quadrant.URGENT_IMPORTANT;
      if (row === 0 && column === 1) return Quadrant.NOT_URGENT_IMPORTANT;
      if (row === 1 && column === 0) return Quadrant.URGENT_NOT_IMPORTANT;
      return Quadrant.NOT_URGENT_NOT_IMPORTANT;
    },
    [matrixFrame],
  );

  return (
    <View style={[styles.fitPage, { width, paddingHorizontal: fit.pageX, gap: fit.gap }]}>
      <View style={[styles.heroCard, { height: fit.heroHeight, padding: fit.heroPadding }]}>
        <Pressable style={styles.heroTop} onPress={onOpenMonth}>
          <View style={styles.redRule} />
          <Text style={styles.sideLabel} selectable>
            EISENHOWER{'\n'}MATRIX
          </Text>
        </Pressable>
        <Pressable style={styles.heroDateBlock} onPress={onOpenMonth}>
          <Text style={[styles.heroTitle, { fontSize: fit.compact ? 32 : 36 }]} selectable>
            {selectedEpochDay === today ? '今天' : formatShortDate(selectedEpochDay)}
          </Text>
          <Text style={[styles.heroSubtitle, { fontSize: fit.compact ? 14 : 15 }]} selectable>
            {selected.month}月{selected.day}日 星期{'日一二三四五六'[selected.weekday]} · {summary.openCount} open ·{' '}
            {summary.completedTasks.length} done
          </Text>
        </Pressable>
        <DateStrip
          selectedDay={selectedEpochDay}
          onPickDay={pickDate}
          compact={fit.compact}
          stripWidth={width - fit.pageX * 2 - fit.heroPadding * 2}
        />
      </View>

      <View ref={matrixRef} style={[styles.matrixPanel, { height: fit.matrixHeight, padding: fit.matrixPadding }]} onLayout={measureMatrix}>
        <View style={styles.matrixGrid}>
          {quadrantOrder.map((quadrant) => {
            const meta = quadrantMeta[quadrant];
            const openTasks = visibleTasks.filter((task) => task.quadrant === quadrant && !task.completed);
            const isUrgent = quadrant === Quadrant.URGENT_IMPORTANT;
            return (
              <Pressable
                key={quadrant}
                style={[styles.quadrantCard, { height: fit.quadrantHeight, padding: fit.quadrantPadding }, isUrgent && styles.quadrantUrgent]}
                onPress={() => onOpenQuadrant(quadrant)}>
                <View style={styles.quadrantHeader}>
                  <View style={[styles.bullet, { backgroundColor: meta.accent }]} />
                  <Text style={[styles.quadrantTitle, { fontSize: fit.compact ? 20 : 22 }]} selectable>
                    {meta.title}
                  </Text>
                </View>
                <Text style={[styles.quadrantAction, { fontSize: fit.compact ? 13 : 14 }]} selectable>
                  {meta.action}
                </Text>
                <View style={styles.quadrantTasks}>
                  {openTasks.slice(0, 2).map((task) => (
                    <QuadrantTaskRow
                      key={task.id}
                      task={task}
                      accent={meta.accent}
                      compact={fit.compact}
                      quadrantForPoint={quadrantForPoint}
                      onComplete={() => toggleTask(task.id)}
                      onMove={(targetQuadrant) => moveTask(task.id, targetQuadrant)}
                      onOpen={() => onOpenTask(task)}
                      onDragStateChange={onTaskDragStateChange}
                      onFloatingDragChange={onFloatingTaskDragChange}
                    />
                  ))}
                  {openTasks.length === 0 ? (
                    <Pressable
                      onPress={(event) => {
                        event.stopPropagation();
                        onAddTask(quadrant);
                      }}>
                      <Text style={[styles.emptyHint, { fontSize: fit.compact ? 15 : 17 }]}>轻触添加任务</Text>
                    </Pressable>
                  ) : null}
                </View>
                <View style={styles.quadrantFoot}>
                  <Text style={styles.footLabel}>OPEN</Text>
                  <Text style={[styles.quadrantCount, { fontSize: fit.compact ? 28 : 32 }, isUrgent && styles.redText]} selectable>
                    {openTasks.length}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

function getFitMetrics(height: number) {
  const usableHeight = Math.max(560, height - 24);
  const compact = usableHeight < 720;
  const gap = compact ? 8 : 12;
  const pageX = compact ? 14 : 20;
  const heroHeight = Math.round(usableHeight * (compact ? 0.28 : 0.3));
  const matrixHeight = usableHeight - heroHeight - gap - 24;
  const matrixPadding = compact ? 6 : 8;
  const quadrantHeight = (matrixHeight - matrixPadding * 2 - 8) / 2;

  return {
    compact,
    gap,
    pageX,
    heroHeight,
    matrixHeight,
    matrixPadding,
    quadrantHeight,
    heroPadding: compact ? 16 : 20,
    quadrantPadding: compact ? 12 : 14,
  };
}

function QuadrantTaskRow({
  task,
  accent,
  compact,
  quadrantForPoint,
  onComplete,
  onMove,
  onOpen,
  onDragStateChange,
  onFloatingDragChange,
}: {
  task: Task;
  accent: string;
  compact?: boolean;
  quadrantForPoint: (x: number, y: number) => Quadrant | null;
  onComplete: () => Promise<void>;
  onMove: (quadrant: Quadrant) => Promise<void>;
  onOpen: () => void;
  onDragStateChange: (dragging: boolean) => void;
  onFloatingDragChange: React.Dispatch<React.SetStateAction<FloatingTaskDrag>>;
}) {
  const rowRef = React.useRef<View>(null);
  const drag = React.useRef(new Animated.ValueXY()).current;
  const draggingRef = React.useRef(false);
  const panActiveRef = React.useRef(false);
  const gestureOriginRef = React.useRef<{ x: number; y: number } | null>(null);
  const longPressTriggeredRef = React.useRef(false);
  const [dragging, setDragging] = React.useState(false);

  const resetDrag = React.useCallback(() => {
    Animated.spring(drag, {
      toValue: { x: 0, y: 0 },
      useNativeDriver: true,
      damping: 22,
      stiffness: 180,
    }).start();
  }, [drag]);

  const startDrag = React.useCallback(
    (touchX: number, touchY: number) => {
    longPressTriggeredRef.current = true;
    drag.stopAnimation(() => {
      drag.setValue({ x: 0, y: 0 });
    });
    draggingRef.current = true;
    setDragging(true);
    onDragStateChange(true);
    rowRef.current?.measureInWindow((originX, originY, rowWidth, rowHeight) => {
      onFloatingDragChange({
        task,
        accent,
        compact,
        originX,
        originY,
        width: rowWidth,
        height: rowHeight,
        touchOffsetX: touchX - originX,
        touchOffsetY: touchY - originY,
        touchX,
        touchY,
      });
    });
    if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync();
    },
    [accent, compact, drag, onDragStateChange, onFloatingDragChange, task],
  );

  const cancelDrag = React.useCallback(() => {
    draggingRef.current = false;
    panActiveRef.current = false;
    gestureOriginRef.current = null;
    setDragging(false);
    onDragStateChange(false);
    onFloatingDragChange(null);
    resetDrag();
  }, [onDragStateChange, onFloatingDragChange, resetDrag]);

  const endDrag = React.useCallback(
    (moveX: number, moveY: number) => {
      const targetQuadrant = quadrantForPoint(moveX, moveY);
      draggingRef.current = false;
      panActiveRef.current = false;
      gestureOriginRef.current = null;
      setDragging(false);
      onDragStateChange(false);
      onFloatingDragChange(null);
      resetDrag();
      if (targetQuadrant && targetQuadrant !== task.quadrant) {
        if (process.env.EXPO_OS === 'ios') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        void onMove(targetQuadrant);
      }
    },
    [onDragStateChange, onFloatingDragChange, onMove, quadrantForPoint, resetDrag, task.quadrant],
  );

  const panResponder = React.useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: () => draggingRef.current,
        onMoveShouldSetPanResponderCapture: () => draggingRef.current,
        onPanResponderGrant: (_, gesture) => {
          panActiveRef.current = true;
          gestureOriginRef.current = { x: gesture.moveX || gesture.x0, y: gesture.moveY || gesture.y0 };
          drag.stopAnimation(() => {
            drag.setValue({ x: 0, y: 0 });
          });
        },
        onPanResponderMove: (_, gesture) => {
          if (!gestureOriginRef.current) {
            gestureOriginRef.current = { x: gesture.moveX || gesture.x0, y: gesture.moveY || gesture.y0 };
          }
          drag.setValue({
            x: gesture.moveX - gestureOriginRef.current.x,
            y: gesture.moveY - gestureOriginRef.current.y,
          });
          onFloatingDragChange((current) =>
            current
              ? {
                  ...current,
                  touchX: gesture.moveX,
                  touchY: gesture.moveY,
                }
              : current,
          );
        },
        onPanResponderRelease: (_, gesture) => endDrag(gesture.moveX, gesture.moveY),
        onPanResponderTerminate: (_, gesture) => endDrag(gesture.moveX, gesture.moveY),
      }),
    [drag, endDrag, onFloatingDragChange],
  );

  const completeTask = () => {
    if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync();
    void onComplete();
  };

  return (
    <Animated.View
      ref={rowRef}
      style={[styles.quadrantTaskRow, dragging && styles.quadrantTaskRowHidden]}
      onTouchEnd={() => {
        if (draggingRef.current && !panActiveRef.current) cancelDrag();
      }}
      onTouchCancel={() => {
        if (draggingRef.current && !panActiveRef.current) cancelDrag();
      }}
      {...panResponder.panHandlers}>
      <Pressable
        style={styles.quadrantTaskCheckWrap}
        hitSlop={8}
        onPress={(event) => {
          event.stopPropagation();
          completeTask();
        }}>
        <View style={[styles.quadrantTaskCheck, { borderColor: accent }]} />
      </Pressable>
      <Pressable
        style={styles.quadrantTaskPressArea}
        delayLongPress={300}
        onPress={(event) => {
          event.stopPropagation();
          if (longPressTriggeredRef.current) {
            longPressTriggeredRef.current = false;
            return;
          }
          onOpen();
        }}
        onLongPress={(event) => {
          event.stopPropagation();
          startDrag(event.nativeEvent.pageX, event.nativeEvent.pageY);
        }}>
        <Text style={[styles.quadrantTask, { fontSize: compact ? 16 : 18 }]} numberOfLines={1}>
          {task.title}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

function FloatingTaskLayer({ drag }: { drag: FloatingTaskDrag }) {
  if (!drag) return null;

  const left = drag.touchX - drag.touchOffsetX;
  const top = drag.touchY - drag.touchOffsetY;

  return (
    <View pointerEvents="none" style={styles.floatingTaskLayer}>
      <View style={[styles.floatingTaskRow, { left, top, width: drag.width, minHeight: drag.height }]}>
        <View style={[styles.quadrantTaskCheck, { borderColor: drag.accent }]} />
        <Text style={[styles.quadrantTask, { flex: 1, fontSize: drag.compact ? 16 : 18 }]} numberOfLines={1}>
          {drag.task.title}
        </Text>
      </View>
    </View>
  );
}

function DateStrip({
  selectedDay,
  onPickDay,
  compact,
  stripWidth,
}: {
  selectedDay: number;
  onPickDay: (day: number) => void;
  compact?: boolean;
  stripWidth: number;
}) {
  const weekRadius = 12;
  const centerWeekPage = weekRadius;
  const today = localEpochDay();
  const scrollRef = React.useRef<ScrollView>(null);
  const [weekBaseDay, setWeekBaseDay] = React.useState(selectedDay);
  const weekPages = React.useMemo(
    () => Array.from({ length: weekRadius * 2 + 1 }, (_, pageIndex) => weekPageDays(pageIndex, weekBaseDay, weekRadius)),
    [weekBaseDay],
  );
  const dayGap = compact ? 5 : 6;
  const dayWidth = Math.max(38, Math.floor((stripWidth - dayGap * 6) / 7));

  React.useEffect(() => {
    const firstDay = weekPages[0][0];
    const lastPage = weekPages[weekPages.length - 1];
    const lastDay = lastPage[lastPage.length - 1];
    if (selectedDay < firstDay || selectedDay > lastDay) {
      setWeekBaseDay(selectedDay);
    }
  }, [selectedDay, weekPages]);

  React.useEffect(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ x: stripWidth * centerWeekPage, animated: false });
    });
  }, [centerWeekPage, stripWidth, weekBaseDay]);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      pagingEnabled
      nestedScrollEnabled
      showsHorizontalScrollIndicator={false}
      decelerationRate="fast"
      snapToInterval={stripWidth}
      style={styles.dateStrip}
      contentContainerStyle={styles.dateStripContent}>
      {weekPages.map((days, pageIndex) => (
        <View key={`week-${pageIndex}`} style={[styles.weekPage, { width: stripWidth, gap: dayGap }]}>
          {days.map((day) => {
            const parts = dateParts(day);
            const selected = day === selectedDay;
            const isToday = day === today;
            return (
              <Pressable
                key={day}
                style={[styles.dayPill, compact && styles.dayPillCompact, { width: dayWidth }, selected && styles.dayPillSelected]}
                onPress={() => onPickDay(day)}>
                <Text style={[styles.weekdayText, compact && styles.weekdayTextCompact, selected && styles.dayTextSelected]}>{'日一二三四五六'[parts.weekday]}</Text>
                <Text style={[styles.dayText, compact && styles.dayTextCompact, selected && styles.dayTextSelected]}>{parts.day}</Text>
                <View style={[styles.todayDot, isToday && { backgroundColor: RED }, selected && { backgroundColor: CARD }]} />
              </Pressable>
            );
          })}
        </View>
      ))}
    </ScrollView>
  );
}

function ReviewPage({ width, height }: { width: number; height: number }) {
  const { summary, tasks } = useTaskStore();
  const fit = getReviewFitMetrics(height);
  const today = localEpochDay();
  const todayDoneTasks = tasks.filter((task) => task.completedAtEpochDay === today);
  const todayOpenTasks = tasksForDate(tasks, today, today).filter((task) => !task.completed);
  const tomorrowTasks = tasksForDate(tasks, today + 1, today).filter((task) => !task.completed);
  const pastOpenTasks = tasks.filter((task) => !task.completed && task.dueDateEpochDay !== null && task.dueDateEpochDay < today);

  return (
    <View style={[styles.fitPage, { width, paddingHorizontal: fit.pageX, gap: fit.gap }]}>
      <View style={[styles.reviewHero, { height: fit.heroHeight, padding: fit.heroPadding }]}>
        <View style={styles.reviewBookmark} />
        <View style={[styles.reviewGhostWrap, { top: fit.ghostTop }]}>
          <Text style={[styles.reviewGhostWord, { fontSize: fit.ghostSize }]}>REVIEW</Text>
        </View>
        <Text style={[styles.reviewSide, { fontSize: fit.compact ? 13 : 14 }]}>DAY{'\n'}LOG</Text>
        <View style={[styles.reviewTitleBlock, { bottom: fit.titleBottom }]}>
          <Text style={[styles.reviewTitle, { fontSize: fit.compact ? 28 : 32 }]} selectable>
            今日复盘
          </Text>
          <Text style={[styles.reviewSubtitle, { fontSize: fit.compact ? 12 : 13 }]} selectable>
            完成 {summary.completedToday} · 未完成 {summary.openCount} · {formatDurationCompact(summary.totalElapsedSeconds)}
          </Text>
        </View>
      </View>

      <View style={[styles.reviewPanel, { height: fit.panelHeight, padding: fit.panelPadding, gap: fit.gap }]}>
        <View style={styles.sectionHead}>
          <View>
            <Text style={[styles.sectionTitle, styles.sectionTitleCompact]}>TIME FLOW</Text>
            <View style={styles.sectionNeedle} />
          </View>
          <Text style={[styles.checkMark, styles.checkMarkCompact]}>✓</Text>
        </View>
        <View style={[styles.statRow, { height: fit.statHeight }]}>
          <StatBox label="完成" value={`${summary.completedToday}`} compact />
          <StatBox label="未完成" value={`${summary.openCount}`} compact />
          <StatBox label="耗时" value={formatDurationCompact(summary.totalElapsedSeconds)} compact />
        </View>
        <View style={styles.separator} />
        <View style={styles.reviewLists}>
          <ReviewList title="今天做的" tasks={todayDoneTasks} compact maxRows={fit.listRows} />
          <ReviewList title="今天没做的" tasks={todayOpenTasks} compact maxRows={fit.listRows} />
          <ReviewList title="明天要做的" tasks={tomorrowTasks} compact maxRows={fit.listRows} />
          <ReviewList title="过去未做的" tasks={pastOpenTasks} compact maxRows={fit.listRows} />
        </View>
      </View>
    </View>
  );
}

function getReviewFitMetrics(height: number) {
  const usableHeight = Math.max(540, height - 20);
  const compact = usableHeight < 720;
  const gap = compact ? 7 : 9;
  const heroHeight = Math.round(usableHeight * (compact ? 0.2 : 0.215));
  const panelHeight = usableHeight - heroHeight - gap - 14;

  return {
    compact,
    gap,
    pageX: compact ? 10 : 12,
    heroHeight,
    panelHeight,
    heroPadding: compact ? 14 : 16,
    panelPadding: compact ? 12 : 14,
    listRows: compact ? 3 : 4,
    statHeight: compact ? 52 : 58,
    titleBottom: compact ? 8 : 10,
    ghostTop: Math.round(heroHeight * (compact ? 0.34 : 0.36)),
    ghostSize: compact ? 64 : 74,
  };
}

function StatBox({ label, value, compact }: { label: string; value: string; compact?: boolean }) {
  return (
    <View style={[styles.statBox, compact && styles.statBoxCompact]}>
      <Text style={[styles.statLabel, compact && styles.statLabelCompact]}>{label}</Text>
      <Text style={[styles.statValue, compact && styles.statValueCompact]} selectable>
        {value}
      </Text>
    </View>
  );
}

function ReviewList({ title, tasks, compact, maxRows = 4 }: { title: string; tasks: Task[]; compact?: boolean; maxRows?: number }) {
  const visibleTasks = tasks.slice(0, maxRows);
  return (
    <View style={[styles.reviewList, compact && styles.reviewListCompact]}>
      <View style={styles.reviewListHead}>
        <Text style={[styles.reviewListTitle, compact && styles.reviewListTitleCompact]}>{title}</Text>
        <View style={styles.smallBullet} />
      </View>
      {visibleTasks.map((task, index) => (
        <View key={task.id} style={styles.reviewTaskRow}>
          <Text style={styles.reviewTaskIndex}>{index + 1}</Text>
          <Text style={[styles.reviewTaskTitle, compact && styles.reviewTaskTitleCompact]} numberOfLines={1}>
            {task.title}
          </Text>
        </View>
      ))}
      <View style={styles.placeholderStack}>
        {Array.from({ length: Math.max(3, maxRows - visibleTasks.length) }, (_, index) => (
          <View key={`empty-${index}`} style={styles.placeholderLine} />
        ))}
      </View>
    </View>
  );
}

function DetailModal({
  quadrant,
  onClose,
  onAddTask,
  onEditTask,
}: {
  quadrant: Quadrant | null;
  onClose: () => void;
  onAddTask: (quadrant: Quadrant) => void;
  onEditTask: (task: Task) => void;
}) {
  const { tasks, selectedEpochDay, toggleTask, toggleTaskTimer, deleteTask } = useTaskStore();
  const today = localEpochDay();
  const visibleTasks = quadrant ? tasksForDate(tasks, selectedEpochDay, today).filter((task) => task.quadrant === quadrant) : [];
  const openTasks = visibleTasks.filter((task) => !task.completed);
  const doneTasks = visibleTasks.filter((task) => task.completed);

  return (
    <Modal visible={quadrant !== null} animationType="slide" onRequestClose={onClose}>
      {quadrant ? (
        <SafeScreen>
          <View style={styles.detailTop}>
            <Pressable onPress={onClose} style={styles.iconButton}>
              <Text style={styles.iconText}>‹</Text>
            </Pressable>
            <View>
              <Text style={styles.detailKicker}>LIST</Text>
              <Text style={styles.detailTitle}>{quadrantMeta[quadrant].title}</Text>
            </View>
            <View style={styles.detailTopSpacer} />
          </View>
          <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.detailContent}>
            <TaskSection
              title="OPEN TASKS"
              count={openTasks.length}
              tasks={openTasks}
              onToggleTask={toggleTask}
              onToggleTimer={toggleTaskTimer}
              onEdit={onEditTask}
              onDelete={deleteTask}
            />
            {doneTasks.length > 0 ? (
              <TaskSection
                title="DONE"
                count={doneTasks.length}
                tasks={doneTasks}
                onToggleTask={toggleTask}
                onToggleTimer={toggleTaskTimer}
                onEdit={onEditTask}
                onDelete={deleteTask}
              />
            ) : null}
          </ScrollView>
          <Pressable onPress={() => onAddTask(quadrant)} style={styles.detailFab}>
            <Text style={styles.detailFabText}>+</Text>
          </Pressable>
        </SafeScreen>
      ) : null}
    </Modal>
  );
}

function SafeScreen({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return <View style={[styles.safeScreen, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>{children}</View>;
}

function TaskSection({
  title,
  count,
  tasks,
  onToggleTask,
  onToggleTimer,
  onEdit,
  onDelete,
}: {
  title: string;
  count: number;
  tasks: Task[];
  onToggleTask: (taskId: string) => Promise<void>;
  onToggleTimer: (taskId: string) => Promise<void>;
  onEdit: (task: Task) => void;
  onDelete: (taskId: string) => Promise<void>;
}) {
  return (
    <View style={styles.taskSection}>
      <View style={styles.taskSectionHead}>
        <Text style={styles.taskSectionTitle}>{title}</Text>
        <Text style={[styles.taskSectionCount, title === 'OPEN TASKS' && styles.redText]}>{count}</Text>
      </View>
      {tasks.map((task) => (
        <TaskCard
          key={task.id}
          task={task}
          onToggleTask={() => onToggleTask(task.id)}
          onToggleTimer={() => onToggleTimer(task.id)}
          onEdit={() => onEdit(task)}
          onDelete={() => onDelete(task.id)}
        />
      ))}
    </View>
  );
}

function TaskCard({
  task,
  onToggleTask,
  onToggleTimer,
  onEdit,
  onDelete,
}: {
  task: Task;
  onToggleTask: () => void;
  onToggleTimer: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { elapsedForTask } = useTaskStore();
  const elapsed = elapsedForTask(task);
  const running = task.timerStartedAtMillis !== null;
  const [showActions, setShowActions] = React.useState(false);

  const revealActions = () => {
    if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync();
    setShowActions(true);
  };

  const handleEdit = () => {
    if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync();
    setShowActions(false);
    onEdit();
  };

  const handleDelete = () => {
    if (process.env.EXPO_OS === 'ios') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setShowActions(false);
    onDelete();
  };

  return (
    <Pressable style={[styles.taskCard, showActions && styles.taskCardActive]} delayLongPress={320} onLongPress={revealActions} onPress={() => showActions && setShowActions(false)}>
        <Pressable style={[styles.radio, task.completed && styles.radioDone]} onPress={onToggleTask}>
          {task.completed ? <View style={styles.radioHole} /> : null}
        </Pressable>
        <View style={styles.taskBody}>
          <Text style={[styles.taskTitle, task.completed && styles.taskDone]} numberOfLines={1}>
            {task.title}
          </Text>
          <Text style={styles.taskMeta} selectable>
            已记录 {formatDuration(elapsed)}
          </Text>
        </View>
        <View style={styles.taskActions}>
          {showActions ? (
            <View style={styles.taskInlineActions}>
              <Pressable style={[styles.inlineActionButton, styles.inlineEdit]} hitSlop={8} onPress={handleEdit}>
                <Ionicons name="create-outline" size={22} color={CARD} />
              </Pressable>
              <Pressable style={[styles.inlineActionButton, styles.inlineDelete]} hitSlop={8} onPress={handleDelete}>
                <Ionicons name="trash-outline" size={22} color={CARD} />
              </Pressable>
            </View>
          ) : !task.completed ? (
            <Pressable style={[styles.timerButton, running && styles.timerButtonActive]} onPress={onToggleTimer}>
              <Text style={[styles.timerText, running && styles.timerTextActive]}>{running ? 'PAUSE' : 'START'}</Text>
            </Pressable>
          ) : (
            <View style={styles.doneBadge}>
              <Text style={styles.doneTime}>{formatDuration(elapsed)}</Text>
              <Text style={styles.doneLabel}>DONE</Text>
            </View>
          )}
        </View>
    </Pressable>
  );
}

function TaskFormModal({
  visible,
  task,
  initialQuadrant,
  onClose,
}: {
  visible: boolean;
  task: Task | null;
  initialQuadrant: Quadrant;
  onClose: () => void;
}) {
  const { addTask, updateTask, selectedEpochDay } = useTaskStore();
  const [sheet, setSheet] = React.useState<'quadrant' | 'date' | 'time' | 'repeat' | 'reminder' | null>(null);
  const [draft, setDraft] = React.useState<TaskDraft>(() => defaultDraft(initialQuadrant, selectedEpochDay));

  React.useEffect(() => {
    if (!visible) return;
    setDraft(task ? draftFromTask(task) : defaultDraft(initialQuadrant, selectedEpochDay));
  }, [initialQuadrant, selectedEpochDay, task, visible]);

  const saveDisabled = draft.title.trim().length === 0;
  const save = async () => {
    if (saveDisabled) return;
    const ok = task ? await updateTask(task.id, draft) : await addTask(draft);
    if (ok) onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeScreen>
        <KeyboardAvoidingView behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined} style={styles.formScreen}>
          <View style={styles.formTop}>
            <Pressable onPress={onClose} style={styles.iconButton}>
              <Text style={styles.iconText}>‹</Text>
            </Pressable>
            <Text style={styles.formTitle}>{task ? '编辑任务' : '新建任务'}</Text>
            <Pressable onPress={save} style={[styles.saveMini, saveDisabled && styles.saveMiniDisabled]}>
              <Text style={styles.saveMiniText}>保存</Text>
            </Pressable>
          </View>
          <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.formContent}>
            <TextInput
              value={draft.title}
              onChangeText={(title) => setDraft((current) => ({ ...current, title }))}
              placeholder="添加事项名称"
              placeholderTextColor="#a5a8ad"
              style={styles.titleInput}
            />
            <View style={styles.formCard}>
              <OptionRow label="象限" value={quadrantMeta[draft.quadrant].title} accent={quadrantMeta[draft.quadrant].accent} onPress={() => setSheet('quadrant')} />
              <OptionRow label="日期" value={draft.dueDateEpochDay === null ? '无' : formatChineseDate(draft.dueDateEpochDay)} onPress={() => setSheet('date')} />
              <OptionRow
                label="时间"
                value={draft.startMinuteOfDay === null ? '无' : formatMinuteOfDay(draft.startMinuteOfDay)}
                onPress={() => setSheet('time')}
              />
              <OptionRow label="重复" value={repeatLabels[draft.repeatRule]} onPress={() => setSheet('repeat')} />
              <OptionRow
                label="提醒"
                value={draft.reminderEnabled && draft.endMinuteOfDay !== null ? formatMinuteOfDay(draft.endMinuteOfDay) : '无'}
                onPress={() => setSheet('reminder')}
                last
              />
            </View>
          </ScrollView>
          <Pressable style={[styles.saveButton, saveDisabled && styles.saveButtonDisabled]} onPress={save}>
            <Text style={styles.saveButtonText}>保存任务</Text>
          </Pressable>
        </KeyboardAvoidingView>
        <PickerSheet sheet={sheet} draft={draft} setDraft={setDraft} onClose={() => setSheet(null)} />
      </SafeScreen>
    </Modal>
  );
}

function TaskDetailModal({ task, onClose }: { task: Task | null; onClose: () => void }) {
  const { updateTask } = useTaskStore();
  const [note, setNote] = React.useState('');

  React.useEffect(() => {
    if (task) setNote(task.note);
  }, [task]);

  const closeAndSave = async () => {
    if (!task) {
      onClose();
      return;
    }
    if (note !== task.note) {
      await updateTask(task.id, { ...draftFromTask(task), note });
    }
    onClose();
  };

  return (
    <Modal visible={task !== null} animationType="slide" onRequestClose={closeAndSave}>
      {task ? (
        <SafeScreen>
          <KeyboardAvoidingView behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined} style={styles.formScreen}>
            <View style={styles.formTop}>
              <Pressable onPress={closeAndSave} style={styles.iconButton}>
                <Text style={styles.iconText}>‹</Text>
              </Pressable>
              <Text style={styles.formTitle}>任务详情</Text>
              <View style={styles.detailTopSpacer} />
            </View>
            <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.taskDetailContent}>
              <View style={styles.taskDetailHeader}>
                <Text style={styles.taskDetailTitle} numberOfLines={3}>
                  {task.title}
                </Text>
                <Text style={styles.taskDetailMeta}>
                  {quadrantMeta[task.quadrant].title} · {task.dueDateEpochDay === null ? '无日期' : formatChineseDate(task.dueDateEpochDay)}
                </Text>
              </View>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="写任务详情"
                placeholderTextColor="#a5a8ad"
                multiline
                textAlignVertical="top"
                style={styles.taskDetailInput}
              />
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeScreen>
      ) : null}
    </Modal>
  );
}

function defaultDraft(quadrant: Quadrant, day: number): TaskDraft {
  return {
    title: '',
    quadrant,
    dueDateEpochDay: day,
    repeatRule: RepeatRule.NONE,
    startMinuteOfDay: null,
    endMinuteOfDay: null,
    reminderEnabled: false,
    note: '',
  };
}

function draftFromTask(task: Task): TaskDraft {
  return {
    title: task.title,
    quadrant: task.quadrant,
    dueDateEpochDay: task.dueDateEpochDay,
    repeatRule: task.repeatRule,
    startMinuteOfDay: task.startMinuteOfDay,
    endMinuteOfDay: task.endMinuteOfDay,
    reminderEnabled: task.reminderEnabled,
    note: task.note,
  };
}

function OptionRow({
  label,
  value,
  accent,
  onPress,
  last,
}: {
  label: string;
  value: string;
  accent?: string;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <Pressable style={[styles.optionRow, last && styles.optionLast]} onPress={onPress}>
      <View style={styles.optionLabelWrap}>
        {accent ? <View style={[styles.bullet, { backgroundColor: accent }]} /> : null}
        <Text style={styles.optionLabel}>{label}</Text>
      </View>
      <View style={styles.optionRight}>
        <Text style={[styles.optionValue, accent === RED && styles.redText]} numberOfLines={1}>
          {value}
        </Text>
        <Text style={styles.chevron}>›</Text>
      </View>
    </Pressable>
  );
}

function PickerSheet({
  sheet,
  draft,
  setDraft,
  onClose,
}: {
  sheet: 'quadrant' | 'date' | 'time' | 'repeat' | 'reminder' | null;
  draft: TaskDraft;
  setDraft: React.Dispatch<React.SetStateAction<TaskDraft>>;
  onClose: () => void;
}) {
  const [month, setMonth] = React.useState(() => draft.dueDateEpochDay ?? localEpochDay());
  React.useEffect(() => setMonth(draft.dueDateEpochDay ?? localEpochDay()), [draft.dueDateEpochDay, sheet]);

  return (
    <BottomSheet visible={sheet !== null} onClose={onClose}>
      {sheet === 'quadrant' ? (
        <SheetOptions
          options={quadrantOrder.map((quadrant) => ({ label: quadrantMeta[quadrant].title, value: quadrant }))}
          selected={draft.quadrant}
          onPick={(quadrant) => {
            setDraft((current) => ({ ...current, quadrant: quadrant as Quadrant }));
            onClose();
          }}
        />
      ) : null}
      {sheet === 'repeat' ? (
        <SheetOptions
          options={Object.values(RepeatRule).map((rule) => ({ label: repeatLabels[rule], value: rule }))}
          selected={draft.repeatRule}
          onPick={(rule) => {
            setDraft((current) => ({ ...current, repeatRule: rule as RepeatRule }));
            onClose();
          }}
        />
      ) : null}
      {sheet === 'time' ? (
        <TimeWheelSheet
          draft={draft}
          setDraft={setDraft}
          onClear={() => {
            setDraft((current) => ({ ...current, startMinuteOfDay: null }));
            onClose();
          }}
          onDone={onClose}
        />
      ) : null}
      {sheet === 'reminder' ? (
        <ReminderWheelSheet
          minute={draft.endMinuteOfDay}
          enabled={draft.reminderEnabled}
          setDraft={setDraft}
          onClear={() => {
            setDraft((current) => ({ ...current, reminderEnabled: false }));
            onClose();
          }}
          onDone={onClose}
        />
      ) : null}
      {sheet === 'date' ? (
        <MonthGrid
          month={month}
          selectedDay={draft.dueDateEpochDay}
          onPrev={() => setMonth((current) => addMonths(current, -1))}
          onNext={() => setMonth((current) => addMonths(current, 1))}
          onPick={(day) => {
            setDraft((current) => ({ ...current, dueDateEpochDay: day }));
            onClose();
          }}
        />
      ) : null}
    </BottomSheet>
  );
}

function TimeWheelSheet({
  draft,
  setDraft,
  onClear,
  onDone,
}: {
  draft: TaskDraft;
  setDraft: React.Dispatch<React.SetStateAction<TaskDraft>>;
  onClear: () => void;
  onDone: () => void;
}) {
  const startMinute = draft.startMinuteOfDay ?? 540;

  const updateStart = (date?: Date) => {
    if (!date) return;
    const nextStart = clockDateToMinute(date);
    setDraft((current) => ({ ...current, startMinuteOfDay: nextStart }));
  };

  return (
    <View style={styles.wheelSheet}>
      <View style={styles.wheelTop}>
        <Pressable onPress={onClear} style={styles.wheelGhostButton}>
          <Text style={styles.wheelGhostText}>无时间</Text>
        </Pressable>
        <Text style={styles.wheelTitle}>选择时间</Text>
        <Pressable onPress={onDone} style={styles.wheelDoneButton}>
          <Text style={styles.wheelDoneText}>完成</Text>
        </Pressable>
      </View>
      <View style={styles.singleTimeWheelWrap}>
        <Text style={styles.timeWheelLabel}>开始时间</Text>
        <DateTimePicker value={minuteToClockDate(startMinute)} mode="time" display="spinner" minuteInterval={1} textColor={INK} style={styles.clockWheelWide} onChange={(_, date) => updateStart(date)} />
      </View>
    </View>
  );
}

function ReminderWheelSheet({
  minute,
  enabled,
  setDraft,
  onClear,
  onDone,
}: {
  minute: number | null;
  enabled: boolean;
  setDraft: React.Dispatch<React.SetStateAction<TaskDraft>>;
  onClear: () => void;
  onDone: () => void;
}) {
  const reminderMinute = enabled ? minute ?? 540 : minute ?? 540;

  const updateReminder = (date?: Date) => {
    if (!date) return;
    const nextMinute = clockDateToMinute(date);
    setDraft((current) => ({ ...current, endMinuteOfDay: nextMinute, reminderEnabled: true }));
  };

  return (
    <View style={styles.wheelSheet}>
      <View style={styles.wheelTop}>
        <Pressable onPress={onClear} style={styles.wheelGhostButton}>
          <Text style={styles.wheelGhostText}>关闭提醒</Text>
        </Pressable>
        <Text style={styles.wheelTitle}>提醒时间</Text>
        <Pressable onPress={onDone} style={styles.wheelDoneButton}>
          <Text style={styles.wheelDoneText}>完成</Text>
        </Pressable>
      </View>
      <View style={styles.reminderWheelWrap}>
        <DateTimePicker value={minuteToClockDate(reminderMinute)} mode="time" display="spinner" minuteInterval={1} textColor={INK} style={styles.clockWheelWide} onChange={(_, date) => updateReminder(date)} />
      </View>
    </View>
  );
}

function SheetOptions({
  options,
  selected,
  onPick,
}: {
  options: { label: string; value: string }[];
  selected: string;
  onPick: (value: string) => void;
}) {
  return (
    <View style={styles.sheetOptions}>
      {options.map((option) => (
        <Pressable key={option.value} style={styles.sheetOption} onPress={() => onPick(option.value)}>
          <Text style={styles.sheetOptionText}>{option.label}</Text>
          {option.value === selected ? <Text style={styles.sheetCheck}>✓</Text> : null}
        </Pressable>
      ))}
    </View>
  );
}

function MonthCalendarSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { selectedEpochDay, pickDate } = useTaskStore();
  const [month, setMonth] = React.useState(selectedEpochDay);
  React.useEffect(() => setMonth(selectedEpochDay), [selectedEpochDay, visible]);

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <MonthGrid
        month={month}
        selectedDay={selectedEpochDay}
        onPrev={() => setMonth((current) => addMonths(current, -1))}
        onNext={() => setMonth((current) => addMonths(current, 1))}
        onPick={(day) => {
          pickDate(day);
          onClose();
        }}
      />
    </BottomSheet>
  );
}

function MonthGrid({
  month,
  selectedDay,
  onPrev,
  onNext,
  onPick,
}: {
  month: number;
  selectedDay: number | null;
  onPrev: () => void;
  onNext: () => void;
  onPick: (day: number) => void;
}) {
  const today = localEpochDay();
  const { width } = useWindowDimensions();
  const monthParts = dateParts(month);
  const days = monthCalendarDays(month);
  const gridWidth = Math.min(360, width - 44);
  const dayGap = 4;
  const cellSize = Math.floor((gridWidth - dayGap * 6) / 7);
  return (
    <View style={[styles.monthGridWrap, { width: gridWidth }]}>
      <View style={styles.monthHead}>
        <Pressable onPress={onPrev} style={styles.monthButton}>
          <Text style={styles.monthButtonText}>‹</Text>
        </Pressable>
        <Text style={styles.monthTitle}>{monthParts.year}年{monthParts.month}月</Text>
        <Pressable onPress={onNext} style={styles.monthButton}>
          <Text style={styles.monthButtonText}>›</Text>
        </Pressable>
      </View>
      <View style={[styles.monthWeekRow, { gap: dayGap }]}>
        {'一二三四五六日'.split('').map((label) => (
          <Text key={label} style={[styles.monthWeekText, { width: cellSize }]}>{label}</Text>
        ))}
      </View>
      <View style={[styles.monthDays, { gap: dayGap }]}>
        {days.map((day) => {
          const parts = dateParts(day);
          const selected = day === selectedDay;
          const inMonth = parts.month === monthParts.month;
          return (
            <Pressable key={day} style={[styles.monthDay, { width: cellSize, height: cellSize }]} onPress={() => onPick(day)}>
              <Text
                style={[
                  styles.monthDayText,
                  selected && styles.monthDaySelected,
                  !inMonth && styles.fadeText,
                  day === today && styles.redText,
                  selected && styles.monthDayTextSelected,
                ]}>
                {parts.day}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function BottomSheet({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetOverlay} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]} onPress={() => undefined}>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: PAPER },
  fitPage: { height: '100%', paddingBottom: 18 },
  pageContent: { paddingHorizontal: 22, paddingBottom: 48, gap: 14 },
  heroCard: { backgroundColor: CARD, borderRadius: 18, overflow: 'hidden' },
  heroTop: { minHeight: 30, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  redRule: { width: 64, height: 5, borderRadius: 3, backgroundColor: RED },
  sideLabel: { color: '#b7b7b7', fontSize: 16, fontWeight: '800', textAlign: 'right' },
  heroDateBlock: { gap: 3, marginTop: 'auto', marginBottom: 9 },
  heroTitle: { color: INK, fontSize: 46, fontWeight: '900', letterSpacing: 0 },
  heroSubtitle: { color: MUTED, fontSize: 18, fontWeight: '800' },
  dateStrip: { flexGrow: 0, paddingBottom: 6 },
  dateStripContent: { paddingBottom: 2 },
  weekPage: { flexDirection: 'row' },
  dayPill: { width: 50, minHeight: 64, borderRadius: 10, backgroundColor: '#f4f4f3', alignItems: 'center', justifyContent: 'center', gap: 3 },
  dayPillCompact: { width: 44, minHeight: 52, gap: 2 },
  dayPillSelected: { backgroundColor: INK },
  weekdayText: { color: '#696d75', fontSize: 14, fontWeight: '900' },
  weekdayTextCompact: { fontSize: 12 },
  dayText: { color: INK, fontSize: 24, fontWeight: '900', fontVariant: ['tabular-nums'] },
  dayTextCompact: { fontSize: 20 },
  dayTextSelected: { color: CARD },
  todayDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: 'transparent' },
  matrixPanel: { backgroundColor: CARD, borderRadius: 18 },
  matrixGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  quadrantCard: { width: '48.8%', borderRadius: 8, backgroundColor: '#f4f4f3' },
  quadrantUrgent: { backgroundColor: '#fff0f1' },
  quadrantHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bullet: { width: 10, height: 10, borderRadius: 5, backgroundColor: INK },
  smallBullet: { width: 9, height: 9, borderRadius: 5, backgroundColor: INK },
  quadrantTitle: { color: INK, fontSize: 24, fontWeight: '900' },
  quadrantAction: { color: MUTED, fontSize: 15, fontWeight: '700', marginTop: 6 },
  quadrantTasks: { flex: 1, justifyContent: 'center', gap: 8 },
  quadrantTaskRow: { minHeight: 24, flexDirection: 'row', alignItems: 'center', gap: 7 },
  quadrantTaskRowHidden: { opacity: 0 },
  quadrantTaskCheckWrap: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  quadrantTaskCheck: { width: 13, height: 13, borderRadius: 7, borderWidth: 2, backgroundColor: CARD },
  quadrantTaskPressArea: { flex: 1, minHeight: 26, justifyContent: 'center' },
  quadrantTask: { color: INK, fontSize: 19, fontWeight: '800' },
  floatingTaskLayer: { ...StyleSheet.absoluteFillObject, zIndex: 1000, elevation: 1000 },
  floatingTaskRow: {
    position: 'absolute',
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 8,
    backgroundColor: CARD,
    paddingHorizontal: 8,
    shadowColor: INK,
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 10,
  },
  emptyHint: { color: '#a1a4aa', fontSize: 18, fontWeight: '800' },
  quadrantFoot: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  footLabel: { color: MUTED, fontSize: 14, fontWeight: '900' },
  quadrantCount: { color: INK, fontSize: 36, fontWeight: '900', fontVariant: ['tabular-nums'] },
  redText: { color: RED },
  dots: { position: 'absolute', bottom: 18, alignSelf: 'center', flexDirection: 'row', gap: 8, alignItems: 'center' },
  dotActive: { width: 36, height: 10, borderRadius: 5, backgroundColor: INK },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#d5d6d3' },
  reviewHero: { backgroundColor: CARD, borderRadius: 18, overflow: 'hidden' },
  reviewBookmark: { position: 'absolute', left: 22, top: 22, width: 78, height: 4, borderRadius: 2, backgroundColor: RED },
  reviewGhostWrap: { position: 'absolute', left: 18, right: -12, height: 82, overflow: 'hidden' },
  reviewGhostWord: { color: '#ececea', fontWeight: '900', lineHeight: 78, letterSpacing: 0, opacity: 0.78 },
  reviewSide: { position: 'absolute', right: 24, top: 30, color: '#b9babd', fontSize: 16, fontWeight: '900', textAlign: 'center' },
  reviewTitleBlock: { position: 'absolute', left: 20, right: 20 },
  reviewTitle: { color: INK, fontSize: 36, fontWeight: '900' },
  reviewSubtitle: { color: MUTED, fontSize: 18, fontWeight: '800', marginTop: 10 },
  reviewPanel: { backgroundColor: CARD, borderRadius: 18 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { color: INK, fontSize: 20, fontWeight: '900', letterSpacing: 3 },
  sectionTitleCompact: { fontSize: 14, letterSpacing: 2 },
  sectionNeedle: { width: 34, height: 3, borderRadius: 2, backgroundColor: RED, marginTop: 7 },
  checkMark: { color: INK, fontSize: 34, fontWeight: '900' },
  checkMarkCompact: { fontSize: 22 },
  statRow: { flexDirection: 'row', gap: 10 },
  statBox: { flex: 1, backgroundColor: '#f5f5f4', borderRadius: 8, padding: 14, gap: 20 },
  statBoxCompact: { padding: 8, gap: 4 },
  statLabel: { color: MUTED, fontSize: 16, fontWeight: '800' },
  statLabelCompact: { fontSize: 12 },
  statValue: { color: INK, fontSize: 30, fontWeight: '900', fontVariant: ['tabular-nums'] },
  statValueCompact: { fontSize: 22 },
  separator: { height: 1, backgroundColor: LINE },
  reviewLists: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  reviewList: { width: '48%', height: '48%', minHeight: 0, borderRadius: 8, backgroundColor: '#f5f5f4', padding: 14, gap: 12, overflow: 'hidden' },
  reviewListCompact: { padding: 10, gap: 7 },
  reviewListHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reviewListTitle: { color: INK, fontSize: 22, fontWeight: '900' },
  reviewListTitleCompact: { fontSize: 16 },
  reviewTaskRow: { minHeight: 23, flexDirection: 'row', gap: 10, alignItems: 'center' },
  reviewTaskIndex: { color: '#aaaeb5', fontSize: 13, fontWeight: '900', fontVariant: ['tabular-nums'] },
  reviewTaskTitle: { flex: 1, color: MUTED, fontSize: 18, fontWeight: '800' },
  reviewTaskTitleCompact: { fontSize: 13 },
  placeholderStack: { flex: 1, justifyContent: 'space-evenly', paddingTop: 10, paddingBottom: 8 },
  placeholderLine: { height: 1, backgroundColor: '#e2e2df' },
  safeScreen: { flex: 1, backgroundColor: PAPER, paddingHorizontal: 20 },
  detailTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  detailTopSpacer: { width: 38, height: 38 },
  iconButton: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: CARD },
  iconText: { color: INK, fontSize: 30, fontWeight: '500', marginTop: -2 },
  detailKicker: { color: '#a3a4a8', fontSize: 12, fontWeight: '900', letterSpacing: 4, textAlign: 'center' },
  detailTitle: { color: INK, fontSize: 28, fontWeight: '900', textAlign: 'center' },
  detailFab: { position: 'absolute', alignSelf: 'center', bottom: 70, width: 82, height: 82, borderRadius: 41, backgroundColor: RED, alignItems: 'center', justifyContent: 'center' },
  detailFabText: { color: CARD, fontSize: 50, fontWeight: '300', lineHeight: 58, marginTop: -5 },
  detailContent: { gap: 16, paddingBottom: 138 },
  taskSection: { gap: 8 },
  taskSectionHead: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 },
  taskSectionTitle: { color: '#8f9298', fontSize: 13, fontWeight: '900', letterSpacing: 3 },
  taskSectionCount: { color: MUTED, fontSize: 14, fontWeight: '900' },
  taskCard: { minHeight: 64, borderRadius: 10, backgroundColor: CARD, paddingHorizontal: 10, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  taskCardActive: { backgroundColor: '#fbfbfa', borderWidth: 1, borderColor: '#ececea' },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#d8dadd', alignItems: 'center', justifyContent: 'center' },
  radioDone: { backgroundColor: RED, borderColor: RED },
  radioHole: { width: 9, height: 9, borderRadius: 5, backgroundColor: CARD },
  taskBody: { flex: 1, gap: 2 },
  taskTitle: { color: INK, fontSize: 17, fontWeight: '900' },
  taskDone: { color: '#9ca0a8', textDecorationLine: 'line-through' },
  taskMeta: { color: MUTED, fontSize: 12, fontWeight: '800' },
  taskActions: { alignItems: 'flex-end', gap: 4 },
  taskInlineActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  inlineActionButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  inlineEdit: { backgroundColor: '#a8acb3' },
  inlineDelete: { backgroundColor: RED },
  timerButton: { minWidth: 68, height: 32, borderRadius: 16, backgroundColor: '#f7f7f6', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  timerButtonActive: { backgroundColor: RED },
  timerText: { color: RED, fontSize: 12, fontWeight: '900' },
  timerTextActive: { color: CARD },
  doneBadge: { minWidth: 74, height: 34, borderRadius: 17, backgroundColor: '#f7f7f6', alignItems: 'center', justifyContent: 'center' },
  doneTime: { color: MUTED, fontSize: 13, fontWeight: '900', fontVariant: ['tabular-nums'] },
  doneLabel: { color: '#8f9298', fontSize: 9, fontWeight: '900' },
  formScreen: { flex: 1 },
  formTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  formTitle: { color: INK, fontSize: 23, fontWeight: '900' },
  saveMini: { backgroundColor: INK, borderRadius: 20, paddingHorizontal: 15, paddingVertical: 9 },
  saveMiniDisabled: { backgroundColor: '#d8dad5' },
  saveMiniText: { color: CARD, fontSize: 14, fontWeight: '900' },
  formContent: { paddingTop: 24, gap: 16, paddingBottom: 110 },
  titleInput: { height: 108, borderRadius: 14, backgroundColor: CARD, paddingHorizontal: 18, color: INK, fontSize: 23, fontWeight: '800' },
  taskDetailContent: { paddingTop: 24, gap: 16, paddingBottom: 42 },
  taskDetailHeader: { borderRadius: 14, backgroundColor: CARD, padding: 18, gap: 10 },
  taskDetailTitle: { color: INK, fontSize: 28, fontWeight: '900', lineHeight: 34 },
  taskDetailMeta: { color: MUTED, fontSize: 15, fontWeight: '800' },
  taskDetailInput: {
    minHeight: 360,
    borderRadius: 14,
    backgroundColor: CARD,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 18,
    color: INK,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 26,
  },
  formCard: { borderRadius: 14, backgroundColor: CARD, paddingHorizontal: 18 },
  optionRow: { minHeight: 76, borderBottomWidth: 1, borderBottomColor: LINE, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  optionLast: { borderBottomWidth: 0 },
  optionLabelWrap: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  optionLabel: { color: INK, fontSize: 23, fontWeight: '900' },
  optionRight: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  optionValue: { color: MUTED, fontSize: 20, fontWeight: '800', flexShrink: 1 },
  chevron: { color: '#b4b7bd', fontSize: 38, fontWeight: '600' },
  saveButton: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 64, borderRadius: 12, backgroundColor: RED, alignItems: 'center', justifyContent: 'center' },
  saveButtonDisabled: { backgroundColor: '#d8dad5' },
  saveButtonText: { color: CARD, fontSize: 22, fontWeight: '900' },
  sheetOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'transparent' },
  sheet: { backgroundColor: CARD, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 16, paddingTop: 16 },
  sheetOptions: { gap: 2 },
  sheetOption: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetOptionText: { color: INK, fontSize: 21, fontWeight: '800' },
  sheetCheck: { color: RED, fontSize: 22, fontWeight: '900' },
  wheelSheet: { gap: 16 },
  wheelTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  wheelTitle: { flex: 1, color: INK, fontSize: 21, fontWeight: '900', textAlign: 'center' },
  wheelGhostButton: { minWidth: 82, minHeight: 38, borderRadius: 19, backgroundColor: '#f4f4f2', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  wheelGhostText: { color: MUTED, fontSize: 14, fontWeight: '900' },
  wheelDoneButton: { minWidth: 64, minHeight: 38, borderRadius: 19, backgroundColor: INK, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  wheelDoneText: { color: CARD, fontSize: 14, fontWeight: '900' },
  singleTimeWheelWrap: { borderRadius: 14, backgroundColor: CARD, overflow: 'hidden', alignItems: 'center', paddingTop: 12 },
  timeWheelLabel: { color: INK, fontSize: 14, fontWeight: '900' },
  clockWheelWide: { backgroundColor: CARD, width: '100%' },
  reminderWheelWrap: { borderRadius: 14, backgroundColor: CARD, overflow: 'hidden', alignItems: 'center', paddingTop: 8 },
  monthGridWrap: { alignSelf: 'center', gap: 10 },
  monthHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#f5f5f4', alignItems: 'center', justifyContent: 'center' },
  monthButtonText: { color: INK, fontSize: 26, fontWeight: '600', marginTop: -2 },
  monthTitle: { color: INK, fontSize: 21, fontWeight: '900' },
  monthWeekRow: { flexDirection: 'row' },
  monthWeekText: { textAlign: 'center', color: MUTED, fontSize: 13, fontWeight: '900' },
  monthDays: { flexDirection: 'row', flexWrap: 'wrap' },
  monthDay: { alignItems: 'center', justifyContent: 'center' },
  monthDaySelected: { width: 34, height: 30, borderRadius: 15, backgroundColor: INK, textAlign: 'center', lineHeight: 30, overflow: 'hidden' },
  monthDayText: { color: INK, fontSize: 17, fontWeight: '800', width: 34, height: 30, textAlign: 'center', lineHeight: 30 },
  monthDayTextSelected: { color: CARD },
  fadeText: { color: '#c6c8cc' },
});
