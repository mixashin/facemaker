import { target } from './state';
import { FACEON, pickTarget } from '../filters/faceon';
import { Strip } from './Strip';
import { t } from '../i18n/i18n';

// Face on a picture: the live eyes and mouth on an orange, a cat, and so on.
export function FaceOnPanel() {
  return <Strip items={FACEON.filter((c) => c.id !== 'photo')} value={target.value} onPick={(id) => (target.value = pickTarget(target.value, id))} label={t('tabs.faceon')} />;
}
