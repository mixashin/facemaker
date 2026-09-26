import { useMemo } from 'preact/hooks';
import { busy, galleryThumb, recording } from './state';
import { createHold, type HoldEvent } from './hold';

// Shutter: a tap takes a photo, a hold records a video until release. onShutter must be a stable function.
export function CaptureButton({ onShutter, onFlip, onGallery }: { onShutter: (e: HoldEvent) => void; onFlip: () => void; onGallery: () => void }) {
  const hold = useMemo(() => createHold(onShutter), []);
  const rec = recording.value;
  return (
    <div class="bar">
      <button class="round flip" aria-label="flip camera" disabled={rec} onClick={onFlip}>🔄</button>
      <button
        class={'round shutter' + (rec ? ' rec' : '')}
        aria-label="take photo"
        aria-pressed={rec}
        disabled={busy.value && !rec}
        onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); hold.down(); }}
        onPointerUp={() => hold.up()}
        onPointerCancel={() => hold.cancel()}
        onContextMenu={(e) => e.preventDefault()}
        onClick={(e) => { if (e.detail === 0) onShutter('tap'); }}
      >
        {rec && <svg class="ring" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="46" /></svg>}
      </button>
      <button class={'round gallery-btn' + (galleryThumb.value ? ' has-thumb' : '')} aria-label="gallery" disabled={rec} onClick={onGallery}>{galleryThumb.value ? <img src={galleryThumb.value} alt="" /> : '🖼️'}</button>
    </div>
  );
}
