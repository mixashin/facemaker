import { dockOpen, dockTab, presets, stickers, sliders, type DockTab } from './state';
import { DEFAULT_SLIDERS } from '../filters/sliders';
import { PRESETS, togglePreset, type PresetId } from '../filters/presets';
import { STICKER_PACKS, toggleSticker } from '../filters/stickers';
import { Strip } from './Strip';
import { TextEditor } from './TextEditor';
import { LabRows } from './FaceLab';
import { VoicePanel } from './VoicePanel';
import { t } from '../i18n/i18n';

const TABS: { id: DockTab; icon: string }[] = [
  { id: 'warp', icon: '🎭' },
  { id: 'sticker', icon: '🐱' },
  { id: 'text', icon: '✏️' },
  { id: 'voice', icon: '🎤' },
  { id: 'lab', icon: '🧪' },
];

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
        {tab === 'text' && <TextEditor />}
        {tab === 'voice' && <VoicePanel />}
        {tab === 'lab' && <LabRows />}
      </div>
    </aside>
  );
}
