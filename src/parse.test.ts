import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseInbox, parsePropfind, parseToday, parseTodo } from './parse.ts';

test('TODO.md: open tasks with optional date', () => {
  const md = '# Bike\n- [ ] Fix the back brake (2026-10-31)\n- [x] Pump the tyres\n- [ ] Ask Ana (she has a drill)\nnotes\n';
  assert.deepEqual(parseTodo(md, 'bike'), [
    { text: 'Fix the back brake', date: '2026-10-31', project: 'bike', line: '- [ ] Fix the back brake (2026-10-31)' },
    { text: 'Ask Ana (she has a drill)', date: undefined, project: 'bike', line: '- [ ] Ask Ana (she has a drill)' },
  ]);
});

test('today.md: date heading, done state, trailing date and project', () => {
  const t = parseToday('## 2026-10-25\n- [ ] Email Jonas (copenhagen)\n- [x] Fix the brake (2026-10-25, bike)\n- [ ] Call mum (about Sunday)\n- [ ] Loose one\n');
  assert.equal(t.date, '2026-10-25');
  assert.deepEqual(
    t.items.map(({ text, done, date, project }) => [text, done, date, project]),
    [
      ['Email Jonas', false, undefined, 'copenhagen'],
      ['Fix the brake', true, '2026-10-25', 'bike'],
      ['Call mum (about Sunday)', false, undefined, undefined],
      ['Loose one', false, undefined, undefined],
    ],
  );
  assert.deepEqual(parseToday(''), { items: [] });
});

test('inbox.md: days, times, links, lines before the first heading', () => {
  const md = '- Idea without a day\n## 2026-10-25\n- 10:21 Ask Ana\n- 09:58 [Bleed brakes](https://example.com/b?x=1): for the bike\n## 2026-10-24\n- [](https://example.com/raw)\n';
  assert.deepEqual(parseInbox(md).map(({ line, ...i }) => i), [
    { day: undefined, time: undefined, text: 'Idea without a day' },
    { day: '2026-10-25', time: '10:21', text: 'Ask Ana' },
    { day: '2026-10-25', time: '09:58', text: 'Bleed brakes', url: 'https://example.com/b?x=1', note: 'for the bike' },
    { day: '2026-10-24', time: undefined, text: 'https://example.com/raw', url: 'https://example.com/raw', note: undefined },
  ]);
});

test('PROPFIND reply from Nextcloud', () => {
  const xml = `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:" xmlns:s="http://sabredav.org/ns" xmlns:oc="http://owncloud.org/ns">
 <d:response><d:href>/remote.php/dav/files/michele/notes/</d:href><d:propstat><d:prop><d:getetag>&quot;6718a1&quot;</d:getetag><d:resourcetype><d:collection/></d:resourcetype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>
 <d:response><d:href>/remote.php/dav/files/michele/notes/inbox.md</d:href><d:propstat><d:prop><d:getetag>&quot;abc&quot;</d:getetag><d:resourcetype/></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>
 <d:response><d:href>/remote.php/dav/files/michele/notes/master%20%26%20more/</d:href><d:propstat><d:prop><d:getetag>&quot;def&quot;</d:getetag><d:resourcetype><d:collection/></d:resourcetype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>
</d:multistatus>`;
  assert.deepEqual(parsePropfind(xml, '/remote.php/dav/files/michele/notes/'), [
    { path: '', etag: '6718a1', dir: true },
    { path: 'inbox.md', etag: 'abc', dir: false },
    { path: 'master & more/', etag: 'def', dir: true },
  ]);
});
