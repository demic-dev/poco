import { SymbolView, type SFSymbol } from 'expo-symbols';
import { useState, type ReactNode } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, Text, TextInput, useColorScheme, View } from 'react-native';
import type { InboxItem, Task, Today } from './parse';
import type { Account } from './sync';

// "Paper, ink, one green". Green means only "done".
const light = {
  paper: '#F7F6F2', ink: '#1C1B19', card: '#FFFFFF', muted: '#5F5D57', faint: '#6E6C66', line: '#E4E2DC', ring: '#C9C6BE',
  accent: '#2E6B57', onAccent: '#FFFFFF', accentSoft: 'rgba(46,107,87,0.10)', banner: '#EFEDE7', bar: 'rgba(255,255,255,0.82)',
};
const dark: typeof light = {
  paper: '#141413', ink: '#F2F1EC', card: '#1F1E1C', muted: '#A8A6A0', faint: '#A8A6A0', line: '#2C2B29', ring: '#55534E',
  accent: '#7CC2A6', onAccent: '#10241C', accentSoft: 'rgba(124,194,166,0.14)', banner: '#1F1E1C', bar: 'rgba(44,43,41,0.86)',
};
export const useColors = () => (useColorScheme() === 'dark' ? dark : light);

const pad = (n: number) => String(n).padStart(2, '0');
export const isoDay = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

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

const time = (ms?: number) => (ms ? new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : 'never');

function Icon({ name, size = 22, color }: { name: SFSymbol; size?: number; color: string }) {
  return <SymbolView name={name} size={size} tintColor={color} />;
}

const caps = { fontSize: 13, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' } as const;

export type SyncState = { ok?: boolean; error?: string; syncedAt?: number };

// The cloud: synced or offline, never a spinner. Tapping it gives one plain sentence.
export function Screen({ title, subtitle, sync, onRefresh, children }: { title: string; subtitle: string; sync: SyncState; onRefresh: () => Promise<void>; children: ReactNode }) {
  const c = useColors();
  const [explain, setExplain] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const sentence =
    sync.ok === false
      ? `Can't reach Nextcloud (${sync.error}). Showing the copy from ${time(sync.syncedAt)}.`
      : `Synced at ${time(sync.syncedAt)}.`;
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
        <Pressable accessibilityLabel={sentence} onPress={() => setExplain(!explain)} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={sync.ok === false ? 'icloud.slash' : sync.ok ? 'checkmark.icloud' : 'icloud'} size={24} color={c.faint} />
        </Pressable>
      </View>
      {(explain || sync.ok === false) && (
        <Text style={{ padding: 12, paddingHorizontal: 16, borderRadius: 16, overflow: 'hidden', backgroundColor: c.banner, fontSize: 15, lineHeight: 20, color: c.muted }}>{sentence}</Text>
      )}
      {children}
    </ScrollView>
  );
}

function Card({ children, gap = 20 }: { children: ReactNode; gap?: number }) {
  const c = useColors();
  return (
    <View style={{ backgroundColor: c.card, borderRadius: 28, padding: 24, paddingBottom: 20, gap, shadowColor: '#1C1B19', shadowOpacity: 0.06, shadowRadius: 14, shadowOffset: { width: 0, height: 8 } }}>
      {children}
    </View>
  );
}

function BigButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  const c = useColors();
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={{ height: 56, borderRadius: 28, backgroundColor: c.accent, opacity: disabled ? 0.4 : 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: c.onAccent, fontSize: 17, fontWeight: '600' }}>{label}</Text>
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

export function TodayScreen({ today, tasks, onPick }: { today: Today; tasks: Task[]; onPick: () => void }) {
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
      {/* ponytail: read-only build; Done and "Not now" arrive with events (phase 3) */}
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
      </Card>
      {rest.length > 0 && (
        <View style={{ paddingHorizontal: 4 }}>
          <Text style={{ ...caps, color: c.faint, paddingBottom: 6 }}>After that</Text>
          {rest.map((i, n) => (
            <View key={i.line} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 48, borderBottomWidth: n < rest.length - 1 ? 1 : 0, borderColor: c.line }}>
              {i.done ? <Icon name="checkmark" size={18} color={c.accent} /> : <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: c.ring }} />}
              <Text style={{ flex: 1, fontSize: 17, color: i.done ? c.faint : c.muted, textDecorationLine: i.done ? 'line-through' : 'none' }}>{i.text}</Text>
            </View>
          ))}
        </View>
      )}
    </>
  );
}

export function InboxScreen({ inbox }: { inbox: InboxItem[] }) {
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
            disabled={!i.url}
            onPress={() => i.url && Linking.openURL(i.url)}
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
            {i.time && <Text style={{ fontSize: 13, color: c.faint, lineHeight: 22 }}>{i.time}</Text>}
          </Pressable>
        ))}
      </View>
    </View>
  ));
}

// The daily pick: the only place with the long list. Dated items first, then everything else.
export function PickScreen({ tasks, files, inboxCount, onClose, onInbox }: { tasks: Task[]; files: number; inboxCount: number; onClose: () => void; onInbox: () => void }) {
  const c = useColors();
  const [chosen, setChosen] = useState<Task[]>([]);
  const full = chosen.length === 3;
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
          <Text style={{ fontSize: 15, color: c.muted }}>Up to three. The first one you tap is next.</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {[0, 1, 2].map((n) => (
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
        {/* ponytail: read-only build; the pick event arrives in phase 3 */}
        <BigButton label={chosen.length ? `Start today with ${chosen.length}` : 'Tap up to three'} disabled onPress={onClose} />
        <Text style={{ textAlign: 'center', fontSize: 13, color: c.faint }}>{full ? 'Three is plenty. Tap one to swap it out.' : 'This build doesn’t save the pick yet.'}</Text>
      </View>
    </View>
  );
}

export function DoneScreen({ account, sync, onEditAccount }: { account: Account; sync: SyncState; onEditAccount: () => void }) {
  const c = useColors();
  return (
    <Card gap={8}>
      <Text style={{ ...caps, color: c.faint }}>Notes folder</Text>
      <Text style={{ fontSize: 17, color: c.ink }}>
        {account.user} · {account.folder}
      </Text>
      <Text style={{ fontSize: 15, color: c.muted }}>{account.server}</Text>
      <Text style={{ fontSize: 15, color: c.muted }}>Last synced {time(sync.syncedAt)}</Text>
      <Pressable onPress={onEditAccount} style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text style={{ fontSize: 17, color: c.accent }}>Change connection</Text>
      </Pressable>
    </Card>
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

export function TabBar({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  const c = useColors();
  const tabs: [Tab, string, SFSymbol][] = [
    ['today', 'Today', 'sun.max'],
    ['inbox', 'Inbox', 'tray'],
    ['done', 'Done', 'checkmark.circle'],
  ];
  // ponytail: the round capture button joins the bar in phase 3
  return (
    <View style={{ position: 'absolute', left: 16, right: 16, bottom: 30, height: 62, borderRadius: 31, padding: 4, flexDirection: 'row', backgroundColor: c.bar, borderWidth: 1, borderColor: c.line, shadowColor: '#1C1B19', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 8 } }}>
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
  );
}
