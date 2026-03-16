const ESC = '\x1b[';

export const c = {
  reset: `${ESC}0m`,
  bold: `${ESC}1m`,
  dim: `${ESC}2m`,
  italic: `${ESC}3m`,

  red: `${ESC}31m`,
  green: `${ESC}32m`,
  yellow: `${ESC}33m`,
  blue: `${ESC}34m`,
  magenta: `${ESC}35m`,
  cyan: `${ESC}36m`,
  white: `${ESC}37m`,
  gray: `${ESC}90m`,

  orange: `${ESC}38;2;217;119;87m`,
  offpeak: `${ESC}32m`,
  peak: `${ESC}38;2;200;100;80m`,
};

export function color(text: string, ...codes: string[]): string {
  return codes.join('') + text + c.reset;
}

/** Strip ANSI codes to get visible length */
export function visibleLength(str: string): number {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '').length;
}

/** Pad a string (accounting for ANSI) to exact visible width */
export function padRight(str: string, width: number): string {
  const vlen = visibleLength(str);
  if (vlen >= width) return truncate(str, width);
  return str + ' '.repeat(width - vlen);
}

/** Truncate a string with ANSI codes to a max visible width */
export function truncate(str: string, maxWidth: number): string {
  if (maxWidth <= 0) return '';
  let visible = 0;
  let i = 0;
  while (i < str.length && visible < maxWidth) {
    if (str[i] === '\x1b') {
      // Skip ANSI sequence
      const end = str.indexOf('m', i);
      if (end !== -1) { i = end + 1; continue; }
    }
    visible++;
    i++;
  }
  // Include any trailing ANSI codes (resets)
  while (i < str.length && str[i] === '\x1b') {
    const end = str.indexOf('m', i);
    if (end !== -1) { i = end + 1; } else break;
  }
  return str.slice(0, i);
}
