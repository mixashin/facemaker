import { signal } from '@preact/signals';
import type { PresetId } from '../filters/presets';
import type { Facing } from '../camera/camera';
import type { ThemeId } from './themes';
import type { TextState } from '../render/textLayer';
import type { GalleryStore, GalleryItem } from '../storage/gallery';
import { DEFAULT_SLIDERS, type SliderState } from '../filters/sliders';
import type { VoiceId } from '../audio/voice';
import type { LookId } from '../filters/makeup';
import type { Target } from '../filters/faceon';
import type { Scene } from '../filters/scenes';

export type CamState = 'idle' | 'starting' | 'live' | 'denied' | 'nocam' | 'error';

export const presets = signal<PresetId[]>([]); // active face filters in pick order. Clean start, the kid picks
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
export type DockTab = 'warp' | 'sticker' | 'makeup' | 'faceon' | 'scene' | 'text' | 'voice' | 'lab';
export const dockOpen = signal(false); // effects dock on the left, closed by default
export const dockTab = signal<DockTab>('warp');
export const stickers = signal<string[]>([]); // active sticker packs in pick order
export type Screen = 'camera' | 'gallery' | 'viewer' | 'editor';
export const screen = signal<Screen>('camera');
export const store = signal<GalleryStore | null>(null);
export const items = signal<GalleryItem[]>([]);
export const current = signal<string | null>(null);
export async function refreshGallery(): Promise<void> {
  items.value = store.value ? await store.value.list() : [];
}
export const sliders = signal<SliderState>(DEFAULT_SLIDERS);
export const galleryThumb = signal<string | null>(null); // object URL of the newest photo, shown on the gallery button
export const flyShot = signal<string | null>(null);      // object URL of the photo animating into the gallery button
export const recording = signal(false); // a video is being recorded
export const voice = signal<VoiceId>('none');
export const target = signal<string>('none'); // face-on mode: id of the picture that carries the live eyes and mouth
export const photo = signal<Target | null>(null); // the picture from the device, this session only
// Face search on a still picture. App.tsx sets it when the tracker runs (the tracker owns the worker).
export const still: { detect: null | ((picture: ImageBitmap) => Promise<Float32Array | null>) } = { detect: null };
export const scene = signal<string>('none'); // the place behind the person
export const tryScene = signal<Scene | null>(null); // a scene that is not in the list: for checks (scripts/smoke.mjs)
export const makeup = signal<LookId>('none'); // one look at a time. It combines with filters, stickers, text and voice
