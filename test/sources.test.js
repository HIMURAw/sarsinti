import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseAfad, parseKandilli, parseUsgs } from '../src/sources.js';

test('AFAD rows become quakes in UTC', () => {
  const [q] = parseAfad([
    {
      eventID: '731199',
      location: 'Saimbeyli (Adana)',
      latitude: '37.7725',
      longitude: '36.15617',
      depth: '7',
      magnitude: '2.1',
      date: '2026-10-12T00:18:23',
    },
  ]);
  assert.equal(q.id, 'afad:731199');
  assert.equal(q.time.toISOString(), '2026-10-11T21:18:23.000Z');
  assert.equal(q.mag, 2.1);
  assert.equal(q.lat, 37.7725);
});

test('Kandilli table rows parse, preferring Mw over ML over MD', () => {
  const text = [
    'Tarih      Saat      Enlem(N)  Boylam(E) Derinlik(km)  MD   ML   Mw    Yer                                             Çözüm Niteliği',
    '---------- --------  --------  -------   ----------    ------------    --------------                                  --------------',
    '2026.10.13 08:42:30  39.1997   28.1393        9.9      -.-  1.5  -.-   ORMANICI-SINDIRGI (BALIKESIR)                     İlksel',
    '2026.10.13 08:03:28  37.1025   36.9322        9.3      2.6  2.8  3.0   KARTALKOY-NURDAGI (GAZIANTEP)                     REVIZE01 (2026.10.13 08:10:11)',
  ].join('\n');
  const quakes = parseKandilli(text);
  assert.equal(quakes.length, 2);
  assert.equal(quakes[0].mag, 1.5);
  assert.equal(quakes[0].place, 'ORMANICI-SINDIRGI (BALIKESIR)');
  assert.equal(quakes[0].time.toISOString(), '2026-10-13T05:42:30.000Z');
  assert.equal(quakes[1].mag, 3.0);
  assert.equal(quakes[1].depth, 9.3);
});

test('USGS GeoJSON features parse', () => {
  const [q] = parseUsgs({
    features: [
      {
        id: 'us6000u1h4',
        properties: { mag: 4.2, place: '31 km WNW of Fry, Greece', time: 1791671608087 },
        geometry: { coordinates: [26.8, 35.5, 10] },
      },
    ],
  });
  assert.deepEqual([q.lat, q.lon, q.depth, q.mag], [35.5, 26.8, 10, 4.2]);
});
