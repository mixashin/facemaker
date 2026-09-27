import { useRef, useState } from 'preact/hooks';
import { target, photo, still, scene } from './state';
import { FACEON, pickTarget, photoTarget, fitSize } from '../filters/faceon';
import { Strip } from './Strip';
import { t } from '../i18n/i18n';

let job = 0; // two photos picked one after the other: the one picked last wins, not the one that is ready last

// A photo from the device becomes the picture. It stays on the device: a local copy in memory, local face search.
// Result: false when the photo was replaced by a newer pick.
async function usePhoto(file: File): Promise<boolean> {
  const mine = ++job;
  const full = await createImageBitmap(file);
  const [w, h] = fitSize(full.width, full.height); // a phone photo is too large for a texture
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d')!.drawImage(full, 0, 0, w, h);
  full.close();
  const blob = await new Promise<Blob | null>((done) => c.toBlob(done, 'image/jpeg', 0.9));
  if (!blob) throw new Error('no picture from the canvas');
  const lm = still.detect ? await still.detect(await createImageBitmap(c)) : null; // no face: eyes and mouth go in the middle
  if (mine !== job) return false;
  if (photo.value) URL.revokeObjectURL(photo.value.img);
  photo.value = photoTarget(URL.createObjectURL(blob), lm, w, h);
  target.value = 'photo';
  scene.value = 'none';
  return true;
}

// Face on a picture: the live eyes and mouth on an orange, a cat, or a photo from the device.
export function FaceOnPanel() {
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<'idle' | 'busy' | 'failed'>('idle');
  const pick = (id: string) => {
    if (id === 'photo') input.current?.click(); // the picture changes when a photo arrives, not before
    else { target.value = pickTarget(target.value, id); if (target.value !== 'none') scene.value = 'none'; } // a picture takes the place of the camera view: no place behind it
  };
  const onFile = (e: Event) => {
    const el = e.currentTarget as HTMLInputElement;
    const file = el.files?.[0];
    el.value = ''; // the same photo can be picked again
    if (!file) return;
    setState('busy');
    usePhoto(file).then((used) => { if (used) setState('idle'); }).catch((err) => {
      console.warn('photo', err); // not a picture, or a format that the browser cannot read
      setState('failed');
      setTimeout(() => setState((s) => (s === 'failed' ? 'idle' : s)), 2500);
    });
  };
  const icon = state === 'busy' ? '⏳' : state === 'failed' ? '⚠️' : null;
  const items = icon ? FACEON.map((c) => (c.id === 'photo' ? { ...c, icon } : c)) : FACEON;
  return (
    <>
      <Strip items={items} value={target.value} onPick={pick} label={t('tabs.faceon')} />
      <input ref={input} type="file" accept="image/*" hidden aria-label="photo file" onChange={onFile} />
    </>
  );
}
