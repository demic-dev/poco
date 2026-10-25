// The applier: applies every event in `_events/` to the Markdown and deletes it.
// Goes through WebDAV, not the files on disk, so Nextcloud keeps its ETags and
// versions and tells the desktop clients; If-Match makes every write safe.
//
//   POCO_URL            the notes folder, https://…/remote.php/dav/files/<user>/notes/
//   POCO_USER           the Nextcloud user
//   POCO_PASSWORD_FILE  a file holding its app password
//   POCO_STATE          state file (default: ./poco-state.json)

import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { type Event, isoDay, localTime } from '../src/events.ts';
import { parsePropfind } from '../src/parse.ts';
import { type Context, noteStep, type Step, steps } from './apply.ts';

export type Config = { url: string; user: string; password: string; state: string; now?: () => Date };

// applied: ids already applied, so an event that comes back (the phone re-sending after a
// lost reply) isn't applied twice; kept 30 days. captured: the inbox line each capture became.
// progress: the event being applied, and how far it got.
type State = { applied: string[]; captured: Record<string, string>; progress?: { id: string; step: number; problems: string[] } };

const keep = 30 * 864e5;
const idTime = (id: string) => Date.parse(id.slice(0, 19).replace(/T(\d\d)-(\d\d)-(\d\d)/, 'T$1:$2:$3') + 'Z');

export async function run(cfg: Config): Promise<number> {
  const now = cfg.now ?? (() => new Date());
  const root = cfg.url.replace(/\/*$/, '/');
  const base = decodeURIComponent(new URL(root).pathname);
  const auth = `Basic ${Buffer.from(`${cfg.user}:${cfg.password}`).toString('base64')}`;

  // Throws on a failure, except for the statuses in `allow`.
  async function dav(method: string, path: string, init: { body?: string; headers?: Record<string, string> } = {}, allow: number[] = []) {
    const res = await fetch(root + path.split('/').map(encodeURIComponent).join('/'), {
      method,
      body: init.body,
      headers: { Authorization: auth, ...init.headers },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok && !allow.includes(res.status)) throw new Error(`${method} ${path}: HTTP ${res.status}`);
    return res;
  }

  let state: State;
  try {
    state = JSON.parse(readFileSync(cfg.state, 'utf8'));
  } catch {
    state = { applied: [], captured: {} };
  }
  const save = () => {
    writeFileSync(cfg.state + '.tmp', JSON.stringify(state));
    renameSync(cfg.state + '.tmp', cfg.state);
  };

  const ctx: Context = {
    local: (iso) => ({ day: isoDay(new Date(iso)), time: localTime(new Date(iso)) }),
    captured: (id) => state.captured[id],
  };

  // One file: read it with its ETag, edit, write it back only if nobody changed it meanwhile.
  async function apply(step: Step): Promise<{ problem?: string; stop?: boolean; remember?: string }> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await dav('GET', step.file, {}, [404]);
      const md = res.status === 404 ? '' : await res.text();
      const etag = res.headers.get('etag');
      const r = step.edit(md);
      if (r.content === undefined || r.content === md) return r;
      const put = await dav('PUT', step.file, { body: r.content, headers: etag ? { 'If-Match': etag } : { 'If-None-Match': '*' } }, [412]);
      if (put.status !== 412) return r;
    }
    throw new Error(`${step.file} kept changing while writing it`);
  }

  async function list() {
    const res = await dav('PROPFIND', '_events/', { headers: { Depth: '1' } }, [404]);
    if (res.status === 404) return [];
    return parsePropfind(await res.text(), base)
      .map((e) => e.path.replace(/^_events\//, ''))
      .filter((n) => n.endsWith('.json'))
      .sort();
  }

  let count = 0;
  // Until empty: events that land while running may not start the service again.
  for (let names = await list(); names.length; names = await list()) {
    for (const name of names) {
      const id = name.replace(/\.json$/, '');
      if (!state.applied.includes(id)) {
        let event: Event | undefined;
        try {
          event = JSON.parse(await (await dav('GET', `_events/${name}`)).text());
        } catch (e) {
          if (e instanceof SyntaxError) event = undefined;
          else throw e;
        }
        const all = event ? steps(event, ctx) : [];
        const p = state.progress?.id === id ? state.progress : { id, step: 0, problems: event ? [] : [`Couldn't read the event ${name}.`] };
        for (; p.step < all.length; p.step++) {
          const r = await apply(all[p.step]);
          if (r.remember) state.captured[id] = r.remember;
          if (r.problem) p.problems.push(r.problem);
          if (r.stop) p.step = all.length - 1;
          state.progress = { ...p, step: p.step + 1 };
          save();
        }
        if (p.problems.length) await apply(noteStep(p.problems, now().toISOString(), ctx));
        state.applied.push(id);
        state.progress = undefined;
        save();
        count++;
      }
      await dav('DELETE', `_events/${name}`, {}, [404]);
    }
  }

  const cutoff = now().getTime() - keep;
  state.applied = state.applied.filter((id) => idTime(id) > cutoff);
  state.captured = Object.fromEntries(Object.entries(state.captured).filter(([id]) => idTime(id) > cutoff));
  save();
  return count;
}

if (import.meta.main) {
  const env = (k: string) => process.env[k] ?? (console.error(`${k} is not set`), process.exit(1));
  run({
    url: env('POCO_URL'),
    user: env('POCO_USER'),
    password: readFileSync(env('POCO_PASSWORD_FILE'), 'utf8').trim(),
    state: process.env.POCO_STATE ?? 'poco-state.json',
  }).then(
    (n) => n && console.log(`applied ${n} event${n === 1 ? '' : 's'}`),
    (e) => (console.error(String(e), e.cause ? `(${e.cause})` : ''), process.exit(1)),
  );
}
