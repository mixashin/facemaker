import { sliders, showFaceLab } from './state';
import { REGIONS, MODES, DEFAULT_SLIDERS } from '../filters/sliders';
import { t } from '../i18n/i18n';

export function FaceLab() {
  const s = sliders.value;
  return (
    <div class="sheet facelab" role="dialog" aria-label={t('facelab.title')}>
      <button class="close" aria-label={t('settings.close')} onClick={() => (showFaceLab.value = false)}>✖</button>
      <h2>🧪 {t('facelab.title')}</h2>
      {REGIONS.map((r) => (
        <div class="lab-row" key={r.id}>
          <span class="lab-icon" title={t('region.' + r.id)}>{r.icon}{r.id === 'leftEye' ? '◀' : r.id === 'rightEye' ? '▶' : ''}</span>
          <div class="row">
            {MODES.map((m) => (
              <button key={m.id} class={'chip small' + (s[r.id].mode === m.id ? ' active' : '')} aria-label={t('region.' + r.id) + ' ' + t('mode.' + m.id)} aria-pressed={s[r.id].mode === m.id}
                onClick={() => (sliders.value = { ...s, [r.id]: { ...s[r.id], mode: m.id } })}>{m.icon}</button>
            ))}
          </div>
          <input type="range" min="-1" max="1" step="0.05" value={s[r.id].amount} aria-label={t('region.' + r.id)}
            onInput={(e) => (sliders.value = { ...sliders.value, [r.id]: { ...sliders.value[r.id], amount: Number((e.currentTarget as HTMLInputElement).value) } })} />
        </div>
      ))}
      <button class="rowbtn" onClick={() => (sliders.value = DEFAULT_SLIDERS)}>♻️ {t('facelab.reset')}</button>
    </div>
  );
}
