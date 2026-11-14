/**
 * Romanian public holidays (Codul muncii, Legea 53/2003, art. 139, as amended; 6–7 January added in 2024).
 * On these days shops and offices close, so parking demand follows the Sunday curve.
 * Movable feasts are computed from Orthodox Easter, so nothing is hand-typed per year.
 */

/** Orthodox Easter Sunday (Meeus' Julian algorithm + 13 days, valid 1900–2099). Returns [month 1–12, day]. */
export function orthodoxEaster(year: number): [number, number] {
  const a = year % 4;
  const b = year % 7;
  const c = year % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31);
  const day = ((d + e + 114) % 31) + 1;
  const julian = new Date(Date.UTC(year, month - 1, day));
  julian.setUTCDate(julian.getUTCDate() + 13);
  return [julian.getUTCMonth() + 1, julian.getUTCDate()];
}

const FIXED: [number, number, string][] = [
  [1, 1, 'Anul Nou'],
  [1, 2, 'Anul Nou'],
  [1, 6, 'Boboteaza'],
  [1, 7, 'Sf. Ioan Botezătorul'],
  [1, 24, 'Unirea Principatelor Române'],
  [5, 1, 'Ziua Muncii'],
  [6, 1, 'Ziua Copilului'],
  [8, 15, 'Adormirea Maicii Domnului'],
  [11, 30, 'Sf. Andrei'],
  [12, 1, 'Ziua Națională'],
  [12, 25, 'Crăciunul'],
  [12, 26, 'Crăciunul'],
];

const cache = new Map<number, Map<string, string>>();

function holidaysOf(year: number): Map<string, string> {
  const hit = cache.get(year);
  if (hit) return hit;
  const out = new Map<string, string>();
  for (const [m, d, name] of FIXED) out.set(`${m}-${d}`, name);
  const [em, ed] = orthodoxEaster(year);
  const easter = Date.UTC(year, em - 1, ed);
  const add = (offsetDays: number, name: string) => {
    const t = new Date(easter + offsetDays * 86_400_000);
    out.set(`${t.getUTCMonth() + 1}-${t.getUTCDate()}`, name);
  };
  add(-2, 'Vinerea Mare');
  add(0, 'Paștele');
  add(1, 'Paștele');
  add(49, 'Rusaliile');
  add(50, 'Rusaliile');
  cache.set(year, out);
  return out;
}

/** Name of the public holiday on that calendar date in Timișoara, or null. */
export function publicHoliday(year: number, month: number, day: number): string | null {
  return holidaysOf(year).get(`${month}-${day}`) ?? null;
}
