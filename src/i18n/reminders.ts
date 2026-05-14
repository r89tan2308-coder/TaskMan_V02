export const reminderTranslations = {
  ru: {
    browserNotifications: 'Напоминания',
    enableMorningCheckIn: 'Утренний чек-ин',
    morningCheckInTime: 'Время утреннего чек-ина',
    enableEveningReview: 'Вечерний обзор',
    eveningReviewTime: 'Время вечернего обзора',
    enableOverdueReminder: 'Напоминать о просроченных',
    overdueReminderHint: 'Показывается только если есть просроченные задачи.',
    notificationPermission: 'Разрешение уведомлений',
    enableNotifications: 'Включить уведомления',
    permissionGranted: 'Разрешены',
    permissionDefault: 'Не запрошены',
    permissionDenied: 'Отклонены',
    permissionUnsupported: 'Не поддерживаются',
    deniedHint:
      'Браузер отклонил уведомления. Можно включить их вручную в настройках сайта.',
    unsupportedHint: 'Этот браузер не поддерживает локальные уведомления для приложения.',
    quietHint: 'Уведомления не запрашиваются при запуске. Включи их только если они нужны.',
    todayTasks: (count: number) => `У тебя ${count} ${count === 1 ? 'задача' : 'задачи'} на сегодня`,
    overdueTasks: (count: number) =>
      `Есть ${count} ${count === 1 ? 'просроченная задача' : 'просроченные задачи'}`,
    eveningReview: 'Вечерний обзор: закрыть день?'
  },
  en: {
    browserNotifications: 'Reminders',
    enableMorningCheckIn: 'Morning check-in',
    morningCheckInTime: 'Morning check-in time',
    enableEveningReview: 'Evening review',
    eveningReviewTime: 'Evening review time',
    enableOverdueReminder: 'Overdue reminder',
    overdueReminderHint: 'Shown only when overdue tasks exist.',
    notificationPermission: 'Notification permission',
    enableNotifications: 'Enable notifications',
    permissionGranted: 'Granted',
    permissionDefault: 'Not requested',
    permissionDenied: 'Denied',
    permissionUnsupported: 'Unsupported',
    deniedHint:
      'The browser denied notifications. You can enable them manually in site settings.',
    unsupportedHint: 'This browser does not support local notifications for the app.',
    quietHint: 'Notifications are not requested on launch. Enable them only if useful.',
    todayTasks: (count: number) => `You have ${count} task${count === 1 ? '' : 's'} today`,
    overdueTasks: (count: number) =>
      `You have ${count} overdue task${count === 1 ? '' : 's'}`,
    eveningReview: 'Evening review: close the day?'
  }
} as const;

export type ReminderLocale = keyof typeof reminderTranslations;

export const reminderCopy = reminderTranslations.ru;
