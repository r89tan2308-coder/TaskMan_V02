import { createContext, useContext, type ReactNode } from 'react';

export type AppLocale = 'ru' | 'en';

export const APP_LOCALE_META_KEY = 'appLocale';

export const APP_LOCALE_LABELS: Record<AppLocale, string> = {
  ru: 'Русский',
  en: 'English'
};

export const isAppLocale = (value: unknown): value is AppLocale =>
  value === 'ru' || value === 'en';

type LocaleContextValue = {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => Promise<void>;
};

const LocaleContext = createContext<LocaleContextValue>({
  locale: 'ru',
  setLocale: async () => undefined
});

export function LocaleProvider({
  value,
  children
}: {
  value: LocaleContextValue;
  children: ReactNode;
}) {
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export const useLocale = () => useContext(LocaleContext);
