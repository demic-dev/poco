// The notes folder as the drawer shows it, and links between notes. Pure, so
// `node --test src/` runs it without React Native.

export const isImage = (path: string) => /\.(png|jpe?g|gif|webp|heic)$/i.test(path);

// Where a link or image in the note `from` points inside the notes folder, or
// undefined for anything else: a web address, an anchor, a path above the folder.
export function resolve(from: string, href: string): string | undefined {
  if (/^[a-z][\w+.-]*:|^\/\/|^#/i.test(href)) return;
  let target = href.replace(/[?#].*$/, '');
  try {
    target = decodeURIComponent(target);
  } catch {}
  const parts = target.startsWith('/') ? [] : from.split('/').slice(0, -1);
  for (const s of target.split('/')) {
    if (s === '..') {
      if (!parts.length) return;
      parts.pop();
    } else if (s && s !== '.') parts.push(s);
  }
  return parts.join('/') || undefined;
}

// The images in the notes folder a note shows, so the sync can bring them along.
export const imageLinks = (path: string, md: string) =>
  [...md.matchAll(/!\[[^\]]*\]\(\s*<?([^)\s>]+)/g)].flatMap(([, href]) => {
    const p = resolve(path, href);
    return p && isImage(p) ? [p] : [];
  });

export type Note = { path: string; here: boolean }; // here: downloaded to the phone
export type Group = { folder: string; notes: Note[] }; // folder '' holds the loose files at the top

export const folderOf = (path: string) => path.split('/').slice(0, -1).join('/');
export const nameOf = (path: string) => path.split('/').pop()!.replace(/\.md$/, '');
// How a note shows inside its group: `meetings/2026-10-14`, or `TODO.md` as it is.
export const nameIn = (folder: string, path: string) => (path === (folder ? `${folder}/TODO.md` : 'TODO.md') ? 'TODO.md' : path.slice(folder ? folder.length + 1 : 0).replace(/\.md$/, ''));

// Projects are folders with a TODO.md, holding the notes in their subfolders too. The rest
// go by top-level folder, and the files at the top are "Loose files" (folder ''), last.
export function groupNotes(notes: Note[]): { projects: Group[]; other: Group[] } {
  const projects = new Set(notes.filter((n) => n.path.endsWith('/TODO.md')).map((n) => folderOf(n.path)));
  const groups = new Map<string, Note[]>();
  for (const n of notes) {
    const parts = n.path.split('/').slice(0, -1);
    let folder = parts[0] ?? '';
    for (let i = parts.length; i > 0; i--) {
      if (projects.has(parts.slice(0, i).join('/'))) {
        folder = parts.slice(0, i).join('/');
        break;
      }
    }
    groups.set(folder, [...(groups.get(folder) ?? []), n]);
  }
  const sorted = (folder: string): Group => ({
    folder,
    notes: groups.get(folder)!.sort((a, b) => {
      const [x, y] = [nameIn(folder, a.path), nameIn(folder, b.path)];
      return x === 'TODO.md' ? -1 : y === 'TODO.md' ? 1 : x.localeCompare(y);
    }),
  });
  const folders = [...groups.keys()].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)));
  return { projects: folders.filter((f) => projects.has(f)).map(sorted), other: folders.filter((f) => !projects.has(f)).map(sorted) };
}

// "Find a note": every word in the name or the folder.
export function findNotes(notes: Note[], query: string) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return notes.filter((n) => words.every((w) => n.path.toLowerCase().replace(/\.md$/, '').includes(w))).sort((a, b) => nameOf(a.path).localeCompare(nameOf(b.path)));
}

// marked leaves entities as written; a browser would show `&amp;` as `&`.
const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' };
export const decode = (text: string) =>
  text.replace(/&(?:#(\d+)|#x([\da-f]+)|(\w+));/gi, (m, dec, hex, name) => {
    const code = dec ? Number(dec) : hex ? parseInt(hex, 16) : undefined;
    return code !== undefined ? (code <= 0x10ffff ? String.fromCodePoint(code) : m) : (entities[name.toLowerCase()] ?? m);
  });
