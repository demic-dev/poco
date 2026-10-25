import { SymbolView, type SFSymbol } from 'expo-symbols';
import { useState, type ReactNode } from 'react';
import { Linking, Modal, Pressable, RefreshControl, ScrollView, Text, TextInput, useColorScheme, View } from 'react-native';
import { isoDay, type View as Notes } from './events';
import type { Task } from './parse';
import type { Account } from './sync';

export { isoDay };
type Today = Notes['today'];
type TodayItem = Today['items'][number];
export type InboxItem = Notes['inbox'][number];

// "Paper, ink, one green". Green means only "done".
const light = {
  paper: '#F7F6F2', ink: '#1C1B19', card: '#FFFFFF', muted: '#5F5D57', faint: '#6E6C66', line: '#E4E2DC', ring: '#C9C6BE',
  accent: '#2E6B57', onAccent: '#FFFFFF', accentSoft: 'rgba(46,107,87,0.10)', banner: '#EFEDE7', bar: 'rgba(255,255,255,0.82)', pending: '#8A877F', toast: '#1C1B19', onToast: '#F2F1EC', check: '#7CC2A6',
};
const dark: typeof light = {
  paper: '#141413', ink: '#F2F1EC', card: '#1F1E1C', muted: '#A8A6A0', faint: '#A8A6A0', line: '#2C2B29', ring: '#55534E',
  accent: '#7CC2A6', onAccent: '#10241C', accentSoft: 'rgba(124,194,166,0.14)', banner: '#1F1E1C', bar: 'rgba(44,43,41,0.86)', pending: '#8A877F', toast: '#F2F1EC', onToast: '#1C1B19', check: '#2E6B57',
};
export const useColors = () => (useColorScheme() === 'dark' ? dark : light);


// Today, Tomorrow, Yesterday, "Tue 27" within a week, else "3 Nov". Never "overdue".
export function dayLabel(iso: string, now = new Date()) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const days = Math.round((date.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 864e5);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  if (Math.abs(days) < 7) return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' });
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export const time = (ms?: number) => (ms ? new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : 'never');

export function Icon({ name, size = 22, color }: { name: SFSymbol; size?: number; color: string }) {
  return <SymbolView name={name} size={size} tintColor={color} />;
}

export const caps = { fontSize: 13, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' } as const;

// waiting: events still on the phone; sent: uploaded, not applied yet.
export type SyncState = { ok?: boolean; error?: string; syncedAt?: number; waiting: number; sent: number };

const changes = (n: number) => (n === 1 ? '1 change is' : `${n} changes are`);

// A grey ring: saved on this phone, not in the files yet. Never a spinner or a colour.
export function Ring() {
  const c = useColors();
  return <View accessibilityRole="image" accessibilityLabel="Saved on this phone, not synced yet" style={{ width: 8, height: 8, borderRadius: 4, borderWidth: 1.5, borderColor: c.pending }} />;
}

// The cloud: synced, waiting or offline, never a spinner. Tapping it gives one plain sentence.
export function Screen({ title, subtitle, sync, onRefresh, right, children }: { title: string; subtitle: string; sync: SyncState; onRefresh: () => Promise<void>; right?: ReactNode; children: ReactNode }) {
  const c = useColors();
  const [explain, setExplain] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const n = sync.waiting + sync.sent;
  const sentence =
    sync.ok === false
      ? `Offline since ${time(sync.syncedAt)}. Everything works${n ? ` — ${changes(n)} saved on this phone and will sync later` : ''}. (${sync.error})`
      : sync.waiting
        ? `${changes(sync.waiting)} saved on this phone, sending now.`
        : sync.sent
          ? `Sent. Your files will show ${sync.sent === 1 ? 'it' : 'them'} once the server applies ${sync.sent === 1 ? 'it' : 'them'}.`
          : `Everything synced at ${time(sync.syncedAt)}.`;
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.paper }}
      contentContainerStyle={{ paddingTop: 62, paddingHorizontal: 20, paddingBottom: 130, gap: 16 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => (setRefreshing(true), onRefresh().finally(() => setRefreshing(false)))} />}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 4 }}>
        <View style={{ gap: 2, flex: 1 }}>
          <Text style={{ fontSize: 15, color: c.muted }}>{subtitle}</Text>
          <Text accessibilityRole="header" style={{ fontSize: 34, lineHeight: 41, fontWeight: '700', letterSpacing: -0.4, color: c.ink }}>{title}</Text>
        </View>
        {right ?? <Pressable accessibilityLabel={sentence} onPress={() => setExplain(!explain)} style={{ minWidth: 44, height: 44, paddingHorizontal: 4, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center' }}>
          {n > 0 && <Text style={{ fontSize: 13, color: c.faint }}>{n} waiting</Text>}
          <Icon name={sync.ok === false ? 'icloud.slash' : n ? 'icloud' : sync.ok ? 'checkmark.icloud' : 'icloud'} size={24} color={c.faint} />
        </Pressable>}
      </View>
      {!right && (explain || sync.ok === false) && (
        <Text style={{ padding: 12, paddingHorizontal: 16, borderRadius: 16, overflow: 'hidden', backgroundColor: c.banner, fontSize: 15, lineHeight: 20, color: c.muted }}>{sentence}</Text>
      )}
      {children}
    </ScrollView>
  );
}

