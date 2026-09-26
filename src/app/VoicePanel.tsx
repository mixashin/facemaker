import { useEffect, useMemo, useState } from 'preact/hooks';
import { voice } from './state';
import { Strip } from './Strip';
import { createHold } from './hold';
import { VOICE_PRESETS, type VoiceId } from '../audio/voice';
import { ensureVoice } from '../audio/session';
import { micState } from '../audio/mic';
import { Recorder, AUDIO_MIME_ORDER, type RecCtor } from '../capture/recorder';
import { t } from '../i18n/i18n';

type Mirror = 'idle' | 'rec' | 'play';

// Voice strip plus the voice mirror: hold the microphone, talk, let go, hear it back changed.
// Record then play: the mic never feeds the speaker, so nothing can howl.
export function VoicePanel() {
  const [mirror, setMirror] = useState<Mirror>('idle');
  useEffect(() => { ensureVoice(voice.value).catch(() => {}); }, []); // opening the tab is the first need

  const hold = useMemo(() => {
    let rec: Recorder | null = null;
    let held = false;
    const play = async () => {
      const file = await rec?.stop();
      if (!file) { setMirror('idle'); return; }
      const url = URL.createObjectURL(file);
      const a = new Audio(url);
      const done = () => { URL.revokeObjectURL(url); setMirror('idle'); };
      a.onended = done; a.onerror = done;
      setMirror('play');
      a.play().catch(done);
    };
    return createHold(async (e) => {
      if (e === 'tap') return;
      if (e === 'holdEnd') { held = false; if (rec?.active) await play(); return; }
      held = true;
      if (typeof MediaRecorder === 'undefined') return;
      const engine = await ensureVoice(voice.value);
      if (!engine || !held) return;
      rec = new Recorder(MediaRecorder as unknown as RecCtor, (m) => MediaRecorder.isTypeSupported(m), { order: AUDIO_MIME_ORDER, bitsPerSecond: 0, maxMs: 8000 });
      if (rec.start(engine.stream, () => play())) setMirror('rec');
    }, 150);
  }, []);

  const pick = (id: string) => { voice.value = id as VoiceId; ensureVoice(voice.value).catch(() => {}); };
  const denied = micState.value === 'denied';
  return (
    <div class="voice">
      <Strip items={VOICE_PRESETS} value={voice.value} onPick={pick} label={t('tabs.voice')} />
      {denied
        ? <p class="line small" role="status">🔒🎤 {t('voice.denied')}</p>
        : (
          <button
            class={'round mirror' + (mirror !== 'idle' ? ' ' + mirror : '')}
            aria-label="voice mirror"
            title={t('voice.try')}
            disabled={mirror === 'play'}
            onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); hold.down(); }}
            onPointerUp={() => hold.up()}
            onPointerCancel={() => hold.cancel()}
            onContextMenu={(e) => e.preventDefault()}
          >
            {mirror === 'rec' ? '⏺️' : mirror === 'play' ? '🔊' : '🎤'}
          </button>
        )}
    </div>
  );
}
