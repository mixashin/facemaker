import { showSettings, showAbout } from './state';
import { ThemePicker } from './ThemePicker';
import { markTutorialSeen } from './tutorialState';
import { LANGS, lang, setLang, t } from '../i18n/i18n';

export function Settings() {
  return (
    <div class="sheet" role="dialog" aria-label={t('settings.title')}>
      <button class="close" aria-label={t('settings.close')} onClick={() => (showSettings.value = false)}>✖</button>
      <h2>{t('settings.title')}</h2>
      <h3>{t('settings.language')}</h3>
      <div class="row">
        {LANGS.map((l) => (
          <button key={l.id} class={'chip small' + (lang.value === l.id ? ' active' : '')} aria-pressed={lang.value === l.id} onClick={() => setLang(l.id)}>{l.label}</button>
        ))}
      </div>
      <h3>{t('settings.theme')}</h3>
      <ThemePicker />
      <button class="rowbtn" onClick={() => { markTutorialSeen(false); showSettings.value = false; }}>❓ {t('settings.tutorial')}</button>
      <button class="rowbtn" onClick={() => { showAbout.value = true; showSettings.value = false; }}>ℹ️ {t('settings.about')}</button>
    </div>
  );
}
