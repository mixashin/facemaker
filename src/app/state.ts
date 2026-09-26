import { signal } from '@preact/signals';
import type { PresetId } from '../filters/presets';
import type { Facing } from '../camera/camera';
import type { ThemeId } from './themes';
import type { TextState } from '../render/textLayer';

export type CamState = 'idle' | 'starting' | 'live' | 'denied' | 'nocam' | 'error';

export const preset = signal<PresetId>('bigEyes');
export const facing = signal<Facing>('user');
export const camState = signal<CamState>('idle');
export const flash = signal(false);
export const busy = signal(false); // a capture is in progress

export function camStateFromError(name: string): 'denied' | 'nocam' | 'error' {
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'nocam';
  return 'error';
}

export const theme = signal<ThemeId>('neutral');
export const showThemes = signal(false);
export const tutorialSeen = signal(false);
export const showSettings = signal(false);
export const showAbout = signal(false);
export const text = signal<TextState>({ text: '', color: '#ffffff', font: 'a', x: 0.5, y: 0.25, scale: 1 });
export type Mode = 'none' | 'warp' | 'sticker' | 'text';
export const mode = signal<Mode>('none'); // clean screen: no strip open until a tab is tapped
export const sticker = signal<string>('none');
