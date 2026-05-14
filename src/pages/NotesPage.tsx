import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { showAppAlert, showAppConfirm } from '../components/AppDialog';
import { getAppMetaValue, setAppMetaValue } from '../db/repositories/appMetaRepo';
import { Rarity } from '../entities/task/types';

type NoteEntry = {
  id: string;
  title: string;
  summary: string;
  body: string;
  rarity: Rarity;
  sortOrder?: number;
  createdAt: string;
  updatedAt: string;
};

type NotesPayload = {
  notes: NoteEntry[];
};

type NoteSort = 'manual' | 'rarity' | 'createdAt';

const NOTES_META_KEY = 'notes';
const NOTES_SORT_META_KEY = 'notesSortMode';
const NOTES_BOOTSTRAP_VERSION_META_KEY = 'notesBootstrapVersion';
const NOTES_BOOTSTRAP_VERSION = 2;
const NOTE_SORTS: Array<{ value: NoteSort; label: string }> = [
  { value: 'manual', label: 'Ручная' },
  { value: 'rarity', label: 'По редкости' },
  { value: 'createdAt', label: 'По времени создания' }
];

const LEGACY_NOTES_BOOTSTRAP_SEEDS: Array<Pick<NoteEntry, 'title' | 'summary' | 'body' | 'rarity'>> = [
  {
    title: 'Inbox идей по приложению',
    summary: 'Собрать в одном месте открытые идеи и проблемы по приложению.',
    body:
      'Собрать в одном месте открытые идеи и проблемы по приложению.\n\nОдин входящий список без реализации, чтобы потом спокойно разобрать и раскидать по bucket.',
    rarity: 'rare'
  }
];

const NOTES_BOOTSTRAP_SEEDS: Array<Pick<NoteEntry, 'title' | 'summary' | 'body' | 'rarity'>> = [
  {
    title: 'Inbox идей по приложению',
    summary: 'Текущий список продуктовых идей и ближайших улучшений TaskMan.',
    body:
      'Что уже имеет смысл держать в фокусе по приложению:\n\n- Inbox идей: один входящий список идей и проблем по приложению, без немедленной реализации, чтобы потом спокойно разбирать и раскладывать по bucket.\n- Today как execution-first экран: Overdue выше Today, очереди Today / Inbox / Next / Backlog внутри одного экрана, компактный Next preview и вторичная contextual pane на широких экранах.\n- Автологика задач: daily и due today автоматически всплывают в Today; recurring weekly / monthly / yearly тоже поднимаются в Today в день текущего дедлайна; bucket остается home queue и не переписывается автоматически.\n- Next layer: позже можно добавить автоподнятие задач с близким дедлайном в Next как временный слой поверх bucket.\n- Карточки задач: сохранять компактные action buttons, не перегружать карточку CTA и продолжать улучшать wide-grid раскладку.\n- История выполнения: держать под рукой блок Сделано ранее и удобную отмену прошлых выполнений без возврата к длинной простыне completed-задач.\n- Streak: ежедневный стрик уже логичен для daily-задач; следующим шагом можно продумать weekly streak и правила его расчета.\n- Theme polish: handwritten theme нужно держать консистентной для popup/menu/modal и не плодить дублирующиеся override в разных CSS-слоях.\n- Notes как product inbox: использовать Notes как место для продуктовых идей, а позже можно подумать о связке заметок с задачами или проектами.',
    rarity: 'rare'
  }
];

const RARITY_STYLES: Record<Rarity, { border: string; text: string; accent: string }> = {
  common: { border: 'border-l-slate-400', text: 'tm-rarity-text', accent: 'tm-rarity-common' },
  rare: { border: 'border-l-sky-500', text: 'tm-rarity-text', accent: 'tm-rarity-rare' },
  epic: { border: 'border-l-violet-500', text: 'tm-rarity-text', accent: 'tm-rarity-epic' },
  legendary: { border: 'border-l-amber-500', text: 'tm-rarity-text', accent: 'tm-rarity-legendary' }
};

const RARITY_SORT_ORDER: Record<Rarity, number> = {
  common: 0,
  rare: 1,
  epic: 2,
  legendary: 3
};

const generateId = (): string => {
  const uuid = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : undefined;
  if (uuid) return uuid;
  const rand = Math.random().toString(16).slice(2);
  const time = Date.now().toString(16);
  return `${time}-${rand}-${Math.random().toString(16).slice(2, 10)}`;
};

