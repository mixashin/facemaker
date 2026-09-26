import { THEMES, applyTheme } from './themes';
import { theme } from './state';
import { t } from '../i18n/i18n';

export function ThemePicker() {
  return (
    <div class="themes" role="group" aria-label={t('settings.theme')}>
      {THEMES.map((th) => (
        <button
          key={th.id}
          class={'chip' + (theme.value === th.id ? ' active' : '')}
          aria-label={t('theme.' + th.id)}
          aria-pressed={theme.value === th.id}
          onClick={() => { theme.value = th.id; applyTheme(th.id); }}
        >
          {th.icon}
        </button>
      ))}
    </div>
  );
}
