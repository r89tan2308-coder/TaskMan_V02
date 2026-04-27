import type { AllowedWeekday, Task } from './types';

export const ALL_ALLOWED_WEEKDAYS: AllowedWeekday[] = [1, 2, 3, 4, 5, 6, 7];
export const WEEKDAY_WORKDAYS: AllowedWeekday[] = [1, 2, 3, 4, 5];
export const WEEKDAY_WEEKENDS: AllowedWeekday[] = [6, 7];

export const WEEKDAY_LABELS_SHORT: Record<AllowedWeekday, string> = {
  1: 'Пн',
  2: 'Вт',
  3: 'Ср',
  4: 'Чт',
  5: 'Пт',
  6: 'Сб',
  7: 'Вс'
};

const isAllowedWeekday = (value: number): value is AllowedWeekday => value >= 1 && value <= 7;

export const normalizeAllowedWeekdays = (
  value?: readonly number[] | null
): AllowedWeekday[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const normalized = [...new Set(value.filter(isAllowedWeekday))].sort((left, right) => left - right);
  if (normalized.length === 0 || normalized.length === ALL_ALLOWED_WEEKDAYS.length) {
    return undefined;
  }
  return normalized;
};

export const getIsoWeekday = (date: Date): AllowedWeekday => {
  const day = date.getDay();
  return (day === 0 ? 7 : day) as AllowedWeekday;
};

export const isTaskAllowedOnDate = (
  task: Pick<Task, 'allowedWeekdays'>,
  date: Date
): boolean => {
  const normalized = normalizeAllowedWeekdays(task.allowedWeekdays);
  if (!normalized) return true;
  return normalized.includes(getIsoWeekday(date));
};

const arraysEqual = (left: readonly AllowedWeekday[] | undefined, right: readonly AllowedWeekday[]) => {
  if (!left || left.length !== right.length) return false;
  return right.every((value, index) => left[index] === value);
};

export const formatAllowedWeekdaysLabel = (value?: readonly AllowedWeekday[] | null) => {
  const normalized = normalizeAllowedWeekdays(value);
  if (!normalized) return 'Любой день';
  if (arraysEqual(normalized, WEEKDAY_WORKDAYS)) return 'Будни';
  if (arraysEqual(normalized, WEEKDAY_WEEKENDS)) return 'Выходные';
  return normalized.map((weekday) => WEEKDAY_LABELS_SHORT[weekday]).join(', ');
};
