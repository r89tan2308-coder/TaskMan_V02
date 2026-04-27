import { Suspense, lazy, useEffect, useRef, useState, type CSSProperties } from 'react';
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

type InterfaceTheme = 'classic' | 'vault' | 'handwritten';

const INTERFACE_THEME_META_KEY = 'interfaceTheme';
const HANDWRITTEN_BG_META_KEY = 'handwrittenBackground';

const TetrisPage = lazy(async () => {
  const module = await import('./features/tetris/TetrisPage');
  return { default: module.TetrisPage };
});

const isInterfaceTheme = (value: unknown): value is InterfaceTheme =>
  value === 'classic' || value === 'vault' || value === 'handwritten';

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
  const [progressTab, setProgressTab] = useState<ProgressTab>('shop');
  const [interfaceTheme, setInterfaceTheme] = useState<InterfaceTheme>('classic');
  const [handwrittenBackground, setHandwrittenBackground] = useState<string | null>(null);
  const navShellRef = useRef<HTMLDivElement | null>(null);
  const navScrollRef = useRef<HTMLDivElement | null>(null);
  const isTetrisAccessible = FEATURE_FLAGS.tetris;

  useEffect(() => {
    const loadTheme = async () => {
      const [savedTheme, savedBackground] = await Promise.all([
        getAppMetaValue<unknown>(INTERFACE_THEME_META_KEY),
        getAppMetaValue<unknown>(HANDWRITTEN_BG_META_KEY)
      ]);
      if (isInterfaceTheme(savedTheme)) {
        setInterfaceTheme(savedTheme);
      }
      if (typeof savedBackground === 'string' && savedBackground.trim().length > 0) {
        setHandwrittenBackground(savedBackground);
      }
    };
    void loadTheme();
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

  const handleHandwrittenBackgroundChange = async (next: string | null) => {
    const normalized = typeof next === 'string' && next.trim().length > 0 ? next : null;
    setHandwrittenBackground(normalized);
    await setAppMetaValue(HANDWRITTEN_BG_META_KEY, normalized);
  };

  const themeClassName =
    interfaceTheme === 'classic'
      ? 'tm-theme-classic'
      : interfaceTheme === 'vault'
      ? 'tm-theme-vault'
      : interfaceTheme === 'handwritten'
      ? 'tm-theme-handwritten'
      : '';
  const handwrittenStyle =
    interfaceTheme === 'handwritten'
      ? ({
          '--tm-handwritten-bg-image': handwrittenBackground
            ? `url("${handwrittenBackground}")`
            : 'none'
        } as CSSProperties)
      : undefined;

  return (
    <div
      className={`tm-app ${route === 'today' ? 'tm-app-today' : ''} ${themeClassName}`}
      style={handwrittenStyle}
    >
      <nav className="tm-nav tm-nav-compact">
        <div ref={navShellRef} className="tm-nav-shell" data-scroll-left="false" data-scroll-right="false">
          <div ref={navScrollRef} className="tm-nav-inner">
            <button
              className={`tm-tab ${route === 'today' ? 'tm-tab-active' : ''}`}
              onClick={() => setRoute('today')}
            >
              Today
            </button>
            <button
              className={`tm-tab ${route === 'projects' ? 'tm-tab-active' : ''}`}
              onClick={() => setRoute('projects')}
            >
              Projects
            </button>
            <button
              className={`tm-tab ${route === 'progress' ? 'tm-tab-active' : ''}`}
              onClick={() => setRoute('progress')}
            >
              Progress
            </button>
            <button
              className={`tm-tab ${route === 'calendar' ? 'tm-tab-active' : ''}`}
              onClick={() => setRoute('calendar')}
            >
              Calendar
            </button>
            <button
              className={`tm-tab ${route === 'notes' ? 'tm-tab-active' : ''}`}
              onClick={() => setRoute('notes')}
            >
              Notes
            </button>
            <button
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
            >
              Settings
            </button>
          </div>
        </div>
      </nav>
      {route === 'today' && <TodayPage />}
      {route === 'projects' && <ProjectsPage />}
      {route === 'progress' && <ProgressPage tab={progressTab} onTabChange={setProgressTab} />}
      {route === 'calendar' && <CalendarPage />}
      {route === 'ledger' && <LedgerPage />}
      {route === 'log' && <DailyLogPage />}
      {route === 'notes' && <NotesPage />}
      {route === 'manual' && <ManualPage onBack={() => setRoute('settings')} />}
      {route === 'settings' && (
        <SettingsPage
          onNavigate={(target) => setRoute(target)}
          interfaceTheme={interfaceTheme}
          onInterfaceChange={handleInterfaceChange}
          handwrittenBackground={handwrittenBackground}
          onHandwrittenBackgroundChange={handleHandwrittenBackgroundChange}
          tetrisAvailable={FEATURE_FLAGS.tetris}
        />
      )}
      {route === 'tetris' && isTetrisAccessible ? (
        <Suspense
          fallback={
            <div className="max-w-5xl mx-auto px-2 sm:px-4 py-8">
              <div className="tm-frame p-4 text-sm text-amber-200/70">Загружаем Tetris...</div>
            </div>
          }
        >
          <TetrisPage onBack={() => setRoute('settings')} />
        </Suspense>
      ) : null}
    </div>
  );
}

export default App;
