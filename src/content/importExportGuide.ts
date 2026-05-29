import type { AppLocale } from '../i18n/appLocale';

type ImportExportGuide = {
  taskmanPlanPrompt: string;
  planImportGuideItems: string[];
  backupGuideItems: string[];
};

export const IMPORT_EXPORT_GUIDE: Record<AppLocale, ImportExportGuide> = {
  ru: {
    taskmanPlanPrompt: `Составь JSON для TaskMan. Верни только валидный JSON без Markdown, комментариев и пояснений.

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
- Не добавляй поля, которых нет в формате.`,
    planImportGuideItems: [
      'Экспорт плана выгружает только открытые задачи и активные проекты. Этот файл удобно отправлять нейронке как контекст.',
      'Импорт плана добавляет новые проекты и задачи. Он не заменяет базу, не трогает награды, историю XP, завершённые задачи и настройки.',
      'Для нейронки используй промпт ниже и попроси вернуть только JSON. Сохрани ответ в файл с расширением .json и загрузи через импорт плана.',
      'Перед применением приложение покажет предпросмотр: можно снять лишние проекты и задачи, а дубликаты будут пропущены.'
    ],
    backupGuideItems: [
      'Скачать резервную копию создаёт полную копию локальной базы: задачи, проекты, награды, историю, заметки и настройки.',
      'Восстановить резервную копию полностью заменяет текущие локальные данные содержимым выбранного файла.',
      'Резервная копия нужна для переноса между портами, браузерами и профилями, а также перед рискованными экспериментами.',
      'Не отправляй резервную копию нейронке без необходимости: в ней может быть вся личная история приложения. Для работы с нейронкой обычно достаточно экспорта плана.'
    ]
  },
  en: {
    taskmanPlanPrompt: `Create a JSON file for TaskMan. Return only valid JSON, with no Markdown, comments, or explanations.

Format:
{
  "schemaVersion": 1,
  "createProjects": [
    {
      "clientId": "project-health",
      "title": "Project name",
      "description": "Short description"
    }
  ],
  "createTasks": [
    {
      "title": "Action name",
      "projectRef": "project-health",
      "bucket": "next",
      "dueDate": "2026-06-01",
      "periodicity": "one-time",
      "note": "Short context",
      "rarity": "common",
      "value": 5
    }
  ]
}

Rules:
- schemaVersion is always 1.
- projectRef must be a clientId from createProjects or null.
- bucket: today, next, backlog, or inbox.
- dueDate: YYYY-MM-DD or null.
- periodicity: daily, weekly, monthly, yearly, or one-time.
- rarity: common, rare, epic, or legendary.
- value: a positive XP number.
- Do not add fields that are not in the format.`,
    planImportGuideItems: [
      'Export in Planning downloads only open tasks and active projects. Use that file as context for an AI assistant.',
      'Import in Planning adds new projects and tasks. It does not replace the database, rewards, XP history, completed tasks, or settings.',
      'Use the prompt below with your AI assistant and ask it to return only JSON. Save the answer as a .json file and upload it through Import.',
      'Before applying changes, the app shows a preview: you can uncheck extra projects and tasks, and duplicates will be skipped.'
    ],
    backupGuideItems: [
      'Download backup creates a full local database copy: tasks, projects, rewards, history, notes, and settings.',
      'Restore backup fully replaces the current local data with the selected backup file.',
      'Use backup to move data between ports, browsers, profiles, or before risky experiments.',
      'Do not send a backup to an AI assistant unless necessary: it may contain the full personal app history. Planning Export is usually enough.'
    ]
  }
};

export const getImportExportGuide = (locale: AppLocale) => IMPORT_EXPORT_GUIDE[locale];

export const TASKMAN_PLAN_PROMPT = IMPORT_EXPORT_GUIDE.ru.taskmanPlanPrompt;
export const PLAN_IMPORT_GUIDE_ITEMS = IMPORT_EXPORT_GUIDE.ru.planImportGuideItems;
export const BACKUP_GUIDE_ITEMS = IMPORT_EXPORT_GUIDE.ru.backupGuideItems;
