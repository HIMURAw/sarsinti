import { BrailleCanvas } from './canvas.js';
import { CITIES, distanceKm } from './cities.js';
import { land, borders, turkey, lakes } from './geo.js';
import { Screen, magColor } from './screen.js';

const VIEW = { w: 25.6, e: 45.0, s: 35.6, n: 42.3 };
const SOURCE_NAMES = { afad: 'AFAD', kandilli: 'Kandilli', usgs: 'USGS' };

export function hhmm(date) {
  return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' });
}

// Equirectangular, squashed by cos(latitude) so Anatolia keeps its shape.
// Braille dots are about square, so one dot unit works on both axes.
// The view grows along whichever axis has room left, so the frame is always full.
export function projection(dotsW, dotsH) {
  const k = Math.cos(((VIEW.s + VIEW.n) / 2) * (Math.PI / 180));
  const spanX = (VIEW.e - VIEW.w) * k;
  const spanY = VIEW.n - VIEW.s;
  const scale = Math.min(dotsW / spanX, dotsH / spanY);
  const west = (VIEW.w + VIEW.e) / 2 - dotsW / scale / k / 2;
  const north = (VIEW.s + VIEW.n) / 2 + dotsH / scale / 2;
  return (lon, lat) => [(lon - west) * k * scale, (north - lat) * scale];
}

function drawLines(canvas, project, lines, color, rank) {
  for (const pts of lines) {
    let prev = project(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) {
      const next = project(pts[i], pts[i + 1]);
      canvas.line(prev[0], prev[1], next[0], next[1], color, rank);
      prev = next;
    }
  }
}

const MARKS = [
  [5, '✱'],
  [4, '◉'],
  [3, '●'],
  [2, '•'],
  [0, '·'],
];
const markFor = (mag) => MARKS.find(([m]) => mag >= m)[1];

function drawMap(screen, x0, y0, cols, rows, state, t) {
  const canvas = new BrailleCanvas(cols, rows);
  const project = projection(canvas.width, canvas.height);
  drawLines(canvas, project, land, 'faint', 0);
  drawLines(canvas, project, borders, 'faint', 0);
  // Turkey's own outline sits above the neighbours' coasts and borders.
  drawLines(canvas, project, lakes, 'water', 1);
  drawLines(canvas, project, turkey, 'turkey', 2);

  // Bigger quakes get a ring roughly the size of the area that felt them.
  const quakes = [...state.visible].sort((a, b) => a.mag - b.mag);
  for (const q of quakes) {
    if (q.mag < 4) continue;
    const [px, py] = project(q.lon, q.lat);
    const r = (q.mag - 3) * canvas.height * 0.025;
    canvas.ring(px, py, r, magColor(q.mag), 3);
    if (q.mag >= 5) canvas.ring(px, py, r * 1.8, magColor(q.mag), 3);
  }
  canvas.blit(screen, x0, y0);

  const toCell = (lon, lat) => {
    const [px, py] = project(lon, lat);
    return [x0 + Math.floor(px / 2), y0 + Math.floor(py / 4)];
  };
  const inside = (cx, cy) => cx >= x0 && cy >= y0 && cx < x0 + cols && cy < y0 + rows;

  const taken = new Set();
  const marks = [];
  for (const q of quakes) {
    const [cx, cy] = toCell(q.lon, q.lat);
    if (!inside(cx, cy)) continue;
    taken.add(`${cx},${cy}`);
    marks.push([cx, cy, q]);
  }

  // City names go wherever they don't hide a quake: right of the city, else left, else no name.
  const labelled = CITIES.filter((c) => c[3] || (state.near && c[0] === state.near.name));
  const free = (x, y, len) => x >= x0 && x + len <= x0 + cols && [...Array(len)].every((_, i) => !taken.has(`${x + i},${y}`));
  for (const [name, lat, lon] of labelled) {
    const [cx, cy] = toCell(lon, lat);
    if (!inside(cx, cy) || taken.has(`${cx},${cy}`)) continue;
    screen.put(cx, cy, '+', 'dim');
    if (cols < 60) continue;
    const len = [...name].length;
    if (free(cx + 1, cy, len + 1)) screen.text(cx + 1, cy, name, 'dim');
    else if (free(cx - len - 1, cy, len + 1)) screen.text(cx - len, cy, name, 'dim');
  }

  for (const [cx, cy, q] of marks) {
    const fresh = state.fresh.has(q.id) && t % 2 === 0;
    screen.put(cx, cy, markFor(q.mag), magColor(q.mag), { bold: q.mag >= 4 || fresh, inverse: fresh });
  }

  const sel = state.visible[state.selected];
  if (sel) {
    const [cx, cy] = toCell(sel.lon, sel.lat);
    if (inside(cx, cy)) {
      screen.put(cx, cy, markFor(sel.mag), magColor(sel.mag), { bold: true, inverse: t % 2 === 0 });
      const tag = ` M${sel.mag.toFixed(1)} `;
      const tx = cx + 2 + tag.length < x0 + cols ? cx + 2 : cx - 1 - tag.length;
      screen.text(tx, cy, tag, magColor(sel.mag), { bold: true });
    }
  }
}

