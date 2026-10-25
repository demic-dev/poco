import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { type Event, type NewEvent, stamp } from '../src/events.ts';
import { addToInbox } from './apply.ts';
import { run } from './main.ts';

test('inbox: under the day, newest first; a new day above older ones', () => {
  assert.equal(addToInbox('', '2026-10-25', '- 10:00 a'), '## 2026-10-25\n- 10:00 a\n');
  assert.equal(addToInbox('# Inbox\n## 2026-10-25\n- 09:00 a\n', '2026-10-25', '- 10:00 b'), '# Inbox\n## 2026-10-25\n- 10:00 b\n- 09:00 a\n');
  assert.equal(addToInbox('- loose\n## 2026-10-24\n- x\n', '2026-10-25', '- 10:00 b'), '- loose\n## 2026-10-25\n- 10:00 b\n## 2026-10-24\n- x\n');
});

// A Nextcloud stand-in: files with ETags, If-Match, PROPFIND of a folder.
function fakeDav(files: Record<string, string>) {
  let tag = 0;
  const etags: Record<string, string> = Object.fromEntries(Object.keys(files).map((k) => [k, `"${tag++}"`]));
  let beforePut: ((path: string) => number | void) | undefined; // a status to fail with
  const base = '/remote.php/dav/files/me/notes/';
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const path = decodeURIComponent(req.url!.slice(base.length));
    const send = (status: number, text = '', headers: Record<string, string> = {}) => (res.writeHead(status, headers), res.end(text));
    if (req.headers.authorization !== `Basic ${Buffer.from('me:secret').toString('base64')}`) return send(401);
    if (req.method === 'PROPFIND') {
      const inside = Object.keys(files).filter((k) => k.startsWith(path));
      if (!inside.length) return send(404);
      const entry = (p: string) => `<d:response><d:href>${base}${encodeURI(p)}</d:href><d:propstat><d:prop><d:getetag>${etags[p] ?? '"d"'}</d:getetag></d:prop></d:propstat></d:response>`;
      return send(207, `<d:multistatus xmlns:d="DAV:">${[path, ...inside].map(entry).join('')}</d:multistatus>`);
    }
    if (req.method === 'GET') return path in files ? send(200, files[path], { ETag: etags[path] }) : send(404);
    if (req.method === 'DELETE') return path in files ? (delete files[path], send(204)) : send(404);
    if (req.method === 'PUT') {
      const fail = beforePut?.(path);
      if (fail) return send(fail);
      const match = req.headers['if-match'];
      if ((match && match !== etags[path]) || (req.headers['if-none-match'] === '*' && path in files)) return send(412);
      files[path] = body;
      etags[path] = `"${tag++}"`;
      return send(201);
    }
    send(405);
  });
  // An edit from the laptop: new content, new ETag.
  const edit = (path: string, content: string) => ((files[path] = content), (etags[path] = `"${tag++}"`));
  return { server, files, base, edit, onPut: (f: (path: string) => number | void) => (beforePut = f) };
}

async function withDav(files: Record<string, string>, fn: (dav: ReturnType<typeof fakeDav>, go: () => Promise<number>) => Promise<void>) {
  const dav = fakeDav(files);
  await new Promise<void>((r) => dav.server.listen(0, r));
  const port = (dav.server.address() as { port: number }).port;
  const state = join(mkdtempSync(join(tmpdir(), 'poco-')), 'state.json');
  const go = () => run({ url: `http://localhost:${port}${dav.base}`, user: 'me', password: 'secret', state });
  try {
    await fn(dav, go);
  } finally {
    dav.server.close();
  }
}

let n = 0;
const ev = (e: NewEvent): Event => stamp(e, new Date(Date.UTC(2026, 9, 25, 10, 0, 0, n++)));
const events = (...list: Event[]) => Object.fromEntries(list.map((e) => [`_events/${e.id}.json`, JSON.stringify(e)]));

