import assert from 'node:assert/strict';
import { test } from 'node:test';
import { countByDay, goodWeeks, parseDone, streak, weekOf } from './days.ts';

test('done.md lines, with and without a folder', () => {
  assert.deepEqual(parseDone('# Done\n- Fix the brake (2026-10-25, bike)\n- Call mum (2026-10-24)\n- no date\n- [x] Old style (2026-10-20, master/tum)\n'), [
    { text: 'Fix the brake', date: '2026-10-25', project: 'bike' },
    { text: 'Call mum', date: '2026-10-24', project: undefined },
    { text: 'Old style', date: '2026-10-20', project: 'master/tum' },
  ]);
});

test('weeks start on Monday or Sunday', () => {
  assert.deepEqual(weekOf('2026-10-25', 1), ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']);
  assert.equal(weekOf('2026-10-25', 0)[0], '2026-10-25');
});

const days = (...d: string[]) => countByDay(d.map((date) => ({ text: 'x', date })));

test('streak: rest days a week, today counted once something is done', () => {
  // Mon to Wed, Thursday off, Fri to Sun (the design's week).
  const week = days('2026-10-19', '2026-10-20', '2026-10-21', '2026-10-23', '2026-10-24', '2026-10-25');
  assert.equal(streak(week, '2026-10-25', 1, 1), 7);
  assert.equal(streak(week, '2026-10-25', 0, 1), 3);
  assert.equal(streak(week, '2026-10-26', 1, 1), 7); // Monday, nothing done yet: still going
  assert.equal(streak(days(), '2026-10-25', 2, 1), 0);
  assert.equal(streak(days('2026-10-24'), '2026-10-25', 2, 1), 1); // rest days before the first don't count
});

test('good weeks in a row: 4 days or more', () => {
  const c = days('2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-20');
  assert.equal(goodWeeks(c, '2026-10-21', 1), 2); // this week isn't there yet, the two before were
});
