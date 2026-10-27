import assert from 'node:assert/strict';
import { test } from 'node:test';
import { imageLinks, resolve } from './notes.ts';

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
