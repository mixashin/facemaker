import type { Mode } from './state';

// A tab tap opens its strip. Tapping the open tab again closes it. Nothing is open by default.
export function toggleMode(current: Mode, tapped: Exclude<Mode, 'none'>): Mode {
  return current === tapped ? 'none' : tapped;
}
