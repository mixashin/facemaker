import { useEffect, useMemo, useState } from 'preact/hooks';
import { showSettings, showAbout, showFaceLab, store, items, refreshGallery } from './state';
import { createConfirm } from './confirm';
import { ThemePicker } from './ThemePicker';
import { markTutorialSeen } from './tutorialState';
import { LANGS, lang, setLang, t } from '../i18n/i18n';

export function Settings() {
  const [usage, setUsage] = useState<{ used: number; quota: number } | null>(null);
  useEffect(() => { refreshGallery(); store.value?.usage().then(setUsage); }, []);
  const confirm = useMemo(() => createConfirm(3000), []);
  const mb = (n: number) => (n / 1048576).toFixed(n < 10485760 ? 1 : 0) + ' MB';
  const clearAll = () => confirm.tap(async () => { await store.value?.clear(); await refreshGallery(); store.value?.usage().then(setUsage); });
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
      <h3>{t('settings.storage')}</h3>
      <p class="line small">🖼️ {items.value.length} · {mb(items.value.reduce((a, i) => a + i.size, 0))}{usage && usage.quota > 0 ? ` / ${mb(usage.quota)}` : ''}</p>
      <button class={'rowbtn' + (confirm.armed.value ? ' danger' : '')} aria-label="clear all" onClick={clearAll}>
        {confirm.armed.value ? '❓ ' + t('settings.clearConfirm') : '🗑️ ' + t('settings.clear')}
      </button>
      <button class="rowbtn" aria-label="facelab" onClick={() => { showFaceLab.value = true; showSettings.value = false; }}>🧪 {t('settings.facelab')}</button>
      <button class="rowbtn" onClick={() => { markTutorialSeen(false); showSettings.value = false; }}>❓ {t('settings.tutorial')}</button>
      <button class="rowbtn" aria-label="about" onClick={() => { showAbout.value = true; showSettings.value = false; }}>ℹ️ {t('settings.about')}</button>
    </div>
  );
}
