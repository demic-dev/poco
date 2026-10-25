// What each event does to the Markdown, as steps of one file each, applied in order.
// Every step reads its file fresh, so after a 412 (the laptop synced an edit) or a
// crash the run picks up at the step it was on. Pure: main.ts does the WebDAV.

import { captureText, type Event, todayLine, todoFile } from '../src/events.ts';
import { parseToday, parseTodo } from '../src/parse.ts';

// content: the new file, or unchanged when missing. problem: goes to inbox.md as a note.
// stop: skip the event's remaining steps. remember: the inbox line a capture became.
export type Result = { content?: string; problem?: string; stop?: boolean; remember?: string };
export type Step = { file: string; edit: (md: string) => Result };
export type Context = {
  local: (iso: string) => { day: string; time: string }; // in bach's time zone
  captured: (id: string) => string | undefined; // the inbox line of an earlier capture
};

const heading = /^## (\d{4}-\d{2}-\d{2})\s*$/;
const lines = (md: string) => (md === '' ? [] : md.replace(/\n$/, '').split('\n'));
const join = (ls: string[]) => (ls.length ? ls.join('\n') + '\n' : '');
const append = (md: string, line: string) => join([...lines(md), line]);
const projectOf = (file: string) => file.split('/').slice(0, -1).join('/');

// inbox.md is newest first: a line goes right under its day's heading, and a new
// heading goes above the first older one (or at the end).
export function addToInbox(md: string, day: string, line: string) {
  const ls = lines(md);
  const h = ls.findIndex((l) => l.match(heading)?.[1] === day);
  if (h >= 0) ls.splice(h + 1, 0, line);
  else {
    const older = ls.findIndex((l) => (l.match(heading)?.[1] ?? '9') < day);
    ls.splice(older >= 0 ? older : ls.length, 0, `## ${day}`, line);
  }
  return join(ls);
}

// Removes a line, and its day's heading if nothing is left under it.
function removeLine(ls: string[], i: number) {
  ls.splice(i, 1);
  const emptyDay = heading.test(ls[i - 1] ?? '') && (i >= ls.length || heading.test(ls[i]));
  if (emptyDay) ls.splice(i - 1, 1);
}

export function steps(e: Event, ctx: Context): Step[] {
  switch (e.type) {
    case 'capture': {
      const { day, time } = ctx.local(e.time);
      const line = `- ${time} ${captureText(e)}`;
      return [{ file: 'inbox.md', edit: (md) => ({ content: addToInbox(md, day, line), remember: line }) }];
    }

    case 'pick': {
      const picked = e.items.flatMap(({ file, line }) => parseTodo(line, projectOf(file)).map((t) => ({ ...t, project: t.project || undefined })));
      return [
        {
          file: 'today.md',
          edit: (md) => {
            const today = parseToday(md);
            if (today.date !== e.date) return { content: join([`## ${e.date}`, ...picked.map(todayLine)]) };
            const fresh = picked.filter((t) => !today.items.some((i) => i.text === t.text && i.project === t.project));
            const ls = lines(md);
            const last = ls.findLastIndex((l) => parseToday(l).items.length > 0);
            ls.splice(last >= 0 ? last + 1 : ls.length, 0, ...fresh.map(todayLine));
            return { content: join(ls) };
          },
        },
      ];
    }

    case 'move-down':
      return [
        {
          file: 'today.md',
          edit: (md) => {
            const ls = lines(md);
            const i = ls.indexOf(e.line);
            if (parseToday(md).date !== e.date || i < 0) return {}; // already done, or another day: nothing to move
            ls.splice(i, 1);
            const lastOpen = ls.findLastIndex((l) => parseToday(l).items[0]?.done === false);
            ls.splice(Math.max(lastOpen + 1, i), 0, e.line);
            return { content: join(ls) };
          },
        },
      ];

    case 'done': {
      const fromToday = e.file === 'today.md';
      const item = fromToday ? parseToday(e.line).items[0] : parseTodo(e.line, projectOf(e.file))[0];
      if (!item) return [{ file: 'inbox.md', edit: () => ({ problem: `Couldn't read a done line: ${e.line}` }) }];
      const project = item.project || '';
      const file = fromToday ? todoFile(project) : e.file;
      const out: Step[] = [];
      if (fromToday)
        out.push({
          file: 'today.md',
          edit: (md) => {
            const ls = lines(md);
            const i = ls.indexOf(e.line);
            if (i < 0) return {}; // checked already, or the pick changed on the laptop
            ls[i] = ls[i].replace('[ ]', '[x]');
            return { content: join(ls) };
          },
        });
      out.push(
        {
          file,
          edit: (md) => {
            const ls = lines(md);
            const i = ls.findIndex((l) => parseTodo(l, '').some((t) => t.text === item.text && t.date === item.date));
            if (i < 0) return { problem: `Done on the phone, but ${file} no longer has “${item.text}”.` };
            ls.splice(i, 1);
            return { content: join(ls) };
          },
        },
        {
          file: 'done.md',
          edit: (md) => ({ content: append(md, `- ${item.text} (${[ctx.local(e.time).day, project].filter(Boolean).join(', ')})`) }),
        },
      );
      return out;
    }

    case 'make-task': {
      const line = e.capture ? ctx.captured(e.capture) : e.line;
      if (!line) return [{ file: 'inbox.md', edit: () => ({ problem: `Couldn't find the capture to make a task of (${e.capture}).` }) }];
      const text = line.replace(/^\s*[-*] (\d{1,2}:\d{2}\s+)?/, '');
      return [
        {
          file: 'inbox.md',
          edit: (md) => {
            const ls = lines(md);
            const i = ls.indexOf(line);
            if (i < 0) return { stop: true, problem: `Not made a task, it changed in the inbox meanwhile: “${text}”.` };
            removeLine(ls, i);
            return { content: join(ls) };
          },
        },
        { file: e.file, edit: (md) => ({ content: append(md, `- [ ] ${text}${e.date ? ` (${e.date})` : ''}`) }) },
      ];
    }

    default:
      return [{ file: 'inbox.md', edit: () => ({ problem: `Unknown event from the phone: ${JSON.stringify(e)}` }) }];
  }
}

// What couldn't be applied, as inbox lines, so nothing is lost silently.
export function noteStep(problems: string[], now: string, ctx: Context): Step {
  const { day, time } = ctx.local(now);
  return { file: 'inbox.md', edit: (md) => ({ content: problems.reduce((m, p) => addToInbox(m, day, `- ${time} poco: ${p}`), md) }) };
}
