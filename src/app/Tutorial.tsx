import { useState } from 'preact/hooks';
import { STEPS, markTutorialSeen } from './tutorialState';
import { t } from '../i18n/i18n';

export function Tutorial() {
  const [i, setI] = useState(0);
  const last = i === STEPS.length - 1;
  const done = () => markTutorialSeen(true);
  return (
    <div class="sheet tutorial" role="dialog" aria-label="tutorial">
      <button class="close" aria-label={t('tutorial.skip')} onClick={done}>✖</button>
      <div class="huge">{STEPS[i].icon}</div>
      <p class="line">{t(STEPS[i].key)}</p>
      <div class="dots">{STEPS.map((_, k) => <span key={k} class={'dot' + (k === i ? ' on' : '')} />)}</div>
      <button class="cta" onClick={() => (last ? done() : setI(i + 1))}>{last ? t('tutorial.done') : t('tutorial.next')} ▶</button>
    </div>
  );
}
