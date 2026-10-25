// done.md and the streak. Pure, so `node --test` runs it.

import { isoDay } from './events.ts';

export type DoneItem = { text: string; date: string; project?: string; pending?: boolean };

// `- Fix the back brake (2026-10-25, bike)`; a line without a date has no day to count on.
export function parseDone(md: string): DoneItem[] {
  return md.split('\n').flatMap((line) => {
    const m = line.match(/^\s*[-*] (?:\[[xX]\] )?(.*?)\s*\((\d{4}-\d{2}-\d{2})(?:,\s*([\w./-]+))?\)\s*$/);
    return m ? [{ text: m[1], date: m[2], project: m[3] }] : [];
  });
}

const parse = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const addDays = (iso: string, n: number) => {
  const d = parse(iso);
  d.setDate(d.getDate() + n);
  return isoDay(d);
};

// The 7 days of the week holding `day`. weekStart: 0 Sunday, 1 Monday.
export function weekOf(day: string, weekStart: number) {
  const first = addDays(day, -((parse(day).getDay() - weekStart + 7) % 7));
  return [0, 1, 2, 3, 4, 5, 6].map((n) => addDays(first, n));
}

export const countByDay = (done: DoneItem[]) => done.reduce((m, d) => m.set(d.date, (m.get(d.date) ?? 0) + 1), new Map<string, number>());

// Days in a row with something done, where up to `rest` empty days a week don't break it.
// Today only counts once something is done; until then the streak is yesterday's.
export function streak(counts: Map<string, number>, today: string, rest: number, weekStart: number) {
  const restUsed = new Map<string, number>();
  let day = counts.get(today) ? today : addDays(today, -1);
  let length = 0;
  for (let i = 0; i < 3660; i++, day = addDays(day, -1)) {
    if (counts.get(day)) {
      length = i + 1; // rest days before the first done day don't count
      continue;
    }
    const week = weekOf(day, weekStart)[0];
    const used = restUsed.get(week) ?? 0;
    if (used >= rest) break;
    restUsed.set(week, used + 1);
  }
  return length;
}

// A good week has something done on 4 days or more. This week counts once it gets there.
export const goodWeek = (counts: Map<string, number>, week: string[]) => week.filter((d) => counts.get(d)).length >= 4;

export function goodWeeks(counts: Map<string, number>, today: string, weekStart: number) {
  let week = weekOf(today, weekStart);
  let n = goodWeek(counts, week) ? 1 : 0;
  for (let i = 0; i < 520; i++) {
    week = weekOf(addDays(week[0], -7), weekStart);
    if (!goodWeek(counts, week)) break;
    n++;
  }
  return n;
}
