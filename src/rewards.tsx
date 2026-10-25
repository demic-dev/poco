// The Done tab (Tally card or Little garden, and the quiet list), the moment after
// a Done, and Settings. Drawn with plain views: no SVG module in this build.

import { type ReactNode, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Modal, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { addDays, countByDay, type DoneItem, goodWeeks, streak, weekOf } from './days';
import type { Settings } from './settings';
import type { Account } from './sync';
import { caps, dayLabel, Icon, isoDay, QuietButton, Ring, time, useColors } from './ui';

const ink = { leaf: '#3F8A6F', newLeaf: '#6DBB97', stem: '#2E6B57', petal: '#E8B9A4', heart: '#C77B4F', pot: '#C77B4F', rim: '#B86E45', paper: '#FFFDF7' };
const short = (iso: string, opts: Intl.DateTimeFormatOptions) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', opts);

export function useReduceMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduce);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => sub.remove();
  }, []);
  return reduce;
}

// --- Drawing ---

// Tally marks, a struck group of five, then a number.
function Tally({ n, size = 1 }: { n: number; size?: number }) {
  const c = useColors();
  const marks = Math.min(n, 4);
  return (
    <View accessibilityLabel={`${n} done`} style={{ flexDirection: 'row', alignItems: 'center', gap: 7 * size, height: 34 * size }}>
      <View style={{ flexDirection: 'row', gap: 7 * size }}>
        {Array.from({ length: marks }, (_, i) => (
          <View key={i} style={{ width: 3 * size, height: 30 * size, borderRadius: 2, backgroundColor: c.ink, transform: [{ rotate: '4deg' }] }} />
        ))}
        {n >= 5 && <View style={{ position: 'absolute', left: -3 * size, top: 13 * size, width: 36 * size, height: 3 * size, borderRadius: 2, backgroundColor: c.ink, transform: [{ rotate: '-28deg' }] }} />}
      </View>
      {n > 5 && <Text style={{ fontSize: 13 * size, fontWeight: '600', color: c.muted }}>+{n - 5}</Text>}
    </View>
  );
}

function Stamp({ size = 20, label = false }: { size?: number; label?: boolean }) {
  const c = useColors();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: Math.max(2, size / 30), borderColor: c.accent, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-8deg' }] }}>
      {label ? (
        <Text style={{ fontSize: 13, fontWeight: '800', letterSpacing: 1, color: c.accent, textAlign: 'center' }}>{'TODAY\nDONE'}</Text>
      ) : (
        <Icon name="checkmark" size={size * 0.55} color={c.accent} />
      )}
    </View>
  );
}

function Flower({ size = 1 }: { size?: number }) {
  const r = 7 * size;
  const petals = [0, 72, 144, 216, 288].map((a) => [Math.sin((a * Math.PI) / 180) * r * 1.2, -Math.cos((a * Math.PI) / 180) * r * 1.2]);
  return (
    <View style={{ width: r * 5, height: r * 5, alignItems: 'center', justifyContent: 'center' }}>
      {petals.map(([x, y], i) => (
        <View key={i} style={{ position: 'absolute', width: r * 2, height: r * 2, borderRadius: r, backgroundColor: ink.petal, transform: [{ translateX: x }, { translateY: y }] }} />
      ))}
      <View style={{ width: r * 1.6, height: r * 1.6, borderRadius: r, backgroundColor: ink.heart }} />
    </View>
  );
}

