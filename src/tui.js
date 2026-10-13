import { fetchQuakes, SOURCES } from './sources.js';
import { render } from './view.js';

const MIN_STEPS = [0, 2, 3, 4];
const HOUR_STEPS = [6, 24, 72, 168];
const REFRESH_MS = 60_000;

export async function runTui(opts) {
  const out = process.stdout;
  const state = {
    L: opts.L,
    source: opts.source,
    hours: opts.hours,
    minMag: opts.minMag,
    near: opts.near,
    all: [],
    visible: [],
    selected: 0,
    fresh: new Set(),
    freshAt: 0,
    seen: null,
    loading: true,
    error: null,
    updatedAt: null,
  };

  let tick = 0;
  const draw = () => {
    const frame = render(state, out.columns || 100, out.rows || 30, tick);
    out.write(`\x1b[H${frame.toAnsi({ truecolor: opts.truecolor })}`);
  };

  const applyFilter = () => {
    const prevId = state.visible[state.selected]?.id;
    state.visible = state.all.filter((q) => q.mag >= state.minMag);
    const keep = state.visible.findIndex((q) => q.id === prevId);
    state.selected = keep >= 0 ? keep : 0;
  };

  let inflight = null;
  const refresh = async ({ reset = false } = {}) => {
    if (inflight) return inflight;
    if (reset) {
      state.seen = null;
      state.all = [];
      state.loading = true;
      applyFilter();
      draw();
    }
    inflight = (async () => {
      try {
        const quakes = await fetchQuakes(state.source, state.hours);
        // Anything new since the previous poll blinks for a minute.
        if (state.seen) {
          const fresh = quakes.filter((q) => !state.seen.has(q.id));
          if (fresh.length) {
            state.fresh = new Set(fresh.map((q) => q.id));
            state.freshAt = Date.now();
          }
          if (fresh.some((q) => q.mag >= opts.bellAt)) out.write('\x07');
        }
        state.seen = new Set(quakes.map((q) => q.id));
        state.all = quakes;
        state.error = null;
        state.updatedAt = new Date();
      } catch (err) {
        state.error = `${state.L.error}: ${err.cause?.code ?? err.message}`;
      } finally {
        state.loading = false;
        inflight = null;
        applyFilter();
        draw();
      }
    })();
    return inflight;
  };

  const cycle = (steps, value) => steps[(steps.indexOf(value) + 1) % steps.length] ?? steps[0];
  const sources = Object.keys(SOURCES);

  out.write('\x1b[?1049h\x1b[?25l\x1b[2J');
  const cleanup = () => {
    clearInterval(blink);
    clearInterval(poll);
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    out.write('\x1b[0m\x1b[?25h\x1b[?1049l');
  };
  const quit = () => {
    cleanup();
    process.exit(0);
  };
  process.on('SIGTERM', quit);
  out.on('resize', () => {
    out.write('\x1b[2J');
    draw();
  });

  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on('data', (buf) => {
    const key = buf.toString();
    const n = state.visible.length;
    if (key === 'q' || key === '\x03' || key === '\x1b') return quit();
    if (key === '\x1b[A' || key === 'k') state.selected = Math.max(0, state.selected - 1);
    else if (key === '\x1b[B' || key === 'j') state.selected = Math.min(n - 1, state.selected + 1);
    else if (key === '\x1b[5~') state.selected = Math.max(0, state.selected - 10);
    else if (key === '\x1b[6~') state.selected = Math.min(n - 1, state.selected + 10);
    else if (key === 'g') state.selected = 0;
    else if (key === 'G') state.selected = n - 1;
    else if (key === 'm') {
      state.minMag = cycle(MIN_STEPS, state.minMag);
      applyFilter();
    } else if (key === 'h') {
      state.hours = cycle(HOUR_STEPS, state.hours);
      return void refresh({ reset: true });
    } else if (key === 's') {
      state.source = cycle(sources, state.source);
      return void refresh({ reset: true });
    } else if (key === 'r') return void refresh();
    state.selected = Math.max(0, state.selected);
    draw();
  });

  const blink = setInterval(() => {
    tick++;
    if (state.fresh.size && Date.now() - state.freshAt > 60_000) state.fresh.clear();
    draw();
  }, 500);
  const poll = setInterval(refresh, REFRESH_MS);
  draw();
  await refresh();
}