export function Card({ children, gap = 20 }: { children: ReactNode; gap?: number }) {
  const c = useColors();
  return (
    <View style={{ backgroundColor: c.card, borderRadius: 28, padding: 24, paddingBottom: 20, gap, shadowColor: '#1C1B19', shadowOpacity: 0.06, shadowRadius: 14, shadowOffset: { width: 0, height: 8 } }}>
      {children}
    </View>
  );
}

function BigButton({ label, icon, onPress, disabled }: { label: string; icon?: SFSymbol; onPress: () => void; disabled?: boolean }) {
  const c = useColors();
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={{ height: 56, borderRadius: 28, backgroundColor: c.accent, opacity: disabled ? 0.4 : 1, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' }}>
      {icon && <Icon name={icon} size={20} color={c.onAccent} />}
      <Text style={{ color: c.onAccent, fontSize: 17, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

export function QuietButton({ label, onPress }: { label: string; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 15, color: c.muted }}>{label}</Text>
    </Pressable>
  );
}

function Chip({ label, selected, icon, onPress }: { label: string; selected: boolean; icon?: SFSymbol; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{ minHeight: 40, paddingHorizontal: 16, borderRadius: 20, flexDirection: 'row', gap: 6, alignItems: 'center', backgroundColor: c.card, borderWidth: selected ? 1.5 : 1, borderColor: selected ? c.ink : c.line }}
    >
      {icon && <Icon name={icon} size={16} color={selected ? c.ink : c.muted} />}
      <Text style={{ fontSize: 15, fontWeight: selected ? '600' : '400', color: selected ? c.ink : c.muted }}>{label}</Text>
    </Pressable>
  );
}

function Meta({ icon, text }: { icon: SFSymbol; text: string }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Icon name={icon} size={16} color={c.muted} />
      <Text style={{ fontSize: 15, color: c.muted }}>{text}</Text>
    </View>
  );
}

export function TodayScreen({ today, tasks, onPick, onDone, onMoveDown }: { today: Today; tasks: Task[]; onPick: () => void; onDone: (i: TodayItem) => void; onMoveDown: (i: TodayItem) => void }) {
  const c = useColors();
  const picked = today.date === isoDay() ? today.items : [];

  if (!picked.length) {
    const inAWeek = isoDay(new Date(Date.now() + 7 * 864e5));
    const soon = tasks.filter((t) => t.date && t.date <= inAWeek).length;
    return (
      <Card gap={14}>
        <View style={{ flexDirection: 'row', gap: 8 }} accessibilityElementsHidden>
          {['#B9B6AE', '#D6D3CB', c.line].map((color) => (
            <View key={color} style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', borderColor: color }} />
          ))}
        </View>
        <Text style={{ fontSize: 30, lineHeight: 36, fontWeight: '600', color: c.ink }}>Nothing picked yet</Text>
        <Text style={{ fontSize: 17, lineHeight: 23, color: c.muted }}>Two minutes. Choose one to three things — the first one becomes next.</Text>
        <View style={{ paddingTop: 10, gap: 4 }}>
          <BigButton label="Pick today" onPress={onPick} />
          <Text style={{ textAlign: 'center', paddingVertical: 10, fontSize: 15, color: c.faint }}>
            {tasks.length} things in your list{soon ? ` · ${soon} dated this week` : ''}
          </Text>
        </View>
      </Card>
    );
  }

  const next = picked.find((i) => !i.done);
  if (!next) {
    const done = ['Done.', 'Both done.', 'All three done.'][picked.length - 1] ?? 'All done.';
    return (
      <>
        <Card gap={14}>
          <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="checkmark" size={28} color={c.onAccent} />
          </View>
          <Text style={{ fontSize: 30, lineHeight: 36, fontWeight: '600', color: c.ink }}>That’s today.</Text>
          <Text style={{ fontSize: 17, lineHeight: 23, color: c.muted }}>{done} The rest can wait for tomorrow.</Text>
          <View style={{ paddingTop: 6 }}>
            {picked.map((i) => (
              <View key={i.line} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 40 }}>
                <Icon name="checkmark" size={16} color={c.accent} />
                <Text style={{ flex: 1, fontSize: 15, color: c.muted }}>{i.text}</Text>
                {i.pending && <Ring />}
              </View>
            ))}
          </View>
        </Card>
        <Pressable onPress={onPick} style={{ alignSelf: 'center', minHeight: 44, justifyContent: 'center' }}>
          <Text style={{ fontSize: 15, color: c.muted }}>Pick one more, if you want</Text>
        </Pressable>
      </>
    );
  }

  const rest = [...picked.filter((i) => i !== next && !i.done), ...picked.filter((i) => i.done)];
  return (
    <>
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ ...caps, color: c.accent }}>Next</Text>
          <Text style={{ fontSize: 13, color: c.faint }}>
            {picked.filter((i) => i.done).length + 1} of {picked.length}
          </Text>
        </View>
        <Text style={{ fontSize: 30, lineHeight: 36, fontWeight: '600', letterSpacing: -0.3, color: c.ink }}>{next.text}</Text>
        {(next.date || next.project) && (
          <View style={{ flexDirection: 'row', gap: 16, flexWrap: 'wrap' }}>
            {next.date && <Meta icon="calendar" text={dayLabel(next.date)} />}
            {next.project && <Meta icon="folder" text={next.project} />}
          </View>
        )}
        <View style={{ gap: 4, paddingTop: 8 }}>
          <BigButton label="Done" icon="checkmark" onPress={() => onDone(next)} />
          {rest.some((i) => !i.done) && <QuietButton label="Not now — move it down" onPress={() => onMoveDown(next)} />}
        </View>
      </Card>
      {rest.length > 0 && (
        <View style={{ paddingHorizontal: 4 }}>
          <Text style={{ ...caps, color: c.faint, paddingBottom: 6 }}>After that</Text>
          {rest.map((i, n) => (
            <Pressable
              key={i.line}
              disabled={i.done}
              accessibilityRole="button"
              accessibilityState={{ checked: i.done }}
              accessibilityHint={i.done ? undefined : 'Marks it done'}
              onPress={() => onDone(i)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 48, borderBottomWidth: n < rest.length - 1 ? 1 : 0, borderColor: c.line }}
            >
              {i.done ? <Icon name="checkmark" size={18} color={c.accent} /> : <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: c.ring }} />}
              <Text style={{ flex: 1, fontSize: 17, color: i.done ? c.faint : c.muted, textDecorationLine: i.done ? 'line-through' : 'none' }}>{i.text}</Text>
              {i.pending && <Ring />}
            </Pressable>
          ))}
        </View>
      )}
    </>
  );
}

