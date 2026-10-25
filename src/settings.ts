import { File, Paths } from 'expo-file-system';

// This phone's choices. Not synced: they're about how the phone feels, not the notes.
export type Settings = {
  reward: 'tally' | 'garden';
  rest: 0 | 1 | 2; // rest days a week that don't break the streak
  maxPicks: 1 | 2 | 3;
  weekStart: 0 | 1; // Sunday, Monday
  haptics: boolean;
  sounds: boolean;
  finished: string[]; // days whose picks were all done: a stamp, a flower. today.md only knows today.
};

const defaults: Settings = { reward: 'tally', rest: 1, maxPicks: 3, weekStart: 1, haptics: true, sounds: false, finished: [] };
const file = new File(Paths.document, 'settings.json');

export function loadSettings(): Settings {
  try {
    return { ...defaults, ...JSON.parse(file.textSync()) };
  } catch {
    return defaults;
  }
}

export function saveSettings(s: Settings) {
  file.create({ overwrite: true });
  file.writeSync(JSON.stringify({ ...s, finished: s.finished.slice(-400) }));
}
