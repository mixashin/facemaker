import { useEffect, useMemo, useState } from 'preact/hooks';
import { voice, dockOpen } from './state';
import { Strip } from './Strip';
import { createHold } from './hold';
import { VOICE_PRESETS, type VoiceId } from '../audio/voice';
import { acquireVoice, setVoicePreset, type Lease } from '../audio/session';
import { micState, micNeedsPrompt } from '../audio/mic';
import { Recorder, AUDIO_MIME_ORDER, type RecCtor } from '../capture/recorder';
import { t } from '../i18n/i18n';
import { pauseWhenHidden } from './background';

type Mirror = 'idle' | 'rec' | 'play';

// Voice strip plus the voice mirror: hold the microphone, talk, let go, hear it back changed.
// Record then play: the mic never feeds the speaker, so nothing can howl. The mic is held only
// while the mirror records (session.ts turns it off a few seconds after the lease goes back).
export function VoicePanel() {
  const [mirror, setMirror] = useState<Mirror>('idle');
  // Opening the tab is a first need: the mic question shows here, not in the middle of a hold.
  // Only for an open dock (the dock renders closed too) and only while the answer is open.
  const open = dockOpen.value;
  useEffect(() => {
    if (!open) return;
    let here = true;
    micNeedsPrompt().then((need) => { if (need && here) acquireVoice(voice.value).then((l) => l.release()); });
    return () => { here = false; };
  }, [open]);

  const m = useMemo(() => {
    let rec: Recorder | null = null;
    let lease: Lease | null = null;
    let audio: HTMLAudioElement | null = null;
    let url: string | null = null;
    let held = false, gone = false;
    const free = () => { lease?.release(); lease = null; };
    const done = () => {
      if (url) URL.revokeObjectURL(url);
      url = null; audio = null;
      free();
      if (!gone) setMirror('idle');
    };
    const play = async () => {
      const r = rec; rec = null;
      const file = await r?.stop().catch(() => null);
      free(); // playback needs no mic
      if (!file || gone) { done(); return; }
      url = URL.createObjectURL(file);
      audio = new Audio(url);
      audio.onended = done; audio.onerror = done; audio.onpause = done;
      setMirror('play');
      audio.play().catch(done);
    };
    const hold = createHold(async (e) => {
      if (e === 'tap') return;
      if (e === 'holdEnd') { held = false; if (rec?.active) await play(); return; }
      held = true;
      if (typeof MediaRecorder === 'undefined' || audio || rec) return;
      const l = await acquireVoice(voice.value);
      if (!l.engine || !held || gone) { l.release(); return; }
      lease = l;
      rec = new Recorder(MediaRecorder as unknown as RecCtor, (x) => MediaRecorder.isTypeSupported(x), { order: AUDIO_MIME_ORDER, bitsPerSecond: 0, maxMs: 8000 });
      if (rec.start(l.engine.stream, () => play())) setMirror('rec');
      else { rec = null; free(); }
    }, 150);
    // The dock closes on a tap on the video, on a tab change and when a recording starts: end everything.
    const stopAll = () => {
      held = false;
      const r = rec; rec = null;
      r?.stop().catch(() => null);
      audio?.pause();
      done();
    };
    const cleanup = () => { gone = true; stopAll(); };
    return { hold, stopAll, cleanup };
  }, []);
  useEffect(() => m.cleanup, []);
  useEffect(() => pauseWhenHidden(() => ({ pause: m.stopAll })), []); // another app in front: stop the mirror

  const pick = (id: string) => { voice.value = id as VoiceId; setVoicePreset(voice.value); };
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
            onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); m.hold.down(); }}
            onPointerUp={() => m.hold.up()}
            onPointerCancel={() => m.hold.cancel()}
            onContextMenu={(e) => e.preventDefault()}
          >
            {mirror === 'rec' ? '⏺️' : mirror === 'play' ? '🔊' : '🎤'}
          </button>
        )}
    </div>
  );
}
