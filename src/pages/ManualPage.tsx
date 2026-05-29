import { getImportExportGuide } from '../content/importExportGuide';
import { useLocale, type AppLocale } from '../i18n/appLocale';

type ManualSection = {
  id: string;
  title: string;
  summary: string;
  items: string[];
  prompt?: string;
};

const MANUAL_COPY = {
  ru: {
    title: 'Мануал',
    summary:
      'Краткое руководство по текущим функциям приложения. Описаны только те возможности, которые уже есть в интерфейсе.',
    back: 'Назад в настройки',
    contents: 'Содержание',
    aiPrompt: 'Промпт для нейронки'
  },
  en: {
    title: 'Manual',
    summary:
      'A short guide to the app features that are currently available in the interface.',
    back: 'Back to Settings',
    contents: 'Contents',
    aiPrompt: 'AI prompt'
  }
} satisfies Record<AppLocale, unknown>;

const getManualSections = (locale: AppLocale): ManualSection[] => {
  const guide = getImportExportGuide(locale);

  if (locale === 'en') {
    return [
      {
        id: 'navigation',
        title: 'Navigation and App Logic',
        summary:
          'The main areas are in the top navigation; utility and data-flow screens live inside Settings.',
        items: [
          'Use the top menu to switch between Today, Projects, Progress, Calendar, Notes, and Settings.',
          'On narrow screens the top navigation scrolls horizontally instead of wrapping.',
          'Progress contains three tabs: Skills, Shop, and Analytics.',
          'Settings contains utility screens: XP Ledger, Daily Log, Manual, and Tetris.',
          'Changes are saved automatically. Use Planning Export / Import for task exchange, and backup for a full database copy.'
        ]
      },
      {
        id: 'today',
        title: 'Today',
        summary: 'The main screen for daily work, queues, and day progress.',
        items: [
          'The top summary shows how the day is going and the nearest pinned reward progress.',
          'Tasks are organized into Today, Inbox, Next, and Backlog. You can change the queue when creating or editing a task.',
          'Upcoming deadlines can appear in the main day layer without changing the original queue.',
          'New tasks support rarity, repetition, due date, reminder offset, checklist, progress, skill tags, project, and queue.',
          'Task cards can be completed, skipped, restored, edited, exported to calendar, moved, or deleted.'
        ]
      },
      {
        id: 'projects',
        title: 'Projects',
        summary:
          'Containers for larger goals. A project groups tasks and shows progress, but tasks remain the actual actions.',
        items: [
          'A project has a title, description, and status. Progress is calculated from linked tasks.',
          'Tasks can be linked to a project while creating or editing them.',
          'Project screens show progress, active tasks, completed tasks, and a quick path to create a task inside the project.',
          'When a large project is completed, it can grant a separate XP bonus recorded in history.'
        ]
      },
      {
        id: 'progress',
        title: 'Progress',
        summary: 'A unified area for growth, rewards, and analytics.',
        items: [
          'Skills tracks life areas, attributes, skill goals, notes, and snapshots.',
          'Shop contains XP rewards, repeatable rewards, cooldowns, and pinned rewards for the Today screen.',
          'Analytics shows XP and task statistics across different periods.'
        ]
      },
      {
        id: 'calendar',
        title: 'Calendar',
        summary: 'A calendar view of tasks by date.',
        items: [
          'Day, Week, and Month modes are available.',
          'You can jump to today and move between periods.',
          'Day mode shows tasks for the selected date; week and month modes show task distribution by day.'
        ]
      },
      {
        id: 'notes',
        title: 'Notes',
        summary: 'A lightweight space for manually structured notes.',
        items: [
          'Each note has a title, short description, rarity, and main text.',
          'Notes can be sorted manually, by rarity, or by creation time.',
          'In manual sort mode, notes can be reordered with drag and drop.',
          'A note card can be expanded, edited, or deleted.'
        ]
      },
      {
        id: 'transfer',
        title: 'Import, Plan, and Backup',
        summary:
          'Two different transfer flows: planning JSON adds new tasks, while backup fully restores the local database.',
        items: [
          ...guide.planImportGuideItems,
          ...guide.backupGuideItems,
          'Data is tied to the current browser and app origin. To move between localhost:5173 and localhost:5174, create a backup on the old address and restore it on the new one.'
        ],
        prompt: guide.taskmanPlanPrompt
      },
      {
        id: 'settings',
        title: 'Settings',
        summary: 'Interface, data, and utility actions.',
        items: [
          'Interface lets you switch language and visual theme.',
          'The handwritten theme can use a custom background.',
          'XP lets you manually edit the current balance.',
          'Data contains Import / Export with planning Export / Import, backup download / restore, and a short guide.'
        ]
      }
    ];
  }

  return [
  {
    id: 'navigation',
    title: 'Навигация и общая логика',
    summary: 'Основные разделы находятся в верхней панели, а служебные и data-flow экраны собраны внутри Settings.',
    items: [
      'Из верхнего меню переключаются Today, Projects, Progress, Calendar, Notes и Settings.',
      'На узких экранах верхняя навигация не переносится на несколько строк, а прокручивается по горизонтали.',
      'Внутри Progress находятся три вкладки: Skills, Shop и Analytics.',
      'Внутри Settings находятся служебные разделы: Ledger, Daily Log и Manual.',
      'Все изменения сохраняются внутри приложения автоматически. Для обмена задачами используйте planning Export / Import, для полной копии базы используйте backup.'
    ]
  },
  {
    id: 'today',
    title: 'Today',
    summary: 'Главный экран для ежедневной работы с задачами, очередями и быстрым обзором прогресса.',
    items: [
      'Вверху находится summary-блок Как идёт день и отдельная карточка ближайшей награды с прогрессом по XP.',
      'Задачи распределяются по очередям Today, Inbox, Next и Backlog. Очередь можно менять при создании и редактировании задачи.',
      'Если дедлайн подходит, задача автоматически подмешивается в главный слой дня без смены исходной очереди. Для ближайших дедлайнов есть отдельная секция Скоро дедлайн.',
      'Новая задача поддерживает редкость, повторение, дедлайн, смещение напоминания, чеклист, прогресс, теги навыков, проект и ручной выбор очереди.',
      'Повторение задачи: ежедневно, раз в неделю, раз в месяц, раз в год и разово.',
      'Недельная задача повторяется по дню недели дедлайна. Если поставить дедлайн на вторник, задача будет повторяться по вторникам.',
      'Есть поиск, фильтр по типу повторения и сортировка. Ручная сортировка работает перетаскиванием.',
      'Внешние действия карточки сокращены до завершения и меню ... . Через меню доступны перенос, календарь, редактирование, пропуск и удаление.',
      'Просроченные задачи выводятся отдельно. Ниже показываются Сделано сегодня и превью очереди Next.',
      'При завершении задачи обновляются summary и reward strip, задача уходит в Сделано сегодня, а на экране появляется краткий +XP feedback.',
      'Задачу можно завершить, отметить как пропущенную, откатить выполнение, отредактировать и выгрузить в календарь через .ics.'
    ]
  },
  {
    id: 'projects',
    title: 'Projects',
    summary: 'Контейнеры для больших целей. Проект сам по себе не заменяет задачи, а собирает их в одну цель с прогрессом.',
    items: [
      'Проект содержит название, описание и статус. Прогресс считается автоматически по обычным задачам, привязанным через project.',
      'Задачу можно сразу привязать к проекту при создании или редактировании. На карточке задачи показывается компактный project chip.',
      'На экране Projects виден список проектов с прогресс-баром, статусом и количеством завершённых задач.',
      'Внутри проекта есть header, прогресс, активные задачи, завершённые задачи и быстрый переход к созданию новой задачи внутри проекта.',
      'После полного закрытия достаточно крупного проекта может начисляться отдельный бонус XP. Он фиксируется в истории отдельной записью.'
    ]
  },
  {
    id: 'progress',
    title: 'Progress',
    summary: 'Единый раздел роста, наград и аналитики.',
    items: [
      'Внутри Progress есть три вкладки: Skills, Shop и Analytics. Это отдельные подэкраны, а не одна длинная лента.',
      'Skills содержит колесо баланса по жизненным сферам, характеристики и навыки с целями, заметками и снимками состояния.',
      'Shop содержит награды, покупки за XP, повторяемые награды с кулдауном и закрепление наград для главного экрана.',
      'Analytics показывает статистику по XP и задачам за разные периоды, а также рейтинг задач по ценности.'
    ]
  },
  {
    id: 'calendar',
    title: 'Calendar',
    summary: 'Календарный просмотр задач по датам.',
    items: [
      'Есть режимы День, Неделя и Месяц.',
      'Можно быстро перейти к сегодняшней дате и листать периоды назад и вперёд.',
      'В дневном режиме видны задачи выбранной даты.',
      'В недельном и месячном режиме видно распределение задач по дням и количество задач в дне.'
    ]
  },
  {
    id: 'notes',
    title: 'Notes',
    summary: 'Лёгкий раздел для заметок с ручной структурой и сортировкой.',
    items: [
      'Каждая заметка содержит название, краткое описание, редкость и основной текст.',
      'Новые заметки создаются пустыми, без мешающего заранее вписанного текста.',
      'Есть три режима сортировки: ручная, по редкости и по времени создания.',
      'В ручном режиме заметки можно переставлять drag-and-drop.',
      'Карточку заметки можно раскрывать, редактировать и удалять.'
    ]
  },
  {
    id: 'log',
    title: 'Daily Log',
    summary: 'Ручной журнал событий по задачам.',
    items: [
      'Раздел открывается из Settings.',
      'Позволяет вручную отметить задачу как выполненную или пропущенную.',
      'Можно использовать текущее время или задать свою дату и время события.',
      'Ниже показывается история по дням с суммой XP и списком операций.'
    ]
  },
  {
    id: 'ledger',
    title: 'Ledger',
    summary: 'Технический журнал всех XP-событий.',
    items: [
      'Раздел открывается из Settings.',
      'Показывает операции по задачам, наградам и ручным корректировкам XP.',
      'Для поддерживаемых записей доступно удаление события из журнала.',
      'Этот экран полезен для аудита истории и проверки, откуда появился баланс XP.'
    ]
  },
  {
    id: 'transfer',
    title: 'Импорт, план и backup',
    summary: 'Два разных сценария переноса данных: planning JSON добавляет новые задачи, backup полностью восстанавливает локальную базу.',
    items: [
      ...guide.planImportGuideItems,
      ...guide.backupGuideItems,
      'Файлы привязаны к текущему браузеру и origin приложения. Для переноса между localhost:5173 и localhost:5174 сначала сделайте backup на старом адресе, затем восстановите его на новом.'
    ],
    prompt: guide.taskmanPlanPrompt
  },
  {
    id: 'settings',
    title: 'Settings',
    summary: 'Настройки интерфейса, данных и служебных действий.',
    items: [
      'В разделе Interface можно переключать темы Classic, Retro и Рукописный.',
      'Для рукописной темы можно загрузить собственный фон и удалить его.',
      'В разделе XP можно вручную отредактировать текущий баланс.',
      'Кнопка обновления приложения проверяет наличие новой версии.',
      'В разделе Данные находится блок Импорт / экспорт: там есть planning Export / Import, backup download / restore и краткий встроенный мануал под кнопкой Как пользоваться.',
      'Planning Import создаёт только новые проекты и задачи через preview. Backup restore полностью заменяет локальную базу.'
    ]
  }
  ];
};

