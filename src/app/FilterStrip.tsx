import { PRESETS } from '../filters/presets';
import { preset } from './state';

export function FilterStrip() {
  return (
    <nav class="strip" aria-label="filters">
      {PRESETS.map((p) => (
        <button
          key={p.id}
          class={'chip' + (preset.value === p.id ? ' active' : '')}
          aria-label={p.id}
          aria-pressed={preset.value === p.id}
          onClick={() => (preset.value = p.id)}
        >
          {p.icon}
        </button>
      ))}
    </nav>
  );
}
