import { useRef } from 'preact/hooks';
import { target, photo, still } from './state';
import { FACEON, pickTarget, photoTarget, fitSize } from '../filters/faceon';
import { Strip } from './Strip';
import { t } from '../i18n/i18n';

// A photo from the device becomes the picture. It stays on the device: a local copy in memory, local face search.
async function usePhoto(file: File): Promise<void> {
  const full = await createImageBitmap(file);
  const [w, h] = fitSize(full.width, full.height); // a phone photo is too large for a texture
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d')!.drawImage(full, 0, 0, w, h);
  full.close();
  const blob = await new Promise<Blob | null>((done) => c.toBlob(done, 'image/jpeg', 0.9));
  if (!blob) return;
  const lm = still.detect ? await still.detect(await createImageBitmap(c)) : null; // no face: eyes and mouth go in the middle
  if (photo.value) URL.revokeObjectURL(photo.value.img);
  photo.value = photoTarget(URL.createObjectURL(blob), lm, w, h);
  target.value = 'photo';
}

// Face on a picture: the live eyes and mouth on an orange, a cat, or a photo from the device.
export function FaceOnPanel() {
  const input = useRef<HTMLInputElement>(null);
  const pick = (id: string) => {
    if (id === 'photo') input.current?.click(); // the picture changes when a photo arrives, not before
    else target.value = pickTarget(target.value, id);
  };
  const onFile = (e: Event) => {
    const el = e.currentTarget as HTMLInputElement;
    const file = el.files?.[0];
    el.value = ''; // the same photo can be picked again
    if (file) usePhoto(file).catch((err) => console.warn('photo', err));
  };
  return (
    <>
      <Strip items={FACEON} value={target.value} onPick={pick} label={t('tabs.faceon')} />
      <input ref={input} type="file" accept="image/*" hidden aria-label="photo file" onChange={onFile} />
    </>
  );
}
