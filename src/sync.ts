import { ExtensionStorage } from '@bacons/apple-targets';
import { Directory, File, Paths } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import { type InboxItem, type Task, type Today, parseInbox, parsePropfind, parseToday, parseTodo } from './parse';

export type Account = { server: string; user: string; password: string; folder: string };
export type Notes = { today: Today; inbox: InboxItem[]; tasks: Task[]; syncedAt?: number };

// SideStore re-signs with the free Apple ID and renames App Groups to
// `group.dev.demic.poco.<TEAMID>`, so read the real one from our profile.
function findAppGroup(): string {
  const base = 'group.dev.demic.poco';
  try {
    const bytes = new File(Paths.bundle, 'embedded.mobileprovision').bytesSync();
    const raw = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
    return raw.match(/<string>(group\.dev\.demic\.poco[^<]*)<\/string>/)?.[1] ?? base;
  } catch {
    return base;
  }
}

export const shared = new ExtensionStorage(findAppGroup());

export async function loadAccount(): Promise<Account | null> {
  const json = await SecureStore.getItemAsync('account');
  return json ? JSON.parse(json) : null;
}

export async function saveAccount(account: Account) {
  await SecureStore.setItemAsync('account', JSON.stringify(account));
}

// The offline copy: the files we read, under their paths in the notes folder,
// plus index.json with each file's and folder's ETag.
const cache = new Directory(Paths.document, 'notes');
const indexFile = new File(Paths.document, 'index.json');
type Index = { etags: Record<string, string>; syncedAt?: number };

const wanted = (path: string) => ['inbox.md', 'today.md', 'done.md'].includes(path) || path.split('/').pop() === 'TODO.md';
const skipped = (path: string) => path.split('/').some((s) => s.startsWith('.') || s.startsWith('_')); // .git, _events

function readIndex(): Index {
  try {
    return JSON.parse(indexFile.textSync());
  } catch {
    return { etags: {} };
  }
}

const cached = (path: string) => new File(cache, ...path.split('/'));

export function readNotes(): Notes {
  const { etags, syncedAt } = readIndex();
  const text = (path: string) => (path in etags ? cached(path).textSync() : '');
  const tasks = Object.keys(etags)
    .filter((p) => p.split('/').pop() === 'TODO.md')
    .sort()
    .flatMap((p) => parseTodo(text(p), p.split('/').slice(0, -1).join('/')));
  return { today: parseToday(text('today.md')), inbox: parseInbox(text('inbox.md')), tasks, syncedAt };
}

// Walks the notes folder one level at a time. Nextcloud changes a folder's ETag
// whenever anything inside it changes, so an unchanged folder is skipped whole,
// and when nothing changed the refresh is a single PROPFIND.
export async function refresh(account: Account): Promise<void> {
  const root = `${account.server.replace(/\/+$/, '')}/remote.php/dav/files/${encodeURIComponent(account.user)}/${account.folder
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/')}/`;
  const basePath = decodeURIComponent(root.replace(/^https?:\/\/[^/]+/, ''));
  const auth = { Authorization: `Basic ${btoa(`${account.user}:${account.password}`)}` };
  const url = (path: string) => root + path.split('/').map(encodeURIComponent).join('/');

  async function request(path: string, init: RequestInit) {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 15000);
    try {
      const res = await fetch(url(path), { ...init, headers: { ...auth, ...init.headers }, signal: abort.signal });
      if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path || '/'}: HTTP ${res.status}`);
      return await res.text();
    } finally {
      clearTimeout(timer);
    }
  }

  const old = readIndex().etags;
  const next: Record<string, string> = {};

  async function walk(dir: string) {
    const xml = await request(dir, {
      method: 'PROPFIND',
      headers: { Depth: '1', 'Content-Type': 'application/xml' },
      body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:getetag/><d:resourcetype/></d:prop></d:propfind>',
    });
    for (const e of parsePropfind(xml, basePath)) {
      if (e.path === dir) next[dir] = e.etag;
      else if (skipped(e.path)) continue;
      else if (e.dir && old[e.path] === e.etag) {
        for (const k in old) if (k.startsWith(e.path)) next[k] = old[k];
      } else if (e.dir) await walk(e.path);
      else if (wanted(e.path)) {
        if (old[e.path] !== e.etag || !cached(e.path).exists) {
          const f = cached(e.path);
          const body = await request(e.path, {});
          f.create({ intermediates: true, overwrite: true });
          await f.write(body);
        }
        next[e.path] = e.etag;
      }
    }
  }

  await walk('');
  for (const k in old) if (!(k in next) && !k.endsWith('/') && cached(k).exists) cached(k).delete();
  indexFile.create({ overwrite: true });
  await indexFile.write(JSON.stringify({ etags: next, syncedAt: Date.now() } satisfies Index));
}
