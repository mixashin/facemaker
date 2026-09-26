import { showSettings } from './state';

export function TopBar() {
  return (
    <div class="top">
      <button class="round" aria-label="settings" onClick={() => (showSettings.value = true)}>⚙️</button>
    </div>
  );
}
