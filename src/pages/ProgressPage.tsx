import { AnalyticsPage } from './AnalyticsPage';
import { ShopPage } from './ShopPage';
import { SkillsPage } from './SkillsPage';

export type ProgressTab = 'skills' | 'shop' | 'analytics';

const PROGRESS_TAB_LABELS: Record<ProgressTab, string> = {
  skills: 'Skills',
  shop: 'Shop',
  analytics: 'Analytics'
};

export function ProgressPage({
  tab,
  onTabChange
}: {
  tab: ProgressTab;
  onTabChange: (tab: ProgressTab) => void;
}) {
  return (
    <>
      <div className="max-w-5xl mx-auto px-2 sm:px-4 pt-4 pb-0">
        <section className="tm-panel-soft tm-progress-subnav">
          <div className="tm-progress-subnav-copy">
            <h1 className="text-xl font-semibold tm-title">Progress</h1>
            <p className="text-xs text-amber-200/70">
              Рост, награды и аналитика в одном разделе.
            </p>
          </div>
          <div className="tm-progress-tabs" role="tablist" aria-label="Разделы progress">
            {(Object.keys(PROGRESS_TAB_LABELS) as ProgressTab[]).map((progressTab) => (
              <button
                key={progressTab}
                type="button"
                role="tab"
                aria-selected={tab === progressTab}
                className={`tm-tab tm-tab-sm tm-progress-tab ${
                  tab === progressTab ? 'tm-tab-active' : ''
                }`}
                onClick={() => onTabChange(progressTab)}
              >
                {PROGRESS_TAB_LABELS[progressTab]}
              </button>
            ))}
          </div>
        </section>
      </div>

      <div role="tabpanel" aria-label={PROGRESS_TAB_LABELS[tab]}>
        {tab === 'skills' ? <SkillsPage /> : null}
        {tab === 'shop' ? <ShopPage /> : null}
        {tab === 'analytics' ? <AnalyticsPage /> : null}
      </div>
    </>
  );
}
