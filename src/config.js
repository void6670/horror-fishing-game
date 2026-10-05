// Tunable game parameters. Settings from the options menu override some of these at runtime.
export const CONFIG = {
  // Real seconds per in-game hour (12 AM -> 6 AM = 6 hours).
  secondsPerHour: 100,
  // Chance (0..1) that any given catch is the alarm clock, indexed by in-game hour (0 = 12 AM ... 5 = 5 AM).
  alarmChanceByHour: [0.0, 0.01, 0.03, 0.08, 0.2, 0.38],
  // Once the alarm clock has been caught, the dream collapses: time moves faster but monsters are enraged.
  alarmTimeScale: 1.6,
  // Checkpoint hour inside a nightmare (dying after this hour restarts here instead of 12 AM).
  checkpointHour: 3,
  mouseSensitivity: 0.0022,
  fov: 72,
  quality: 'high', // 'low' | 'medium' | 'high'
  voiceSynthesis: true,
  masterVolume: 0.9,
  showClockAlways: false,
  playerName: 'Sam',
  debug: false,
};

export const QUALITY = {
  low: { shadowMap: 1024, reflectionScale: 0.25, pixelRatio: 0.75, treeDensity: 0.5, grass: false },
  medium: { shadowMap: 1024, reflectionScale: 0.4, pixelRatio: 1, treeDensity: 0.75, grass: true },
  high: { shadowMap: 2048, reflectionScale: 0.5, pixelRatio: Math.min(1.5, window.devicePixelRatio || 1), treeDensity: 1, grass: true },
};
