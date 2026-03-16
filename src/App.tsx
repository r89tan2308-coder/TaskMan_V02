import { useEffect, useState, type CSSProperties } from 'react';
import { TodayPage } from './pages/TodayPage';
import { LedgerPage } from './pages/LedgerPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { DailyLogPage } from './pages/DailyLogPage';
import { ShopPage } from './pages/ShopPage';
import { SkillsPage } from './pages/SkillsPage';
import { NotesPage } from './pages/NotesPage';
import { CalendarPage } from './pages/CalendarPage';
import { SettingsPage } from './pages/SettingsPage';
import { getAppMetaValue, setAppMetaValue } from './db/repositories/appMetaRepo';

type InterfaceTheme = 'classic' | 'vault' | 'handwritten';

const INTERFACE_THEME_META_KEY = 'interfaceTheme';
const HANDWRITTEN_BG_META_KEY = 'handwrittenBackground';

const isInterfaceTheme = (value: unknown): value is InterfaceTheme =>
  value === 'classic' || value === 'vault' || value === 'handwritten';

function App() {
  const [route, setRoute] = useState<
    | 'today'
    | 'calendar'
    | 'ledger'
    | 'analytics'
    | 'log'
    | 'shop'
    | 'skills'
    | 'notes'
    | 'settings'
  >('today');
  const [interfaceTheme, setInterfaceTheme] = useState<InterfaceTheme>('classic');
  const [handwrittenBackground, setHandwrittenBackground] = useState<string | null>(null);

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
    loadTheme();
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle(
      'tm-font-scale-handwritten',
      interfaceTheme === 'handwritten'
    );
  }, [interfaceTheme]);

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
    interfaceTheme === 'vault'
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
      <nav className="tm-nav">
        <div className="tm-nav-inner">
          <button
            className={`tm-tab ${route === 'today' ? 'tm-tab-active' : ''}`}
            onClick={() => setRoute('today')}
          >
            Today
          </button>
          <button
            className={`tm-tab ${route === 'calendar' ? 'tm-tab-active' : ''}`}
            onClick={() => setRoute('calendar')}
          >
            Calendar
          </button>
          <button
            className={`tm-tab ${route === 'analytics' ? 'tm-tab-active' : ''}`}
            onClick={() => setRoute('analytics')}
          >
            Analytics
          </button>
          <button
            className={`tm-tab ${route === 'shop' ? 'tm-tab-active' : ''}`}
            onClick={() => setRoute('shop')}
          >
            Shop
          </button>
          <button
            className={`tm-tab ${route === 'skills' ? 'tm-tab-active' : ''}`}
            onClick={() => setRoute('skills')}
          >
            Skills
          </button>
          <button
            className={`tm-tab ${route === 'notes' ? 'tm-tab-active' : ''}`}
            onClick={() => setRoute('notes')}
          >
            Notes
          </button>
          <button
            className={`tm-tab ${
              route === 'settings' || route === 'ledger' || route === 'log'
                ? 'tm-tab-active'
                : ''
            }`}
            onClick={() => setRoute('settings')}
          >
            Settings
          </button>
        </div>
      </nav>
      {route === 'today' && <TodayPage />}
      {route === 'calendar' && <CalendarPage />}
      {route === 'ledger' && <LedgerPage />}
      {route === 'analytics' && <AnalyticsPage />}
      {route === 'log' && <DailyLogPage />}
      {route === 'shop' && <ShopPage />}
      {route === 'skills' && <SkillsPage />}
      {route === 'notes' && <NotesPage />}
      {route === 'settings' && (
        <SettingsPage
          onNavigate={(target) => setRoute(target)}
          interfaceTheme={interfaceTheme}
          onInterfaceChange={handleInterfaceChange}
          handwrittenBackground={handwrittenBackground}
          onHandwrittenBackgroundChange={handleHandwrittenBackgroundChange}
        />
      )}
    </div>
  );
}

export default App;