export function InboxScreen({ inbox, onItem }: { inbox: InboxItem[]; onItem: (i: InboxItem) => void }) {
  const c = useColors();
  if (!inbox.length) {
    return (
      <View style={{ alignItems: 'center', gap: 10, paddingTop: 140, paddingHorizontal: 24 }}>
        <Icon name="tray" size={44} color={c.faint} />
        <Text style={{ fontSize: 22, lineHeight: 28, fontWeight: '600', color: c.ink }}>Empty inbox</Text>
        <Text style={{ fontSize: 17, lineHeight: 23, color: c.muted, textAlign: 'center' }}>Nothing waiting. When a thought shows up, the + is right there.</Text>
      </View>
    );
  }
  // Consecutive lines of the same day form a group; lines before the first heading are "Earlier".
  const groups: { day?: string; items: InboxItem[] }[] = [];
  for (const i of inbox) {
    if (groups.at(-1)?.day === i.day && groups.length) groups.at(-1)!.items.push(i);
    else groups.push({ day: i.day, items: [i] });
  }
  return groups.map((g, n) => (
    <View key={n} style={{ gap: 8 }}>
      <Text style={{ ...caps, color: c.faint, paddingHorizontal: 4, paddingTop: 4 }}>{g.day ? dayLabel(g.day) : 'Earlier'}</Text>
      <View style={{ backgroundColor: c.card, borderRadius: 20, paddingHorizontal: 16 }}>
        {g.items.map((i, k) => (
          <Pressable
            key={k}
            accessibilityRole="button"
            accessibilityHint="Make it a task"
            onPress={() => onItem(i)}
            style={{ flexDirection: 'row', gap: 12, paddingVertical: 14, borderBottomWidth: k < g.items.length - 1 ? 1 : 0, borderColor: c.line }}
          >
            <Icon name={i.url ? 'link' : 'text.alignleft'} size={18} color={c.faint} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontSize: 17, lineHeight: 22, color: c.ink }}>{i.text}</Text>
              {i.url && (
                <Text style={{ fontSize: 13, color: c.faint }}>
                  {i.url.replace(/^\w+:\/\/(www\.)?/, '').split(/[/?#]/)[0]}
                  {i.note ? ` · ${i.note}` : ''}
                </Text>
              )}
            </View>
            {(i.time || i.pending) && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 22 }}>
                {i.pending && <Ring />}
                {i.time && <Text style={{ fontSize: 13, color: c.faint }}>{i.time}</Text>}
              </View>
            )}
          </Pressable>
        ))}
      </View>
    </View>
  ));
}

