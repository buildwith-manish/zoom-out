export const W = 1920;
export const H = 1080;
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
  main: {b1: '#8e55e0', b2: '#55229f', b3: '#34207f', vig: 'rgba(20,6,60,.5)'},
  food: {b1: '#35d696', b2: '#0b8d5a', b3: '#0a5f7c', vig: 'rgba(2,40,34,.5)'},
  animals: {b1: '#5668ff', b2: '#2433dc', b3: '#0b64d8', vig: 'rgba(5,8,60,.45)'},
  science: {b1: '#22cfe0', b2: '#0a86bb', b3: '#0a4a96', vig: 'rgba(2,26,70,.5)'},
};

export const FONTS = {
  display: '"Anton", "Impact", "Arial Narrow", sans-serif',
  mono: '"JetBrains Mono", ui-monospace, Menlo, monospace',
};

export function seriesColors(name) {
  return SERIES[name] || SERIES.main;
}
