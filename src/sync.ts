import { ExtensionStorage } from '@bacons/apple-targets';
import { Directory, File, Paths } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import PocoNative from '../modules/poco-native';
import { type Event, type View, isoDay } from './events';
import { type DoneItem, parseDone } from './days';
import { type InboxItem, type Task, type Today, parseInbox, parsePropfind, parseToday, parseTodo } from './parse';
import { readLocal, takeRemote, updateLocal, uploaded } from './settings';

export type Account = { server: string; user: string; password: string; folder: string };
export type Notes = { today: Today; inbox: InboxItem[]; tasks: Task[]; done: DoneItem[]; todos: string[]; syncedAt?: number }; // todos: every TODO.md

// SideStore renames the App Group when it re-signs; the native module reads the real one.
export const shared = new ExtensionStorage(PocoNative.appGroup);

// The widget and the "What's next" shortcut read this (targets/widget/_shared/Poco.swift).
export function publishWidget(view: View) {
  const picked = view.today.date === isoDay() ? view.today.items : [];
  const json = picked.length
    ? JSON.stringify({ date: view.today.date, next: picked.find((i) => !i.done)?.text, done: picked.filter((i) => i.done).length, total: picked.length })
    : undefined;
  if ((json ?? null) === shared.get('today')) return;
  shared.set('today', json);
  ExtensionStorage.reloadWidget();
}

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

// Events wait in the App Group's outbox (the extensions write there too), and after
// upload in sent/ until they're gone from `_events/`: then the files show them.
const outbox = new Directory(PocoNative.containerPath ? `file://${PocoNative.containerPath}` : Paths.document, 'outbox');
const sent = new Directory(Paths.document, 'sent');
const jsonFiles = (dir: Directory) => (dir.exists ? dir.list().filter((f): f is File => f instanceof File && f.name.endsWith('.json')) : []);

export function readEvents(): { waiting: Event[]; sent: Event[] } {
  const read = (dir: Directory) =>
    jsonFiles(dir).flatMap((f) => {
      try {
        return [JSON.parse(f.textSync()) as Event];
      } catch {
        return []; // half-written by an extension; next time
      }
    });
  return { waiting: read(outbox), sent: read(sent) };
}

export function queue(events: Event[]) {
  outbox.create({ intermediates: true, idempotent: true });
  for (const e of events) {
    const f = new File(outbox, `${e.id}.json`);
    f.create({ overwrite: true });
    f.writeSync(JSON.stringify(e));
  }
}

export function readNotes(): Notes {
  const { etags, syncedAt } = readIndex();
  const text = (path: string) => (path in etags ? cached(path).textSync() : '');
  const todos = Object.keys(etags)
    .filter((p) => p.split('/').pop() === 'TODO.md')
    .sort();
  const tasks = todos.flatMap((p) => parseTodo(text(p), p.split('/').slice(0, -1).join('/')));
  return { today: parseToday(text('today.md')), inbox: parseInbox(text('inbox.md')), tasks, done: parseDone(text('done.md')), todos, syncedAt };
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

  // Throws on a failure, unless its status is in `allow`.
  async function request(path: string, init: RequestInit, allow: number[] = []) {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 15000);
    try {
      const res = await fetch(url(path), { ...init, headers: { ...auth, ...init.headers }, signal: abort.signal });
      if (!res.ok && !allow.includes(res.status)) throw new Error(`${init.method ?? 'GET'} ${path || '/'}: HTTP ${res.status}`);
      return { ok: res.ok, status: res.status, body: await res.text(), etag: res.headers.get('etag')?.replace(/"/g, '') };
    } finally {
      clearTimeout(timer);
    }
  }

  const propfind = async (dir: string, allow?: number[]) => {
    const res = await request(
      dir,
      {
        method: 'PROPFIND',
        headers: { Depth: '1', 'Content-Type': 'application/xml' },
        body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:getetag/><d:resourcetype/></d:prop></d:propfind>',
      },
      allow,
    );
    return res.ok ? res.body : null;
  };

  // Upload: same name, same bytes, so sending twice is harmless. Nextcloud answers 404
  // (the spec says 409) while `_events/` doesn't exist yet.
  for (const f of jsonFiles(outbox)) {
    const put = () => request(`_events/${f.name}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: f.textSync() }, [404, 409]);
    if (!(await put()).ok) {
      await request('_events/', { method: 'MKCOL' }, [405]); // 405: made meanwhile
      if (!(await put()).ok) throw new Error(`PUT _events/${f.name}: no _events folder`);
    }
    sent.create({ intermediates: true, idempotent: true });
    f.moveSync(new File(sent, f.name), { overwrite: true });
  }

  // Confirm before reading the files: the applier deletes an event only after writing them.
  const waiting = jsonFiles(sent);
  if (waiting.length) {
    const xml = await propfind('_events/', [404]);
    const left = new Set(xml === null ? [] : parsePropfind(xml, basePath).map((e) => e.path.replace(/^_events\//, '')));
    for (const f of waiting) if (!left.has(f.name)) f.delete();
  }

  const old = readIndex().etags;
  const next: Record<string, string> = {};
  let poco: string | undefined; // the ETag of `.poco/`, if it exists

  async function walk(dir: string) {
    const xml = (await propfind(dir))!;
    for (const e of parsePropfind(xml, basePath)) {
      if (e.path === dir) next[dir] = e.etag;
      else if (e.path === '.poco/') poco = e.etag;
      else if (skipped(e.path)) continue;
      else if (e.dir && old[e.path] === e.etag) {
        for (const k in old) if (k.startsWith(e.path)) next[k] = old[k];
      } else if (e.dir) await walk(e.path);
      else if (wanted(e.path)) {
        if (old[e.path] !== e.etag || !cached(e.path).exists) {
          const f = cached(e.path);
          const { body } = await request(e.path, {});
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

  // The phone's state (src/settings.ts). Read when `.poco/` changed or there's no copy
  // here yet; our own upload changes `.poco/` too, which costs one PROPFIND next time.
  const state = '.poco/state.json';
  const read = async () => {
    const res = await request(state, {}, [404]);
    if (res.ok) takeRemote(JSON.parse(res.body), res.etag);
    else updateLocal({ etag: undefined });
  };
  const local = readLocal();
  if (!local || (poco && poco !== local.dir)) {
    const xml = poco ? await propfind('.poco/') : null;
    const etag = xml ? parsePropfind(xml, basePath).find((e) => e.path === state)?.etag : undefined;
    if (etag && etag !== local?.etag) await read();
    updateLocal({ dir: poco });
  }

  // Written with If-Match, as the applier does: on 412 read it, apply the change again, retry.
  for (let tries = 0; ; tries++) {
    const l = readLocal()!;
    if (!l.dirty.length) break;
    if (tries === 3) throw new Error(`PUT ${state}: it keeps changing`);
    const put = () =>
      request(state, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(l.etag ? { 'If-Match': `"${l.etag}"` } : { 'If-None-Match': '*' }) }, body: JSON.stringify(l.state, null, 2) }, [404, 409, 412]);
    let res = await put();
    if (res.status === 404 || res.status === 409) {
      await request('.poco/', { method: 'MKCOL' }, [405]); // Nextcloud answers 404 into a missing folder
      res = await put();
    }
    if (res.ok) uploaded(l.state, res.etag);
    else if (res.status === 412) await read();
    else throw new Error(`PUT ${state}: HTTP ${res.status}`);
  }
}

// One sync at a time: the app, the background task and a just-queued event can all ask.
let running = Promise.resolve();
export function sync(account: Account) {
  running = running.catch(() => {}).then(() => refresh(account));
  return running;
}
