import { text } from './state';
import { TEXT_COLORS } from '../render/textLayer';
import { t } from '../i18n/i18n';

export function TextEditor() {
  const s = text.value;
  return (
    <div class="texted">
      <input
        class="textin"
        type="text"
        maxLength={40}
        placeholder={t('text.placeholder')}
        value={s.text}
        onInput={(e) => (text.value = { ...text.value, text: (e.currentTarget as HTMLInputElement).value })}
      />
      <div class="colors">
        {TEXT_COLORS.map((c) => (
          <button key={c} class={'swatch' + (s.color === c ? ' active' : '')} style={{ background: c }} aria-label={c} aria-pressed={s.color === c} onClick={() => (text.value = { ...text.value, color: c })} />
        ))}
        <button class="chip small" aria-label={t('text.font')} onClick={() => (text.value = { ...text.value, font: text.value.font === 'a' ? 'b' : 'a' })}>Aa</button>
        <button class="chip small" aria-label={t('text.clear')} onClick={() => (text.value = { ...text.value, text: '' })}>✖</button>
      </div>
    </div>
  );
}
