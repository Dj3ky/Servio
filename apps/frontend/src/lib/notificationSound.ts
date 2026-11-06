// Short chime for in-app notifications, generated so there is no audio file to load.
// Browsers block sound until the user has interacted with the page, so the audio context
// is created on the first click or key press. Before that the notification is silent.

const MIN_GAP_MS = 2000;
const MUTED_KEY = 'notification_sound_muted';

// Saved per device. Storage can be unavailable (e.g. private windows), then sound stays on.
export function isSoundMuted(): boolean {
  try {
    return localStorage.getItem(MUTED_KEY) === '1';
  } catch {
    return false;
  }
}

export function setSoundMuted(muted: boolean): void {
  try {
    if (muted) localStorage.setItem(MUTED_KEY, '1');
    else localStorage.removeItem(MUTED_KEY);
  } catch {}
}

let audio: AudioContext | null = null;
let lastPlayed = 0;

function unlock() {
  audio ??= new AudioContext();
  void audio.resume();
  window.removeEventListener('pointerdown', unlock);
  window.removeEventListener('keydown', unlock);
}

window.addEventListener('pointerdown', unlock);
window.addEventListener('keydown', unlock);

function tone(ctx: AudioContext, frequency: number, start: number) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.15, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + 0.25);
  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(start + 0.25);
}

// True once playNotificationSound can actually make a sound
export function canPlayNotificationSound(): boolean {
  return audio !== null && !isSoundMuted();
}

export function playNotificationSound(): void {
  const ctx = audio;
  if (!ctx || isSoundMuted()) return;
  // Several notifications arriving together (e.g. tasks from a meeting) get one chime
  if (Date.now() - lastPlayed < MIN_GAP_MS) return;
  lastPlayed = Date.now();
  void ctx.resume().then(() => {
    tone(ctx, 880, ctx.currentTime);
    tone(ctx, 1175, ctx.currentTime + 0.12);
  });
}
