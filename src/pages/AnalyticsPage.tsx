import { useEffect, useMemo, useState } from 'react';
import { listEvents } from '../db/repositories/ledgerRepo';
import { LedgerEvent } from '../entities/ledger/types';
import { Task } from '../entities/task/types';
import { xpForTask } from '../logic/xp';
import { listTasks } from '../services/tasksService';

type AnalyticsMetric = 'xp' | 'tasks';
type SeriesPoint = { date: Date; value: number };
type PlotPoint = SeriesPoint & { safeValue: number; x: number; y: number };

const pad2 = (value: number) => value.toString().padStart(2, '0');
const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);
const addDays = (date: Date, amount: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
};
const addMonths = (date: Date, amount: number) =>
  new Date(date.getFullYear(), date.getMonth() + amount, 1);

const buildAxis = (maxValue: number, desiredTicks: number) => {
  const safeMax = Math.max(1, Math.ceil(maxValue));
  const steps = Math.max(2, desiredTicks);
  const roughStep = Math.max(1, safeMax / (steps - 1));
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const residual = roughStep / magnitude;
  const niceResidual = residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 5 ? 5 : 10;
  const step = niceResidual * magnitude;
  const axisMax = Math.ceil(safeMax / step) * step;
  const ticks: number[] = [];
  for (let value = axisMax; value >= 0; value -= step) {
    ticks.push(value);
  }
  if (ticks[ticks.length - 1] !== 0) ticks.push(0);
  return { max: axisMax, ticks };
};