// The daily pick: the only place with the long list. Dated items first, then everything else.
export function PickScreen({ tasks, files, inboxCount, max, onClose, onInbox, onStart }: { tasks: Task[]; files: number; inboxCount: number; max: number; onClose: () => void; onInbox: () => void; onStart: (chosen: Task[]) => void }) {
  const c = useColors();
  const [chosen, setChosen] = useState<Task[]>([]);
  const full = chosen.length >= max;
  const toggle = (t: Task) => setChosen(chosen.includes(t) ? chosen.filter((x) => x !== t) : full ? chosen : [...chosen, t]);
  const dated = tasks.filter((t) => t.date).sort((a, b) => a.date!.localeCompare(b.date!));
  const rest = tasks.filter((t) => !t.date);

  const header = (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <Pressable onPress={onClose} style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text style={{ fontSize: 17, color: c.muted }}>Close</Text>
      </Pressable>
      <Text style={{ fontSize: 13, color: c.faint }}>from {files} TODO.md {files === 1 ? 'file' : 'files'}</Text>
    </View>
  );

  if (!tasks.length) {
    return (
      <View style={{ flex: 1, backgroundColor: c.paper, paddingTop: 58, paddingHorizontal: 20, paddingBottom: 38 }}>
        {header}
        <Text style={{ marginTop: 14, fontSize: 34, lineHeight: 41, fontWeight: '700', color: c.ink }}>Pick today</Text>
        <View style={{ flex: 1, justifyContent: 'center', gap: 12, paddingBottom: 60 }}>
          <Icon name="checklist" size={40} color={c.faint} />
          <Text style={{ fontSize: 24, lineHeight: 30, fontWeight: '600', color: c.ink }}>Your todo list is empty</Text>
          <Text style={{ fontSize: 17, lineHeight: 23, color: c.muted }}>Nothing to pick from. Things you capture wait in the inbox until you sort them on your laptop.</Text>
        </View>
        <Pressable onPress={onInbox} style={{ height: 56, borderRadius: 28, backgroundColor: c.ink, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: c.paper, fontSize: 17, fontWeight: '600' }}>Open inbox · {inboxCount} items</Text>
        </Pressable>
        <Pressable onPress={onClose} style={{ height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 15, color: c.muted }}>Take the day off from lists</Text>
        </Pressable>
      </View>
    );
  }

  const row = (t: Task) => {
    const n = chosen.indexOf(t);
    return (
      <Pressable
        key={t.project + t.line}
        accessibilityRole="button"
        accessibilityState={{ selected: n >= 0 }}
        onPress={() => toggle(t)}
        style={{ minHeight: 52, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 14, borderBottomWidth: 1, borderColor: c.line, opacity: full && n < 0 ? 0.45 : 1 }}
      >
        <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: n >= 0 ? c.accent : 'transparent', borderWidth: n >= 0 ? 0 : 1.5, borderColor: c.ring }}>
          {n >= 0 && <Text style={{ fontSize: 13, fontWeight: '700', color: c.onAccent }}>{n + 1}</Text>}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontSize: 17, color: c.ink }}>{t.text}</Text>
          {t.project !== '' && <Text style={{ fontSize: 13, color: c.faint }}>{t.project}</Text>}
        </View>
        {t.date && <Text style={{ fontSize: 15, color: c.muted }}>{dayLabel(t.date)}</Text>}
      </Pressable>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.paper }}>
      <View style={{ paddingTop: 58, paddingHorizontal: 20, paddingBottom: 12, gap: 14, borderBottomWidth: 1, borderColor: c.line }}>
        {header}
        <View style={{ gap: 4 }}>
          <Text accessibilityRole="header" style={{ fontSize: 34, lineHeight: 41, fontWeight: '700', letterSpacing: -0.4, color: c.ink }}>Pick today</Text>
          <Text style={{ fontSize: 15, color: c.muted }}>{['Just one.', 'Up to two.', 'Up to three.'][max - 1]} The first one you tap is next.</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {[0, 1, 2].slice(0, max).map((n) => (
            <View key={n} style={{ flex: 1, minHeight: 64, borderRadius: 14, padding: 8, paddingHorizontal: 10, gap: 2, backgroundColor: chosen[n] ? c.card : 'transparent', borderWidth: 1, borderStyle: chosen[n] ? 'solid' : 'dashed', borderColor: chosen[n] ? c.line : c.ring }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: chosen[n] ? c.accent : c.faint }}>{n === 0 ? 'NEXT' : n + 1}</Text>
              <Text numberOfLines={2} style={{ fontSize: 13, lineHeight: 17, color: c.ink }}>{chosen[n]?.text ?? ''}</Text>
            </View>
          ))}
        </View>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 160 }}>
        {dated.length > 0 && <Text style={{ ...caps, color: c.faint, paddingTop: 14, paddingBottom: 4 }}>Has a date</Text>}
        {dated.map(row)}
        {rest.length > 0 && <Text style={{ ...caps, color: c.faint, paddingTop: 22, paddingBottom: 4 }}>Everything else</Text>}
        {rest.map(row)}
      </ScrollView>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 20, paddingTop: 14, paddingBottom: 38, gap: 8, backgroundColor: c.paper, borderTopWidth: 1, borderColor: c.line }}>
        <BigButton label={chosen.length ? `Start today with ${chosen.length}` : ['Tap one', 'Tap up to two', 'Tap up to three'][max - 1]} disabled={!chosen.length} onPress={() => onStart(chosen)} />
        {full && max > 1 && <Text style={{ textAlign: 'center', fontSize: 13, color: c.faint }}>{max === 3 ? 'Three' : 'Two'} is plenty. Tap one to swap it out.</Text>}
      </View>
    </View>
  );
}

