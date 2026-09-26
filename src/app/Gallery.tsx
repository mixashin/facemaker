import { useEffect, useState } from 'preact/hooks';
import { screen, store, items, current } from './state';
import { t } from '../i18n/i18n';
import type { GalleryItem } from '../storage/gallery';

function Thumb({ item }: { item: GalleryItem }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let u: string | null = null, gone = false;
    store.value?.thumb(item.name).then((b) => { if (!b) return; if (gone) return; u = URL.createObjectURL(b); setUrl(u); }).catch(() => {});
    return () => { gone = true; if (u) URL.revokeObjectURL(u); };
  }, [item.name]);
  return (
    <button class="thumb" aria-label={item.name} onClick={() => { current.value = item.name; screen.value = 'viewer'; }}>
      {url ? <img src={url} alt="" /> : <span class="big">🖼️</span>}
      {item.type === 'video' && <span class="badge">▶</span>}
    </button>
  );
}

export function Gallery() {
  return (
    <div class="sheet gallery" role="dialog" aria-label={t('gallery.title')}>
      <button class="close" aria-label={t('gallery.back')} onClick={() => (screen.value = 'camera')}>✖</button>
      <h2>{t('gallery.title')}</h2>
      {items.value.length === 0 ? (
        <p class="line">{t('gallery.empty')}</p>
      ) : (
        <div class="grid">{items.value.map((it) => <Thumb key={it.name} item={it} />)}</div>
      )}
    </div>
  );
}
