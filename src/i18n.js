// Turkish ablative suffix: Ankara'dan, İzmir'den, Erzincan'dan, Sivas'tan.
export function ablative(word) {
  const lower = word.toLocaleLowerCase('tr');
  const vowels = [...lower].filter((c) => 'aeıioöuü'.includes(c));
  const back = 'aıou'.includes(vowels.at(-1) ?? 'a');
  const hard = 'çfhkpsşt'.includes(lower.at(-1));
  return `${hard ? 't' : 'd'}${back ? 'a' : 'e'}n`;
}

const tr = {
  quakes: (n) => `${n} deprem`,
  lastHours: (h) => (h % 24 === 0 && h > 24 ? `son ${h / 24} gün` : `son ${h} saat`),
  largest: 'en büyük',
  updated: 'güncellendi',
  loading: 'yükleniyor…',
  none: 'Bu aralıkta deprem yok.',
  ago: (m) => (m < 1 ? 'şimdi' : m < 60 ? `${m} dk önce` : m < 1440 ? `${Math.floor(m / 60)} sa önce` : `${Math.floor(m / 1440)} gün önce`),
  depth: 'derinlik',
  km: 'km',
  from: (city) => `${city}'${ablative(city)}`,
  keys: '↑↓ seç  m büyüklük  h süre  s kaynak  r yenile  q çık',
  min: 'M≥',
  error: 'bağlantı hatası',
  activity: 'saatlik etkinlik',
};

const en = {
  quakes: (n) => `${n} quake${n === 1 ? '' : 's'}`,
  lastHours: (h) => (h % 24 === 0 && h > 24 ? `last ${h / 24} days` : `last ${h}h`),
  largest: 'largest',
  updated: 'updated',
  loading: 'loading…',
  none: 'No earthquakes in this window.',
  ago: (m) => (m < 1 ? 'now' : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.floor(m / 60)}h ago` : `${Math.floor(m / 1440)}d ago`),
  depth: 'depth',
  km: 'km',
  from: (city) => `from ${city}`,
  keys: '↑↓ select  m magnitude  h window  s source  r refresh  q quit',
  min: 'M≥',
  error: 'connection error',
  activity: 'hourly activity',
};

export const STRINGS = { tr, en };
export const pickLang = (lang) => STRINGS[lang] ?? (/^tr/i.test(lang ?? process.env.LANG ?? '') ? tr : en);