export function SetupScreen({ initial, onSave, onCancel }: { initial?: Account; onSave: (a: Account) => Promise<void>; onCancel?: () => void }) {
  const c = useColors();
  const [a, setA] = useState<Account>(initial ?? { server: 'https://', user: '', password: '', folder: 'notes' });
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const field = (label: string, key: keyof Account, extra: object = {}) => (
    <View style={{ gap: 6 }}>
      <Text style={{ ...caps, color: c.faint }}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={a[key]}
        onChangeText={(v) => setA({ ...a, [key]: v.trim() })}
        autoCapitalize="none"
        autoCorrect={false}
        style={{ fontSize: 17, color: c.ink, backgroundColor: c.card, borderRadius: 14, padding: 14 }}
        {...extra}
      />
    </View>
  );
  const save = () => {
    setSaving(true);
    setError(undefined);
    onSave(a).catch((e) => (setError(String(e.message ?? e)), setSaving(false)));
  };
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.paper }} contentContainerStyle={{ paddingTop: 62, paddingHorizontal: 20, paddingBottom: 40, gap: 18 }} keyboardShouldPersistTaps="handled">
      <Text accessibilityRole="header" style={{ fontSize: 34, lineHeight: 41, fontWeight: '700', color: c.ink }}>Nextcloud</Text>
      <Text style={{ fontSize: 15, lineHeight: 20, color: c.muted }}>poco reads your notes over WebDAV. Use an app password (Nextcloud → Settings → Security), and keep Tailscale on.</Text>
      {field('Server', 'server', { keyboardType: 'url', placeholder: 'https://cloud.example.ts.net' })}
      {field('User', 'user')}
      {field('App password', 'password', { secureTextEntry: true })}
      {field('Notes folder', 'folder')}
      {error && <Text style={{ fontSize: 15, color: c.muted, backgroundColor: c.banner, padding: 12, borderRadius: 14, overflow: 'hidden' }}>{error}</Text>}
      <BigButton label={saving ? 'Connecting…' : 'Connect'} disabled={saving || !a.user || !a.password} onPress={save} />
      {onCancel && (
        <Pressable onPress={onCancel} style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 15, color: c.muted }}>Cancel</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

