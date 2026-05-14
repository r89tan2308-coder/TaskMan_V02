import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react';

type DialogTone = 'default' | 'danger';

type AppDialogInput = string | {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: DialogTone;
};

type DialogConfig = {
  kind: 'alert' | 'confirm';
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone: DialogTone;
};

type PendingDialog = DialogConfig & {
  id: number;
  resolve: (confirmed: boolean) => void;
};

type AppDialogApi = {
  alert: (input: AppDialogInput) => Promise<void>;
  confirm: (input: AppDialogInput) => Promise<boolean>;
};

let registeredDialogApi: AppDialogApi | null = null;

const normalizeDialogInput = (input: AppDialogInput): Omit<DialogConfig, 'kind'> =>
  typeof input === 'string'
    ? { message: input, tone: 'default' }
    : { ...input, tone: input.tone ?? 'default' };

const getPortalThemeClassName = () => {
  if (typeof document === 'undefined') return '';
  const appRoot = document.querySelector('.tm-app');
  if (appRoot?.classList.contains('tm-theme-classic')) return 'tm-theme-classic';
  if (appRoot?.classList.contains('tm-theme-handwritten')) return 'tm-theme-handwritten';
  if (appRoot?.classList.contains('tm-theme-hud')) return 'tm-theme-hud';
  return appRoot?.classList.contains('tm-theme-vault') ? 'tm-theme-vault' : '';
};

export const showAppAlert = async (input: AppDialogInput) => {
  if (registeredDialogApi) {
    await registeredDialogApi.alert(input);
    return;
  }

  const config = normalizeDialogInput(input);
  if (typeof window !== 'undefined') {
    window.alert(config.message);
  }
};

export const showAppConfirm = async (input: AppDialogInput) => {
  if (registeredDialogApi) {
    return registeredDialogApi.confirm(input);
  }

  const config = normalizeDialogInput(input);
  if (typeof window !== 'undefined') {
    return window.confirm(config.message);
  }
  return false;
};

export function AppDialogProvider({ children }: { children: ReactNode }) {
  const [dialogs, setDialogs] = useState<PendingDialog[]>([]);
  const nextIdRef = useRef(1);
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null);
  const currentDialog = dialogs[0] ?? null;

  const openDialog = useCallback((config: DialogConfig) => {
    return new Promise<boolean>((resolve) => {
      setDialogs((current) => [
        ...current,
        {
          ...config,
          id: nextIdRef.current,
          resolve
        }
      ]);
      nextIdRef.current += 1;
    });
  }, []);

  const settleDialog = useCallback((confirmed: boolean) => {
    setDialogs((current) => {
      const [active, ...rest] = current;
      active?.resolve(confirmed);
      return rest;
    });
  }, []);

  const api = useMemo<AppDialogApi>(
    () => ({
      alert: async (input) => {
        const config = normalizeDialogInput(input);
        await openDialog({ ...config, kind: 'alert' });
      },
      confirm: async (input) => {
        const config = normalizeDialogInput(input);
        return openDialog({ ...config, kind: 'confirm' });
      }
    }),
    [openDialog]
  );

  useEffect(() => {
    registeredDialogApi = api;
    return () => {
      if (registeredDialogApi === api) {
        registeredDialogApi = null;
      }
    };
  }, [api]);

  useEffect(() => {
    if (!currentDialog) return;
    const frameId = window.requestAnimationFrame(() => {
      confirmButtonRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [currentDialog]);

  useEffect(() => {
    if (!currentDialog) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        settleDialog(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [currentDialog, settleDialog]);

  const isConfirm = currentDialog?.kind === 'confirm';
  const title = currentDialog?.title ?? (isConfirm ? 'Подтверждение' : 'Сообщение');
  const confirmLabel = currentDialog?.confirmLabel ?? 'OK';
  const cancelLabel = currentDialog?.cancelLabel ?? 'Отмена';
  const themeClassName = currentDialog ? getPortalThemeClassName() : '';
  const titleId = currentDialog ? `tm-service-dialog-title-${currentDialog.id}` : undefined;
  const messageId = currentDialog ? `tm-service-dialog-message-${currentDialog.id}` : undefined;

  return (
    <>
      {children}
      {currentDialog ? (
        <div
          className="tm-service-dialog-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && isConfirm) {
              settleDialog(false);
            }
          }}
        >
          <section
            className={`tm-service-dialog tm-panel ${themeClassName} ${
              currentDialog.tone === 'danger' ? 'tm-service-dialog-danger' : ''
            }`}
            role={isConfirm ? 'alertdialog' : 'dialog'}
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={messageId}
          >
            <div className="tm-service-dialog-copy">
              <h2 id={titleId} className="tm-service-dialog-title tm-title">
                {title}
              </h2>
              <p id={messageId} className="tm-service-dialog-message">
                {currentDialog.message}
              </p>
            </div>
            <div className="tm-service-dialog-actions">
              {isConfirm ? (
                <button
                  type="button"
                  className="tm-button tm-button-ghost"
                  onClick={() => settleDialog(false)}
                >
                  {cancelLabel}
                </button>
              ) : null}
              <button
                ref={confirmButtonRef}
                type="button"
                className={`tm-button ${
                  currentDialog.tone === 'danger' ? 'tm-button-danger' : 'tm-button-primary'
                }`}
                onClick={() => settleDialog(true)}
              >
                {confirmLabel}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
