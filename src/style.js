export const W = 2560;
export const H = 1440;
export const CQ = Math.min(W, H) / 100;

export const cq = (n) => n * CQ;

export const COLORS = {
  b1: '#8e55e0',
  b2: '#55229f',
  b3: '#34207f',
  amber: '#ffc13a',
  amber2: '#ff8f2b',
  red: '#ff4d4f',
  white: '#fff',
  pagebg: '#090b1c',
  muted: '#8e94c8',
  vig: 'rgba(20,6,60,.5)',
  glass: 'rgba(255,255,255,.14)',
  glassline: 'rgba(255,255,255,.34)',
};

export const SERIES = {
  // dark        = opaque panel bg (zoom badge, watermark pill)
  // darkLight   = lighter panel bg (watermark pill lighter variant)
  // darkMid     = semi-transparent lens / vignette overlay
  // darkDeep    = deep text-shadow / strong overlay tint
  // darkOverlay = full-screen intro overlay
  // hint        = hint-dot inactive fill
  // panelBg     = glass card bg for Q-counter / level badge / LevelCard chip (needs to pop off bg)
  // panelBorder = border colour for glass cards
  main:    {b1: '#8e55e0', b2: '#55229f', b3: '#34207f', vig: 'rgba(20,6,60,.5)',    dark: 'rgba(10,14,80,.82)',  darkLight: 'rgba(10,14,80,.55)',  darkMid: 'rgba(6,4,44,.62)',   darkDeep: 'rgba(20,8,90,.9)',   darkOverlay: 'rgba(6,4,44,.72)',  hint: '#2a1d6e',  panelBg: 'rgba(10,8,50,.72)',   panelBorder: 'rgba(255,255,255,.38)'},
  food:    {b1: '#35d696', b2: '#0b8d5a', b3: '#0a5f7c', vig: 'rgba(2,40,34,.5)',   dark: 'rgba(2,20,16,.88)',   darkLight: 'rgba(2,20,16,.65)',   darkMid: 'rgba(1,18,14,.70)',  darkDeep: 'rgba(1,16,12,.95)',  darkOverlay: 'rgba(1,22,16,.80)', hint: '#062e22',  panelBg: 'rgba(2,22,18,.82)',   panelBorder: 'rgba(255,255,255,.45)'},
  animals: {b1: '#5668ff', b2: '#2433dc', b3: '#0b64d8', vig: 'rgba(5,8,60,.45)',   dark: 'rgba(4,8,60,.85)',    darkLight: 'rgba(4,8,60,.55)',    darkMid: 'rgba(3,5,48,.62)',   darkDeep: 'rgba(3,6,55,.9)',    darkOverlay: 'rgba(3,5,48,.72)',  hint: '#080f52',  panelBg: 'rgba(4,8,56,.78)',    panelBorder: 'rgba(255,255,255,.40)'},
  science: {b1: '#22cfe0', b2: '#0a86bb', b3: '#0a4a96', vig: 'rgba(2,26,70,.5)',   dark: 'rgba(2,16,50,.86)',   darkLight: 'rgba(2,16,50,.55)',   darkMid: 'rgba(1,14,44,.62)',  darkDeep: 'rgba(1,14,46,.9)',   darkOverlay: 'rgba(1,14,44,.72)', hint: '#041430',  panelBg: 'rgba(2,16,48,.78)',   panelBorder: 'rgba(255,255,255,.40)'},
};

export const FONTS = {
  display: '"Anton", "Impact", "Arial Narrow", sans-serif',
  mono: '"JetBrains Mono", ui-monospace, Menlo, monospace',
};

export function seriesColors(name) {
  return SERIES[name] || SERIES.main;
}

export const LEVELS = {
  easy: {label: 'EASY', color: '#3ddc84', sub: 'Warm-up round'},
  medium: {label: 'MEDIUM', color: '#ffc13a', sub: 'Now it gets tricky'},
  hard: {label: 'HARD', color: '#ff5d5d', sub: 'Sharp eyes only'},
};
