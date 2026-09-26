import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { screen, store, current, refreshGallery } from './state';
import { createConfirm } from './confirm';
import { shareOrDownload, downloadFile } from '../capture/share';
import { t } from '../i18n/i18n';
import { mimeForName } from '../storage/gallery';
import { pauseWhenHidden } from './background';

export function Viewer() {
  const name = current.value!;
  const [url, setUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const confirm = useMemo(() => createConfirm(3000), [name]);
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => pauseWhenHidden(() => videoRef.current), []); // no playback in the background
  useEffect(() => {
    let u: string | null = null;
    store.value?.get(name).then((b) => { if (b) { const f = new File([b], name, { type: mimeForName(name) }); setFile(f); u = URL.createObjectURL(f); setUrl(u); } });
    return () => { if (u) URL.revokeObjectURL(u); confirm.cancel(); };
  }, [name]);
  const back = () => { screen.value = 'gallery'; };
  const del = () => confirm.tap(async () => { await store.value?.delete(name); await refreshGallery(); back(); });
  const isVideo = mimeForName(name).startsWith('video/');
  return (
    <div class="sheet viewer" role="dialog" aria-label={name}>
      <button class="close" aria-label={t('gallery.back')} onClick={back}>✖</button>
      {url && (isVideo
        ? <video ref={videoRef} class="full" src={url} controls playsInline autoPlay loop />
        : <img class="full" src={url} alt="" />)}
      <div class="bar viewbar">
        <button class="round" aria-label={t('viewer.share')} disabled={!file} onClick={() => file && shareOrDownload(file)}>📤</button>
        <button class="round" aria-label={t('viewer.save')} disabled={!file} onClick={() => file && downloadFile(file)}>💾</button>
        {!isVideo && <button class="round" aria-label={t('viewer.edit')} disabled={!file} onClick={() => (screen.value = 'editor')}>✏️</button>}
        <button class={'round' + (confirm.armed.value ? ' danger' : '')} aria-label={confirm.armed.value ? t('viewer.deleteConfirm') : t('viewer.delete')} onClick={del}>{confirm.armed.value ? '❓' : '🗑️'}</button>
      </div>
      {confirm.armed.value && <p class="hint">{t('viewer.deleteConfirm')}</p>}
    </div>
  );
}
