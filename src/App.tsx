import { Suspense, lazy, useEffect, useRef, useState, type CSSProperties } from 'react';
import { AppDialogProvider } from './components/AppDialog';
import { TodayPage } from './pages/TodayPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { ProgressPage, type ProgressTab } from './pages/ProgressPage';
import { LedgerPage } from './pages/LedgerPage';
import { DailyLogPage } from './pages/DailyLogPage';
import { NotesPage } from './pages/NotesPage';
import { CalendarPage } from './pages/CalendarPage';
import { SettingsPage } from './pages/SettingsPage';
import { ManualPage } from './pages/ManualPage';
import { getAppMetaValue, setAppMetaValue } from './db/repositories/appMetaRepo';
import { FEATURE_FLAGS } from './features/featureFlags';
import { AppPet } from './features/pet/AppPet';
import { emitPetEvent } from './features/pet/petEvents';
import {
  APP_LOCALE_META_KEY,
  LocaleProvider,
  isAppLocale,
  type AppLocale
} from './i18n/appLocale';
import {
  getPetEnabled,
  getPetMotionMode,
  resetPetPosition,
  setPetEnabled,
  setPetMotionMode,
  type PetMotionMode
} from './features/pet/petPreferences';
import { refreshAppBadge, startAppBadgeDayRolloverRefresh } from './services/appBadgeService';
import { startReminderRuntime } from './services/reminderService';

type InterfaceTheme = 'classic' | 'vault' | 'handwritten' | 'hud';

const INTERFACE_THEME_META_KEY = 'interfaceTheme';
const HANDWRITTEN_BG_META_KEY = 'handwrittenBackground';
const PROGRESS_TAB_META_KEY = 'progressTab';

const APP_NAV_LABELS: Record<
  AppLocale,
  {
    today: string;
    settings: string;
    progress: string;
    projects: string;
    calendar: string;
    notes: string;
    tetrisLoading: string;
  }
> = {
  ru: {
    today: 'Сегодня',
    settings: 'Настройки',
    progress: 'Прогресс',
    projects: 'Проекты',
    calendar: 'Календарь',
    notes: 'Заметки',
    tetrisLoading: 'Загружаем Tetris...'
  },
  en: {
    today: 'Today',
    settings: 'Settings',
    progress: 'Progress',
    projects: 'Projects',
    calendar: 'Calendar',
    notes: 'Notes',
    tetrisLoading: 'Loading Tetris...'
  }
};

const TetrisPage = lazy(async () => {
  const module = await import('./features/tetris/TetrisPage');
  return { default: module.TetrisPage };
});

const isInterfaceTheme = (value: unknown): value is InterfaceTheme =>
  value === 'classic' || value === 'vault' || value === 'handwritten' || value === 'hud';

const isProgressTab = (value: unknown): value is ProgressTab =>
  value === 'skills' || value === 'shop' || value === 'analytics';

