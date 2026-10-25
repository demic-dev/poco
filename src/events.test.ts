import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Event, overlay, stamp, todayLine } from './events.ts';
import { parseInbox, parseToday, parseTodo } from './parse.ts';

const at = (iso: string) => new Date(iso);

test('ids sort in time order and keep the extensions\' shape', () => {
  const a = stamp({ type: 'capture', text: 'a' }, at('2026-10-25T10:24:03.120Z'));
  const b = stamp({ type: 'capture', text: 'b' }, at('2026-10-25T10:24:03.121Z'));
  assert.match(a.id, /^2026-10-25T10-24-03\.120Z-[0-9a-f]{8}$/);
  assert.equal(a.time, '2026-10-25T10:24:03.120Z');
  assert.ok(a.id < b.id);
});

test('today line round-trips through parseToday', () => {
  const line = todayLine({ text: 'Fix the brake', date: '2026-10-31', project: 'bike' });
  assert.equal(line, '- [ ] Fix the brake (2026-10-31, bike)');
  assert.deepEqual(parseToday(line).items[0], { text: 'Fix the brake', done: false, date: '2026-10-31', project: 'bike', line });
  assert.equal(todayLine({ text: 'Loose one' }), '- [ ] Loose one');
});

test('overlay: pick, done, move down, capture, make task', () => {
  const tasks = [...parseTodo('- [ ] Fix the brake (2026-10-31)\n- [ ] Pump tyres\n', 'bike'), ...parseTodo('- [ ] Call mum\n', '')];
  const files = { today: parseToday('## 2026-10-24\n- [ ] Old pick\n'), inbox: parseInbox('## 2026-10-24\n- 09:00 Ask Ana\n'), tasks };
  let n = 0;
  const ev = (e: Parameters<typeof stamp>[0]) => stamp(e, at(`2026-10-25T10:00:0${n++}.000Z`));
  const events: Event[] = [
    ev({ type: 'pick', date: '2026-10-25', items: [{ file: 'bike/TODO.md', line: tasks[0].line }, { file: 'TODO.md', line: tasks[2].line }, { file: 'bike/TODO.md', line: tasks[1].line }] }),
    ev({ type: 'move-down', date: '2026-10-25', line: '- [ ] Fix the brake (2026-10-31, bike)' }),
    ev({ type: 'done', file: 'today.md', line: '- [ ] Call mum' }),
    ev({ type: 'capture', text: 'Buy batteries' }),
    ev({ type: 'capture', text: 'Bleed brakes', url: 'https://example.com/b' }),
  ];
  events.push(ev({ type: 'make-task', file: 'bike/TODO.md', capture: events[4].id, date: '2026-11-01' }));
  events.push(ev({ type: 'make-task', file: 'TODO.md', line: '- 09:00 Ask Ana' }));

  const v = overlay(files, events);
  assert.equal(v.today.date, '2026-10-25');
  assert.deepEqual(v.today.items.map((i) => [i.text, i.done, i.pending]), [
    ['Call mum', true, true],
    ['Pump tyres', false, true],
    ['Fix the brake', false, true],
  ]);
  assert.deepEqual(v.inbox.map((i) => [i.text, i.pending]), [['Buy batteries', true]]);
  assert.deepEqual(v.done.map((d) => [d.text, d.pending]), [['Call mum', true]]);
  assert.deepEqual(v.tasks.map((t) => [t.text, t.project, t.date, t.pending]), [
    ['Fix the brake', 'bike', '2026-10-31', undefined],
    ['Pump tyres', 'bike', undefined, undefined],
    ['[Bleed brakes](https://example.com/b)', 'bike', '2026-11-01', true],
    ['Ask Ana', '', undefined, true],
  ]);
});

test('overlay skips what the files already show', () => {
  const files = { today: parseToday('## 2026-10-25\n- [x] Call mum\n'), inbox: parseInbox('## 2026-10-25\n- 10:00 Buy batteries\n'), tasks: [] };
  const events: Event[] = [
    stamp({ type: 'pick', date: '2026-10-25', items: [{ file: 'TODO.md', line: '- [ ] Call mum' }] }),
    stamp({ type: 'done', file: 'today.md', line: '- [ ] Call mum' }),
    stamp({ type: 'capture', text: 'Buy batteries' }),
  ];
  const v = overlay(files, events);
  assert.deepEqual(v.today.items.map((i) => [i.text, i.done, i.pending]), [['Call mum', true, undefined]]);
  assert.deepEqual(v.inbox.map((i) => [i.text, i.pending]), [['Buy batteries', undefined]]);
});
