export function CaptureButton({ onCapture, onFlip }: { onCapture: () => void; onFlip: () => void }) {
  return (
    <div class="bar">
      <button class="round flip" aria-label="flip camera" onClick={onFlip}>🔄</button>
      <button class="round shutter" aria-label="take photo" onClick={onCapture} />
      <span class="round spacer" />
    </div>
  );
}