export function ManualPage({ onBack }: { onBack: () => void }) {
  const { locale } = useLocale();
  const copy = MANUAL_COPY[locale];
  const sections = getManualSections(locale);

  return (
    <div className="min-h-screen">
      <div className="max-w-5xl mx-auto px-2 sm:px-4 py-8">
        <div className="tm-frame tm-reveal space-y-5 p-3 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tm-title">{copy.title}</h1>
              <p className="tm-label max-w-3xl">
                {copy.summary}
              </p>
            </div>
            <button onClick={onBack} className="tm-button tm-button-steel">
              {copy.back}
            </button>
          </div>

          <div className="tm-panel-soft p-3 sm:p-4 space-y-2">
            <p className="tm-label">{copy.contents}</p>
            <div className="flex flex-wrap gap-2">
              {sections.map((section) => (
                <a
                  key={section.id}
                  href={`#manual-${section.id}`}
                  className="tm-pill tm-chip tm-chip-muted"
                >
                  {section.title}
                </a>
              ))}
            </div>
          </div>

          <div className="grid gap-4">
            {sections.map((section) => (
              <section
                key={section.id}
                id={`manual-${section.id}`}
                className="tm-panel-soft p-4 sm:p-5 space-y-3 scroll-mt-24"
              >
                <div className="space-y-1">
                  <h2 className="text-xl font-semibold tm-title">{section.title}</h2>
                  <p className="tm-label">{section.summary}</p>
                </div>
                <ul className="space-y-2 text-sm sm:text-[15px] text-amber-100/90 leading-6 pl-5 list-disc">
                  {section.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                {section.prompt ? (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold tm-title">{copy.aiPrompt}</p>
                    <pre className="tm-transfer-prompt whitespace-pre-wrap text-xs leading-5"><code>{section.prompt}</code></pre>
                  </div>
                ) : null}
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