const normalizeRarity = (value?: string): Rarity => {
  if (value === 'rare' || value === 'epic' || value === 'legendary') return value;
  return 'common';
};

const normalizeSortMode = (value?: string): NoteSort | undefined => {
  if (value === 'manual' || value === 'rarity' || value === 'createdAt') return value;
  return undefined;
};

const normalizeNotes = (value?: NotesPayload | NoteEntry[]) => {
  const list = !value ? [] : Array.isArray(value) ? value : value.notes;
  if (!Array.isArray(list)) return [];
  return list.map((note) => {
    const createdAt =
      typeof note.createdAt === 'string' && note.createdAt
        ? note.createdAt
        : new Date().toISOString();
    const updatedAt =
      typeof note.updatedAt === 'string' && note.updatedAt ? note.updatedAt : createdAt;
    return {
      ...note,
      title: typeof note.title === 'string' ? note.title : '',
      summary: typeof note.summary === 'string' ? note.summary : '',
      body: typeof note.body === 'string' ? note.body : '',
      rarity: normalizeRarity(note.rarity),
      createdAt,
      updatedAt,
      sortOrder:
        typeof note.sortOrder === 'number' ? note.sortOrder : Date.parse(createdAt) || 0
    };
  });
};

const noteMatchesSeed = (
  note: Pick<NoteEntry, 'title' | 'body'>,
  seed: Pick<NoteEntry, 'title' | 'body'>
) =>
  note.title.trim() === seed.title.trim() && note.body.trim() === seed.body.trim();

