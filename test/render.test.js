import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BrailleCanvas } from '../src/canvas.js';
import { distanceKm, findCity } from '../src/cities.js';
import { ablative, STRINGS } from '../src/i18n.js';
import { render, projection } from '../src/view.js';

test('braille canvas sets the right dot bits', () => {
  const c = new BrailleCanvas(1, 1);
  c.set(0, 0, 'ink');
  c.set(1, 3, 'ink');
  assert.equal(c.bits[0], 0x01 | 0x80);
});

test('projection keeps east to the right and north up', () => {
  const p = projection(200, 100);
  const [ix, iy] = p(28.98, 41.01); // İstanbul
  const [vx, vy] = p(43.38, 38.5); // Van
  assert.ok(vx > ix);
  assert.ok(vy > iy);
  assert.ok(ix >= 0 && vx <= 200);
});

test('cities are found without Turkish characters', () => {
  assert.equal(findCity('izmir').name, 'İzmir');
  assert.equal(findCity('DIYARBAKIR').name, 'Diyarbakır');
  assert.equal(findCity('kahraman').name, 'Kahramanmaraş');
  assert.equal(findCity('narnia'), null);
});

test('İstanbul to Ankara is about 350 km', () => {
  const km = distanceKm(41.01, 28.98, 39.93, 32.86);
  assert.ok(km > 340 && km < 360, String(km));
});

test('Turkish ablative follows vowel harmony and hard consonants', () => {
  assert.equal(ablative('Ankara'), 'dan');
  assert.equal(ablative('İzmir'), 'den');
  assert.equal(ablative('Sivas'), 'tan');
  assert.equal(ablative('Gaziantep'), 'ten');
});

test('a full frame renders at any size without throwing', () => {
  const quakes = [
    { id: 'a', time: new Date(), lat: 37.2, lon: 37.0, depth: 10, mag: 5.6, place: 'Pazarcık (Kahramanmaraş)', source: 'afad' },
    { id: 'b', time: new Date(Date.now() - 3600e3), lat: 39.2, lon: 28.1, depth: 7, mag: 2.3, place: 'Sındırgı (Balıkesir)', source: 'afad' },
  ];
  for (const [w, h] of [[40, 12], [80, 24], [160, 50]]) {
    const state = { L: STRINGS.en, source: 'afad', hours: 24, minMag: 0, near: findCity('Ankara'), visible: quakes, selected: 0, fresh: new Set(['a']), updatedAt: new Date() };
    const screen = render(state, w, h, 0);
    assert.equal(screen.cells.length, w * h);
    assert.ok(screen.toAnsi().length > 0);
    assert.ok(screen.toSvg().startsWith('<svg'));
  }
});