export type Tab = 'today' | 'inbox' | 'done';

export function TabBar({ tab, onTab, onCapture }: { tab: Tab; onTab: (t: Tab) => void; onCapture: () => void }) {
  const c = useColors();
  const tabs: [Tab, string, SFSymbol][] = [
    ['today', 'Today', 'sun.max'],
    ['inbox', 'Inbox', 'tray'],
    ['done', 'Done', 'checkmark.circle'],
  ];
  return (
    <View style={{ position: 'absolute', left: 16, right: 16, bottom: 30, flexDirection: 'row', gap: 12, alignItems: 'center' }}>
      <View style={{ flex: 1, height: 62, borderRadius: 31, padding: 4, flexDirection: 'row', backgroundColor: c.bar, borderWidth: 1, borderColor: c.line, shadowColor: '#1C1B19', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 8 } }}>
        {tabs.map(([id, label, icon]) => (
          <Pressable
            key={id}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === id }}
            onPress={() => onTab(id)}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, borderRadius: 27, backgroundColor: tab === id ? c.accentSoft : 'transparent' }}
          >
            <Icon name={icon} size={22} color={tab === id ? c.accent : c.muted} />
            <Text style={{ fontSize: 10, fontWeight: tab === id ? '600' : '500', color: tab === id ? c.accent : c.muted }}>{label}</Text>
          </Pressable>
        ))}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Capture"
        onPress={onCapture}
        style={{ width: 62, height: 62, borderRadius: 31, backgroundColor: c.toast, alignItems: 'center', justifyContent: 'center', shadowColor: '#1C1B19', shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 8 } }}
      >
        <Icon name="plus" size={26} color={c.onToast} />
      </Pressable>
    </View>
  );
}

// "Saved to inbox · Undo": the event waits on the phone while this shows.
export function Toast({ message, onUndo }: { message: string; onUndo: () => void }) {
  const c = useColors();
  return (
    <View accessibilityRole="alert" style={{ position: 'absolute', left: 16, right: 16, bottom: 108, minHeight: 56, borderRadius: 28, backgroundColor: c.toast, flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 20, paddingRight: 8, shadowColor: '#1C1B19', shadowOpacity: 0.25, shadowRadius: 15, shadowOffset: { width: 0, height: 10 } }}>
      <Icon name="checkmark" size={20} color={c.check} />
      <Text style={{ flex: 1, fontSize: 15, color: c.onToast }}>{message}</Text>
      <Pressable accessibilityRole="button" onPress={onUndo} style={{ minHeight: 44, paddingHorizontal: 14, justifyContent: 'center' }}>
        <Text style={{ fontSize: 15, fontWeight: '600', color: c.onToast }}>Undo</Text>
      </Pressable>
    </View>
  );
}