// A leaf per thing done this week, a flower per finished day; nothing ever wilts.
export function Plant({ leaves, flowers, scale = 1, grow }: { leaves: number; flowers: number; scale?: number; grow?: Animated.Value }) {
  const shown = Math.min(leaves, 16);
  const gap = 12 * scale;
  const stem = Math.max(40 * scale, (shown + 1) * gap + 10 * scale);
  return (
    <View accessibilityLabel={`${leaves} ${leaves === 1 ? 'leaf' : 'leaves'}, ${flowers} ${flowers === 1 ? 'flower' : 'flowers'}`} style={{ alignItems: 'center' }}>
      <View style={{ width: 120 * scale, height: stem + 26 * scale, alignItems: 'center', justifyContent: 'flex-end' }}>
        <View style={{ position: 'absolute', bottom: 0, width: 4 * scale, height: stem, borderRadius: 2, backgroundColor: ink.stem }} />
        {Array.from({ length: shown }, (_, i) => {
          const left = i % 2 === 0;
          const last = i === shown - 1 && grow;
          const leaf = (
            <View
              key={i}
              style={{
                position: 'absolute',
                bottom: (i + 1) * gap,
                ...(left ? { right: 60 * scale } : { left: 60 * scale }),
                width: 32 * scale - i * 0.6 * scale,
                height: 13 * scale,
                borderRadius: 10 * scale,
                backgroundColor: last ? ink.newLeaf : ink.leaf,
                transform: [{ rotate: left ? '25deg' : '-25deg' }],
              }}
            />
          );
          return last ? (
            <Animated.View key={i} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, top: 0, transform: [{ scale: grow }] }}>
              {leaf}
            </Animated.View>
          ) : (
            leaf
          );
        })}
        {flowers > 0 && (
          <View style={{ position: 'absolute', bottom: stem - 14 * scale, flexDirection: 'row' }}>
            {Array.from({ length: Math.min(flowers, 3) }, (_, i) => (
              <View key={i} style={{ marginHorizontal: -6 * scale, marginTop: i ? 10 * scale : 0 }}>
                <Flower size={scale * (i ? 0.75 : 1)} />
              </View>
            ))}
          </View>
        )}
      </View>
      <View style={{ width: 96 * scale, height: 12 * scale, borderRadius: 4, backgroundColor: ink.rim }} />
      <View style={{ width: 78 * scale, height: 28 * scale, borderBottomLeftRadius: 10 * scale, borderBottomRightRadius: 10 * scale, backgroundColor: ink.pot }} />
    </View>
  );
}

// --- The Done tab ---

type Week = { days: string[]; counts: Map<string, number>; finished: Set<string>; today: string };