function drawList(screen, x0, y0, w, h, state, L) {
  const now = Date.now();
  const list = state.visible;
  if (!list.length) {
    screen.text(x0, y0, state.loading ? L.loading : L.none, 'dim', { maxWidth: w });
    return;
  }
  // Keep the selection on screen.
  const first = Math.max(0, Math.min(state.selected - Math.floor(h / 2), list.length - h));
  list.slice(first, first + h).forEach((q, i) => {
    const y = y0 + i;
    const selected = first + i === state.selected;
    const ago = L.ago(Math.floor((now - q.time) / 60000));
    const color = magColor(q.mag);
    screen.text(x0, y, q.mag.toFixed(1), color, { bold: q.mag >= 4 || selected });
    const placeW = w - 5 - ago.length - 1;
    screen.text(x0 + 4, y, shortPlace(q.place), selected ? 'ink' : 'dim', { maxWidth: placeW, bold: selected });
    screen.text(x0 + w - ago.length, y, ago, selected ? 'ink' : 'faint');
    if (selected) screen.put(x0 - 2, y, '▸', color, { bold: true });
  });
}

function shortPlace(place) {
  // "Ege Denizi - [10.59 km] Ayvalık (Balıkesir)" → "Ayvalık (Balıkesir)"
  return place.replace(/^.*\]\s*/, '').trim() || place;
}

// A seismograph strip: one spike per quake, its height the magnitude.
function drawTrace(screen, x0, y0, w, rows, state, L) {
  const canvas = new BrailleCanvas(w, rows);
  const span = state.hours * 3600e3;
  const now = Date.now();
  const mid = canvas.height - 1;
  canvas.line(0, mid, canvas.width - 1, mid, 'faint', 0);
  const sorted = [...state.visible].sort((a, b) => a.mag - b.mag);
  for (const q of sorted) {
    const x = (1 - (now - q.time) / span) * (canvas.width - 1);
    const top = mid - Math.min(canvas.height - 1, (q.mag / 6) * canvas.height);
    canvas.line(x, mid, x, top, magColor(q.mag), Math.round(q.mag));
  }
  canvas.blit(screen, x0, y0);
  const label = `${L.lastHours(state.hours)} · ${L.activity}`;
  screen.text(x0, y0 + rows, `-${state.hours}h`, 'faint');
  screen.text(x0 + Math.floor((w - label.length) / 2), y0 + rows, label, 'faint');
  screen.text(x0 + w - hhmm(new Date()).length, y0 + rows, hhmm(new Date()), 'faint');
}

function headline(state, L) {
  const parts = [`sarsıntı`, SOURCE_NAMES[state.source], L.lastHours(state.hours)];
  if (state.minMag > 0) parts.push(`${L.min}${state.minMag}`);
  parts.push(L.quakes(state.visible.length));
  return parts.join(' · ');
}

export function render(state, width, height, t = 0) {
  const L = state.L;
  const screen = new Screen(width, height);
  screen.text(1, 0, headline(state, L), 'ink', { bold: true });
  if (state.error) {
    screen.text(width - state.error.length - 2, 0, state.error, 'm4', { maxWidth: width - 2 });
  } else if (state.updatedAt) {
    const s = `${L.updated} ${hhmm(state.updatedAt)}`;
    screen.text(width - s.length - 1, 0, s, 'faint');
  }

  const showList = width >= 96;
  const listW = showList ? Math.min(46, Math.floor(width * 0.34)) : 0;
  const traceRows = height >= 24 ? 2 : 0;
  const footer = 1;
  const mapCols = width - listW - (showList ? 3 : 0) - 1;
  const mapRows = height - 2 - footer - (traceRows ? traceRows + 2 : 0);
  drawMap(screen, 1, 2, mapCols, mapRows, state, t);

  if (showList) {
    const lx = width - listW - 1;
    drawList(screen, lx, 2, listW, mapRows - 4, state, L);
    const sel = state.visible[state.selected];
    if (sel) drawDetail(screen, lx, 2 + mapRows - 3, listW, sel, state, L);
  }

  if (traceRows) drawTrace(screen, 1, height - footer - traceRows - 1, width - 2, traceRows, state, L);
  screen.text(1, height - 1, L.keys, 'faint', { maxWidth: width - 2 });
  return screen;
}

function drawDetail(screen, x0, y0, w, q, state, L) {
  screen.text(x0, y0, '─'.repeat(w), 'faint');
  const when = q.time.toLocaleString('tr-TR', {
    timeZone: 'Europe/Istanbul',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  screen.text(x0, y0 + 1, `M${q.mag.toFixed(1)}  ${when}  ${L.depth} ${q.depth.toFixed(1)} ${L.km}`, magColor(q.mag), {
    maxWidth: w,
  });
  let where = q.place;
  if (state.near) {
    const d = Math.round(distanceKm(q.lat, q.lon, state.near.lat, state.near.lon));
    where = `${d} ${L.km} ${L.from(state.near.name)} · ${q.place}`;
  }
  screen.text(x0, y0 + 2, where, 'dim', { maxWidth: w });
}