test('a day on the phone becomes Markdown', async () => {
  process.env.TZ = 'UTC';
  const pick = ev({ type: 'pick', date: '2026-10-25', items: [{ file: 'bike/TODO.md', line: '- [ ] Fix the brake (2026-10-31)' }, { file: 'TODO.md', line: '- [ ] Call mum' }] });
  const cap = ev({ type: 'capture', text: 'Bleed\nbrakes', url: 'https://example.com/b', note: 'for the bike' });
  const files = {
    'today.md': '## 2026-10-24\n- [x] Old\n',
    'inbox.md': '## 2026-10-24\n- 09:00 Ask Ana\n',
    'done.md': '- Old (2026-10-24)\n',
    'TODO.md': '- [ ] Call mum\n- [ ] Pay rent\n',
    'bike/TODO.md': '# Bike\n- [ ] Fix the brake (2026-10-31)\n',
    ...events(
      pick,
      ev({ type: 'move-down', date: '2026-10-25', line: '- [ ] Fix the brake (2026-10-31, bike)' }),
      ev({ type: 'done', file: 'today.md', line: '- [ ] Call mum' }),
      cap,
      ev({ type: 'make-task', file: 'bike/TODO.md', capture: cap.id, date: '2026-11-01' }),
      ev({ type: 'make-task', file: 'TODO.md', line: '- 09:00 Ask Ana' }),
    ),
  };
  await withDav(files, async (dav, go) => {
    assert.equal(await go(), 6);
    assert.equal(dav.files['today.md'], '## 2026-10-25\n- [x] Call mum\n- [ ] Fix the brake (2026-10-31, bike)\n');
    assert.equal(dav.files['done.md'], '- Old (2026-10-24)\n- Call mum (2026-10-25)\n');
    assert.equal(dav.files['TODO.md'], '- [ ] Pay rent\n- [ ] Ask Ana\n');
    assert.equal(dav.files['bike/TODO.md'], '# Bike\n- [ ] Fix the brake (2026-10-31)\n- [ ] [Bleed brakes](https://example.com/b): for the bike (2026-11-01)\n');
    assert.equal(dav.files['inbox.md'], '');
    assert.deepEqual(Object.keys(dav.files).filter((k) => k.startsWith('_events/')), []);
    assert.equal(await go(), 0);
  });
});

test('a laptop edit in between: retried on 412; a line that is gone becomes a note', async () => {
  process.env.TZ = 'UTC';
  const done = ev({ type: 'done', file: 'today.md', line: '- [ ] Pump tyres (bike)' });
  const files = { 'today.md': '## 2026-10-25\n- [ ] Pump tyres (bike)\n', 'inbox.md': '', 'bike/TODO.md': '- [ ] Pump tyres\n', ...events(done) };
  await withDav(files, async (dav, go) => {
    let once = true;
    dav.onPut((path) => {
      // The laptop removes the task from bike/TODO.md while the applier is busy with today.md.
      if (path === 'today.md' && once) (once = false), dav.edit('bike/TODO.md', '# moved elsewhere\n');
    });
    assert.equal(await go(), 1);
    assert.equal(dav.files['today.md'], '## 2026-10-25\n- [x] Pump tyres (bike)\n');
    assert.equal(dav.files['bike/TODO.md'], '# moved elsewhere\n');
    assert.match(dav.files['inbox.md'], /^## \d{4}-\d{2}-\d{2}\n- \d\d:\d\d poco: Done on the phone, but bike\/TODO.md no longer has “Pump tyres”\.\n$/);
  });
});

test('an event that comes back is not applied twice', async () => {
  process.env.TZ = 'UTC';
  const cap = ev({ type: 'capture', text: 'Once' });
  await withDav({ 'inbox.md': '', ...events(cap) }, async (dav, go) => {
    await go();
    Object.assign(dav.files, events(cap)); // the phone re-sends after a lost reply
    assert.equal(await go(), 0);
    assert.equal(dav.files['inbox.md'], '## 2026-10-25\n- 10:00 Once\n');
    assert.equal(dav.files[`_events/${cap.id}.json`], undefined);
  });
});

test('a 412 on the same file is retried', async () => {
  process.env.TZ = 'UTC';
  await withDav({ 'inbox.md': '## 2026-10-25\n- 08:00 a\n', ...events(ev({ type: 'capture', text: 'b' })) }, async (dav, go) => {
    let once = true;
    dav.onPut((path) => {
      if (path === 'inbox.md' && once) (once = false), dav.edit('inbox.md', '## 2026-10-25\n- 09:00 laptop\n- 08:00 a\n');
    });
    await go();
    assert.equal(dav.files['inbox.md'], '## 2026-10-25\n- 10:00 b\n- 09:00 laptop\n- 08:00 a\n');
  });
});

test('a crash halfway resumes where it stopped', async () => {
  process.env.TZ = 'UTC';
  const done = ev({ type: 'done', file: 'today.md', line: '- [ ] Call mum' });
  await withDav({ 'today.md': '## 2026-10-25\n- [ ] Call mum\n', 'TODO.md': '- [ ] Call mum\n', 'done.md': '', 'inbox.md': '', ...events(done) }, async (dav, go) => {
    dav.onPut((path) => {
      if (path === 'done.md') return 500; // bach lost power
    });
    await assert.rejects(go());
    assert.equal(dav.files['TODO.md'], '');
    dav.onPut(() => {});
    assert.equal(await go(), 1);
    assert.equal(dav.files['done.md'], '- Call mum (2026-10-25)\n');
    assert.equal(dav.files['inbox.md'], ''); // no "no longer has" note: TODO.md was not edited twice
  });
});
