// A note, read-only: marked's tokens drawn with React Native views, so it looks as
// designed. All of its text can be selected; React Native selects within one block.

import type { Token, Tokens } from 'marked';
import { type ReactNode, useMemo, useState } from 'react';
import { Image, Linking, Modal, Pressable, ScrollView, Share, Text, type TextStyle, View } from 'react-native';
import { decode, folderOf, nameOf, resolve } from './notes';
import { type Account, cachedUri, noteText, remoteSource } from './sync';
import { Icon, useColors } from './ui';

const mono = 'Menlo';
type Ctx = { c: ReturnType<typeof useColors>; path: string; account: Account; onNote: (path: string) => void; base: TextStyle };

// Loaded when a note first opens, not at launch: if the parser ever failed on the
// phone, notes would show as plain text and the rest of the app would carry on.
let lexer: ((md: string) => Token[]) | undefined;
function parse(md: string) {
  try {
    lexer ??= (require('marked') as typeof import('marked')).lexer;
    return lexer(md);
  } catch {
    return undefined;
  }
}

export function NoteScreen({ path, here, offline, account, onBack, onClose, onNote }: { path?: string; here: boolean; offline: boolean; account: Account; onBack: () => void; onClose: () => void; onNote: (path: string) => void }) {
  return (
    <Modal visible={!!path} animationType="slide" presentationStyle="fullScreen" onRequestClose={onBack}>
      {path && <Body path={path} here={here} offline={offline} account={account} onBack={onBack} onClose={onClose} onNote={onNote} />}
    </Modal>
  );
}

function Body({ path, here, offline, account, onBack, onClose, onNote }: { path: string; here: boolean; offline: boolean; account: Account; onBack: () => void; onClose: () => void; onNote: (path: string) => void }) {
  const c = useColors();
  const text = useMemo(() => (here ? noteText(path) : ''), [path, here]);
  const tokens = useMemo(() => parse(text), [text]);
  const ctx: Ctx = { c, path, account, onNote, base: { fontSize: 17, lineHeight: 26, color: c.ink } };
  const button = { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' } as const;

  return (
    <View style={{ flex: 1, backgroundColor: c.paper }}>
      <View style={{ paddingTop: 50, paddingHorizontal: 8, paddingBottom: 6, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: c.line }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to notes" onPress={onBack} style={{ width: 96, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <Icon name="chevron.left" size={20} color={c.accent} />
          <Text style={{ fontSize: 17, color: c.accent }}>Notes</Text>
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: '600', color: c.ink }}>{nameOf(path)}</Text>
          <Text numberOfLines={1} style={{ fontSize: 11, color: c.faint }}>{folderOf(path) || 'Loose files'}</Text>
        </View>
        <View style={{ width: 96, flexDirection: 'row', justifyContent: 'flex-end' }}>
          {here ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`Share ${path.split('/').pop()}`} onPress={() => Share.share({ url: cachedUri(path)! })} style={button}>
              <Icon name="square.and.arrow.up" size={20} color={c.accent} />
            </Pressable>
          ) : (
            offline && (
              <View accessibilityRole="image" accessibilityLabel="Offline" style={button}>
                <Icon name="icloud.slash" size={20} color={c.faint} />
              </View>
            )
          )}
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={button}>
            <Icon name="xmark" size={18} color={c.muted} />
          </Pressable>
        </View>
      </View>

      {here ? (
        <ScrollView key={path} contentContainerStyle={{ paddingTop: 22, paddingHorizontal: 20, paddingBottom: 60, gap: 16 }}>
          {tokens ? blocks(tokens, ctx) : <Text selectable style={ctx.base}>{text}</Text>}
        </ScrollView>
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 40, paddingBottom: 120 }}>
          <Text style={{ fontSize: 22, lineHeight: 28, fontWeight: '600', color: c.ink }}>Not on this phone yet</Text>
          <Text style={{ fontSize: 17, lineHeight: 24, color: c.muted, textAlign: 'center' }}>{offline ? 'It downloads by itself next time you’re online.' : 'It downloads by itself with the next sync.'}</Text>
          <Pressable accessibilityRole="button" onPress={onBack} style={{ marginTop: 14, minHeight: 48, paddingHorizontal: 22, borderRadius: 24, backgroundColor: c.card, borderWidth: 1, borderColor: c.rule, justifyContent: 'center' }}>
            <Text style={{ fontSize: 17, color: c.ink }}>Back to notes</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const headings: TextStyle[] = [
  { fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.3 },
  { fontSize: 21, lineHeight: 27, fontWeight: '700', marginTop: 10 },
  { fontSize: 18, lineHeight: 24, fontWeight: '600', marginTop: 6 },
  { fontSize: 17, lineHeight: 24, fontWeight: '600' },
];

function blocks(tokens: Token[], ctx: Ctx): ReactNode[] {
  return tokens.map((t, i) => block(t, ctx, i));
}

