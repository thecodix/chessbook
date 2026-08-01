// Minimal dependency-free WebAudio beep helper for Portal Chess sound
// effects — no external audio assets/licensing to worry about, and no npm
// package needed (avoids the Docker/npm-install overhead this repo avoids
// elsewhere, e.g. the guided Tour component).

let ctx = null
function getCtx() {
  if (typeof window === 'undefined') return null
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return null
  if (!ctx) ctx = new AC()
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}

export function beep(freq = 440, duration = 0.09, type = 'sine', volume = 0.06) {
  const c = getCtx()
  if (!c) return
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = type
  osc.frequency.value = freq
  osc.connect(gain)
  gain.connect(c.destination)
  const now = c.currentTime
  gain.gain.setValueAtTime(volume, now)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)
  osc.start(now)
  osc.stop(now + duration)
}

export const SFX = {
  move: () => beep(320, 0.05, 'sine', 0.04),
  capture: () => beep(200, 0.12, 'square', 0.05),
  charge: () => beep(140, 0.16, 'sawtooth', 0.05),
  kill: () => { beep(500, 0.1, 'square', 0.06); setTimeout(() => beep(250, 0.18, 'square', 0.06), 90) },
  teleport: () => { beep(700, 0.06, 'sine', 0.05); setTimeout(() => beep(900, 0.08, 'sine', 0.05), 60) },
  blackhole: () => { beep(120, 0.3, 'sawtooth', 0.06); setTimeout(() => beep(80, 0.35, 'sawtooth', 0.05), 120) },
  win: () => { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.14, 'triangle', 0.06), i * 110)) },
  lose: () => { [400, 300, 220].forEach((f, i) => setTimeout(() => beep(f, 0.2, 'sawtooth', 0.05), i * 140)) },
  buy: () => { beep(600, 0.05, 'sine', 0.05); setTimeout(() => beep(800, 0.07, 'sine', 0.05), 50) },
  card: () => { beep(520, 0.05, 'triangle', 0.05); setTimeout(() => beep(680, 0.06, 'triangle', 0.05), 55) },
  tick: () => beep(950, 0.045, 'square', 0.035),
  flawless: () => { [523, 659, 784, 988, 1318].forEach((f, i) => setTimeout(() => beep(f, 0.13, 'triangle', 0.065), i * 90)) },
}
