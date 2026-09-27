import { describe, it, expect } from 'vitest';
import { report, type Facts } from './report';

const facts: Facts = {
  build: 'abc1234 2026-09-27', installed: true, agent: 'Mozilla/5.0 (Linux; Android 16; SM-F966B) Chrome/140', screen: '768x884 @2.6',
  video: '1280x720', webgl: 'ANGLE (Qualcomm, Adreno (TM) 830, OpenGL ES 3.2)', worker: 'activated',
  tracker: { prefer: 'auto', delegate: 'GPU', results: 412, withFace: 0, errors: 3, lastError: 'gl lost', note: '' },
};

describe('report', () => {
  it('names the build, the device and the state of the tracker, one fact per line', () => {
    const lines = report(facts).split('\n');
    expect(lines[0]).toBe('facemaker abc1234 2026-09-27');
    expect(lines).toContain('installed: yes');
    expect(lines).toContain('screen: 768x884 @2.6');
    expect(lines).toContain('camera: 1280x720');
    expect(lines).toContain('graphics: ANGLE (Qualcomm, Adreno (TM) 830, OpenGL ES 3.2)');
    expect(lines).toContain('tracker: GPU (asked: auto)');
    expect(lines).toContain('tracker results: 412, with a face: 0, errors: 3');
    expect(lines).toContain('last error: gl lost');
    expect(lines).toContain('offline copy: activated');
    expect(lines.some((l) => l.includes('SM-F966B'))).toBe(true);
  });
  it('says so when the tracker did not start', () => {
    const text = report({ ...facts, tracker: { ...facts.tracker, delegate: '', results: 0, errors: 0, lastError: '' } });
    expect(text).toContain('tracker: not started (asked: auto)');
    expect(text).not.toContain('last error');
  });
  it('shows the note of the start (why the CPU took over)', () => {
    expect(report({ ...facts, tracker: { ...facts.tracker, delegate: 'CPU', note: 'GPU failed: no context' } })).toContain('note: GPU failed: no context');
  });
  it('holds no word "undefined" and no empty line', () => {
    const text = report({ ...facts, video: '', webgl: '' });
    expect(text).not.toMatch(/undefined|null/);
    expect(text.split('\n').every((l) => l.trim().length > 0)).toBe(true);
    expect(text).toContain('camera: none');
    expect(text).toContain('graphics: none');
  });
});
