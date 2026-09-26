import { busy, galleryThumb } from './state';

export function CaptureButton({ onCapture, onFlip, onGallery }: { onCapture: () => void; onFlip: () => void; onGallery: () => void }) {
  return (
    <div class="bar">
      <button class="round flip" aria-label="flip camera" onClick={onFlip}>🔄</button>
      <button class="round shutter" aria-label="take photo" disabled={busy.value} onClick={onCapture} />
      <button class={'round gallery-btn' + (galleryThumb.value ? ' has-thumb' : '')} aria-label="gallery" onClick={onGallery}>{galleryThumb.value ? <img src={galleryThumb.value} alt="" /> : '🖼️'}</button>
    </div>
  );
}
