// Neon Shadow — all sound is synthesized with WebAudio, no audio files.
// The context is created on the first user gesture; every call is safe
// before that (it simply does nothing). Mute persists in localStorage.
let ctx = null;
let muted = false;
try {
  muted = localStorage.getItem('neon-shadow.muted') === '1';
} catch {
  muted = false;
}

export function ensureAudio() {
  if (!ctx) {
    try {
      const AC = window.AudioContext ?? window.webkitAudioContext;
      if (AC) ctx = new AC();
    } catch {
      ctx = null;
    }
  }
  if (ctx && ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export function isMuted() {
  return muted;
}

export function toggleMute() {
  muted = !muted;
  try {
    localStorage.setItem('neon-shadow.muted', muted ? '1' : '0');
  } catch {
    // Storage unavailable: mute still applies for this visit.
  }
  return muted;
}

function tone(freq, dur, type, gain, when = 0, slideTo = 0) {
  if (!ctx || muted) return;
  const t0 = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo > 0) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(amp);
  amp.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

export const sfx = {
  click() { tone(660, 0.07, 'sine', 0.12); },
  pickup() { tone(880, 0.09, 'sine', 0.16); tone(1318, 0.14, 'sine', 0.14, 0.07); },
  step() { tone(180, 0.04, 'triangle', 0.03); },
  suspicious() { tone(392, 0.16, 'square', 0.08); tone(311, 0.2, 'square', 0.08, 0.12); },
  alarm() {
    tone(220, 0.22, 'sawtooth', 0.12, 0, 440);
    tone(220, 0.22, 'sawtooth', 0.12, 0.24, 440);
  },
  calm() { tone(523, 0.18, 'sine', 0.1); tone(392, 0.24, 'sine', 0.1, 0.12); },
  caught() {
    tone(330, 0.3, 'sawtooth', 0.14, 0, 110);
    tone(165, 0.5, 'sawtooth', 0.12, 0.22, 55);
  },
  win() {
    [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, 'sine', 0.14, i * 0.09));
  },
};
