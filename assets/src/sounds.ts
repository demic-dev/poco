// The two sounds, synthesised: `node assets/src/sounds.ts` writes assets/tick.wav and assets/chime.wav.
import { writeFileSync } from 'node:fs';

const rate = 22050;

function wav(path: string, seconds: number, sample: (t: number) => number) {
  const n = Math.round(seconds * rate);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, sample(i / rate))) * 32767), 44 + i * 2);
  writeFileSync(path, buf);
}

const tone = (f: number, t: number) => Math.sin(2 * Math.PI * f * t);

// Capture: a short soft tick.
wav('assets/tick.wav', 0.06, (t) => 0.35 * tone(1800, t) * Math.exp(-t * 90));
// Done: two notes a fifth apart, gentle attack, long fade.
wav('assets/chime.wav', 0.6, (t) => {
  const note = (f: number, start: number) => (t < start ? 0 : tone(f, t - start) * Math.min(1, (t - start) * 200) * Math.exp(-(t - start) * 6));
  return 0.22 * (note(660, 0) + note(990, 0.09));
});
