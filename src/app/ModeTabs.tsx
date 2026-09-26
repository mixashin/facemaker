import { mode, type Mode } from './state';
import { toggleMode } from './modes';
import { t } from '../i18n/i18n';

const TABS: { id: Exclude<Mode, 'none'>; icon: string }[] = [
  { id: 'warp', icon: '🎭' },
  { id: 'sticker', icon: '🐱' },
  { id: 'text', icon: '✏️' },
];

export function ModeTabs() {
  return (
    <div class="tabs" role="tablist">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          class={'tab' + (mode.value === tab.id ? ' active' : '')}
          aria-label={tab.id}
          aria-selected={mode.value === tab.id}
          title={t('tabs.' + tab.id)}
          onClick={() => (mode.value = toggleMode(mode.value, tab.id))}
        >
          {tab.icon}
        </button>
      ))}
    </div>
  );
}
