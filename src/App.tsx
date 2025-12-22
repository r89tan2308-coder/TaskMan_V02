import { useState } from 'react';
import { TodayPage } from './pages/TodayPage';
import { LedgerPage } from './pages/LedgerPage';
import { DailyLogPage } from './pages/DailyLogPage';
import { ShopPage } from './pages/ShopPage';
import { SettingsPage } from './pages/SettingsPage';

function App() {
  const [route, setRoute] = useState<'today' | 'ledger' | 'log' | 'shop' | 'settings'>('today');

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <nav className="bg-slate-900 border-b border-slate-800">
        <div className="max-w-5xl mx-auto px-4 py-3 flex gap-2">
          <button
            className={`px-3 py-2 rounded-md text-sm font-semibold ${
              route === 'today'
                ? 'bg-emerald-500 text-slate-900'
                : 'bg-slate-800 text-slate-100 border border-slate-700'
            }`}
            onClick={() => setRoute('today')}
          >
            Today
          </button>
          <button
            className={`px-3 py-2 rounded-md text-sm font-semibold ${
              route === 'ledger'
                ? 'bg-emerald-500 text-slate-900'
                : 'bg-slate-800 text-slate-100 border border-slate-700'
            }`}
            onClick={() => setRoute('ledger')}
          >
            Ledger
          </button>
          <button
            className={`px-3 py-2 rounded-md text-sm font-semibold ${
              route === 'log'
                ? 'bg-emerald-500 text-slate-900'
                : 'bg-slate-800 text-slate-100 border border-slate-700'
            }`}
            onClick={() => setRoute('log')}
          >
            Log
          </button>
          <button
            className={`px-3 py-2 rounded-md text-sm font-semibold ${
              route === 'shop'
                ? 'bg-emerald-500 text-slate-900'
                : 'bg-slate-800 text-slate-100 border border-slate-700'
            }`}
            onClick={() => setRoute('shop')}
          >
            Shop
          </button>
          <button
            className={`px-3 py-2 rounded-md text-sm font-semibold ${
              route === 'settings'
                ? 'bg-emerald-500 text-slate-900'
                : 'bg-slate-800 text-slate-100 border border-slate-700'
            }`}
            onClick={() => setRoute('settings')}
          >
            Settings
          </button>
        </div>
      </nav>
      {route === 'today' && <TodayPage />}
      {route === 'ledger' && <LedgerPage />}
      {route === 'log' && <DailyLogPage />}
      {route === 'shop' && <ShopPage />}
      {route === 'settings' && <SettingsPage />}
    </div>
  );
}

export default App;