function block(t: Token, ctx: Ctx, key: number): ReactNode {
  const { c } = ctx;
  switch (t.type) {
    case 'space':
    case 'def':
      return null;
    case 'heading':
      return <Text key={key} selectable accessibilityRole="header" style={[ctx.base, headings[Math.min(t.depth, 4) - 1]]}>{inline(t.tokens!, ctx)}</Text>;
    case 'paragraph':
      return paragraph(t.tokens!, ctx, key);
    case 'text': // a tight list item's text
      return t.tokens ? paragraph(t.tokens, ctx, key) : <Text key={key} selectable style={ctx.base}>{decode(t.text)}</Text>;
    case 'list':
      return <List key={key} list={t as Tokens.List} ctx={ctx} />;
    case 'code':
      return (
        <View key={key} style={{ borderRadius: 12, backgroundColor: c.block, borderWidth: 1, borderColor: c.blockLine, overflow: 'hidden' }}>
          <Sideways fade={c.block}>
            <Text selectable style={{ fontFamily: mono, fontSize: 13, lineHeight: 20, color: c.ink, paddingVertical: 14, paddingHorizontal: 16 }}>{t.text}</Text>
          </Sideways>
        </View>
      );
    case 'blockquote':
      return (
        <View key={key} style={{ borderLeftWidth: 3, borderColor: c.rule, paddingLeft: 16, paddingVertical: 2, gap: 16 }}>
          {blocks(t.tokens!, { ...ctx, base: { ...ctx.base, color: c.muted, fontStyle: 'italic' } })}
        </View>
      );
    case 'hr':
      return <View key={key} style={{ height: 1, backgroundColor: c.rule, marginVertical: 10 }} />;
    case 'table':
      return <Table key={key} table={t as Tokens.Table} ctx={ctx} />;
    case 'html': {
      const text = decode(t.text.replace(/<[^>]*>/g, '').trim());
      return text ? <Text key={key} selectable style={[ctx.base, { color: c.faint }]}>{text}</Text> : null;
    }
    default:
      return 'raw' in t && t.raw.trim() ? <Text key={key} selectable style={ctx.base}>{t.raw.trim()}</Text> : null;
  }
}

// Text runs as one selectable Text each; an image between them gets the full width.
function paragraph(tokens: Token[], ctx: Ctx, key: number) {
  const parts: ReactNode[] = [];
  let run: Token[] = [];
  const flush = () => {
    if (run.some((t) => t.type !== 'text' || t.text.trim())) parts.push(<Text key={parts.length} selectable style={ctx.base}>{inline(run, ctx)}</Text>);
    run = [];
  };
  for (const t of tokens) {
    if (t.type === 'image') {
      flush();
      parts.push(<NoteImage key={parts.length} href={t.href} alt={t.text} ctx={ctx} />);
    } else run.push(t);
  }
  flush();
  return parts.length === 1 ? <View key={key}>{parts}</View> : <View key={key} style={{ gap: 16 }}>{parts}</View>;
}

function inline(tokens: Token[], ctx: Ctx): ReactNode[] {
  const { c } = ctx;
  return tokens.map((t, key) => {
    switch (t.type) {
      case 'text':
        return t.tokens ? <Text key={key}>{inline(t.tokens, ctx)}</Text> : decode(t.text);
      case 'escape':
        return t.text;
      case 'strong':
        return <Text key={key} style={{ fontWeight: '700' }}>{inline(t.tokens!, ctx)}</Text>;
      case 'em':
        return <Text key={key} style={{ fontStyle: 'italic' }}>{inline(t.tokens!, ctx)}</Text>;
      case 'del':
        return <Text key={key} style={{ textDecorationLine: 'line-through' }}>{inline(t.tokens!, ctx)}</Text>;
      case 'codespan': // thin spaces stand in for the padding a nested Text can't have
        return <Text key={key} style={{ fontFamily: mono, fontSize: 15, backgroundColor: c.code }}>{` ${decode(t.text)} `}</Text>;
      case 'br':
        return '\n';
      case 'html':
        return /^<br\s*\/?>$/i.test(t.text) ? '\n' : null;
      case 'image': // inside a link: its words stand in
        return t.text;
      case 'link': {
        const note = resolve(ctx.path, t.href);
        const web = /^(https?|mailto|tel):/i.test(t.href);
        const go = note?.endsWith('.md') ? () => ctx.onNote(note) : web ? () => Linking.openURL(t.href) : undefined;
        return (
          <Text key={key} accessibilityRole="link" onPress={go} style={{ color: c.accent, textDecorationLine: 'underline', textDecorationColor: c.link }}>
            {inline(t.tokens!, ctx)}
            {web ? ' ↗' : ''}
          </Text>
        );
      }
      default:
        return 'raw' in t ? t.raw : null;
    }
  });
}

