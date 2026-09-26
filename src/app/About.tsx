import { showAbout } from './state';
import { t } from '../i18n/i18n';
import list from '../about/attributions.json';

export function About() {
  return (
    <div class="sheet about" role="dialog" aria-label={t('about.title')}>
      <button class="close" aria-label={t('settings.close')} onClick={() => (showAbout.value = false)}>✖</button>
      <h2>{t('privacy.title')}</h2>
      <div class="flow" aria-hidden="true">
        <div class="box">📷<small>{t('privacy.flow.camera')}</small></div>
        <span class="arrow">→</span>
        <div class="box">📱<small>{t('privacy.flow.device')}</small></div>
        <span class="arrow">→</span>
        <div class="box">📤<small>{t('privacy.flow.share')}</small></div>
      </div>
      <p class="line">{t('privacy.p1')}</p>
      <p class="line">{t('privacy.p2')}</p>
      <p class="line">{t('privacy.p3')}</p>
      <p class="line">{t('privacy.p4')}</p>
      <h2>{t('about.title')}</h2>
      <p class="line">{t('about.made')}</p>
      <ul class="credits">
        {list.map((e) => (
          <li key={e.name}>
            <a href={e.url} target="_blank" rel="noopener noreferrer">{e.name}</a> {e.version} · {t('about.license')}: {e.license}
          </li>
        ))}
      </ul>
    </div>
  );
}
