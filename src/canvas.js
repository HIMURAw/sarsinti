// Braille canvas: every terminal cell holds a 2x4 grid of dots.

const BITS = [
  [0x01, 0x08],
  [0x02, 0x10],
  [0x04, 0x20],
  [0x40, 0x80],
];

export class BrailleCanvas {
  constructor(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    this.width = cols * 2;
    this.height = rows * 4;
    this.bits = new Uint8Array(cols * rows);
    this.color = new Array(cols * rows).fill(null);
    this.rank = new Int8Array(cols * rows).fill(-1);
  }

  // When two layers share a cell, the higher rank decides its colour.
  set(x, y, color, rank = 0) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = (y >> 2) * this.cols + (x >> 1);
    this.bits[i] |= BITS[y & 3][x & 1];
    if (rank >= this.rank[i]) {
      this.rank[i] = rank;
      this.color[i] = color;
    }
  }

  line(x0, y0, x1, y1, color, rank) {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this.set(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, color, rank);
    }
  }

  ring(cx, cy, r, color, rank) {
    const n = Math.max(12, Math.ceil(r * 7));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.set(cx + Math.cos(a) * r, cy + Math.sin(a) * r, color, rank);
    }
  }

  blit(screen, ox, oy) {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const i = r * this.cols + c;
        if (this.bits[i]) screen.put(ox + c, oy + r, String.fromCharCode(0x2800 + this.bits[i]), this.color[i]);
      }
    }
  }
}