// No title, tags or folder. Return saves; swiping the sheet down drops it.
export function CaptureSheet({ visible, onClose, onSave }: { visible: boolean; onClose: () => void; onSave: (text: string, toTodo: boolean) => void }) {
  const c = useColors();
  const [text, setText] = useState('');
  const [toTodo, setToTodo] = useState(false);
  const close = () => (setText(''), setToTodo(false), onClose());
  const save = () => {
    if (text.trim()) onSave(text.trim(), toTodo);
    close();
  };
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: c.paper, paddingHorizontal: 20, paddingTop: 12, gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable onPress={close} style={{ minHeight: 44, justifyContent: 'center' }}>
            <Text style={{ fontSize: 17, color: c.muted }}>Cancel</Text>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={!text.trim()} onPress={save} style={{ minHeight: 44, paddingHorizontal: 20, borderRadius: 22, backgroundColor: c.accent, opacity: text.trim() ? 1 : 0.4, justifyContent: 'center' }}>
            <Text style={{ fontSize: 17, fontWeight: '600', color: c.onAccent }}>Save</Text>
          </Pressable>
        </View>
        <Text style={{ ...caps, color: c.faint, paddingTop: 12 }}>{toTodo ? 'To TODO.md' : 'To inbox'}</Text>
        <TextInput
          accessibilityLabel="Capture"
          autoFocus
          multiline
          value={text}
          onChangeText={setText}
          submitBehavior="submit"
          returnKeyType="done"
          onSubmitEditing={save}
          selectionColor={c.accent}
          style={{ fontSize: 26, lineHeight: 32, fontWeight: '500', letterSpacing: -0.2, color: c.ink, minHeight: 96, padding: 0 }}
        />
        <View style={{ flexDirection: 'row', paddingTop: 4 }}>
          <Chip label="Straight to todo" icon="checklist" selected={toTodo} onPress={() => setToTodo(!toTodo)} />
        </View>
        <Text style={{ fontSize: 13, color: c.faint, paddingTop: 6 }}>Return saves. Swipe down to drop it.</Text>
      </View>
    </Modal>
  );
}

