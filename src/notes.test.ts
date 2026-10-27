import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decode, findNotes, groupNotes, imageLinks, nameIn, resolve } from './notes.ts';

test('links: relative to the note, inside the notes folder only', () => {
  assert.equal(resolve('master/tum/thesis.md', 'kalman-filter.md'), 'master/tum/kalman-filter.md');
  assert.equal(resolve('master/tum/thesis.md', './meetings/2026-10-14.md#agenda'), 'master/tum/meetings/2026-10-14.md');
  assert.equal(resolve('master/tum/thesis.md', '../../TODO.md'), 'TODO.md');
  assert.equal(resolve('master/tum/thesis.md', 'reading%20list.md'), 'master/tum/reading list.md');
  assert.equal(resolve('master/tum/thesis.md', '/bike/TODO.md'), 'bike/TODO.md');
  assert.equal(resolve('inbox.md', '../outside.md'), undefined);
  assert.equal(resolve('inbox.md', 'https://example.com/a.md'), undefined);
  assert.equal(resolve('inbox.md', 'mailto:ana@example.com'), undefined);
  assert.equal(resolve('inbox.md', '#heading'), undefined);
});

test('image links: images in the notes folder, not on the web', () => {
  const md = '![cage](img/cage.jpg "The cage")\n![](<../shared/plot.png>)\n![web](https://example.com/x.png)\n[not an image](a.png)\n![doc](other.md)';
  assert.deepEqual(imageLinks('master/tum/thesis.md', md), ['master/tum/img/cage.jpg', 'master/shared/plot.png']);
});

const notes = (...paths: string[]) => paths.map((path) => ({ path, here: true }));

test('the drawer: projects by TODO.md, the rest by top-level folder, loose files last', () => {
  const g = groupNotes(
    notes('TODO.md', 'inbox.md', 'journal/2026-10-24.md', 'master/tum/TODO.md', 'master/tum/thesis.md', 'master/tum/meetings/2026-10-14.md', 'master/notes.md', 'bike/TODO.md', 'archive/old/x.md'),
  );
  assert.deepEqual(
    g.projects.map((p) => [p.folder, p.notes.map((n) => nameIn(p.folder, n.path))]),
    [
      ['bike', ['TODO.md']],
      ['master/tum', ['TODO.md', 'meetings/2026-10-14', 'thesis']],
    ],
  );
  assert.deepEqual(
    g.other.map((p) => [p.folder, p.notes.map((n) => nameIn(p.folder, n.path))]),
    [
      ['archive', ['old/x']],
      ['journal', ['2026-10-24']],
      ['master', ['notes']],
      ['', ['TODO.md', 'inbox']],
    ],
  );
});

test('find a note: every word, in the name or the folder', () => {
  const all = notes('master/tum/thesis-outline.md', 'master/tum/kalman-filter.md', 'travel/packing-list.md');
  assert.deepEqual(findNotes(all, 'tum OUT').map((n) => n.path), ['master/tum/thesis-outline.md']);
  assert.deepEqual(findNotes(all, 'md'), []);
  assert.equal(findNotes(all, '  ').length, 3);
});

test('entities', () => {
  assert.equal(decode('a &amp; b &lt;c&gt; &#233;&#x2014; &bogus; &#99999999;'), 'a & b <c> é— &bogus; &#99999999;');
});
