// A screen is a grid of cells; it can be printed as ANSI or saved as SVG.

// Colours come from a seismograph room: bone-white trace on dark paper,
// ochre to red for the size of what shook.
export const PALETTE = {
  ink: [214, 207, 190],
  dim: [128, 133, 136],
  faint: [62, 68, 73],
    turkey: [222, 214, 194],
  water: [78, 115, 144],
  m1: [150, 140, 100],
  m2: [196, 170, 92],
  m3: [228, 160, 48],
  m4: [236, 100, 44],
  m5: [255, 59, 48],
  bg: [21, 23, 25],
};

export function magColor(mag) {
  if (mag >= 5) return 'm5';
  if (mag >= 4) return 'm4';
  if (mag >= 3) return 'm3';
  if (mag >= 2) return 'm2';
  return 'm1';
}

export class Screen {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.cells = Array.from({ length: width * height }, () => ({ ch: ' ', fg: null, bold: false, inverse: false }));
  }

  cell(x, y) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return null;
    return this.cells[y * this.width + x];
  }

  put(x, y, ch, fg = null, opts = {}) {
    const c = this.cell(x, y);
    if (!c) return;
    Object.assign(c, { ch, fg, bold: !!opts.bold, inverse: !!opts.inverse });
  }

  // Writes a string, clipped to maxWidth; returns the x after the last char.
  text(x, y, str, fg = 'ink', opts = {}) {
    const chars = [...str];
    const limit = opts.maxWidth ?? this.width - x;
    chars.slice(0, Math.max(0, limit)).forEach((ch, i) => this.put(x + i, y, ch, fg, opts));
    return x + Math.min(chars.length, limit);
  }

  toAnsi({ truecolor = true } = {}) {
    const sgr = (c) => {
      const parts = [];
      if (c.bold) parts.push('1');
      if (c.inverse) parts.push('7');
      if (c.fg) {
        const [r, g, b] = PALETTE[c.fg];
        parts.push(truecolor ? `38;2;${r};${g};${b}` : `38;5;${to256(r, g, b)}`);
      }
      return parts.join(';');
    };
    const lines = [];
    for (let y = 0; y < this.height; y++) {
      let line = '';
      let prev = '';
      for (let x = 0; x < this.width; x++) {
        const c = this.cells[y * this.width + x];
        const s = sgr(c);
        if (s !== prev) {
          line += `\x1b[0m${s ? `\x1b[${s}m` : ''}`;
          prev = s;
        }
        line += c.ch;
      }
      lines.push(`${line}\x1b[0m`);
    }
    return lines.join('\n');
  }

  toSvg({ cellW = 9, cellH = 18, font = 'JetBrains Mono, DejaVu Sans Mono, Menlo, monospace' } = {}) {
    const rgb = (k) => `rgb(${PALETTE[k].join(',')})`;
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const pad = 16;
    const W = this.width * cellW + pad * 2;
    const H = this.height * cellH + pad * 2;
    const out = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
      `<rect width="100%" height="100%" rx="10" fill="${rgb('bg')}"/>`,
      `<g font-family="${font}" font-size="${cellH * 0.78}" xml:space="preserve">`,
    ];
    for (let y = 0; y < this.height; y++) {
      // Group runs of identical style so the file stays small.
      let x = 0;
      while (x < this.width) {
        const c = this.cells[y * this.width + x];
        let run = c.ch;
        let end = x + 1;
        while (end < this.width) {
          const n = this.cells[y * this.width + end];
          if (n.fg !== c.fg || n.bold !== c.bold || n.inverse !== c.inverse) break;
          run += n.ch;
          end++;
        }
        const px = pad + x * cellW;
        const py = pad + y * cellH;
        if (c.inverse) {
          out.push(`<rect x="${px}" y="${py}" width="${(end - x) * cellW}" height="${cellH}" fill="${rgb(c.fg ?? 'ink')}"/>`);
        }
        if (run.trim()) {
          const fill = c.inverse ? rgb('bg') : rgb(c.fg ?? 'ink');
          const weight = c.bold ? ' font-weight="700"' : '';
          // Braille and box glyphs differ in width between fonts, so pin every char to its cell.
          const xs = [...run].map((_, i) => px + i * cellW).join(' ');
          out.push(`<text x="${xs}" y="${py + cellH * 0.78}" fill="${fill}"${weight}>${esc(run)}</text>`);
        }
        x = end;
      }
    }
    out.push('</g></svg>');
    return out.join('\n');
  }
}

function to256(r, g, b) {
  const q = (v) => (v < 48 ? 0 : v < 115 ? 1 : Math.floor((v - 35) / 40));
  return 16 + 36 * q(r) + 6 * q(g) + q(b);
}
