import { dockOpen, dockTab, presets, stickers, sliders, makeup, scene, target, props3d, type DockTab } from './state';
import { DEFAULT_SLIDERS } from '../filters/sliders';
import { PRESETS, togglePreset, type PresetId } from '../filters/presets';
import { STICKER_PACKS, toggleSticker } from '../filters/stickers';
import { MAKEUP, pickLook, type LookId } from '../filters/makeup';
import { BACKDROPS, pickScene } from '../filters/scenes';
import { PROPS3D_CHIPS } from '../filters/props3d';
import { afterPick } from '../filters/costumes';
import { Strip } from './Strip';
import { TextEditor } from './TextEditor';
import { LabRows } from './FaceLab';
import { VoicePanel } from './VoicePanel';
import { FaceOnPanel } from './FaceOnPanel';
import { t } from '../i18n/i18n';

const ALL_TABS: { id: DockTab; icon: string }[] = [
  { id: 'warp', icon: '🎭' },
  { id: 'sticker', icon: '🐱' },
  { id: 'props3d', icon: '🎩' },
  { id: 'makeup', icon: '💄' },
  { id: 'faceon', icon: '🍊' },
  { id: 'scene', icon: '🏝️' },
  { id: 'text', icon: '✏️' },
  { id: 'voice', icon: '🎤' },
  { id: 'lab', icon: '🧪' },
];
// The places tab shows when there is a place to pick (the art arrives with request R2).
const TABS = ALL_TABS.filter((x) => x.id !== 'scene' || BACKDROPS.length > 1);

// Slide-in effects panel. The pull tab sits on the panel's right edge, so it stays reachable open or closed.
export function Dock() {
  const open = dockOpen.value, tab = dockTab.value;
  let x0 = 0;
  const onDown = (e: PointerEvent) => { x0 = e.clientX; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); };
  const onMove = (e: PointerEvent) => { const dx = e.clientX - x0; if (dx > 40) dockOpen.value = true; else if (dx < -40) dockOpen.value = false; };
  return (
    <aside class={'dock' + (open ? ' open' : '')} aria-label={t('dock.title')}>
      <button class="pull" aria-label="effects" aria-expanded={open} onClick={() => (dockOpen.value = !dockOpen.value)} onPointerDown={onDown} onPointerMove={onMove}>
        {open ? '◀' : '✨'}
      </button>
      <div class="rail" role="tablist">
        {TABS.map((x) => (
          <button key={x.id} role="tab" class={'tab' + (tab === x.id ? ' active' : '')} aria-label={x.id} aria-selected={tab === x.id} title={t('tabs.' + x.id)} onClick={() => (dockTab.value = x.id)}>
            {x.icon}
          </button>
        ))}
      </div>
      <div class="dock-body">
        {tab === 'warp' && <Strip items={PRESETS} value={presets.value} onPick={(id) => { presets.value = togglePreset(presets.value, id as PresetId); if (presets.value.length > 0) sliders.value = DEFAULT_SLIDERS; }} label={t('tabs.warp')} />}
        {tab === 'sticker' && <Strip items={STICKER_PACKS} value={stickers.value} onPick={(id) => (stickers.value = toggleSticker(stickers.value, id))} label={t('tabs.sticker')} />}
        {tab === 'props3d' && <Strip items={PROPS3D_CHIPS} value={props3d.value} onPick={(id) => { const to = afterPick(makeup.value, props3d.value, id); makeup.value = to.look; props3d.value = to.active; }} label={t('tabs.props3d')} />}
        {tab === 'makeup' && <Strip items={MAKEUP} value={makeup.value} onPick={(id) => (makeup.value = pickLook(makeup.value, id as LookId))} label={t('tabs.makeup')} />}
        {tab === 'faceon' && <FaceOnPanel />}
        {tab === 'scene' && <Strip items={BACKDROPS} value={scene.value} onPick={(id) => { scene.value = pickScene(scene.value, id); if (scene.value !== 'none') target.value = 'none'; }} label={t('tabs.scene')} />}
        {tab === 'text' && <TextEditor />}
        {tab === 'voice' && <VoicePanel />}
        {tab === 'lab' && <LabRows />}
      </div>
    </aside>
  );
}