function App() {
  const [route, setRoute] = useState<
    | 'today'
    | 'projects'
    | 'progress'
    | 'calendar'
    | 'ledger'
    | 'log'
    | 'notes'
    | 'settings'
    | 'manual'
    | 'tetris'
  >('today');
  const [progressTab, setProgressTab] = useState<ProgressTab>('analytics');
  const [locale, setLocaleState] = useState<AppLocale>('ru');
  const [interfaceTheme, setInterfaceTheme] = useState<InterfaceTheme>('classic');
  const [handwrittenBackground, setHandwrittenBackground] = useState<string | null>(null);
  const [petEnabled, setPetEnabledState] = useState(true);
  const [petMotionMode, setPetMotionModeState] = useState<PetMotionMode>('full');
  const [petPositionResetKey, setPetPositionResetKey] = useState(0);
  const navShellRef = useRef<HTMLDivElement | null>(null);
  const navScrollRef = useRef<HTMLDivElement | null>(null);
  const previousRouteRef = useRef<typeof route | null>(null);
  const isTetrisAccessible = FEATURE_FLAGS.tetris;

  useEffect(() => {
    const loadPreferences = async () => {
      const [
        savedTheme,
        savedBackground,
        savedProgressTab,
        savedLocale,
        savedPetEnabled,
        savedPetMotionMode
      ] = await Promise.all([
        getAppMetaValue<unknown>(INTERFACE_THEME_META_KEY),
        getAppMetaValue<unknown>(HANDWRITTEN_BG_META_KEY),
        getAppMetaValue<unknown>(PROGRESS_TAB_META_KEY),
        getAppMetaValue<unknown>(APP_LOCALE_META_KEY),
        getPetEnabled(),
        getPetMotionMode()
      ]);
      if (isInterfaceTheme(savedTheme)) {
        setInterfaceTheme(savedTheme);
      }
      if (typeof savedBackground === 'string' && savedBackground.trim().length > 0) {
        setHandwrittenBackground(savedBackground);
      }
      if (isProgressTab(savedProgressTab)) {
        setProgressTab(savedProgressTab);
      }
      if (isAppLocale(savedLocale)) {
        setLocaleState(savedLocale);
      }
      setPetEnabledState(savedPetEnabled);
      setPetMotionModeState(savedPetMotionMode);
    };
    void loadPreferences();
  }, []);

  useEffect(() => {
    void refreshAppBadge();
    const stopBadgeRolloverRefresh = startAppBadgeDayRolloverRefresh();
    const stopReminderRuntime = startReminderRuntime();
    return () => {
      stopBadgeRolloverRefresh();
      stopReminderRuntime();
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle(
      'tm-font-scale-handwritten',
      interfaceTheme === 'handwritten'
    );
  }, [interfaceTheme]);

  useEffect(() => {
    if (route === 'tetris' && !isTetrisAccessible) {
      setRoute('settings');
    }
  }, [isTetrisAccessible, route]);

  useEffect(() => {
    const previousRoute = previousRouteRef.current;
    previousRouteRef.current = route;
    if (!FEATURE_FLAGS.petCompanion || !petEnabled) return;
    if (previousRoute === null || previousRoute === route) return;
    emitPetEvent({ type: 'route-changed' });
  }, [petEnabled, route]);

  useEffect(() => {
    const navShell = navShellRef.current;
    const navScroll = navScrollRef.current;
    if (!navShell || !navScroll) return;

    let frameId = 0;
    const comfortPadding = 24;

    const updateNavAffordance = () => {
      const maxScrollLeft = Math.max(0, navScroll.scrollWidth - navScroll.clientWidth);
      navShell.dataset.scrollLeft = navScroll.scrollLeft > 4 ? 'true' : 'false';
      navShell.dataset.scrollRight = navScroll.scrollLeft < maxScrollLeft - 4 ? 'true' : 'false';
    };

    const scrollActiveTabIntoView = (behavior: ScrollBehavior) => {
      const activeTab = navScroll.querySelector<HTMLButtonElement>('.tm-tab-active');
      if (!activeTab) {
        updateNavAffordance();
        return;
      }

      const maxScrollLeft = Math.max(0, navScroll.scrollWidth - navScroll.clientWidth);
      const visibleLeft = navScroll.scrollLeft;
      const visibleRight = visibleLeft + navScroll.clientWidth;
      const activeLeft = activeTab.offsetLeft;
      const activeRight = activeLeft + activeTab.offsetWidth;
      const safeLeft = activeLeft - comfortPadding;
      const safeRight = activeRight + comfortPadding;

      if (safeLeft >= visibleLeft && safeRight <= visibleRight) {
        updateNavAffordance();
        return;
      }

      const centeredScrollLeft =
        activeLeft - (navScroll.clientWidth - activeTab.offsetWidth) / 2;
      const nextScrollLeft = Math.min(maxScrollLeft, Math.max(0, centeredScrollLeft));

      navScroll.scrollTo({
        left: nextScrollLeft,
        behavior
      });
      frameId = window.requestAnimationFrame(updateNavAffordance);
    };

    const requestAffordanceUpdate = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(updateNavAffordance);
    };

    const handleScroll = () => {
      requestAffordanceUpdate();
    };

    const handleResize = () => {
      scrollActiveTabIntoView('auto');
      requestAffordanceUpdate();
    };

    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            handleResize();
          })
        : null;

    navScroll.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleResize);
    resizeObserver?.observe(navScroll);

    frameId = window.requestAnimationFrame(() => {
      scrollActiveTabIntoView('auto');
      updateNavAffordance();
    });

    return () => {
      window.cancelAnimationFrame(frameId);
      navScroll.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
      resizeObserver?.disconnect();
    };
  }, [route, interfaceTheme]);

  const handleInterfaceChange = async (next: InterfaceTheme) => {
    setInterfaceTheme(next);
    await setAppMetaValue(INTERFACE_THEME_META_KEY, next);
  };

  const handleLocaleChange = async (next: AppLocale) => {
    setLocaleState(next);
    await setAppMetaValue(APP_LOCALE_META_KEY, next);
  };

  const handleHandwrittenBackgroundChange = async (next: string | null) => {
    const normalized = typeof next === 'string' && next.trim().length > 0 ? next : null;
    setHandwrittenBackground(normalized);
    await setAppMetaValue(HANDWRITTEN_BG_META_KEY, normalized);
  };

  const handlePetEnabledChange = async (enabled: boolean) => {
    setPetEnabledState(enabled);
    await setPetEnabled(enabled);
  };

  const handlePetMotionModeChange = async (mode: PetMotionMode) => {
    setPetMotionModeState(mode);
    await setPetMotionMode(mode);
  };

  const handlePetPositionReset = async () => {
    setPetEnabledState(true);
    await Promise.all([setPetEnabled(true), resetPetPosition()]);
    setPetPositionResetKey((current) => current + 1);
  };

  const handleProgressTabChange = async (next: ProgressTab) => {
    setProgressTab(next);
    await setAppMetaValue(PROGRESS_TAB_META_KEY, next);
  };

  const themeClassName =
    interfaceTheme === 'classic'
      ? 'tm-theme-classic'
      : interfaceTheme === 'vault'
      ? 'tm-theme-vault'
      : interfaceTheme === 'handwritten'
      ? 'tm-theme-handwritten'
      : interfaceTheme === 'hud'
      ? 'tm-theme-hud'
      : '';
  const handwrittenStyle =
    interfaceTheme === 'handwritten'
      ? ({
          '--tm-handwritten-bg-image': handwrittenBackground
            ? `url("${handwrittenBackground}")`
            : 'none'
        } as CSSProperties)
      : undefined;
  const navLabels = APP_NAV_LABELS[locale];

  return (
    <div
      className={`tm-app ${route === 'today' ? 'tm-app-today' : ''} ${
        route === 'progress' ? 'tm-app-progress' : ''
      } ${
        route === 'progress' && progressTab === 'analytics'
          ? 'tm-app-progress-analytics'
          : ''
      } ${themeClassName}`}
      style={handwrittenStyle}
    >
      <LocaleProvider value={{ locale, setLocale: handleLocaleChange }}>
      <AppDialogProvider>
        <nav className="tm-nav tm-nav-compact">
          <div ref={navShellRef} className="tm-nav-shell" data-scroll-left="false" data-scroll-right="false">
            <div ref={navScrollRef} className="tm-nav-inner">
              <button
                type="button"
                className={`tm-tab ${route === 'today' ? 'tm-tab-active' : ''}`}
                onClick={() => setRoute('today')}
                aria-current={route === 'today' ? 'page' : undefined}
              >
                {navLabels.today}
              </button>
              <button
                type="button"
                className={`tm-tab ${
                  route === 'settings' ||
                  route === 'ledger' ||
                  route === 'log' ||
                  route === 'manual' ||
                  route === 'tetris'
                    ? 'tm-tab-active'
                    : ''
                }`}
                onClick={() => setRoute('settings')}
                aria-current={
                  route === 'settings' ||
                  route === 'ledger' ||
                  route === 'log' ||
                  route === 'manual' ||
                  route === 'tetris'
                    ? 'page'
                    : undefined
                }
              >
                {navLabels.settings}
              </button>
              <button
                type="button"
                className={`tm-tab ${route === 'progress' ? 'tm-tab-active' : ''}`}
                onClick={() => setRoute('progress')}
                aria-current={route === 'progress' ? 'page' : undefined}
              >
                {navLabels.progress}
              </button>
              <button
                type="button"
                className={`tm-tab ${route === 'projects' ? 'tm-tab-active' : ''}`}
                onClick={() => setRoute('projects')}
                aria-current={route === 'projects' ? 'page' : undefined}
              >
                {navLabels.projects}
              </button>
              <button
                type="button"
                className={`tm-tab ${route === 'calendar' ? 'tm-tab-active' : ''}`}
                onClick={() => setRoute('calendar')}
                aria-current={route === 'calendar' ? 'page' : undefined}
              >
                {navLabels.calendar}
              </button>
              <button
                type="button"
                className={`tm-tab ${route === 'notes' ? 'tm-tab-active' : ''}`}
                onClick={() => setRoute('notes')}
                aria-current={route === 'notes' ? 'page' : undefined}
              >
                {navLabels.notes}
              </button>
            </div>
          </div>
        </nav>
        {route === 'today' && <TodayPage />}
        {route === 'projects' && <ProjectsPage />}
        {route === 'progress' && (
          <ProgressPage tab={progressTab} onTabChange={handleProgressTabChange} />
        )}
        {route === 'calendar' && <CalendarPage />}
        {route === 'ledger' && <LedgerPage onBack={() => setRoute('settings')} />}
        {route === 'log' && <DailyLogPage onBack={() => setRoute('settings')} />}
        {route === 'notes' && <NotesPage />}
        {route === 'manual' && <ManualPage onBack={() => setRoute('settings')} />}
        {route === 'settings' && (
          <SettingsPage
            onNavigate={(target) => setRoute(target)}
            interfaceTheme={interfaceTheme}
            onInterfaceChange={handleInterfaceChange}
            handwrittenBackground={handwrittenBackground}
            onHandwrittenBackgroundChange={handleHandwrittenBackgroundChange}
            petEnabled={petEnabled}
            petMotionMode={petMotionMode}
            onPetEnabledChange={handlePetEnabledChange}
            onPetMotionModeChange={handlePetMotionModeChange}
            onPetPositionReset={handlePetPositionReset}
            tetrisAvailable={FEATURE_FLAGS.tetris}
          />
        )}
        {route === 'tetris' && isTetrisAccessible ? (
          <Suspense
            fallback={
              <div className="max-w-5xl mx-auto px-2 sm:px-4 py-8">
                <div className="tm-frame p-4 text-sm text-amber-200/70">
                  {navLabels.tetrisLoading}
                </div>
              </div>
            }
          >
            <TetrisPage onBack={() => setRoute('settings')} />
          </Suspense>
        ) : null}
        <AppPet
          enabled={FEATURE_FLAGS.petCompanion && petEnabled}
          motionMode={petMotionMode}
          positionResetKey={petPositionResetKey}
          baseState="idle"
        />
      </AppDialogProvider>
      </LocaleProvider>
    </div>
  );
}

export default App;
