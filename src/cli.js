import { execFile } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { findCity, distanceKm, CITIES } from './cities.js';
import { pickLang } from './i18n.js';
import { magColor, PALETTE } from './screen.js';
import { fetchQuakes, SOURCES } from './sources.js';
import { runTui } from './tui.js';
import { render, hhmm } from './view.js';

const HELP = `sarsinti — live earthquake map of Türkiye in your terminal

Usage
  sarsinti [options]              live map (default)
  sarsinti list [options]         print recent quakes and exit
  sarsinti watch [options]        stream new quakes, desktop notification for big ones
  sarsinti snapshot [options]     draw the map once (ANSI, or --svg <file>)

Options
  -s, --source <afad|kandilli|usgs>   data feed (default: afad)
  -H, --hours <n>                     time window in hours (default: 24)
  -m, --min <mag>                     minimum magnitude (default: 0, watch: 4)
  -n, --near <city>                   distances from a city, e.g. --near Ankara
  -r, --radius <km>                   with --near: only quakes within this radius
      --json                          list: machine-readable output
      --svg <file>                    snapshot: write an SVG instead of ANSI
      --width <cols> --height <rows>  snapshot size (default: 120x36)
      --lang <tr|en>                  interface language (default: from $LANG)
      --no-color                      plain text
  -h, --help                          this help
  -v, --version                       version

Keys in the live map
  ↑/↓ j/k select   m min magnitude   h time window   s source   r refresh   q quit
`;

const die = (msg) => {
  console.error(`sarsinti: ${msg}`);
  process.exit(1);
};

function parse(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      source: { type: 'string', short: 's', default: 'afad' },
      hours: { type: 'string', short: 'H', default: '24' },
      min: { type: 'string', short: 'm' },
      near: { type: 'string', short: 'n' },
      radius: { type: 'string', short: 'r' },
      json: { type: 'boolean' },
      svg: { type: 'string' },
      width: { type: 'string', default: '120' },
      height: { type: 'string', default: '36' },
      lang: { type: 'string' },
      'no-color': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
  });
  const command = positionals[0] ?? 'live';
  if (!['live', 'list', 'watch', 'snapshot'].includes(command)) die(`unknown command "${command}" (try --help)`);
  if (!SOURCES[values.source]) die(`unknown source "${values.source}" (afad, kandilli, usgs)`);

  const num = (v, name) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) die(`--${name} needs a number, got "${v}"`);
    return n;
  };
  let near = null;
  if (values.near) {
    near = findCity(values.near);
    if (!near) die(`don't know "${values.near}". Known: ${CITIES.map((c) => c[0]).join(', ')}`);
  }
  return {
    command,
    help: values.help,
    version: values.version,
    source: values.source,
    hours: num(values.hours, 'hours') || 24,
    minMag: values.min !== undefined ? num(values.min, 'min') : command === 'watch' ? 4 : 0,
    near,
    radius: values.radius !== undefined ? num(values.radius, 'radius') : null,
    json: values.json,
    svg: values.svg,
    width: num(values.width, 'width'),
    height: num(values.height, 'height'),
    L: pickLang(values.lang),
    color: !values['no-color'] && !process.env.NO_COLOR && process.stdout.isTTY,
    truecolor: /truecolor|24bit/i.test(process.env.COLORTERM ?? ''),
  };
}

function filter(quakes, opts) {
  return quakes.filter((q) => {
    if (q.mag < opts.minMag) return false;
    if (opts.near && opts.radius !== null) return distanceKm(q.lat, q.lon, opts.near.lat, opts.near.lon) <= opts.radius;
    return true;
  });
}

function paint(text, colorKey, opts, bold = false) {
  if (!opts.color) return text;
  const [r, g, b] = PALETTE[colorKey];
  return `\x1b[${bold ? '1;' : ''}38;2;${r};${g};${b}m${text}\x1b[0m`;
}

