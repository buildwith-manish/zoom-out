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
  // dark      = opaque panel backgrounds (zoom badge, watermark pill, wordmark overlay)
  // darkMid   = semi-transparent lens / vignette overlays
  // darkDeep  = deep text-shadow / strong overlay tint
  // hint      = hint-dot inactive fill
  main:    {b1: '#8e55e0', b2: '#55229f', b3: '#34207f', vig: 'rgba(20,6,60,.5)',    dark: 'rgba(10,14,80,.62)',  darkLight: 'rgba(10,14,80,.42)',  darkMid: 'rgba(6,4,44,.62)',   darkDeep: 'rgba(20,8,90,.9)',   darkOverlay: 'rgba(6,4,44,.72)',  hint: '#2a1d6e'},
  food:    {b1: '#35d696', b2: '#0b8d5a', b3: '#0a5f7c', vig: 'rgba(2,40,34,.5)',   dark: 'rgba(4,36,28,.72)',   darkLight: 'rgba(4,36,28,.42)',   darkMid: 'rgba(2,28,22,.62)',  darkDeep: 'rgba(2,30,22,.9)',   darkOverlay: 'rgba(2,28,22,.72)', hint: '#0a3d2e'},
  animals: {b1: '#5668ff', b2: '#2433dc', b3: '#0b64d8', vig: 'rgba(5,8,60,.45)',   dark: 'rgba(6,10,70,.65)',   darkLight: 'rgba(6,10,70,.42)',   darkMid: 'rgba(4,6,54,.62)',   darkDeep: 'rgba(4,8,64,.9)',    darkOverlay: 'rgba(4,6,54,.72)',  hint: '#0d1660'},
  science: {b1: '#22cfe0', b2: '#0a86bb', b3: '#0a4a96', vig: 'rgba(2,26,70,.5)',   dark: 'rgba(4,24,60,.65)',   darkLight: 'rgba(4,24,60,.42)',   darkMid: 'rgba(2,20,52,.62)',  darkDeep: 'rgba(2,22,58,.9)',   darkOverlay: 'rgba(2,20,52,.72)', hint: '#061840'},
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
