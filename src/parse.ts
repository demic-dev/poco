// Everything that turns text from the notes folder into data. Pure, so
// `node --test src/` runs it without React Native.

export type Task = {
  text: string;
  date?: string; // YYYY-MM-DD
  project: string; // folder of its TODO.md, '' for loose tasks
  line: string; // the line as written, how events will name it
};

export type TodayItem = { text: string; done: boolean; date?: string; project?: string; line: string };
export type Today = { date?: string; items: TodayItem[] };

export type InboxItem = { day?: string; time?: string; text: string; url?: string; note?: string };

export type DavEntry = { path: string; etag: string; dir: boolean };

const item = /^\s*[-*] (.*)$/;
const checkbox = /^\[([ xX])\] (.*)$/;
const heading = /^## (\d{4}-\d{2}-\d{2})\s*$/;

// `- [ ] Fix the back brake (2026-10-31)` in <project>/TODO.md. Checked lines are skipped.
export function parseTodo(md: string, project: string): Task[] {
  return md.split('\n').flatMap((line) => {
    const box = line.match(item)?.[1].match(checkbox);
    if (!box || box[1] !== ' ') return [];
    const m = box[2].match(/^(.*?)\s*\((\d{4}-\d{2}-\d{2})\)$/);
    return [{ text: m ? m[1] : box[2].trim(), date: m?.[2], project, line }];
  });
}

// ## 2026-10-25
// - [ ] Email Jonas about the flat inspection (copenhagen)
// - [x] Fix the back brake on the bike (2026-10-25, bike)
export function parseToday(md: string): Today {
  const today: Today = { items: [] };
  for (const line of md.split('\n')) {
    const h = line.match(heading);
    if (h) today.date ??= h[1];
    const box = line.match(item)?.[1].match(checkbox);
    if (!box) continue;
    // Trailing `(date)`, `(project)` or `(date, project)`; a project is one folder path, no spaces.
    const m = box[2].match(/^(.*?)\s*\((?:(\d{4}-\d{2}-\d{2})(?:,\s*)?)?([\w./-]+)?\)$/);
    const meta = m && (m[2] || m[3]);
    today.items.push({
      text: meta ? m[1] : box[2].trim(),
      done: box[1] !== ' ',
      date: meta ? m[2] : undefined,
      project: meta ? m[3] : undefined,
      line,
    });
  }
  return today;
}

// ## 2026-10-25
// - 10:21 Ask Ana if she still has the drill
// - 09:58 [How to bleed hydraulic disc brakes](https://example.com/brakes): for the bike
export function parseInbox(md: string): InboxItem[] {
  let day: string | undefined;
  return md.split('\n').flatMap((line) => {
    const h = line.match(heading);
    if (h) day = h[1];
    let text = line.match(item)?.[1].trim();
    if (!text) return [];
    const t = text.match(/^(\d{1,2}:\d{2})\s+(.*)$/);
    if (t) text = t[2];
    const link = text.match(/^\[([^\]]*)\]\(([^)\s]+)\)(?::\s*(.*))?$/);
    return [link ? { day, time: t?.[1], text: link[1] || link[2], url: link[2], note: link[3] } : { day, time: t?.[1], text }];
  });
}

// The `<d:response>` entries of a PROPFIND reply, as paths relative to `base`
// (the folder's path, decoded, ending in `/`). Folders end in `/`, the folder itself is ''.
export function parsePropfind(xml: string, base: string): DavEntry[] {
  return [...xml.matchAll(/<(?:\w+:)?response\b[^>]*>([\s\S]*?)<\/(?:\w+:)?response>/g)].flatMap(([, r]) => {
    const href = decodeURIComponent((r.match(/<(?:\w+:)?href>([^<]*)</)?.[1] ?? '').replace(/&amp;/g, '&'));
    if (!href.startsWith(base)) return [];
    const etag = (r.match(/<(?:\w+:)?getetag>([^<]*)</)?.[1] ?? '').replace(/&quot;|"/g, '');
    return [{ path: href.slice(base.length), etag, dir: /<(?:\w+:)?collection\s*\/>/.test(r) }];
  });
}
