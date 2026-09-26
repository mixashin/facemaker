import { showThemes } from './state';
import { ThemePicker } from './ThemePicker';

export function TopBar() {
  return (
    <div class="top">
      <button class="round" aria-label="theme" aria-expanded={showThemes.value} onClick={() => (showThemes.value = !showThemes.value)}>🎨</button>
      {showThemes.value && <ThemePicker />}
    </div>
  );
}
