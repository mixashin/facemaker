import { useMemo, useState } from 'preact/hooks';
import { createConfirm } from './confirm';
import { showAbout } from './state';
import { gather, report } from './report';
import { PREFER_KEY } from '../tracking/health';
import { t } from '../i18n/i18n';
import list from '../about/attributions.json';

export function About() {
  const [text, setText] = useState('');
  const [copied, setCopied] = useState(false);
  const show = async () => setText(text ? '' : report(await gather()));
  const copy = () => navigator.clipboard?.writeText(text).then(() => setCopied(true)).catch(() => {});
  const slow = (() => { try { return localStorage.getItem(PREFER_KEY) === 'CPU'; } catch { return false; } })();
  // The slow tracker (CPU) for a device where the fast one finds no face. The app starts again with it.
  const sure = useMemo(() => createConfirm(3000), []); // two taps: the app starts again
  const swap = () => { try { if (slow) localStorage.removeItem(PREFER_KEY); else localStorage.setItem(PREFER_KEY, 'CPU'); } catch { /* storage unavailable */ } location.replace('/'); };
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
      <p class="line">{t('privacy.p5')}</p>
      <h2>{t('about.title')}</h2>
      <p class="line">{t('about.made')}</p>
      <ul class="credits">
        {list.map((e) => (
          <li key={e.name}>
            <a href={e.url} target="_blank" rel="noopener noreferrer">{e.name}</a> {e.version} · {t('about.license')}: {e.license}
          </li>
        ))}
      </ul>
      <h2>🩺</h2>
      <div class="row">
        <button class="chip small" aria-label={t('about.report')} title={t('about.report')} aria-expanded={!!text} onClick={show}>🩺</button>
        <button class={'chip small' + (slow ? ' active' : '') + (sure.armed.value ? ' danger' : '')} aria-label={t('about.slow')} title={t('about.slow')} aria-pressed={slow} onClick={() => sure.tap(swap)}>{sure.armed.value ? '❓' : '🐢'}</button>
        {text && <button class="chip small" aria-label={t('about.copy')} title={t('about.copy')} onClick={copy}>{copied ? '✅' : '📋'}</button>}
      </div>
      {text && <pre class="report">{text}</pre>}
    </div>
  );
}