const getLocalDateKey = (date: Date) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
const getMonthKey = (date: Date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
const getTaskValue = (task: Task) =>
  typeof task.xpOverride === 'number' ? task.xpOverride : xpForTask(task);

const buildDailySeriesRange = (
  startDate: Date,
  endDate: Date,
  events: LedgerEvent[],
  tasksById: Map<string, Task>,
  metric: AnalyticsMetric
): SeriesPoint[] => {
  const start = startOfDay(startDate);
  const end = startOfDay(endDate);
  const points: SeriesPoint[] = [];
  const index = new Map<string, SeriesPoint>();
  const latestTaskEventByDay = new Map<string, Map<string, LedgerEvent>>();
  const adjustmentByDay = new Map<string, number>();

  let current = new Date(start);
  while (current <= end) {
    const point = { date: new Date(current), value: 0 };
    points.push(point);
    index.set(getLocalDateKey(current), point);
    current = addDays(current, 1);
  }

  for (const event of events) {
    const eventDate = new Date(event.createdAt);
    if (Number.isNaN(eventDate.getTime())) continue;
    const key = getLocalDateKey(eventDate);
    if (!index.has(key)) continue;
    if (event.kind === 'task' && event.taskId) {
      const taskMap = latestTaskEventByDay.get(key) ?? new Map<string, LedgerEvent>();
      const existing = taskMap.get(event.taskId);
      if (!existing || Date.parse(existing.createdAt) < Date.parse(event.createdAt)) {
        taskMap.set(event.taskId, event);
      }
      latestTaskEventByDay.set(key, taskMap);
    } else if (event.kind === 'adjustment') {
      adjustmentByDay.set(key, (adjustmentByDay.get(key) ?? 0) + event.deltaXp);
    }
  }

  for (const point of points) {
    const key = getLocalDateKey(point.date);
    const taskMap = latestTaskEventByDay.get(key);
    if (metric === 'tasks') {
      let count = 0;
      if (taskMap) {
        for (const event of taskMap.values()) {
          if (event.deltaXp <= 0) continue;
          count += 1;
        }
      }
      point.value = count;
      continue;
    }

    let total = adjustmentByDay.get(key) ?? 0;
    if (taskMap) {
      for (const event of taskMap.values()) {
        if (event.deltaXp <= 0) continue;
        const task = event.taskId ? tasksById.get(event.taskId) : undefined;
        if (!task) continue;
        total += getTaskValue(task);
      }
    }
    point.value = total;
  }

  return points;
};

const buildDailySeries = (
  days: number,
  events: LedgerEvent[],
  tasksById: Map<string, Task>,
  metric: AnalyticsMetric
) => {
  const end = startOfDay(new Date());
  const start = addDays(end, -(days - 1));
  return buildDailySeriesRange(start, end, events, tasksById, metric);
};

const buildMonthlySeries = (
  months: number,
  events: LedgerEvent[],
  tasksById: Map<string, Task>,
  metric: AnalyticsMetric
): SeriesPoint[] => {
  const currentMonth = startOfMonth(new Date());
  const startMonth = addMonths(currentMonth, -(months - 1));
  const endMonth = addDays(addMonths(currentMonth, 1), -1);
  const dailySeries = buildDailySeriesRange(startMonth, endMonth, events, tasksById, metric);
  const points: SeriesPoint[] = [];
  const index = new Map<string, SeriesPoint>();

  for (let offset = 0; offset < months; offset += 1) {
    const date = addMonths(startMonth, offset);
    const point = { date, value: 0 };
    points.push(point);
    index.set(getMonthKey(date), point);
  }

  for (const point of dailySeries) {
    const key = getMonthKey(point.date);
    const monthPoint = index.get(key);
    if (monthPoint) {
      monthPoint.value += point.value;
    }
  }

  return points;
};

const buildLinePoints = (series: SeriesPoint[], axisMax: number) => {
  if (series.length === 0) return '';
  const safeMax = Math.max(1, axisMax);
  return series
    .map((point, index) => {
      const ratio = Math.min(1, Math.max(0, toSafeValue(point.value) / safeMax));
      const x = series.length === 1 ? 50 : (index / (series.length - 1)) * 100;
      const y = 100 - ratio * 100;
      return `${x},${y}`;
    })
    .join(' ');
};

const buildAreaPoints = (linePoints: string) =>
  linePoints ? `0,100 ${linePoints} 100,100` : '';

const buildPlotPoints = (series: SeriesPoint[], axisMax: number): PlotPoint[] => {
  const safeMax = Math.max(1, axisMax);
  return series.map((point, index) => {
    const safeValue = toSafeValue(point.value);
    const ratio = Math.min(1, Math.max(0, safeValue / safeMax));
    const x = series.length === 1 ? 50 : (index / (series.length - 1)) * 100;
    const y = 100 - ratio * 100;
    return {
      ...point,
      safeValue,
      x,
      y
    };
  });
};

const formatWeekday = (date: Date) =>
  date.toLocaleDateString('ru-RU', { weekday: 'short' });

const formatMonthDay = (date: Date) => String(date.getDate());

const formatTooltipDate = (date: Date) =>
  `${pad2(date.getDate())}.${pad2(date.getMonth() + 1)}`;
const formatMonthLabel = (date: Date) =>
  date.toLocaleDateString('ru-RU', { month: 'short' });
const formatMonthTooltip = (date: Date) =>
  `${pad2(date.getMonth() + 1)}.${date.getFullYear()}`;

const toSafeValue = (value: number) => (Number.isFinite(value) ? value : 0);

const formatAxisValue = (value: number) => String(Math.round(value));
const formatTaskCount = (value: number) => {
  const rounded = Math.round(value);
  const abs = Math.abs(rounded);
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return `${rounded} задача`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${rounded} задачи`;
  return `${rounded} задач`;
};
const formatMetricValue = (value: number, metric: AnalyticsMetric) =>
  metric === 'xp' ? `${formatAxisValue(value)} XP` : formatTaskCount(value);
const formatMetricTotal = (value: number, metric: AnalyticsMetric) =>
  metric === 'xp' ? `+${formatAxisValue(value)} XP` : formatTaskCount(value);

export function AnalyticsPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<LedgerEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [metric, setMetric] = useState<AnalyticsMetric>('xp');
  const [selectedMonthlyIndex, setSelectedMonthlyIndex] = useState(-1);
  const [selectedQuarterIndex, setSelectedQuarterIndex] = useState(-1);
  const [selectedYearIndex, setSelectedYearIndex] = useState(-1);

  const load = async () => {
    setLoading(true);
    const [tasksData, eventsData] = await Promise.all([listTasks(), listEvents()]);
    setTasks(tasksData);
    setEvents(eventsData);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const tasksById = useMemo(
    () => new Map(tasks.map((task) => [task.id, task])),
    [tasks]
  );

  const weeklySeries = useMemo(
    () => buildDailySeries(7, events, tasksById, metric),
    [events, tasksById, metric]
  );
  const monthlySeries = useMemo(
    () => buildDailySeries(30, events, tasksById, metric),
    [events, tasksById, metric]
  );
  const quarterSeries = useMemo(
    () => buildMonthlySeries(4, events, tasksById, metric),
    [events, tasksById, metric]
  );
  const yearSeries = useMemo(
    () => buildMonthlySeries(12, events, tasksById, metric),
    [events, tasksById, metric]
  );

  const weeklyTotal = useMemo(
    () => weeklySeries.reduce((sum, point) => sum + toSafeValue(point.value), 0),
    [weeklySeries]
  );

  const monthlyTotal = useMemo(
    () => monthlySeries.reduce((sum, point) => sum + toSafeValue(point.value), 0),
    [monthlySeries]
  );
  const quarterTotal = useMemo(
    () => quarterSeries.reduce((sum, point) => sum + toSafeValue(point.value), 0),
    [quarterSeries]
  );
  const yearTotal = useMemo(
    () => yearSeries.reduce((sum, point) => sum + toSafeValue(point.value), 0),
    [yearSeries]
  );

  const weeklyMax = useMemo(
    () =>
      Math.max(
        1,
        ...weeklySeries.map((point) => Math.max(0, toSafeValue(point.value)))
      ),
    [weeklySeries]
  );

  const monthlyMax = useMemo(
    () =>
      Math.max(
        1,
        ...monthlySeries.map((point) => Math.max(0, toSafeValue(point.value)))
      ),
    [monthlySeries]
  );
  const quarterMax = useMemo(
    () =>
      Math.max(
        1,
        ...quarterSeries.map((point) => Math.max(0, toSafeValue(point.value)))
      ),
    [quarterSeries]
  );
  const yearMax = useMemo(
    () =>
      Math.max(
        1,
        ...yearSeries.map((point) => Math.max(0, toSafeValue(point.value)))
      ),
    [yearSeries]
  );

  const weeklyAxis = useMemo(() => buildAxis(weeklyMax, 5), [weeklyMax]);
  const monthlyAxis = useMemo(() => buildAxis(monthlyMax, 5), [monthlyMax]);
  const quarterAxis = useMemo(() => buildAxis(quarterMax, 5), [quarterMax]);
  const yearAxis = useMemo(() => buildAxis(yearMax, 5), [yearMax]);

  const monthlyLinePoints = useMemo(() => {
    return buildLinePoints(monthlySeries, monthlyAxis.max);
  }, [monthlySeries, monthlyAxis.max]);

  const monthlyAreaPoints = useMemo(() => {
    return buildAreaPoints(monthlyLinePoints);
  }, [monthlyLinePoints]);

  const quarterLinePoints = useMemo(
    () => buildLinePoints(quarterSeries, quarterAxis.max),
    [quarterSeries, quarterAxis.max]
  );
  const quarterAreaPoints = useMemo(
    () => buildAreaPoints(quarterLinePoints),
    [quarterLinePoints]
  );

  const yearLinePoints = useMemo(
    () => buildLinePoints(yearSeries, yearAxis.max),
    [yearSeries, yearAxis.max]
  );
  const yearAreaPoints = useMemo(() => buildAreaPoints(yearLinePoints), [yearLinePoints]);

  const monthlyPlotPoints = useMemo(
    () => buildPlotPoints(monthlySeries, monthlyAxis.max),
    [monthlySeries, monthlyAxis.max]
  );
  const quarterPlotPoints = useMemo(
    () => buildPlotPoints(quarterSeries, quarterAxis.max),
    [quarterSeries, quarterAxis.max]
  );
  const yearPlotPoints = useMemo(
    () => buildPlotPoints(yearSeries, yearAxis.max),
    [yearSeries, yearAxis.max]
  );

  useEffect(() => {
    if (!monthlyPlotPoints.length) {
      setSelectedMonthlyIndex(-1);
      return;
    }
    setSelectedMonthlyIndex((prev) =>
      prev >= 0 && prev < monthlyPlotPoints.length ? prev : monthlyPlotPoints.length - 1
    );
  }, [monthlyPlotPoints.length]);

  useEffect(() => {
    if (!quarterPlotPoints.length) {
      setSelectedQuarterIndex(-1);
      return;
    }
    setSelectedQuarterIndex((prev) =>
      prev >= 0 && prev < quarterPlotPoints.length ? prev : quarterPlotPoints.length - 1
    );
  }, [quarterPlotPoints.length]);

  useEffect(() => {
    if (!yearPlotPoints.length) {
      setSelectedYearIndex(-1);
      return;
    }
    setSelectedYearIndex((prev) =>
      prev >= 0 && prev < yearPlotPoints.length ? prev : yearPlotPoints.length - 1
    );
  }, [yearPlotPoints.length]);

  const monthlyActiveIndex = monthlyPlotPoints.length
    ? Math.min(Math.max(selectedMonthlyIndex, 0), monthlyPlotPoints.length - 1)
    : -1;
  const quarterActiveIndex = quarterPlotPoints.length
    ? Math.min(Math.max(selectedQuarterIndex, 0), quarterPlotPoints.length - 1)
    : -1;
  const yearActiveIndex = yearPlotPoints.length
    ? Math.min(Math.max(selectedYearIndex, 0), yearPlotPoints.length - 1)
    : -1;

  const monthlyActivePoint = monthlyActiveIndex >= 0 ? monthlyPlotPoints[monthlyActiveIndex] : null;
  const quarterActivePoint = quarterActiveIndex >= 0 ? quarterPlotPoints[quarterActiveIndex] : null;
  const yearActivePoint = yearActiveIndex >= 0 ? yearPlotPoints[yearActiveIndex] : null;

  const topTasks = useMemo(
    () =>
      [...tasks]
        .map((task) => ({ task, value: getTaskValue(task) }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 5),
    [tasks]
  );
  const metricLabel = metric === 'xp' ? 'XP за день' : 'Задач за день';
  const metricTitle = metric === 'xp' ? 'XP' : 'Задачи';

  return (
    <div className="min-h-screen tm-analytics-page">
      <div className="max-w-5xl mx-auto px-2 sm:px-4 py-8 tm-analytics-container">
        <div className="tm-frame tm-reveal tm-analytics-frame space-y-6 p-3 sm:p-6">
          <div className="tm-analytics-toolbar flex flex-wrap items-center justify-between gap-3">
            <h1 className="sr-only">Analytics</h1>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs text-amber-200/80">{metricLabel}</p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setMetric('xp')}
                  className={`tm-button tm-button-sm ${
                    metric === 'xp' ? 'tm-button-gold' : 'tm-button-ghost'
                  }`}
                >
                  XP
                </button>
                <button
                  onClick={() => setMetric('tasks')}
                  className={`tm-button tm-button-sm ${
                    metric === 'tasks' ? 'tm-button-gold' : 'tm-button-ghost'
                  }`}
                >
                  Задачи
                </button>
              </div>
            </div>
          </div>

          {loading ? (
            <p className="text-amber-200/80">Loading analytics...</p>
          ) : (
            <>
              <section className="tm-analytics-grid grid gap-4 md:grid-cols-2">
                <div className="tm-panel-soft tm-analytics-card space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="tm-label">Week</p>
                    <p className="text-xs text-amber-200/80">
                      {formatMetricTotal(weeklyTotal, metric)}
                    </p>
                  </div>
                  <div className="tm-chart-with-axis">
                    <div className="tm-chart-axis" aria-hidden="true">
                      {weeklyAxis.ticks.map((tick) => (
                        <span key={`week-axis-${tick}`}>{formatAxisValue(tick)}</span>
                      ))}
                    </div>
                    <div className="tm-chart-surface">
                      <div className="tm-chart-grid" aria-hidden="true">
                        {weeklyAxis.ticks.map((tick) => (
                          <span key={`week-grid-${tick}`} className="tm-chart-grid-line" />
                        ))}
                      </div>
                    <div className="tm-chart">
                      {weeklySeries.map((point) => {
                        const value = toSafeValue(point.value);
                        const height = weeklyAxis.max ? (value / weeklyAxis.max) * 100 : 0;
                        const clampedHeight = Math.min(100, Math.max(0, height));
                        const label = formatWeekday(point.date);
                        const valueLabel = formatMetricValue(value, metric);
                        return (
                          <div
                            key={formatTooltipDate(point.date)}
                            className="tm-chart-bar"
                            tabIndex={0}
                            aria-label={`${formatTooltipDate(point.date)}: ${valueLabel}`}
                          >
                            <div className="tm-chart-track">
                              <div className="tm-chart-fill" style={{ height: `${clampedHeight}%` }} />
                            </div>
                            <span className="tm-chart-value">{valueLabel}</span>
                            <span className="tm-chart-label">{label}</span>
                          </div>
                        );
                      })}
                    </div>
                    </div>
                  </div>
                </div>
                <div className="tm-panel-soft tm-analytics-card space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="tm-label">Month</p>
                    <p className="text-xs text-amber-200/80">
                      {formatMetricTotal(monthlyTotal, metric)}
                    </p>
                  </div>
                  <div className="tm-chart-grid-layout">
                    <div className="tm-chart-axis" aria-hidden="true">
                      {monthlyAxis.ticks.map((tick) => (
                        <span key={`month-axis-${tick}`}>{formatAxisValue(tick)}</span>
                      ))}
                    </div>
                    <div className="tm-line-chart" aria-label={`${metricTitle} · месяц`}>
                      <div className="tm-chart-grid" aria-hidden="true">
                        {monthlyAxis.ticks.map((tick) => (
                          <span key={`month-grid-${tick}`} className="tm-chart-grid-line" />
                        ))}
                      </div>
                      <svg
                        className="tm-line-chart-svg"
                        viewBox="0 0 100 100"
                        preserveAspectRatio="none"
                        aria-hidden="true"
                      >
                        {monthlyAreaPoints ? (
                          <polygon points={monthlyAreaPoints} className="tm-line-chart-area" />
                        ) : null}
                        {monthlyLinePoints ? (
                          <polyline points={monthlyLinePoints} className="tm-line-chart-line" />
                        ) : null}
                        {monthlyActivePoint ? (
                          <line
                            x1={monthlyActivePoint.x}
                            x2={monthlyActivePoint.x}
                            y1={monthlyActivePoint.y}
                            y2={100}
                            className="tm-line-chart-guide"
                          />
                        ) : null}
                        {monthlyPlotPoints.map((point, index) => {
                          const valueLabel = formatMetricValue(point.safeValue, metric);
                          return (
                            <g key={formatTooltipDate(point.date)}>
                              <circle
                                cx={point.x}
                                cy={point.y}
                                r={2.8}
                                className="tm-line-chart-hit"
                                role="button"
                                tabIndex={0}
                                aria-label={`${formatTooltipDate(point.date)}: ${valueLabel}`}
                                onMouseEnter={() => setSelectedMonthlyIndex(index)}
                                onFocus={() => setSelectedMonthlyIndex(index)}
                                onClick={() => setSelectedMonthlyIndex(index)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    setSelectedMonthlyIndex(index);
                                  }
                                }}
                              />
                              <circle
                                cx={point.x}
                                cy={point.y}
                                r={index === monthlyActiveIndex ? 1.55 : 1.05}
                                className={`tm-line-chart-dot${
                                  index === monthlyActiveIndex ? ' tm-line-chart-dot-active' : ''
                                }`}
                              />
                              <title>{`${formatTooltipDate(point.date)}: ${valueLabel}`}</title>
                            </g>
                          );
                        })}
                      </svg>
                    </div>
                    {monthlyActivePoint ? (
                      <div className="tm-line-chart-selected" role="status" aria-live="polite">
                        <span>{formatTooltipDate(monthlyActivePoint.date)}</span>
                        <strong>{formatMetricValue(monthlyActivePoint.safeValue, metric)}</strong>
                      </div>
                    ) : null}
                    <div className="tm-line-chart-labels">
                      {monthlySeries.map((point, index) => {
                        const label = formatMonthDay(point.date);
                        const showLabel = index % 5 === 0 || index === monthlySeries.length - 1;
                        const value = toSafeValue(point.value);
                        return (
                          <span
                            key={`label-${formatTooltipDate(point.date)}`}
                            className="tm-chart-label tm-line-chart-label"
                            title={`${formatTooltipDate(point.date)}: ${formatMetricValue(
                              value,
                              metric
                            )}`}
                          >
                            {showLabel ? label : ''}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </section>
              <section className="tm-analytics-grid grid gap-4 md:grid-cols-2">
                <div className="tm-panel-soft tm-analytics-card space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="tm-label">Quarter</p>
                    <p className="text-xs text-amber-200/80">
                      {formatMetricTotal(quarterTotal, metric)}
                    </p>
                  </div>
                  <div className="tm-chart-grid-layout">
                    <div className="tm-chart-axis" aria-hidden="true">
                      {quarterAxis.ticks.map((tick) => (
                        <span key={`quarter-axis-${tick}`}>{formatAxisValue(tick)}</span>
                      ))}
                    </div>
                    <div className="tm-line-chart" aria-label={`${metricTitle} · квартал`}>
                      <div className="tm-chart-grid" aria-hidden="true">
                        {quarterAxis.ticks.map((tick) => (
                          <span key={`quarter-grid-${tick}`} className="tm-chart-grid-line" />
                        ))}
                      </div>
                      <svg
                        className="tm-line-chart-svg"
                        viewBox="0 0 100 100"
                        preserveAspectRatio="none"
                        aria-hidden="true"
                      >
                        {quarterAreaPoints ? (
                          <polygon points={quarterAreaPoints} className="tm-line-chart-area" />
                        ) : null}
                        {quarterLinePoints ? (
                          <polyline points={quarterLinePoints} className="tm-line-chart-line" />
                        ) : null}
                        {quarterActivePoint ? (
                          <line
                            x1={quarterActivePoint.x}
                            x2={quarterActivePoint.x}
                            y1={quarterActivePoint.y}
                            y2={100}
                            className="tm-line-chart-guide"
                          />
                        ) : null}
                        {quarterPlotPoints.map((point, index) => {
                          const valueLabel = formatMetricValue(point.safeValue, metric);
                          return (
                            <g key={formatMonthTooltip(point.date)}>
                              <circle
                                cx={point.x}
                                cy={point.y}
                                r={2.8}
                                className="tm-line-chart-hit"
                                role="button"
                                tabIndex={0}
                                aria-label={`${formatMonthTooltip(point.date)}: ${valueLabel}`}
                                onMouseEnter={() => setSelectedQuarterIndex(index)}
                                onFocus={() => setSelectedQuarterIndex(index)}
                                onClick={() => setSelectedQuarterIndex(index)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    setSelectedQuarterIndex(index);
                                  }
                                }}
                              />
                              <circle
                                cx={point.x}
                                cy={point.y}
                                r={index === quarterActiveIndex ? 1.55 : 1.05}
                                className={`tm-line-chart-dot${
                                  index === quarterActiveIndex ? ' tm-line-chart-dot-active' : ''
                                }`}
                              />
                              <title>{`${formatMonthTooltip(point.date)}: ${valueLabel}`}</title>
                            </g>
                          );
                        })}
                      </svg>
                    </div>
                    {quarterActivePoint ? (
                      <div className="tm-line-chart-selected" role="status" aria-live="polite">
                        <span>{formatMonthTooltip(quarterActivePoint.date)}</span>
                        <strong>{formatMetricValue(quarterActivePoint.safeValue, metric)}</strong>
                      </div>
                    ) : null}
                    <div className="tm-line-chart-labels">
                      {quarterSeries.map((point) => {
                        const value = toSafeValue(point.value);
                        return (
                          <span
                            key={`quarter-label-${formatMonthTooltip(point.date)}`}
                            className="tm-chart-label tm-line-chart-label"
                            title={`${formatMonthTooltip(point.date)}: ${formatMetricValue(
                              value,
                              metric
                            )}`}
                          >
                            {formatMonthLabel(point.date)}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <div className="tm-panel-soft tm-analytics-card space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="tm-label">Year</p>
                    <p className="text-xs text-amber-200/80">
                      {formatMetricTotal(yearTotal, metric)}
                    </p>
                  </div>
                  <div className="tm-chart-grid-layout">
                    <div className="tm-chart-axis" aria-hidden="true">
                      {yearAxis.ticks.map((tick) => (
                        <span key={`year-axis-${tick}`}>{formatAxisValue(tick)}</span>
                      ))}
                    </div>
                    <div className="tm-line-chart" aria-label={`${metricTitle} · год`}>
                      <div className="tm-chart-grid" aria-hidden="true">
                        {yearAxis.ticks.map((tick) => (
                          <span key={`year-grid-${tick}`} className="tm-chart-grid-line" />
                        ))}
                      </div>
                      <svg
                        className="tm-line-chart-svg"
                        viewBox="0 0 100 100"
                        preserveAspectRatio="none"
                        aria-hidden="true"
                      >
                        {yearAreaPoints ? (
                          <polygon points={yearAreaPoints} className="tm-line-chart-area" />
                        ) : null}
                        {yearLinePoints ? (
                          <polyline points={yearLinePoints} className="tm-line-chart-line" />
                        ) : null}
                        {yearActivePoint ? (
                          <line
                            x1={yearActivePoint.x}
                            x2={yearActivePoint.x}
                            y1={yearActivePoint.y}
                            y2={100}
                            className="tm-line-chart-guide"
                          />
                        ) : null}
                        {yearPlotPoints.map((point, index) => {
                          const valueLabel = formatMetricValue(point.safeValue, metric);
                          return (
                            <g key={formatMonthTooltip(point.date)}>
                              <circle
                                cx={point.x}
                                cy={point.y}
                                r={2.8}
                                className="tm-line-chart-hit"
                                role="button"
                                tabIndex={0}
                                aria-label={`${formatMonthTooltip(point.date)}: ${valueLabel}`}
                                onMouseEnter={() => setSelectedYearIndex(index)}
                                onFocus={() => setSelectedYearIndex(index)}
                                onClick={() => setSelectedYearIndex(index)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    setSelectedYearIndex(index);
                                  }
                                }}
                              />
                              <circle
                                cx={point.x}
                                cy={point.y}
                                r={index === yearActiveIndex ? 1.55 : 1.05}
                                className={`tm-line-chart-dot${
                                  index === yearActiveIndex ? ' tm-line-chart-dot-active' : ''
                                }`}
                              />
                              <title>{`${formatMonthTooltip(point.date)}: ${valueLabel}`}</title>
                            </g>
                          );
                        })}
                      </svg>
                    </div>
                    {yearActivePoint ? (
                      <div className="tm-line-chart-selected" role="status" aria-live="polite">
                        <span>{formatMonthTooltip(yearActivePoint.date)}</span>
                        <strong>{formatMetricValue(yearActivePoint.safeValue, metric)}</strong>
                      </div>
                    ) : null}
                    <div className="tm-line-chart-labels">
                      {yearSeries.map((point, index) => {
                        const value = toSafeValue(point.value);
                        const showLabel =
                          yearSeries.length <= 6 ||
                          index % 2 === 0 ||
                          index === yearSeries.length - 1;
                        return (
                          <span
                            key={`year-label-${formatMonthTooltip(point.date)}`}
                            className="tm-chart-label tm-line-chart-label"
                            title={`${formatMonthTooltip(point.date)}: ${formatMetricValue(
                              value,
                              metric
                            )}`}
                          >
                            {showLabel ? formatMonthLabel(point.date) : ''}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </section>

              <section className="tm-panel-soft tm-analytics-card space-y-3">
                <div className="flex items-center justify-between">
                  <p className="tm-label">Top by value</p>
                  <p className="text-xs text-amber-200/80">
                    {topTasks.length ? `Top ${topTasks.length}` : 'No tasks'}
                  </p>
                </div>
                {topTasks.length === 0 ? (
                  <p className="text-amber-200/70 text-sm">No tasks.</p>
                ) : (
                  <div className="space-y-2">
                    {topTasks.map(({ task, value }) => (
                      <div key={task.id} className="flex items-center justify-between gap-2">
                        <p className="text-amber-50 font-semibold truncate">{task.title}</p>
                        <span className="tm-pill">{value} XP</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
