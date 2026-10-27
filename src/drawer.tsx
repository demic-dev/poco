// The notes drawer: follows the thumb from the left edge, over a dimmed screen.
// React Native's own PanResponder and Animated, so it ships as an update.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Keyboard, PanResponder, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { findNotes, folderOf, type Group, groupNotes, nameIn, nameOf, type Note } from './notes';
import { caps, cloudIcon, Icon, type SyncState, useColors } from './ui';

const W = 324;

export function Drawer({ open, onOpen, onClose, notes, recent, current, sync, onNote }: { open: boolean; onOpen: () => void; onClose: () => void; notes: Note[]; recent: string[]; current?: string; sync: SyncState; onNote: (path: string) => void }) {
  const c = useColors();
  const x = useRef(new Animated.Value(-W)).current; // the drawer's left edge
  const settle = (show: boolean) => {
    if (!show) Keyboard.dismiss();
    Animated.spring(x, { toValue: show ? 0 : -W, useNativeDriver: true, bounciness: 0, speed: 16 }).start();
    if (show !== open) (show ? onOpen : onClose)();
  };
  useEffect(() => settle(open), [open]);

  // From the edge when closed, on the drawer or the dimmed screen when open. On the edge
  // and the drawer only a sideways move takes over, so taps and scrolling still work;
  // the dimmed screen takes every touch, and a tap there closes.
  const [pan, dimPan] = useMemo(() => {
    const from = open ? 0 : -W;
    const sideways = (g: { dx: number; dy: number }) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5;
    const handlers = (taps: boolean) =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => taps,
        onMoveShouldSetPanResponder: (_, g) => sideways(g),
        onPanResponderMove: (_, g) => x.setValue(Math.min(0, Math.max(-W, from + g.dx))),
        onPanResponderRelease: (_, g) => settle(taps && Math.abs(g.dx) < 6 ? false : from + g.dx + g.vx * 150 > -W / 2),
        onPanResponderTerminate: () => settle(open),
      }).panHandlers;
    return [handlers(false), handlers(true)];
  }, [open]);

  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string>();
  const groups = useMemo(() => groupNotes(notes), [notes]);
  const found = useMemo(() => (query.trim() ? findNotes(notes, query) : undefined), [notes, query]);
  const byPath = new Map(notes.map((n) => [n.path, n]));
  const lastOpened = recent.flatMap((p) => byPath.get(p) ?? []);

  const header = (text: string) => <Text style={{ ...caps, color: c.faint, paddingTop: 16, paddingBottom: 4, paddingHorizontal: 10 }}>{text}</Text>;

  // A note with its folder underneath: Last opened and search results.
  const titled = (n: Note) => (
    <Pressable key={n.path} accessibilityRole="button" onPress={() => onNote(n.path)} style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 10, borderRadius: 12, backgroundColor: n.path === current ? c.selected : 'transparent' }}>
      <Icon name={n.here ? 'doc' : 'arrow.down.circle.dotted'} size={18} color={c.faint} />
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ fontSize: 17, color: n.here ? c.ink : c.faint }}>{nameOf(n.path)}</Text>
        <Text numberOfLines={1} style={{ fontSize: 12, color: c.faint }}>{folderOf(n.path) || 'Loose files'}{n.here ? '' : ' · not on this phone'}</Text>
      </View>
    </Pressable>
  );

  const group = (g: Group, key: string, label: string) => {
    const on = expanded === key;
    const slash = label.lastIndexOf('/') + 1;
    return (
      <View key={key}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: on }} onPress={() => setExpanded(on ? undefined : key)} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, borderRadius: 12 }}>
          <View style={{ transform: [{ rotate: on ? '90deg' : '0deg' }] }}>
            <Icon name="chevron.right" size={13} color={c.pending} />
          </View>
          <Text numberOfLines={1} style={{ flex: 1, fontSize: 17, fontWeight: on ? '600' : '400', color: c.ink }}>
            <Text style={{ color: c.pending, fontWeight: '400' }}>{label.slice(0, slash)}</Text>
            {label.slice(slash)}
          </Text>
        </Pressable>
        {on && (
          <View style={{ paddingBottom: 6 }}>
            {g.notes.map((n) => {
              const name = nameIn(g.folder, n.path);
              const todo = name === 'TODO.md';
              const sub = name.lastIndexOf('/') + 1;
              return (
                <Pressable key={n.path} accessibilityRole="button" onPress={() => onNote(n.path)} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 34, paddingRight: 10, borderRadius: 12, backgroundColor: n.path === current ? c.selected : 'transparent' }}>
                  <Icon name={!n.here ? 'arrow.down.circle.dotted' : todo ? 'checklist' : 'doc'} size={17} color={!n.here ? c.pending : todo ? c.accent : c.faint} />
                  <Text numberOfLines={1} style={{ flex: 1, fontSize: 16, color: n.here ? c.ink : c.faint }}>
                    <Text style={{ color: c.pending }}>{name.slice(0, sub)}</Text>
                    {name.slice(sub)}
                  </Text>
                  {!n.here && <Text style={{ fontSize: 12, color: c.faint }}>not on this phone</Text>}
                </Pressable>
              );
            })}
            {g.folder && g.notes.length === 1 && nameIn(g.folder, g.notes[0].path) === 'TODO.md' && (
              <Text style={{ paddingLeft: 34, paddingRight: 10, paddingTop: 2, paddingBottom: 8, fontSize: 13, lineHeight: 18, color: c.faint }}>Only the task list so far. Notes you add on the laptop show up here.</Text>
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      {!open && <View {...pan} style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 14 }} />}
      <Animated.View
        {...dimPan}
        pointerEvents={open ? 'auto' : 'none'}
        accessible
        accessibilityRole="button"
        accessibilityLabel="Close notes"
        onAccessibilityTap={() => settle(false)}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: c.dim, opacity: x.interpolate({ inputRange: [-W, 0], outputRange: [0, 1] }) }}
      />
      <Animated.View
        {...pan}
        accessibilityViewIsModal={open}
        accessibilityElementsHidden={!open}
        style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: W, backgroundColor: c.drawer, borderTopRightRadius: 28, borderBottomRightRadius: 28, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 20, shadowOffset: { width: 10, height: 0 }, transform: [{ translateX: x }] }}
      >
        <View style={{ paddingTop: 58, paddingLeft: 20, paddingRight: 12, paddingBottom: 8, gap: 12, borderBottomWidth: 1, borderColor: c.line }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text accessibilityRole="header" style={{ fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.3, color: c.ink }}>Notes</Text>
            <View accessibilityLabel={sync.ok === false ? 'Offline, reading the copy on this phone' : 'Synced'} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={cloudIcon(sync)} size={22} color={c.faint} />
            </View>
          </View>
          {sync.ok === false && <Text style={{ fontSize: 13, lineHeight: 18, color: c.faint, marginTop: -8 }}>Offline · reading the copy on this phone</Text>}
          <View style={{ height: 40, marginRight: 8, borderRadius: 12, backgroundColor: c.field, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 }}>
            <Icon name="magnifyingglass" size={16} color={c.faint} />
            <TextInput
              accessibilityLabel="Find a note"
              placeholder="Find a note"
              placeholderTextColor={c.faint}
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
              selectionColor={c.accent}
              style={{ flex: 1, fontSize: 17, color: c.ink, padding: 0 }}
            />
          </View>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ paddingHorizontal: 10, paddingBottom: 40 }}>
          {found ? (
            found.length ? (
              <View style={{ paddingTop: 8 }}>{found.map(titled)}</View>
            ) : (
              <Text style={{ padding: 10, paddingTop: 20, fontSize: 15, color: c.faint }}>No note called that.</Text>
            )
          ) : (
            <>
              {lastOpened.length > 0 && header('Last opened')}
              {lastOpened.map(titled)}
              {groups.projects.length > 0 && header('Projects')}
              {groups.projects.map((g) => group(g, `p:${g.folder}`, g.folder))}
              {groups.other.length > 0 && header('Everything else')}
              {groups.other.map((g) => group(g, `o:${g.folder}`, g.folder || 'Loose files'))}
            </>
          )}
        </ScrollView>
      </Animated.View>
    </View>
  );
}