function line(q, opts) {
  const mag = paint(q.mag.toFixed(1).padStart(4), magColor(q.mag), opts, q.mag >= 4);
  const day = q.time.toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit' });
  const when = paint(`${day} ${hhmm(q.time)}`, 'dim', opts);
  const depth = paint(`${q.depth.toFixed(1).padStart(5)} km`, 'faint', opts);
  let tail = q.place;
  if (opts.near) {
    const d = Math.round(distanceKm(q.lat, q.lon, opts.near.lat, opts.near.lon));
    tail += paint(`  ${d} km ${opts.L.from(opts.near.name)}`, 'dim', opts);
  }
  return `${mag}  ${when}  ${depth}  ${tail}`;
}

async function list(opts) {
  const quakes = filter(await fetchQuakes(opts.source, opts.hours), opts);
  if (opts.json) {
    const rows = quakes.map((q) => ({
      ...q,
      time: q.time.toISOString(),
      ...(opts.near && { distanceKm: +distanceKm(q.lat, q.lon, opts.near.lat, opts.near.lon).toFixed(1) }),
    }));
    console.log(JSON.stringify(rows, null, 2));
    return;
  }
  if (!quakes.length) return console.log(opts.L.none);
  for (const q of quakes) console.log(line(q, opts));
}

function notify(q, opts) {
  const title = `M${q.mag.toFixed(1)} — ${q.place}`;
  const body = `${hhmm(q.time)} · ${q.depth.toFixed(1)} km${
    opts.near ? ` · ${Math.round(distanceKm(q.lat, q.lon, opts.near.lat, opts.near.lon))} km ${opts.L.from(opts.near.name)}` : ''
  }`;
  const quiet = () => {};
  if (process.platform === 'linux') execFile('notify-send', ['-a', 'sarsinti', title, body], quiet);
  else if (process.platform === 'darwin')
    execFile('osascript', ['-e', `display notification ${JSON.stringify(body)} with title ${JSON.stringify(title)}`], quiet);
}

async function watch(opts) {
  let seen = null;
  const poll = async () => {
    try {
      const quakes = filter(await fetchQuakes(opts.source, Math.max(opts.hours, 1)), opts);
      if (!seen) {
        seen = new Set(quakes.map((q) => q.id));
        quakes.slice(0, 5).reverse().forEach((q) => console.log(line(q, opts)));
        console.log(paint(`— ${opts.L.min}${opts.minMag}, ${opts.source} —`, 'faint', opts));
        return;
      }
      const fresh = quakes.filter((q) => !seen.has(q.id)).reverse();
      for (const q of fresh) {
        seen.add(q.id);
        console.log(line(q, opts));
        notify(q, opts);
        if (process.stdout.isTTY) process.stdout.write('\x07');
      }
    } catch (err) {
      console.error(paint(`${opts.L.error}: ${err.cause?.code ?? err.message}`, 'm4', opts));
    }
  };
  await poll();
  setInterval(poll, 60_000);
}

async function snapshot(opts) {
  const all = await fetchQuakes(opts.source, opts.hours);
  const visible = filter(all, opts);
  // A still picture reads best with the strongest quake picked out.
  const strongest = visible.reduce((best, q, i) => (q.mag > visible[best].mag ? i : best), 0);
  const state = { ...opts, all, visible, selected: strongest, fresh: new Set(), updatedAt: new Date() };
  const screen = render(state, opts.width, opts.height, 1);
  if (opts.svg) {
    writeFileSync(opts.svg, screen.toSvg());
    console.error(`wrote ${opts.svg}`);
  } else {
    console.log(opts.color ? screen.toAnsi({ truecolor: true }) : screen.cells.map((c) => c.ch).join('').match(new RegExp(`.{1,${opts.width}}`, 'gu')).join('\n'));
  }
}

export async function main(argv) {
  let opts;
  try {
    opts = parse(argv);
  } catch (err) {
    die(err.message);
  }
  if (opts.help) return console.log(HELP);
  if (opts.version) {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    return console.log(pkg.version);
  }
  try {
    if (opts.command === 'list') return await list(opts);
    if (opts.command === 'watch') return await watch(opts);
    if (opts.command === 'snapshot') return await snapshot(opts);
    if (!process.stdout.isTTY) return await list(opts);
    return await runTui({ ...opts, bellAt: Math.max(4, opts.minMag) });
  } catch (err) {
    die(err.cause?.code ? `${err.message} (${err.cause.code})` : err.message);
  }
}