export function NotesPage() {
  const [notes, setNotes] = useState<NoteEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftSummary, setDraftSummary] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [draftRarity, setDraftRarity] = useState<Rarity>('common');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [sortMode, setSortMode] = useState<NoteSort>('manual');
  const [sortLoaded, setSortLoaded] = useState(false);
  const [draggingNoteId, setDraggingNoteId] = useState<string | null>(null);
  const [dragOverNoteId, setDragOverNoteId] = useState<string | null>(null);
  const sortMenuRef = useRef<HTMLDivElement | null>(null);

  const load = async () => {
    setLoading(true);
    const [storedNotes, storedSort, storedBootstrapVersion] = await Promise.all([
      getAppMetaValue<NotesPayload | NoteEntry[]>(NOTES_META_KEY),
      getAppMetaValue<string>(NOTES_SORT_META_KEY),
      getAppMetaValue<number>(NOTES_BOOTSTRAP_VERSION_META_KEY)
    ]);
    let normalizedNotes = normalizeNotes(storedNotes);
    const bootstrapVersion =
      typeof storedBootstrapVersion === 'number' && Number.isFinite(storedBootstrapVersion)
        ? storedBootstrapVersion
        : 0;
    if (bootstrapVersion < NOTES_BOOTSTRAP_VERSION) {
      let changed = false;
      const baseSortOrder = Date.now();
      const now = new Date().toISOString();
      NOTES_BOOTSTRAP_SEEDS.forEach((seed, index) => {
        if (normalizedNotes.some((note) => noteMatchesSeed(note, seed))) return;
        const legacySeed = LEGACY_NOTES_BOOTSTRAP_SEEDS[index];
        const legacyNoteIndex = legacySeed
          ? normalizedNotes.findIndex((note) => noteMatchesSeed(note, legacySeed))
          : -1;
        if (legacyNoteIndex >= 0) {
          normalizedNotes = normalizedNotes.map((note, noteIndex) =>
            noteIndex === legacyNoteIndex
              ? {
                  ...note,
                  title: seed.title,
                  summary: seed.summary,
                  body: seed.body,
                  rarity: seed.rarity,
                  updatedAt: now
                }
              : note
          );
          changed = true;
          return;
        }
        normalizedNotes = [
          {
            id: generateId(),
            title: seed.title,
            summary: seed.summary,
            body: seed.body,
            rarity: seed.rarity,
            sortOrder: baseSortOrder + NOTES_BOOTSTRAP_SEEDS.length - index,
            createdAt: now,
            updatedAt: now
          },
          ...normalizedNotes
        ];
        changed = true;
      });
      await setAppMetaValue(NOTES_BOOTSTRAP_VERSION_META_KEY, NOTES_BOOTSTRAP_VERSION);
      if (changed) {
        await setAppMetaValue(NOTES_META_KEY, { notes: normalizedNotes });
      }
    }
    setNotes(normalizedNotes);
    const normalizedSort = normalizeSortMode(storedSort);
    if (normalizedSort) setSortMode(normalizedSort);
    setLoading(false);
    setSortLoaded(true);
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!sortOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (!sortMenuRef.current) return;
      if (!sortMenuRef.current.contains(event.target as Node)) {
        setSortOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSortOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [sortOpen]);

  useEffect(() => {
    if (!sortLoaded) return;
    setAppMetaValue(NOTES_SORT_META_KEY, sortMode);
  }, [sortLoaded, sortMode]);

  const persistNotes = async (nextNotes: NoteEntry[]) => {
    setNotes(nextNotes);
    await setAppMetaValue(NOTES_META_KEY, { notes: nextNotes });
  };

  const sortedNotes = useMemo(() => {
    const getManualSortValue = (note: NoteEntry) =>
      typeof note.sortOrder === 'number'
        ? note.sortOrder
        : Date.parse(note.createdAt ?? '') || 0;
    const getCreatedSortValue = (note: NoteEntry) =>
      Date.parse(note.createdAt ?? '') || 0;
    const getRaritySortValue = (note: NoteEntry) =>
      RARITY_SORT_ORDER[note.rarity ?? 'common'];
    return [...notes].sort((a, b) => {
      if (sortMode === 'rarity') {
        const rarityDelta = getRaritySortValue(b) - getRaritySortValue(a);
        if (rarityDelta !== 0) return rarityDelta;
      }
      if (sortMode === 'createdAt') {
        const createdDelta = getCreatedSortValue(b) - getCreatedSortValue(a);
        if (createdDelta !== 0) return createdDelta;
      }
      return getManualSortValue(b) - getManualSortValue(a);
    });
  }, [notes, sortMode]);

  const resetDraft = () => {
    setEditingId(null);
    setDraftTitle('');
    setDraftSummary('');
    setDraftBody('');
    setDraftRarity('common');
  };

  const toggleExpanded = async (noteId: string) => {
    if (editingId === noteId) return;
    if (editingId && editingId !== noteId) {
      const confirmed = await showAppConfirm('Сбросить изменения в текущей заметке?');
      if (!confirmed) return;
      resetDraft();
    }
    setExpandedId((prev) => (prev === noteId ? null : noteId));
  };

  const startEdit = async (note: NoteEntry) => {
    if (editingId && editingId !== note.id) {
      const confirmed = await showAppConfirm('Сбросить изменения в текущей заметке?');
      if (!confirmed) return;
    }
    setEditingId(note.id);
    setDraftTitle(note.title ?? '');
    setDraftSummary(note.summary ?? '');
    setDraftBody(note.body ?? '');
    setDraftRarity(note.rarity ?? 'common');
    setExpandedId(note.id);
  };

  const cancelEdit = () => {
    resetDraft();
  };

  const saveEdit = async (note: NoteEntry) => {
    if (savingId) return;
    const title = draftTitle.trim();
    if (!title) {
      await showAppAlert('Введите название заметки.');
      return;
    }
    const summary = draftSummary.trim();
    const body = draftBody.trim();
    const updated: NoteEntry = {
      ...note,
      title,
      summary,
      body,
      rarity: draftRarity,
      updatedAt: new Date().toISOString()
    };
    const nextNotes = notes.map((item) => (item.id === note.id ? updated : item));
    setSavingId(note.id);
    try {
      await persistNotes(nextNotes);
      resetDraft();
    } catch (error) {
      await showAppAlert('Не удалось сохранить заметку.');
      await load();
    } finally {
      setSavingId(null);
    }
  };

  const addNote = async () => {
    if (adding) return;
    setAdding(true);
    try {
      const now = new Date().toISOString();
      const note: NoteEntry = {
        id: generateId(),
        title: '',
        summary: '',
        body: '',
        rarity: 'common',
        sortOrder: Date.now(),
        createdAt: now,
        updatedAt: now
      };
      const nextNotes = [note, ...notes];
      await persistNotes(nextNotes);
      await startEdit(note);
    } catch (error) {
      await showAppAlert('Не удалось создать заметку.');
    } finally {
      setAdding(false);
    }
  };

  const deleteNote = async (note: NoteEntry) => {
    if (deletingId) return;
    const noteTitle = note.title.trim() || 'без названия';
    const confirmed = await showAppConfirm({
      message: `Удалить заметку "${noteTitle}"?`,
      confirmLabel: 'Удалить',
      tone: 'danger'
    });
    if (!confirmed) return;
    setDeletingId(note.id);
    try {
      const nextNotes = notes.filter((item) => item.id !== note.id);
      await persistNotes(nextNotes);
      if (expandedId === note.id) setExpandedId(null);
      if (editingId === note.id) resetDraft();
    } catch (error) {
      await showAppAlert('Не удалось удалить заметку.');
      await load();
    } finally {
      setDeletingId(null);
    }
  };

  const canReorder = sortedNotes.length > 1 && sortMode === 'manual';

  const reorderNotes = async (sourceId: string, targetId: string) => {
    const sourceIndex = sortedNotes.findIndex((note) => note.id === sourceId);
    const targetIndex = sortedNotes.findIndex((note) => note.id === targetId);
    if (sourceIndex === -1 || targetIndex === -1) return;
    if (sourceIndex === targetIndex) return;

    const reordered = [...sortedNotes];
    const [moved] = reordered.splice(sourceIndex, 1);
    reordered.splice(targetIndex, 0, moved);

    const base = Date.now();
    const reorderedWithSort = reordered.map((note, index) => ({
      ...note,
      sortOrder: base - index
    }));

    setDraggingNoteId(null);
    setDragOverNoteId(null);

    try {
      await persistNotes(reorderedWithSort);
    } catch (error) {
      await showAppAlert('Не удалось изменить порядок заметок.');
      await load();
    }
  };

  const handleDragStart = (event: DragEvent<HTMLDivElement>, noteId: string) => {
    if (!canReorder) return;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', noteId);
    setDraggingNoteId(noteId);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>, noteId: string) => {
    if (!canReorder || !draggingNoteId) return;
    if (draggingNoteId === noteId) return;
    event.preventDefault();
    setDragOverNoteId(noteId);
  };

  const handleDrop = async (event: DragEvent<HTMLDivElement>, noteId: string) => {
    if (!canReorder) return;
    event.preventDefault();
    const sourceId = draggingNoteId ?? event.dataTransfer.getData('text/plain');
    if (!sourceId || sourceId === noteId) {
      setDragOverNoteId(null);
      return;
    }
    await reorderNotes(sourceId, noteId);
  };

  const handleDragEnd = () => {
    setDraggingNoteId(null);
    setDragOverNoteId(null);
  };

  return (
    <div className="min-h-screen">
      <div className="max-w-5xl mx-auto px-2 sm:px-4 py-8">
        <div className="tm-frame tm-reveal space-y-4 p-3 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="sr-only">Notes</h1>
            <div className="flex items-center gap-2">
              <div className="relative" ref={sortMenuRef}>
                <button
                  onClick={() => setSortOpen((prev) => !prev)}
                  className="tm-button tm-button-ghost tm-button-sm"
                  aria-haspopup="true"
                  aria-expanded={sortOpen}
                >
                  Sort
                </button>
                {sortOpen ? (
                  <div className="absolute right-0 top-full mt-2 tm-panel p-3 z-20 w-64 space-y-2">
                    <label htmlFor="notes-sort" className="text-xs tm-label">
                      Сортировка
                    </label>
                    <select
                      id="notes-sort"
                      value={sortMode}
                      onChange={(event) => setSortMode(event.target.value as NoteSort)}
                      className="tm-select text-sm"
                    >
                      {NOTE_SORTS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
              </div>
              <button
                onClick={addNote}
                className="tm-button tm-button-primary"
                disabled={adding}
              >
                {adding ? 'Создание...' : '+ Новая заметка'}
              </button>
            </div>
          </div>

          {loading ? (
            <p className="text-amber-200/80">Загрузка...</p>
          ) : sortedNotes.length === 0 ? (
            <p className="text-amber-200/80">Пока нет заметок.</p>
          ) : (
            <div className="space-y-3">
              {sortedNotes.map((note) => {
                const isExpanded = expandedId === note.id;
                const isEditing = editingId === note.id;
                const isSaving = savingId === note.id;
                const isDeleting = deletingId === note.id;
                const summaryText = note.summary?.trim() || 'Без описания';
                const bodyText = note.body?.trim() || 'Пустая заметка';
                const rarityStyle = RARITY_STYLES[note.rarity ?? 'common'];
                const dragEnabled = canReorder && !isEditing && !isSaving && !isDeleting;
                const dragging = draggingNoteId === note.id;
                const dragOver = dragOverNoteId === note.id && draggingNoteId !== note.id;
                const handleToggle = () => {
                  if (dragging) return;
                  toggleExpanded(note.id);
                };
                return (
                  <div
                    key={note.id}
                    className={`tm-card ${rarityStyle.accent} border-l-4 ${rarityStyle.border} px-4 py-3 flex flex-col gap-3 ${
                      dragging ? 'tm-dragging' : ''
                    } ${dragOver ? 'tm-drag-over' : ''}`}
                    onDragOver={(event) => handleDragOver(event, note.id)}
                    onDrop={(event) => handleDrop(event, note.id)}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`tm-drag-handle min-w-0 ${
                          dragEnabled ? '' : 'tm-drag-disabled'
                        }`}
                        draggable={dragEnabled}
                        onDragStart={(event) => handleDragStart(event, note.id)}
                        onDragEnd={handleDragEnd}
                        onClick={handleToggle}
                        role="button"
                        tabIndex={0}
                        aria-expanded={isExpanded}
                        aria-controls={`note-body-${note.id}`}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            handleToggle();
                          }
                        }}
                        title={dragEnabled ? 'Drag to reorder' : undefined}
                      >
                        <p className="text-amber-50 font-semibold break-words">
                          {note.title || 'Без названия'}
                        </p>
                        <p className="text-sm text-amber-200/80 break-words">
                          {summaryText}
                        </p>
                        <p className="text-xs text-amber-200/80">
                          <span className={rarityStyle.text}>{note.rarity}</span>
                        </p>
                      </div>
                      <span className="tm-pill">{isExpanded ? 'Свернуть' : 'Открыть'}</span>
                    </div>
                    <div
                      id={`note-body-${note.id}`}
                      className={`tm-note-body ${isExpanded ? 'tm-note-body-open' : ''}`}
                    >
                      <div className="tm-note-body-inner pt-3 space-y-3">
                        {isEditing ? (
                          <div className="space-y-3">
                            <div>
                              <label className="block text-xs tm-label mb-1">
                                Название
                              </label>
                              <input
                                value={draftTitle}
                                onChange={(event) => setDraftTitle(event.target.value)}
                                className="tm-input"
                                placeholder="Название заметки"
                              />
                            </div>
                            <div>
                              <label className="block text-xs tm-label mb-1">
                                Краткое описание
                              </label>
                              <input
                                value={draftSummary}
                                onChange={(event) => setDraftSummary(event.target.value)}
                                className="tm-input"
                                placeholder="Короткое описание"
                              />
                            </div>
                            <div>
                              <label className="block text-xs tm-label mb-1">
                                Редкость
                              </label>
                              <select
                                value={draftRarity}
                                onChange={(event) =>
                                  setDraftRarity(event.target.value as Rarity)
                                }
                                className="tm-select"
                              >
                                <option value="common">Common</option>
                                <option value="rare">Rare</option>
                                <option value="epic">Epic</option>
                                <option value="legendary">Legendary</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs tm-label mb-1">Текст</label>
                              <textarea
                                value={draftBody}
                                onChange={(event) => setDraftBody(event.target.value)}
                                className="tm-input min-h-[120px]"
                                rows={6}
                                placeholder="Полный текст заметки"
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="tm-stat-note">{bodyText}</div>
                        )}
                        <div className="flex items-center gap-2">
                          {isEditing ? (
                            <>
                              <button
                                onClick={() => saveEdit(note)}
                                disabled={isSaving}
                                className="tm-button tm-button-primary"
                              >
                                {isSaving ? 'Сохранение...' : 'Сохранить'}
                              </button>
                              <button
                                onClick={cancelEdit}
                                disabled={isSaving}
                                className="tm-button tm-button-ghost"
                              >
                                Отмена
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => startEdit(note)}
                                className="tm-button tm-button-ghost"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => deleteNote(note)}
                                disabled={isDeleting}
                                className="tm-button tm-button-danger"
                              >
                                {isDeleting ? 'Удаление...' : 'Удалить'}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
