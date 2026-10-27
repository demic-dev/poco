import { File, Paths } from 'expo-file-system';

// This phone's choices and history. They live in `.poco/state.json` in the notes folder,
// written only by the phone, so a reinstall keeps them and the laptop can read them.
// The copy here opens the app instantly and works offline; the sync uploads it.
export type Settings = {
  reward: 'tally' | 'garden';
  rest: 0 | 1 | 2; // rest days a week that don't break the streak
  maxPicks: 1 | 2 | 3;
  weekStart: 0 | 1; // Sunday, Monday
  haptics: boolean;
  sounds: boolean;
  finished: string[]; // days whose picks were all done: a stamp, a flower. today.md only knows today.
  recent: string[]; // the drawer's "Last opened", newest first
};

const defaults: Settings = { reward: 'tally', rest: 1, maxPicks: 3, weekStart: 1, haptics: true, sounds: false, finished: [], recent: [] };

// etag: state.json's as last seen; dir: `.poco/`'s, which changes along with it;
// dirty: keys changed on this phone and not uploaded yet.
export type Local = { state: Settings; etag?: string; dir?: string; dirty: (keyof Settings)[] };

const file = new File(Paths.document, 'state.json');
const before = new File(Paths.document, 'settings.json'); // phases 6 and 7: on the phone only

export function readLocal(): Local | undefined {
  try {
    return JSON.parse(file.textSync());
  } catch {}
  try {
    const state = { ...defaults, ...JSON.parse(before.textSync()) };
    return { state, dirty: Object.keys(state) as (keyof Settings)[] };
  } catch {}
}

export function updateLocal(patch: Partial<Local>) {
  file.create({ overwrite: true });
  file.writeSync(JSON.stringify({ state: defaults, dirty: [], ...readLocal(), ...patch }));
}

export const loadSettings = (): Settings => ({ ...defaults, ...readLocal()?.state });

export function saveSettings(s: Settings) {
  const l = readLocal() ?? { state: defaults, dirty: [] };
  const changed = (Object.keys(s) as (keyof Settings)[]).filter((k) => JSON.stringify(s[k]) !== JSON.stringify(l.state[k]));
  updateLocal({ state: { ...s, finished: s.finished.slice(-400) }, dirty: [...new Set([...l.dirty, ...changed])] });
}

// The file as read, with the changes not uploaded yet applied on top again.
export function takeRemote(remote: Partial<Settings>, etag?: string) {
  const l = readLocal() ?? { state: defaults, dirty: [] };
  const state: Settings = { ...defaults, ...remote, ...Object.fromEntries(l.dirty.map((k) => [k, l.state[k]])) };
  if (l.dirty.includes('finished')) state.finished = [...new Set([...(remote.finished ?? []), ...l.state.finished])].sort();
  updateLocal({ state, etag });
}

// After a PUT: clean, unless something changed here while it was on its way.
export function uploaded(sent: Settings, etag?: string) {
  const l = readLocal()!;
  updateLocal({ etag, dirty: JSON.stringify(l.state) === JSON.stringify(sent) ? [] : l.dirty });
}
