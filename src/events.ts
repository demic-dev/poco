// Events: what the phone sends instead of editing Markdown. Each one is uploaded
// once as `_events/<id>.json`; the applier on bach turns it into edits.
// Pure, like parse.ts, so the applier can import it too.

import { type InboxItem, type Task, type Today, type TodayItem, parseInbox, parseTodo } from './parse.ts';

type Base = { id: string; time: string };
export type Event = Base &
  (
    | { type: 'capture'; text: string; url?: string; note?: string }
    | { type: 'pick'; date: string; items: { file: string; line: string }[] } // TODO.md lines, in pick order
    | { type: 'move-down'; date: string; line: string } // a today.md line
    | { type: 'done'; file: string; line: string } // file is today.md for a pick
    | { type: 'make-task'; file: string; date?: string; line?: string; capture?: string } // an inbox line, or a capture not applied yet
  );
type Body<E> = E extends Base ? Omit<E, keyof Base> : never;
export type NewEvent = Body<Event>;

// `2026-10-25T10:24:03.123Z` and `2026-10-25T10-24-03.123Z-1a2b3c4d`, so name order is
// time order. The extensions write the same without milliseconds.
export function stamp(e: NewEvent, now = new Date()): Event {
  const time = now.toISOString();
  const id = time.replace(/:/g, '-') + '-' + Math.random().toString(16).slice(2, 10).padEnd(8, '0');
  return { ...e, id, time } as Event;
}

export const todoFile = (project: string) => (project ? `${project}/TODO.md` : 'TODO.md');
const projectOf = (file: string) => file.split('/').slice(0, -1).join('/');

// The today.md line for a picked task, ending in `(date, folder)` like done.md.
export function todayLine(t: { text: string; date?: string; project?: string }) {
  const meta = [t.date, t.project].filter(Boolean).join(', ');
  return `- [ ] ${t.text}${meta ? ` (${meta})` : ''}`;
}

const pad = (n: number) => String(n).padStart(2, '0');
export const isoDay = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const localTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

// What a capture becomes in inbox.md after the time: `text`, `text: note`, `[text](url): note`. One line.
export function captureText(e: { text: string; url?: string; note?: string }) {
  const one = (s?: string) => s?.replace(/\s+/g, ' ').trim();
  const text = one(e.text) || e.url || '';
  const note = one(e.note);
  return (e.url ? `[${text.replace(/[[\]]/g, '')}](${e.url})` : text) + (note ? `: ${note}` : '');
}

export type Pending = { pending?: boolean };
export type View = { today: { date?: string; items: (TodayItem & Pending)[] }; inbox: (InboxItem & Pending & { capture?: string })[]; tasks: (Task & Pending)[] };

// The files plus the phone's own events not applied yet, marked pending (the grey ring).
// Events the files already show are skipped, for the moment between the applier
// writing a file and deleting the event.
export function overlay(files: { today: Today; inbox: InboxItem[]; tasks: Task[] }, events: Event[]): View {
  const v: View = { today: { date: files.today.date, items: [...files.today.items] }, inbox: [...files.inbox], tasks: [...files.tasks] };
  const captures: View['inbox'] = [];
  for (const e of [...events].sort((a, b) => a.id.localeCompare(b.id))) {
    if (e.type === 'capture') {
      const t = new Date(e.time);
      const [item] = parseInbox(`- ${localTime(t)} ${captureText(e)}`);
      if (v.inbox.some((i) => i.text === item.text && i.url === item.url)) continue;
      captures.unshift({ ...item, day: isoDay(t), capture: e.id, pending: true });
    } else if (e.type === 'pick') {
      if (v.today.date !== e.date) v.today = { date: e.date, items: [] };
      for (const { file, line } of e.items) {
        const [t] = parseTodo(line, projectOf(file));
        if (!t || v.today.items.some((i) => i.text === t.text && (i.project ?? '') === t.project)) continue;
        const project = t.project || undefined;
        v.today.items.push({ text: t.text, date: t.date, project, done: false, line: todayLine({ ...t, project }), pending: true });
      }
    } else if (e.type === 'move-down') {
      // ponytail: not idempotent; for a moment after the applier ran, the line can move twice.
      if (v.today.date !== e.date) continue;
      const items = v.today.items;
      const i = items.findIndex((x) => x.line === e.line);
      if (i < 0) continue;
      const [moved] = items.splice(i, 1);
      const lastOpen = items.findLastIndex((x) => !x.done);
      items.splice(lastOpen + 1, 0, { ...moved, pending: true });
    } else if (e.type === 'done') {
      const i = v.today.items.findIndex((x) => x.line === e.line && !x.done);
      if (i < 0) continue;
      const item = v.today.items[i];
      v.today.items[i] = { ...item, done: true, pending: true };
      v.tasks = v.tasks.filter((t) => !(t.text === item.text && t.project === (item.project ?? '')));
    } else if (e.type === 'make-task') {
      const all = [...captures, ...v.inbox];
      const item = all.find((i) => (e.capture ? i.capture === e.capture : i.line === e.line));
      if (!item) continue;
      const remove = (list: View['inbox']) => list.filter((i) => i !== item);
      captures.splice(0, captures.length, ...remove(captures));
      v.inbox = remove(v.inbox);
      const text = item.line!.replace(/^\s*[-*] (\d{1,2}:\d{2}\s+)?/, ''); // as the applier takes it
      const project = projectOf(e.file);
      if (v.tasks.some((t) => t.text === text && t.project === project)) continue;
      v.tasks.push({ text, date: e.date, project, line: `- [ ] ${text}${e.date ? ` (${e.date})` : ''}`, pending: true });
    }
  }
  v.inbox = [...captures, ...v.inbox];
  return v;
}