// A month to pick a day from, drawn here: a native picker would need a new build.
// Days before today can't be picked; nothing is ever overdue.
function Calendar({ value, weekStart, onChange }: { value?: string; weekStart: number; onChange: (d: string) => void }) {
  const c = useColors();
  const today = isoDay();
  const [month, setMonth] = useState(() => new Date(`${(value ?? today).slice(0, 7)}-01T12:00:00`));
  const y = month.getFullYear();
  const m = month.getMonth();
  const blanks = (new Date(y, m, 1).getDay() - weekStart + 7) % 7;
  const days = Array.from({ length: new Date(y, m + 1, 0).getDate() }, (_, i) => isoDay(new Date(y, m, i + 1)));
  const cells = [...Array<undefined>(blanks).fill(undefined), ...days];
  const names = Array.from({ length: 7 }, (_, i) => new Date(2026, 1, 1 + ((i + weekStart) % 7)).toLocaleDateString('en-GB', { weekday: 'narrow' })); // 1 Feb 2026 is a Sunday
  const canGoBack = new Date(y, m, 1) > new Date();
  return (
    <View style={{ backgroundColor: c.card, borderRadius: 16, padding: 12, gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable accessibilityLabel="Previous month" disabled={!canGoBack} onPress={() => setMonth(new Date(y, m - 1, 1))} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: canGoBack ? 1 : 0.3 }}>
          <Icon name="chevron.left" size={18} color={c.ink} />
        </Pressable>
        <Text style={{ fontSize: 17, fontWeight: '600', color: c.ink }}>{month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</Text>
        <Pressable accessibilityLabel="Next month" onPress={() => setMonth(new Date(y, m + 1, 1))} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="chevron.right" size={18} color={c.ink} />
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row' }}>
        {names.map((n, i) => (
          <Text key={i} style={{ width: `${100 / 7}%`, textAlign: 'center', fontSize: 12, color: c.faint }}>{n}</Text>
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {cells.map((d, i) => {
          const on = d === value;
          const past = !!d && d < today;
          return (
            <Pressable
              key={i}
              disabled={!d || past}
              accessibilityRole="button"
              accessibilityLabel={d && new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
              accessibilityState={{ selected: on, disabled: past }}
              onPress={() => d && onChange(d)}
              style={{ width: `${100 / 7}%`, height: 40, alignItems: 'center', justifyContent: 'center' }}
            >
              {d && (
                <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? c.accent : 'transparent', borderWidth: d === today && !on ? 1 : 0, borderColor: c.ring }}>
                  <Text style={{ fontSize: 15, fontWeight: on ? '600' : '400', color: on ? c.onAccent : past ? c.ring : c.ink }}>{Number(d.slice(8))}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// An inbox line becomes a task: an optional date, and which TODO.md.
export function TaskSheet({ item, todos, weekStart, onClose, onMake }: { item?: InboxItem; todos: string[]; weekStart: number; onClose: () => void; onMake: (file: string, date?: string) => void }) {
  const c = useColors();
  const [date, setDate] = useState<string>();
  const [other, setOther] = useState(false);
  const [file, setFile] = useState('TODO.md');
  const close = () => (setDate(undefined), setOther(false), setFile('TODO.md'), onClose());
  const day = (n: number) => isoDay(new Date(Date.now() + n * 864e5));
  const today = new Date().getDay();
  const saturday = day(((6 - today + 7) % 7) || 7);
  const monday = day(((8 - today) % 7) || 7);
  const dates: [string, string | undefined][] = [['No date', undefined], ['Tomorrow', day(1)]];
  if (saturday !== day(1)) dates.push([dayLabel(saturday), saturday]);
  if (monday !== day(1)) dates.push(['Next week', monday]);
  const files = todos.includes('TODO.md') ? todos : ['TODO.md', ...todos];
  return (
    <Modal visible={!!item} transparent animationType="slide" onRequestClose={close}>
      <Pressable accessibilityLabel="Close" onPress={close} style={{ flex: 1, backgroundColor: 'rgba(20,20,19,0.32)' }} />
      {item && (
        <ScrollView style={{ flexGrow: 0, maxHeight: '88%', backgroundColor: c.paper, borderTopLeftRadius: 34, borderTopRightRadius: 34 }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40, gap: 18 }}>
          <View style={{ gap: 6 }}>
            {item.day && <Text style={{ fontSize: 13, color: c.faint }}>Captured {dayLabel(item.day).replace(/^(Today|Yesterday)$/, (d) => d.toLowerCase())}{item.time ? `, ${item.time}` : ''}</Text>}
            <Text style={{ fontSize: 26, lineHeight: 32, fontWeight: '600', letterSpacing: -0.2, color: c.ink }}>{item.text}</Text>
            {item.url && (
              <Pressable onPress={() => Linking.openURL(item.url!)} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Icon name="link" size={16} color={c.accent} />
                <Text style={{ fontSize: 15, color: c.accent }}>{item.url.replace(/^\w+:\/\/(www\.)?/, '').split(/[/?#]/)[0]}</Text>
              </Pressable>
            )}
          </View>
          <View style={{ gap: 8 }}>
            <Text style={{ ...caps, color: c.faint }}>Date — optional</Text>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {dates.map(([label, d]) => (
                <Chip key={label} label={label} selected={!other && date === d} onPress={() => (setOther(false), setDate(d))} />
              ))}
              <Chip label={other && date ? dayLabel(date) : 'Other…'} selected={other} onPress={() => setOther(true)} />
            </View>
            {other && <Calendar value={date} weekStart={weekStart} onChange={setDate} />}
          </View>
          {files.length > 1 && (
            <View style={{ gap: 8 }}>
              <Text style={{ ...caps, color: c.faint }}>In</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {files.map((f) => (
                  <Chip key={f} label={f === 'TODO.md' ? 'Loose tasks' : f.replace(/\/TODO\.md$/, '')} selected={file === f} onPress={() => setFile(f)} />
                ))}
              </ScrollView>
            </View>
          )}
          <View style={{ gap: 4, paddingTop: 6 }}>
            <BigButton label="Make it a task" icon="checklist" onPress={() => (onMake(file, date), close())} />
            <QuietButton label="Leave it in the inbox" onPress={close} />
          </View>
          <Text style={{ fontSize: 13, lineHeight: 18, color: c.faint, textAlign: 'center' }}>Adds a line to {file} and takes it out of the inbox.</Text>
        </ScrollView>
      )}
    </Modal>
  );
}