function TallyWeek({ days, counts, finished, today }: Week) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {days.map((d, i) => {
        const n = counts.get(d) ?? 0;
        const label = short(d, { weekday: 'short' });
        const isToday = d === today;
        if (!n)
          return (
            <View key={d} style={{ width: '22.5%', height: 96, borderRadius: 8, borderWidth: 1.5, borderStyle: 'dashed', borderColor: isToday ? c.accent : c.ring, padding: 8, gap: 10 }}>
              <Text style={{ fontSize: 12, fontWeight: isToday ? '700' : '600', color: isToday ? c.accent : c.faint }}>{label}</Text>
              {d < today && <Text style={{ fontSize: 13, color: c.faint }}>rest</Text>}
            </View>
          );
        return (
          <View
            key={d}
            style={{
              width: '22.5%',
              height: 96,
              borderRadius: 8,
              backgroundColor: c.paper === '#F7F6F2' ? ink.paper : c.card,
              padding: 8,
              paddingHorizontal: 10,
              gap: 10,
              borderWidth: isToday ? 2 : 0,
              borderColor: c.accent,
              shadowColor: '#1C1B19',
              shadowOpacity: 0.1,
              shadowRadius: 3,
              shadowOffset: { width: 0, height: 1 },
              transform: [{ rotate: `${[-1.5, 1, -0.5, 1.5, -1, 0.5, 1][i]}deg` }],
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: isToday ? '700' : '600', color: isToday ? c.accent : c.muted }}>{label}</Text>
            <Tally n={n} size={0.8} />
            {finished.has(d) && (
              <View style={{ position: 'absolute', right: 6, top: 6 }}>
                <Stamp />
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

function Ledger({ done, days, counts, today, streakDays, rest }: { done: (DoneItem & { pending?: boolean })[]; streakDays: number; rest: number } & Omit<Week, 'finished'>) {
  const c = useColors();
  const week = days.reduce((n, d) => n + (counts.get(d) ?? 0), 0);
  const restNote = ['every day counts', 'one rest day a week doesn’t break it', 'two rest days a week don’t break it'][rest];
  const recent = [...done].filter((d) => d.date >= addDays(today, -30)).sort((a, b) => b.date.localeCompare(a.date));
  const groups = recent.reduce<{ date: string; items: typeof recent }[]>((g, d) => {
    if (g.at(-1)?.date === d.date) g.at(-1)!.items.push(d);
    else g.push({ date: d.date, items: [d] });
    return g;
  }, []);
  return (
    <>
      <View style={{ gap: 14, paddingHorizontal: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
          <Text style={{ fontSize: 56, lineHeight: 60, fontWeight: '700', letterSpacing: -1, fontVariant: ['tabular-nums'], color: c.ink }}>{week}</Text>
          <Text style={{ fontSize: 17, color: c.muted }}>{week === 1 ? 'thing' : 'things'} done this week</Text>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {days.map((d) => (
            <View key={d} style={{ alignItems: 'center', gap: 6, flex: 1 }}>
              <View
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 7,
                  backgroundColor: counts.get(d) ? c.accent : 'transparent',
                  borderWidth: counts.get(d) ? 0 : 1.5,
                  borderStyle: 'dashed',
                  borderColor: c.ring,
                  ...(d === today && counts.get(d) ? { outlineColor: c.accent, outlineWidth: 1.5, outlineOffset: 3, outlineStyle: 'solid' } : {}),
                }}
              />
              <Text style={{ fontSize: 12, fontWeight: d === today ? '700' : '400', color: d === today ? c.ink : c.faint }}>{short(d, { weekday: 'narrow' })}</Text>
            </View>
          ))}
        </View>
        <Text style={{ fontSize: 15, color: c.muted }}>{streakDays ? `${streakDays} ${streakDays === 1 ? 'day' : 'days'} going — ${restNote}.` : `Nothing yet — ${restNote}.`}</Text>
      </View>
      {groups.length > 0 && (
        <View style={{ backgroundColor: c.card, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 4 }}>
          {groups.map((g) => (
            <View key={g.date}>
              <Text style={{ ...caps, color: c.faint, paddingTop: 12, paddingBottom: 2 }}>{dayLabel(g.date) === 'Today' || dayLabel(g.date) === 'Yesterday' ? dayLabel(g.date) : short(g.date, { weekday: 'long', day: 'numeric', month: 'short' })}</Text>
              {g.items.map((d, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, borderBottomWidth: i < g.items.length - 1 ? 1 : 0, borderColor: c.line }}>
                  <Icon name="checkmark" size={16} color={c.accent} />
                  <Text style={{ flex: 1, fontSize: 17, color: c.ink }}>{d.text}</Text>
                  {d.project && <Text style={{ fontSize: 13, color: c.faint }}>{d.project}</Text>}
                  {d.pending && <Ring />}
                </View>
              ))}
            </View>
          ))}
        </View>
      )}
    </>
  );
}

export function doneTitle(settings: Settings, done: DoneItem[], finished: Set<string>, list: boolean) {
  const days = weekOf(isoDay(), settings.weekStart);
  const counts = countByDay(done);
  const n = days.reduce((s, d) => s + (counts.get(d) ?? 0), 0);
  if (list) return `Week of ${short(days[0], { day: 'numeric', month: 'long' })}`;
  if (settings.reward === 'tally') return `This week’s pile · ${n} done`;
  const f = days.filter((d) => finished.has(d)).length;
  return `This week’s plant · ${n} ${n === 1 ? 'leaf' : 'leaves'}${f ? `, ${f} ${f === 1 ? 'flower' : 'flowers'}` : ''}`;
}

export function DoneTab({ done, finished, settings, list, onList }: { done: (DoneItem & { pending?: boolean })[]; finished: Set<string>; settings: Settings; list: boolean; onList: (list: boolean) => void }) {
  const c = useColors();
  const today = isoDay();
  const counts = countByDay(done);
  const days = weekOf(today, settings.weekStart);
  const weeksBack = [2, 1].map((n) => weekOf(addDays(days[0], -7 * n), settings.weekStart));
  const total = (w: string[]) => w.reduce((s, d) => s + (counts.get(d) ?? 0), 0);
  const good = goodWeeks(counts, today, settings.weekStart);
  const toggle = <QuietButton label={list ? (settings.reward === 'tally' ? 'Show the cards' : 'Show the plant') : 'Show as a list'} onPress={() => onList(!list)} />;

  if (list)
    return (
      <>
        <Ledger done={done} days={days} counts={counts} today={today} streakDays={streak(counts, today, settings.rest, settings.weekStart)} rest={settings.rest} />
        {toggle}
      </>
    );

  if (settings.reward === 'tally')
    return (
      <>
        <TallyWeek days={days} counts={counts} finished={finished} today={today} />
        <View style={{ backgroundColor: c.card, borderRadius: 20, padding: 16, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 17, fontWeight: '600', color: c.ink }}>{good ? `${good} good ${good === 1 ? 'week' : 'weeks'} in a row` : 'A good week is coming'}</Text>
            <Text style={{ fontSize: 13, color: c.faint }}>4+ days counts</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {[...weeksBack, days].map((w, i) => (
              <View key={w[0]} style={{ flex: 1, height: 54, borderRadius: 8, backgroundColor: i === 2 ? c.accentSoft : c.banner, justifyContent: 'center', paddingHorizontal: 10 }}>
                <Text style={{ fontSize: 12, color: i === 2 ? c.accent : c.faint }}>{i === 2 ? 'This week' : short(w[0], { day: 'numeric', month: 'short' })}</Text>
                <Text style={{ fontSize: 15, fontWeight: '600', color: c.ink }}>{total(w)} done</Text>
              </View>
            ))}
          </View>
        </View>
        {toggle}
      </>
    );

  const flowers = days.filter((d) => finished.has(d)).length;
  return (
    <>
      <View style={{ alignItems: 'center', paddingTop: 8 }}>
        <Plant leaves={total(days)} flowers={flowers} />
      </View>
      <Text style={{ fontSize: 15, lineHeight: 21, color: c.muted, textAlign: 'center', paddingHorizontal: 16 }}>A leaf for each thing done, a flower when you finish all you picked. Nothing ever wilts.</Text>
      <View style={{ gap: 10, paddingTop: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 4 }}>
          <Text style={{ ...caps, color: c.faint }}>Pressed weeks</Text>
          {good > 0 && <Text style={{ fontSize: 13, color: c.faint }}>{good} {good === 1 ? 'week' : 'weeks'} growing</Text>}
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {weeksBack.map((w) => (
            <View key={w[0]} style={{ flex: 1, height: 120, borderRadius: 10, backgroundColor: c.paper === '#F7F6F2' ? ink.paper : c.card, alignItems: 'center', justifyContent: 'flex-end', padding: 8, gap: 4, overflow: 'hidden' }}>
              <View style={{ opacity: 0.7 }}>
                <Plant leaves={total(w)} flowers={w.filter((d) => finished.has(d)).length} scale={0.32} />
              </View>
              <Text style={{ fontSize: 12, color: c.muted }}>
                {short(w[0], { day: 'numeric', month: 'short' })} · {total(w)}
              </Text>
            </View>
          ))}
          <View style={{ flex: 1, height: 120, borderRadius: 10, borderWidth: 1.5, borderColor: c.accent, alignItems: 'center', justifyContent: 'center', padding: 8, gap: 4 }}>
            <Text style={{ fontSize: 15, fontWeight: '600', color: c.accent }}>This week</Text>
            <Text style={{ fontSize: 12, color: c.muted, textAlign: 'center' }}>Pressed on {short(days[6], { weekday: 'long' })} night</Text>
          </View>
        </View>
      </View>
      {toggle}
    </>
  );
}

// --- The moment after a Done ---

export type Moment = { kind: 'stamp'; date: string; count: number } | { kind: 'leaf'; text: string; leaves: number; flowers: number; finished: boolean; next?: string };

export function MomentView({ moment, onClose, onUndo }: { moment?: Moment; onClose: () => void; onUndo?: () => void }) {
  const c = useColors();
  const reduce = useReduceMotion();
  const enter = useRef(new Animated.Value(0)).current;
  const stamp = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!moment) return;
    if (reduce) return enter.setValue(1), stamp.setValue(1);
    enter.setValue(0);
    stamp.setValue(0);
    Animated.sequence([
      Animated.spring(enter, { toValue: 1, useNativeDriver: true, friction: 6 }),
      Animated.timing(stamp, { toValue: 1, duration: 260, useNativeDriver: true }),
    ]).start();
  }, [moment, reduce, enter, stamp]);
  if (!moment) return null;
  const fade = { opacity: enter, transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }] };
  const bg = moment.kind === 'leaf' && c.paper === '#F7F6F2' ? '#F3F4EE' : c.paper;

  return (
    <Modal visible transparent={false} animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: bg, paddingHorizontal: 20, paddingTop: 120, paddingBottom: 40, alignItems: 'center', gap: 28 }}>
        {moment.kind === 'stamp' ? (
          <Animated.View style={[{ width: 300, height: 210, borderRadius: 10, backgroundColor: c.paper === '#F7F6F2' ? ink.paper : c.card, padding: 20, shadowColor: '#1C1B19', shadowOpacity: 0.14, shadowRadius: 25, shadowOffset: { width: 0, height: 20 } }, fade, { transform: [...fade.transform, { rotate: '-2deg' }] }]}>
            <View style={{ position: 'absolute', left: 0, right: 0, top: 52, height: 1, backgroundColor: ink.petal }} />
            {[84, 116, 148].map((t) => (
              <View key={t} style={{ position: 'absolute', left: 0, right: 0, top: t, height: 1, backgroundColor: c.line }} />
            ))}
            <Text style={{ fontSize: 15, fontWeight: '600', color: c.muted }}>{short(moment.date, { weekday: 'long', day: 'numeric' })}</Text>
            <View style={{ position: 'absolute', left: 30, top: 84 }}>
              <Tally n={moment.count} size={1.8} />
            </View>
            <Animated.View style={{ position: 'absolute', right: 20, bottom: 22, opacity: stamp, transform: [{ scale: stamp.interpolate({ inputRange: [0, 1], outputRange: [1.6, 1] }) }] }}>
              <Stamp size={92} label />
            </Animated.View>
          </Animated.View>
        ) : (
          <Animated.View style={fade}>
            <Plant leaves={moment.leaves} flowers={moment.flowers} scale={1.2} grow={stamp} />
          </Animated.View>
        )}
        <Animated.View style={[{ alignItems: 'center', gap: 6 }, fade]}>
          <Text accessibilityRole="header" style={{ fontSize: 28, lineHeight: 34, fontWeight: '700', color: c.ink }}>
            {moment.kind === 'stamp' ? 'That’s today.' : moment.finished ? 'A flower' : 'A new leaf'}
          </Text>
          <Text style={{ fontSize: 17, lineHeight: 23, color: c.muted, textAlign: 'center', maxWidth: 300 }}>
            {moment.kind === 'stamp'
              ? `${['One for one.', 'Two for two.', 'Three for three.'][moment.count - 1] ?? 'All done.'} The card goes on this week’s pile.`
              : `“${moment.text}” is done. This week’s plant has ${moment.leaves} ${moment.leaves === 1 ? 'leaf' : 'leaves'}.`}
          </Text>
        </Animated.View>
        <View style={{ marginTop: 'auto', alignSelf: 'stretch', gap: 4, alignItems: 'center' }}>
          <Pressable accessibilityRole="button" onPress={onClose} style={{ minHeight: 56, paddingHorizontal: 32, borderRadius: 28, backgroundColor: c.toast, alignItems: 'center', justifyContent: 'center', alignSelf: moment.kind === 'stamp' ? 'center' : 'stretch' }}>
            <Text numberOfLines={1} style={{ fontSize: 17, fontWeight: '600', color: c.onToast }}>
              {moment.kind === 'leaf' && moment.next ? `Next: ${moment.next}` : 'Nice'}
            </Text>
          </Pressable>
          {onUndo && <QuietButton label="Undo" onPress={onUndo} />}
        </View>
      </View>
    </Modal>
  );
}