function List({ list, ctx }: { list: Tokens.List; ctx: Ctx }) {
  const { c } = ctx;
  const start = typeof list.start === 'number' ? list.start : 1;
  return (
    <View style={{ gap: 6 }}>
      {list.items.map((item, i) => {
        const done = item.task && item.checked;
        const inner = done ? { ...ctx, base: { ...ctx.base, color: c.faint, textDecorationLine: 'line-through', textDecorationColor: c.box } as TextStyle } : ctx;
        return (
          <View key={i} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
            {item.task ? (
              <View accessibilityRole="image" accessibilityLabel={done ? 'Checked' : 'Not checked'} style={{ width: 20, height: 20, marginTop: 3, borderRadius: 5, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? c.accent : 'transparent', borderWidth: done ? 0 : 1.5, borderColor: c.box }}>
                {done && <Icon name="checkmark" size={12} color={c.onAccent} />}
              </View>
            ) : (
              <Text style={[ctx.base, { minWidth: list.ordered ? 22 : 12, textAlign: list.ordered ? 'right' : 'center', color: list.ordered ? ctx.base.color : c.faint }]}>{list.ordered ? `${start + i}.` : '•'}</Text>
            )}
            <View style={{ flex: 1, gap: 6 }}>{blocks(item.tokens.filter((t) => t.type !== 'checkbox'), inner)}</View>
          </View>
        );
      })}
    </View>
  );
}

// Scrolls sideways on its own, with a fade at each edge that has more to show.
function Sideways({ fade, grow, onScrolled, children }: { fade: string; grow?: boolean; onScrolled?: (scrolled: boolean) => void; children: ReactNode }) {
  const [width, setWidth] = useState(0);
  const [content, setContent] = useState(0);
  const [x, setX] = useState(0);
  const edge = (side: 'left' | 'right') => (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, [side]: 0, width: 36, backgroundImage: `linear-gradient(to ${side}, ${fade}00, ${fade})` }} />
  );
  return (
    <View style={{ flexGrow: grow ? 1 : 0 }}>
      <ScrollView
        horizontal
        contentContainerStyle={grow ? { flexGrow: 1 } : undefined}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        onContentSizeChange={setContent}
        onScroll={(e) => {
          setX(e.nativeEvent.contentOffset.x);
          onScrolled?.(e.nativeEvent.contentOffset.x > 1);
        }}
        scrollEventThrottle={32}
      >
        {children}
      </ScrollView>
      {x > 1 && edge('left')}
      {x + width < content - 1 && edge('right')}
    </View>
  );
}

// Laid out by columns, so each column is as wide as its widest cell; cells stay on one
// line, so the rows line up. The first column sits outside the scroll and stays put.
function Table({ table, ctx }: { table: Tokens.Table; ctx: Ctx }) {
  const { c } = ctx;
  const [scrolled, setScrolled] = useState(false);
  const rows = table.rows.length;
  const column = (col: number) =>
    [table.header[col], ...table.rows.map((r) => r[col])].map((cell, row) => (
      <View key={row} style={{ paddingVertical: 10, paddingHorizontal: 14, backgroundColor: row === 0 ? c.th : undefined, borderBottomWidth: row < rows ? 1 : 0, borderColor: c.line }}>
        <Text
          selectable
          numberOfLines={col === 0 ? 1 : undefined}
          style={{ fontSize: row === 0 ? 13 : 15, lineHeight: 20, fontWeight: row === 0 || col === 0 ? '600' : '400', color: row === 0 ? c.muted : c.ink, textAlign: table.align[col] ?? 'left' }}
        >
          {cell ? inline(cell.tokens, ctx) : ''}
        </Text>
      </View>
    ));
  return (
    <View style={{ flexDirection: 'row', borderRadius: 12, borderWidth: 1, borderColor: c.line, backgroundColor: c.card, overflow: 'hidden' }}>
      <View style={{ maxWidth: 160, zIndex: 1, backgroundColor: c.card, borderRightWidth: 1, borderColor: c.line, shadowColor: '#1C1B19', shadowOpacity: scrolled ? 0.08 : 0, shadowRadius: 10, shadowOffset: { width: 4, height: 0 } }}>{column(0)}</View>
      {table.header.length > 1 && (
        <View style={{ flex: 1 }}>
          <Sideways fade={c.card} grow onScrolled={setScrolled}>
            <View style={{ flexDirection: 'row', flexGrow: 1 }}>
              {table.header.slice(1).map((_, i) => (
                <View key={i} style={{ flexGrow: i === table.header.length - 2 ? 1 : 0 }}>{column(i + 1)}</View>
              ))}
            </View>
          </Sideways>
        </View>
      )}
    </View>
  );
}

function NoteImage({ href, alt, ctx }: { href: string; alt: string; ctx: Ctx }) {
  const [ratio, setRatio] = useState<number>();
  const [failed, setFailed] = useState(false);
  const path = resolve(ctx.path, href);
  const uri = path && cachedUri(path);
  const source = uri ? { uri } : path ? remoteSource(ctx.account, path) : /^https?:/i.test(href) ? { uri: href } : undefined;
  if (!source || failed) return alt ? <Text selectable style={[ctx.base, { color: ctx.c.faint, fontStyle: 'italic' }]}>{alt}</Text> : null;
  return (
    <Image
      source={source}
      accessibilityLabel={alt || undefined}
      onLoad={(e) => setRatio(e.nativeEvent.source.width / e.nativeEvent.source.height)}
      onError={() => setFailed(true)}
      resizeMode="contain"
      style={{ width: '100%', aspectRatio: ratio ?? 16 / 9, borderRadius: 12 }}
    />
  );
}
