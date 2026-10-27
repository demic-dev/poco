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