// --- Settings ---

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  const c = useColors();
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ ...caps, color: c.faint, paddingTop: 10, paddingHorizontal: 4 }}>{title}</Text>
      {children}
      {note && <Text style={{ fontSize: 13, lineHeight: 18, color: c.faint, paddingHorizontal: 4 }}>{note}</Text>}
    </View>
  );
}

function Rows({ rows }: { rows: ReactNode[] }) {
  const c = useColors();
  return (
    <View style={{ backgroundColor: c.card, borderRadius: 16, paddingHorizontal: 16 }}>
      {rows.map((r, i) => (
        <View key={i} style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderBottomWidth: i < rows.length - 1 ? 1 : 0, borderColor: c.line }}>
          {r}
        </View>
      ))}
    </View>
  );
}

function Segments<T extends number>({ label, values, value, onChange }: { label: string; values: T[]; value: T; onChange: (v: T) => void }) {
  const c = useColors();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: 'row', backgroundColor: c.banner, borderRadius: 10, padding: 2, width: 132 }}>
      {values.map((v) => (
        <Pressable key={v} accessibilityRole="radio" accessibilityState={{ selected: v === value }} onPress={() => onChange(v)} style={{ flex: 1, minHeight: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: v === value ? c.card : 'transparent' }}>
          <Text style={{ fontSize: 15, fontWeight: v === value ? '600' : '400', color: c.ink }}>{v}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function SettingsScreen({ visible, settings, onChange, onClose, account, syncedAt, waiting, onEditAccount }: { visible: boolean; settings: Settings; onChange: (s: Settings) => void; onClose: () => void; account: Account; syncedAt?: number; waiting: number; onEditAccount: () => void }) {
  const c = useColors();
  const set = (p: Partial<Settings>) => onChange({ ...settings, ...p });
  const label = { fontSize: 17, color: c.ink } as const;
  const value = { fontSize: 15, color: c.muted } as const;
  const style = (id: Settings['reward'], title: string, text: string, preview: ReactNode) => {
    const on = settings.reward === id;
    return (
      <Pressable accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => set({ reward: id })} style={{ flex: 1, borderRadius: 20, backgroundColor: c.card, padding: 14, gap: 12, borderWidth: 2.5, borderColor: on ? c.accent : 'transparent' }}>
        <View style={{ height: 96, borderRadius: 12, backgroundColor: c.banner, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>{preview}</View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 17, fontWeight: '600', color: c.ink }}>{title}</Text>
          <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: on ? c.accent : 'transparent', borderWidth: on ? 0 : 1.5, borderColor: c.ring, alignItems: 'center', justifyContent: 'center' }}>
            {on && <Icon name="checkmark" size={13} color={c.onAccent} />}
          </View>
        </View>
        <Text style={{ fontSize: 13, lineHeight: 18, color: c.muted }}>{text}</Text>
      </Pressable>
    );
  };
  const server = account.server.replace(/^\w+:\/\//, '').replace(/\/+$/, '');

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <ScrollView style={{ flex: 1, backgroundColor: c.paper }} contentContainerStyle={{ paddingTop: 54, paddingHorizontal: 20, paddingBottom: 48, gap: 8 }}>
        <Pressable accessibilityRole="button" onPress={onClose} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 2, marginLeft: -6, alignSelf: 'flex-start' }}>
          <Icon name="chevron.left" size={20} color={c.accent} />
          <Text style={{ fontSize: 17, color: c.accent }}>Done</Text>
        </Pressable>
        <Text accessibilityRole="header" style={{ fontSize: 34, lineHeight: 41, fontWeight: '700', letterSpacing: -0.4, color: c.ink, marginLeft: 4, marginBottom: 8 }}>Settings</Text>

        <Section title="Reward style" note="Stays until you change it here. Your history carries over: the same done list, drawn the other way.">
          <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: 12 }}>
            {style(
              'tally',
              'Tally card',
              'A card a day, stamped when you finish what you picked.',
              <View style={{ width: 84, height: 60, borderRadius: 6, backgroundColor: c.paper === '#F7F6F2' ? ink.paper : c.card, padding: 10, transform: [{ rotate: '-3deg' }] }}>
                <Tally n={3} size={0.8} />
                <View style={{ position: 'absolute', right: 6, bottom: 6 }}>
                  <Stamp size={20} />
                </View>
              </View>,
            )}
            {style('garden', 'Little garden', 'A leaf per thing done, a flower per finished day.', <Plant leaves={4} flowers={1} scale={0.45} />)}
          </View>
        </Section>

        <Section title="Streak" note={`Days off that don’t break it. ${['Every day counts.', 'One quiet day a week is fine.', 'Two quiet days a week are fine.'][settings.rest]}`}>
          <Rows
            rows={[
              <>
                <Text style={label}>Rest days a week</Text>
                <Segments label="Rest days a week" values={[0, 1, 2] as const as (0 | 1 | 2)[]} value={settings.rest} onChange={(rest) => set({ rest })} />
              </>,
            ]}
          />
        </Section>

        <Section title="Today">
          <Rows
            rows={[
              <>
                <Text style={label}>Most picks a day</Text>
                <Segments label="Most picks a day" values={[1, 2, 3] as (1 | 2 | 3)[]} value={settings.maxPicks} onChange={(maxPicks) => set({ maxPicks })} />
              </>,
              <Pressable key="week" accessibilityRole="button" onPress={() => set({ weekStart: settings.weekStart ? 0 : 1 })} style={{ flex: 1, minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={label}>Week starts on</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={{ fontSize: 17, color: c.muted }}>{settings.weekStart ? 'Monday' : 'Sunday'}</Text>
                  <Icon name="arrow.left.arrow.right" size={14} color={c.faint} />
                </View>
              </Pressable>,
            ]}
          />
        </Section>

        <Section title="Feel">
          <Rows
            rows={[
              <>
                <Text style={label}>Haptics</Text>
                <Switch accessibilityLabel="Haptics" value={settings.haptics} onValueChange={(haptics) => set({ haptics })} trackColor={{ true: c.accent }} />
              </>,
              <>
                <Text style={label}>Sounds</Text>
                <Switch accessibilityLabel="Sounds" value={settings.sounds} onValueChange={(sounds) => set({ sounds })} trackColor={{ true: c.accent }} />
              </>,
              <>
                <Text style={label}>Motion</Text>
                <Text style={value}>Follows Reduce Motion</Text>
              </>,
            ]}
          />
        </Section>

        <Section title="Sync" note="The phone only records what you do. bach writes it into inbox.md, today.md, done.md and the TODO.md files.">
          <Rows
            rows={[
              <>
                <Text style={label}>Notes folder</Text>
                <Text numberOfLines={1} style={[value, { flexShrink: 1 }]}>
                  {server}/{account.folder}
                </Text>
              </>,
              <>
                <Text style={label}>Last synced</Text>
                <Text style={value}>{time(syncedAt)}</Text>
              </>,
              <>
                <Text style={label}>Waiting on this phone</Text>
                <Text style={value}>{waiting ? `${waiting} ${waiting === 1 ? 'change' : 'changes'}` : 'Nothing'}</Text>
              </>,
              <Pressable key="account" accessibilityRole="button" onPress={onEditAccount} style={{ flex: 1, minHeight: 52, justifyContent: 'center' }}>
                <Text style={{ fontSize: 17, color: c.accent }}>Change connection</Text>
              </Pressable>,
            ]}
          />
        </Section>
      </ScrollView>
    </Modal>
  );
}
