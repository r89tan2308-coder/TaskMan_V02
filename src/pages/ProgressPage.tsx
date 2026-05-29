import { AnalyticsPage } from './AnalyticsPage';
import { ShopPage } from './ShopPage';
import { SkillsPage } from './SkillsPage';
import { useLocale, type AppLocale } from '../i18n/appLocale';

export type ProgressTab = 'skills' | 'shop' | 'analytics';

const PROGRESS_COPY = {
  ru: {
    title: 'Прогресс',
    intro: 'Рост, награды и аналитика в одном разделе.',
    tabListAria: 'Разделы прогресса',
    tabs: {
      skills: 'Навыки',
      shop: 'Магазин',
      analytics: 'Аналитика'
    } satisfies Record<ProgressTab, string>
  },
  en: {
    title: 'Progress',
    intro: 'Growth, rewards, and analytics in one section.',
    tabListAria: 'Progress sections',
    tabs: {
      skills: 'Skills',
      shop: 'Shop',
      analytics: 'Analytics'
    } satisfies Record<ProgressTab, string>
  }
} satisfies Record<AppLocale, unknown>;

export function ProgressPage({
  tab,
  onTabChange
}: {
  tab: ProgressTab;
  onTabChange: (tab: ProgressTab) => void;
}) {
  const { locale } = useLocale();
  const copy = PROGRESS_COPY[locale];
  const tabLabels = copy.tabs;

  return (
    <>
      <div className="max-w-5xl mx-auto px-2 sm:px-4 pt-4 pb-0">
        <section className="tm-panel-soft tm-progress-subnav">
          <div className="tm-progress-subnav-copy">
            <h1 className="sr-only">{copy.title}</h1>
            <p className="text-xs text-amber-200/70">
              {copy.intro}
            </p>
          </div>
          <div
            className="tm-progress-tabs tm-segmented-control tm-segmented-control-nowrap"
            role="tablist"
            aria-label={copy.tabListAria}
          >
            {(Object.keys(tabLabels) as ProgressTab[]).map((progressTab) => (
              <button
                key={progressTab}
                type="button"
                role="tab"
                aria-selected={tab === progressTab}
                className={`tm-tab tm-tab-sm tm-progress-tab tm-segmented-item ${
                  tab === progressTab ? 'tm-tab-active is-selected' : ''
                }`}
                onClick={() => onTabChange(progressTab)}
              >
                {tabLabels[progressTab]}
              </button>
            ))}
          </div>
        </section>
      </div>

      <div role="tabpanel" aria-label={tabLabels[tab]}>
        {tab === 'skills' ? <SkillsPage /> : null}
        {tab === 'shop' ? <ShopPage /> : null}
        {tab === 'analytics' ? <AnalyticsPage /> : null}
      </div>
    </>
  );
}
