import { useRef, useState, type ChangeEvent } from 'react';
import {
  readAllForExport,
  replaceAllFromImport
} from '../db/repositories/exportImportRepo';
import { requestPwaUpdate } from '../pwa';

type InterfaceTheme = 'classic' | 'vault' | 'handwritten';

export function SettingsPage({
  onNavigate,
  interfaceTheme,
  onInterfaceChange,
  handwrittenBackground,
  onHandwrittenBackgroundChange
}: {
  onNavigate: (target: 'ledger' | 'log') => void;
  interfaceTheme: InterfaceTheme;
  onInterfaceChange: (theme: InterfaceTheme) => Promise<void>;
  handwrittenBackground: string | null;
  onHandwrittenBackgroundChange: (value: string | null) => Promise<void>;
}) {
  const [exporting, setExporting] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<
    'idle' | 'checking' | 'reloading' | 'no-update' | 'error'
  >('idle');
  const [interfaceOpen, setInterfaceOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const interfaceLabel =
    interfaceTheme === 'vault'
      ? 'Retro'
      : interfaceTheme === 'handwritten'
      ? 'Рукописный'
      : 'Classic';
  const updateStatusLabel =
    updateStatus === 'checking'
      ? 'Проверяем обновления...'
      : updateStatus === 'reloading'
      ? 'Обновление найдено. Перезагрузка...'
      : updateStatus === 'no-update'
      ? 'Обновлений нет.'
      : updateStatus === 'error'
      ? 'Не удалось обновить приложение.'
      : '';
  const updateStatusClass =
    updateStatus === 'error'
      ? 'text-red-300/80'
      : updateStatus === 'reloading'
      ? 'text-emerald-200/80'
      : 'text-amber-200/70';

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    const payload = await readAllForExport({
      schemaVersion: 1,
      exportedAt: new Date(Date.now()).toISOString()
    });
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'taskman-export.json';
    link.click();
    URL.revokeObjectURL(url);
    setExporting(false);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const confirmed = window.confirm(
        'This will REPLACE all local data. Continue?'
      );
      if (!confirmed) return;
      await replaceAllFromImport(payload);
      window.location.reload();
    } catch (error) {
      alert('Failed to import file.');
    } finally {
      event.target.value = '';
    }
  };

  const handleUpdateApp = async () => {
    if (updating) return;
    setUpdating(true);
    setUpdateStatus('checking');
    try {
      const result = await requestPwaUpdate();
      if (result === 'updated') {
        setUpdateStatus('reloading');
        window.setTimeout(() => {
          window.location.reload();
        }, 350);
        window.setTimeout(() => {
          setUpdating(false);
        }, 5000);
        return;
      }
      setUpdateStatus('no-update');
      setUpdating(false);
    } catch (error) {
      setUpdateStatus('error');
      setUpdating(false);
    }
  };

  const handleInterfaceToggle = () => {
    setInterfaceOpen((prev) => !prev);
  };

  const handleThemeChange = async (next: InterfaceTheme) => {
    if (next === interfaceTheme) return;
    await onInterfaceChange(next);
  };

  const readFileAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(reader.error ?? new Error('Failed to read file.'));
      reader.readAsDataURL(file);
    });

  const handleHandwrittenBackgroundFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      if (dataUrl) {
        await onHandwrittenBackgroundChange(dataUrl);
      }
    } catch (error) {
      alert('Failed to read background image.');
    } finally {
      event.target.value = '';
    }
  };

  const handleHandwrittenBackgroundClear = async () => {
    await onHandwrittenBackgroundChange(null);
  };

  return (
    <div className="min-h-screen">
      <div className="max-w-5xl mx-auto px-2 sm:px-4 py-8">
        <div className="tm-frame tm-reveal space-y-4 p-3 sm:p-6">
          <h1 className="text-3xl font-semibold tm-title">Settings</h1>
          <div className="space-y-2">
            <p className="tm-label">Sections</p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => onNavigate('ledger')}
                className="tm-button tm-button-steel"
              >
                Ledger
              </button>
              <button
                onClick={() => onNavigate('log')}
                className="tm-button tm-button-steel"
              >
                Log
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <p className="tm-label">Interface</p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleInterfaceToggle}
                className="tm-button tm-button-steel"
                aria-expanded={interfaceOpen}
              >
                Interface
              </button>
              <span className="text-sm text-amber-200/70">
                {interfaceLabel}
              </span>
            </div>
            {interfaceOpen ? (
              <div className="tm-panel-soft p-3 space-y-2">
                <p className="text-xs text-amber-200/70">Style</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => handleThemeChange('classic')}
                    className={`tm-button ${
                      interfaceTheme === 'classic' ? 'tm-button-gold' : 'tm-button-ghost'
                    }`}
                  >
                    Classic
                  </button>
                  <button
                    onClick={() => handleThemeChange('vault')}
                    className={`tm-button ${
                      interfaceTheme === 'vault' ? 'tm-button-gold' : 'tm-button-ghost'
                    }`}
                  >
                    Retro
                  </button>
                  <button
                    onClick={() => handleThemeChange('handwritten')}
                    className={`tm-button ${
                      interfaceTheme === 'handwritten' ? 'tm-button-gold' : 'tm-button-ghost'
                    }`}
                  >
                    Рукописный
                  </button>
                </div>
                {interfaceTheme === 'handwritten' ? (
                  <div className="pt-2 space-y-2">
                    <p className="text-xs text-amber-200/70">
                      Фон виден с прозрачностью 20%.
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleHandwrittenBackgroundFile}
                        className="tm-file text-sm"
                      />
                      {handwrittenBackground ? (
                        <button
                          onClick={handleHandwrittenBackgroundClear}
                          className="tm-button tm-button-ghost tm-button-sm"
                        >
                          Удалить фон
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="space-y-2">
            <p className="tm-label">Приложение</p>
            <button
              onClick={handleUpdateApp}
              disabled={updating}
              className="tm-button tm-button-primary"
            >
              {updating ? 'Обновление...' : 'Обновить приложение'}
            </button>
            {updateStatus !== 'idle' ? (
              <p className={`text-xs ${updateStatusClass}`} role="status" aria-live="polite">
                {updateStatusLabel}
              </p>
            ) : null}
          </div>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="tm-button tm-button-gold"
          >
            {exporting ? 'Exporting...' : 'Export'}
          </button>
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              onChange={handleImportFile}
              className="tm-file text-sm"
            />
            <button
              onClick={handleImportClick}
              className="tm-button tm-button-primary"
            >
              Import
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
