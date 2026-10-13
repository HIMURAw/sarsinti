// Places you can pass to --near, plus the handful labelled on the map.
// [name, lat, lon, labelled]
export const CITIES = [
  ['İstanbul', 41.01, 28.98, true],
  ['Ankara', 39.93, 32.86, true],
  ['İzmir', 38.42, 27.14, true],
  ['Bursa', 40.19, 29.06, false],
  ['Antalya', 36.89, 30.71, true],
  ['Adana', 37.0, 35.32, true],
  ['Konya', 37.87, 32.48, false],
  ['Gaziantep', 37.07, 37.38, false],
  ['Kahramanmaraş', 37.58, 36.94, false],
  ['Hatay', 36.2, 36.16, false],
  ['Malatya', 38.35, 38.31, false],
  ['Elazığ', 38.67, 39.22, false],
  ['Diyarbakır', 37.91, 40.24, false],
  ['Erzurum', 39.9, 41.27, true],
  ['Van', 38.5, 43.38, true],
  ['Samsun', 41.29, 36.33, true],
  ['Trabzon', 41.0, 39.72, true],
  ['Kayseri', 38.73, 35.48, false],
  ['Sivas', 39.75, 37.02, false],
  ['Eskişehir', 39.78, 30.52, false],
  ['Kocaeli', 40.77, 29.92, false],
  ['Sakarya', 40.69, 30.44, false],
  ['Düzce', 40.84, 31.16, false],
  ['Bolu', 40.73, 31.61, false],
  ['Balıkesir', 39.65, 27.88, false],
  ['Çanakkale', 40.15, 26.41, false],
  ['Manisa', 38.61, 27.43, false],
  ['Denizli', 37.78, 29.09, false],
  ['Muğla', 37.22, 28.36, false],
  ['Kütahya', 39.42, 29.98, false],
  ['Erzincan', 39.75, 39.49, false],
  ['Bingöl', 38.88, 40.5, false],
  ['Muş', 38.74, 41.49, false],
  ['Adıyaman', 37.76, 38.28, false],
  ['Şanlıurfa', 37.16, 38.79, false],
  ['Mersin', 36.81, 34.64, false],
];

const fold = (s) =>
  s.toLocaleLowerCase('tr').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i');

export function findCity(name) {
  const key = fold(name);
  const hit = CITIES.find(([n]) => fold(n) === key) ?? CITIES.find(([n]) => fold(n).startsWith(key));
  return hit ? { name: hit[0], lat: hit[1], lon: hit[2] } : null;
}

// Great-circle distance in km.
export function distanceKm(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * r) / 2) ** 2 +
    Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}
