// Spec-12 §5.2 "krátká animace + zvuk (i bez zvuku to musí být uspokojivé)". Synthesised, so there
// are no audio files to download. Off switch in Settings; never throws.
const MUTE_KEY = 'soundMuted';
let context = null;

export const isSoundMuted = () => localStorage.getItem(MUTE_KEY) === 'true';
export const setSoundMuted = (muted) => localStorage.setItem(MUTE_KEY, muted ? 'true' : 'false');

const SOUNDS = {
  reward: [[523, 0], [659, 0.09], [784, 0.18]],
  key: [[880, 0], [1175, 0.08]],
  levelUp: [[523, 0], [659, 0.08], [784, 0.16], [1047, 0.24]],
};

export function playSound(name) {
  if (isSoundMuted()) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    context = context || new Ctx();
    if (context.state === 'suspended') context.resume();
    (SOUNDS[name] || []).forEach(([frequency, at]) => {
      const osc = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime + at;
      osc.type = 'triangle';
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.08, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.2);
      osc.connect(gain).connect(context.destination);
      osc.start(start);
      osc.stop(start + 0.22);
    });
  } catch (e) {
    console.warn('Sound failed.', e);
  }
  if (navigator.vibrate) navigator.vibrate(15);
}
