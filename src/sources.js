// Earthquake feeds, normalised to { id, time, lat, lon, depth, mag, place, source }.

const UA = { 'user-agent': 'sarsinti (+https://github.com/HIMURAw/sarsinti)' };
const BOUNDS = { minLat: 34, maxLat: 44, minLon: 24, maxLon: 46 };

async function get(url, timeoutMs = 15000) {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`);
  return res;
}

// AFAD timestamps are Turkey local time (UTC+3, no DST since 2016) without an offset.
const trTime = (s) => new Date(`${s.replace(' ', 'T')}+03:00`);
const pad = (n) => String(n).padStart(2, '0');
function trStamp(d) {
  const t = new Date(d.getTime() + 3 * 3600e3);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())} ${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:${pad(t.getUTCSeconds())}`;
}

export function parseAfad(rows) {
  return rows.map((r) => ({
    id: `afad:${r.eventID}`,
    time: trTime(r.date),
    lat: +r.latitude,
    lon: +r.longitude,
    depth: +r.depth,
    mag: +r.magnitude,
    place: r.location,
    source: 'afad',
  }));
}

async function afad(since) {
  const q = new URLSearchParams({
    start: trStamp(since),
    end: trStamp(new Date(Date.now() + 3600e3)),
    orderby: 'timedesc',
    limit: '1000',
  });
  const res = await get(`https://servisnet.afad.gov.tr/apigateway/deprem/apiv2/event/filter?${q}`);
  return parseAfad(await res.json());
}

// Kandilli publishes a fixed-width <pre> table in windows-1254.
export function parseKandilli(text) {
  const out = [];
  const row =
    /^(\d{4})\.(\d\d)\.(\d\d) (\d\d:\d\d:\d\d)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(.+?)\s{2,}(\S.*)$/;
  for (const line of text.split(/\r?\n/)) {
    const m = line.trim().match(row);
    if (!m) continue;
    const [, y, mo, d, hms, lat, lon, depth, md, ml, mw, place] = m;
    const mag = [mw, ml, md].map(Number).find((v) => Number.isFinite(v) && v > 0);
    if (mag === undefined) continue;
    out.push({
      id: `kandilli:${y}${mo}${d}${hms.replace(/:/g, '')}:${lat}:${lon}`,
      time: new Date(`${y}-${mo}-${d}T${hms}+03:00`),
      lat: +lat,
      lon: +lon,
      depth: +depth,
      mag,
      place: place.trim(),
      source: 'kandilli',
    });
  }
  return out;
}

async function kandilli(since) {
  const res = await get('http://www.koeri.boun.edu.tr/scripts/lst0.asp');
  const text = new TextDecoder('windows-1254').decode(await res.arrayBuffer());
  return parseKandilli(text).filter((q) => q.time >= since);
}

export function parseUsgs(geojson) {
  return geojson.features.map((f) => ({
    id: `usgs:${f.id}`,
    time: new Date(f.properties.time),
    lat: f.geometry.coordinates[1],
    lon: f.geometry.coordinates[0],
    depth: f.geometry.coordinates[2],
    mag: f.properties.mag,
    place: f.properties.place ?? '',
    source: 'usgs',
  }));
}

async function usgs(since) {
  const q = new URLSearchParams({
    format: 'geojson',
    starttime: since.toISOString(),
    minlatitude: BOUNDS.minLat,
    maxlatitude: BOUNDS.maxLat,
    minlongitude: BOUNDS.minLon,
    maxlongitude: BOUNDS.maxLon,
    orderby: 'time',
  });
  const res = await get(`https://earthquake.usgs.gov/fdsnws/event/1/query?${q}`);
  return parseUsgs(await res.json());
}

export const SOURCES = { afad, kandilli, usgs };

export async function fetchQuakes(source, hours) {
  const fn = SOURCES[source];
  if (!fn) throw new Error(`unknown source "${source}" (use ${Object.keys(SOURCES).join(', ')})`);
  const since = new Date(Date.now() - hours * 3600e3);
  const quakes = await fn(since);
  return quakes
    .filter((q) => Number.isFinite(q.lat) && Number.isFinite(q.mag) && q.time >= since)
    .sort((a, b) => b.time - a.time);
}
