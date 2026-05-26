export const TASKMAN_PLAN_PROMPT = `Составь JSON для TaskMan. Верни только валидный JSON без Markdown, комментариев и пояснений.

Формат:
{
  "schemaVersion": 1,
  "createProjects": [
    {
      "clientId": "project-health",
      "title": "Название проекта",
      "description": "Короткое описание"
    }
  ],
  "createTasks": [
    {
      "title": "Название действия",
      "projectRef": "project-health",
      "bucket": "next",
      "dueDate": "2026-06-01",
      "periodicity": "one-time",
      "note": "Короткий контекст",
      "rarity": "common",
      "value": 5
    }
  ]
}

Правила:
- schemaVersion всегда 1.
- projectRef должен быть clientId проекта из createProjects или null.
- bucket: today, next, backlog или inbox.
- dueDate: YYYY-MM-DD или null.
- periodicity: daily, weekly, monthly, yearly или one-time.
- rarity: common, rare, epic или legendary.
- value: положительное число XP.
- Не добавляй поля, которых нет в формате.`;

export const PLAN_IMPORT_GUIDE_ITEMS = [
  'Export в блоке Планирование выгружает только открытые задачи и активные проекты. Этот файл удобно отправлять нейронке как контекст.',
  'Import в блоке Планирование добавляет новые проекты и задачи. Он не заменяет базу, не трогает награды, историю XP, завершённые задачи и настройки.',
  'Для нейронки используй промпт ниже и попроси вернуть только JSON. Сохрани ответ в файл с расширением .json и загрузи через Import.',
  'Перед применением приложение покажет preview: можно снять лишние проекты и задачи, а дубликаты будут пропущены.'
];

export const BACKUP_GUIDE_ITEMS = [
  'Скачать backup создаёт полную копию локальной базы: задачи, проекты, награды, историю, заметки и настройки.',
  'Восстановить backup полностью заменяет текущие локальные данные содержимым выбранного backup-файла.',
  'Backup нужен для переноса между портами, браузерами и профилями, а также перед рискованными экспериментами.',
  'Не отправляй backup нейронке без необходимости: в нём может быть вся личная история приложения. Для работы с нейронкой обычно достаточно planning Export.'
];
