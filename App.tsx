import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import * as BackgroundTask from 'expo-background-task';
import * as Haptics from 'expo-haptics';
import * as TaskManager from 'expo-task-manager';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Modal, Pressable, View } from 'react-native';
import PocoNative from './modules/poco-native';
import { countByDay, weekOf } from './src/days';
import { type Event, type NewEvent, overlay, stamp, todoFile } from './src/events';
import { DoneTab, doneTitle, type Moment, MomentView, SettingsScreen } from './src/rewards';
import { loadSettings, type Settings, saveSettings } from './src/settings';
import { type Account, loadAccount, publishWidget, queue, readEvents, readNotes, saveAccount, sync } from './src/sync';
import { CaptureSheet, Icon, type InboxItem, InboxScreen, isoDay, PickScreen, Screen, SetupScreen, type SyncState, type Tab, TabBar, TaskSheet, Toast, TodayScreen, useColors } from './src/ui';

const pending = () => {
  const e = readEvents();
  return [...e.waiting, ...e.sent];
};

// When iOS allows: send the outbox (the extensions' captures too), refresh, update the widget.
TaskManager.defineTask('sync', async () => {
  const account = await loadAccount().catch(() => null); // the keychain is closed while the phone is locked
  if (!account) return BackgroundTask.BackgroundTaskResult.Failed;
  try {
    await sync(account);
    publishWidget(overlay(readNotes(), pending()));
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

type Held = { events: Event[]; message: string };

// Sounds follow the silent switch and play over other audio.
const tick = createAudioPlayer(require('./assets/tick.wav'));
const chime = createAudioPlayer(require('./assets/chime.wav'));
setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' }).catch(() => {});

function feedback(settings: Settings, kind: 'light' | 'done' | 'pick') {
  if (settings.haptics) {
    if (kind === 'light') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    else if (kind === 'done') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
    else Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }
  if (settings.sounds) {
    const p = kind === 'light' ? tick : chime;
    p.seekTo(0).then(() => p.play());
  }
}

export default function App() {
  const c = useColors();
  const [account, setAccount] = useState<Account | null>();
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState(readNotes);
  const [events, setEvents] = useState(readEvents);
  const [status, setStatus] = useState<Omit<SyncState, 'waiting' | 'sent'>>({ syncedAt: notes.syncedAt });
  const [tab, setTab] = useState<Tab>('today');
  const [picking, setPicking] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [task, setTask] = useState<InboxItem>();
  const [settings, setSettings] = useState(loadSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [doneList, setDoneList] = useState(false);
  const [moment, setMoment] = useState<Moment>();
  const changeSettings = (s: Settings) => (setSettings(s), saveSettings(s));

  // Undo never sends anything: an event waits here 5 seconds before it's queued.
  const [held, setHeld] = useState<Held>();
  const heldRef = useRef<Held>(undefined);

  useEffect(() => void loadAccount().then(setAccount), []);
  useEffect(() => void BackgroundTask.registerTaskAsync('sync', { minimumInterval: 30 }).catch(() => {}), []);

  const reload = () => (setNotes(readNotes()), setEvents(readEvents()));

  const pull = useCallback(async () => {
    if (!account) return;
    try {
      await sync(account);
      setStatus({ ok: true, syncedAt: readNotes().syncedAt });
    } catch (e) {
      setStatus((s) => ({ ...s, ok: false, error: e instanceof Error ? e.message : String(e) }));
    } finally {
      reload();
    }
  }, [account]);

  const commit = useCallback(() => {
    const h = heldRef.current;
    if (!h) return false;
    heldRef.current = undefined;
    setHeld(undefined);
    queue(h.events);
    setEvents(readEvents());
    return true;
  }, []);

  const hold = (e: Event[], message: string) => {
    commit();
    heldRef.current = { events: e, message };
    setHeld(heldRef.current);
  };
  const undo = () => ((heldRef.current = undefined), setHeld(undefined));
  const send = (e: NewEvent) => (queue([stamp(e)]), setEvents(readEvents()), pull());

  useEffect(() => {
    if (!held) return;
    const t = setTimeout(() => commit() && pull(), 5000);
    return () => clearTimeout(t);
  }, [held, commit, pull]);

  useEffect(() => {
    pull();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') pull();
      if (s === 'background') {
        commit();
        if (!account) return;
        // iOS gives a few seconds after leaving the app; enough to upload the outbox.
        const id = PocoNative.beginBackgroundTask();
        sync(account)
          .catch(() => {})
          .finally(() => PocoNative.endBackgroundTask(id));
      }
    });
    return () => sub.remove();
  }, [pull, commit, account]);

  // poco://capture from the Lock Screen button, poco://today from the Next widget.
  useEffect(() => {
    const open = (url?: string | null) => {
      if (url?.startsWith('poco://capture')) setCapturing(true);
      else if (url?.startsWith('poco://today')) setTab('today');
    };
    Linking.getInitialURL().then(open);
    const sub = Linking.addEventListener('url', (e) => open(e.url));
    return () => sub.remove();
  }, []);

  const queued = [...events.waiting, ...events.sent];
  const view = overlay(notes, [...queued, ...(held?.events ?? [])]);
  useEffect(() => publishWidget(view));

  // A day whose picks were all done gets its stamp or flower; only today.md knows, so the phone keeps the list.
  const committed = overlay(notes, queued).today;
  const finishedToday = committed.date === isoDay() && committed.items.length > 0 && committed.items.every((i) => i.done);
  useEffect(() => {
    if (finishedToday && !settings.finished.includes(committed.date!)) changeSettings({ ...settings, finished: [...settings.finished, committed.date!] });
  });
  // Only days done.md agrees on: a remembered day whose done lines are gone (mock data, a reset) loses its stamp.
  const doneDays = new Set(view.done.map((d) => d.date));
  const finished = new Set(settings.finished.filter((d) => doneDays.has(d)));

  if (account === undefined) return <View style={{ flex: 1, backgroundColor: c.paper }} />;

  if (!account || editing) {
    return (
      <SetupScreen
        initial={account ?? undefined}
        onCancel={account ? () => setEditing(false) : undefined}
        onSave={async (a) => {
          await sync(a); // throws on a wrong URL or password, and the form shows why
          await saveAccount(a);
          reload();
          setStatus({ ok: true, syncedAt: readNotes().syncedAt });
          setAccount(a);
          setEditing(false);
        }}
      />
    );
  }

  const state: SyncState = { ...status, waiting: events.waiting.length + (held?.events.length ?? 0), sent: events.sent.length };
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long' }) + ', ' + new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
  const picked = view.today.date === isoDay() ? view.today.items : [];
  const pickable = view.tasks.filter((t) => !picked.some((i) => i.text === t.text && (i.project ?? '') === t.project));

  return (
    <View style={{ flex: 1, backgroundColor: c.paper }}>
      {tab === 'today' && (
        <Screen title="Today" subtitle={today} sync={state} onRefresh={pull}>
          <TodayScreen
            today={view.today}
            tasks={view.tasks}
            onPick={() => setPicking(true)}
            onDone={(i) => {
              feedback(settings, 'done');
              const e = stamp({ type: 'done', file: 'today.md', line: i.line });
              const after = overlay(notes, [...queued, ...(held?.events ?? []), e]);
              hold([e], 'Done');
              const day = isoDay();
              const picks = after.today.date === day ? after.today.items : [];
              const allDone = picks.length > 0 && picks.every((x) => x.done);
              if (settings.reward === 'garden') {
                const week = weekOf(day, settings.weekStart);
                const counts = countByDay(after.done);
                setMoment({
                  kind: 'leaf',
                  text: i.text,
                  leaves: week.reduce((n, d) => n + (counts.get(d) ?? 0), 0),
                  flowers: week.filter((d) => finished.has(d) || (allDone && d === day)).length,
                  finished: allDone,
                  next: picks.find((x) => !x.done)?.text,
                });
              } else if (allDone) setMoment({ kind: 'stamp', date: day, count: picks.length });
            }}
            onMoveDown={(i) => hold([stamp({ type: 'move-down', date: view.today.date!, line: i.line })], 'Moved down')}
          />
        </Screen>
      )}
      {tab === 'inbox' && (
        <Screen title="Inbox" subtitle="Read here, sort on the laptop" sync={state} onRefresh={pull}>
          <InboxScreen inbox={view.inbox} onItem={setTask} />
        </Screen>
      )}
      {tab === 'done' && (
        <Screen
          title="Done"
          subtitle={doneTitle(settings, view.done, finished, doneList)}
          sync={state}
          onRefresh={pull}
          right={
            <Pressable accessibilityRole="button" accessibilityLabel="Settings" onPress={() => setShowSettings(true)} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="slider.horizontal.3" size={24} color={c.faint} />
            </Pressable>
          }
        >
          <DoneTab done={view.done} finished={finished} settings={settings} list={doneList} onList={setDoneList} />
        </Screen>
      )}
      {held && <Toast message={held.message} onUndo={undo} />}
      <MomentView moment={moment} onClose={() => setMoment(undefined)} onUndo={held ? () => (undo(), setMoment(undefined)) : undefined} />
      <SettingsScreen
        visible={showSettings}
        settings={settings}
        onChange={changeSettings}
        onClose={() => setShowSettings(false)}
        account={account}
        syncedAt={status.syncedAt}
        waiting={state.waiting + state.sent}
        onEditAccount={() => (setShowSettings(false), setEditing(true))}
      />
      <TabBar tab={tab} onTab={setTab} onCapture={() => setCapturing(true)} />
      <CaptureSheet
        visible={capturing}
        onClose={() => setCapturing(false)}
        onSave={(text, toTodo) => {
          feedback(settings, 'light');
          const capture = stamp({ type: 'capture', text });
          if (!toTodo) return hold([capture], 'Saved to inbox');
          // A millisecond later, so the applier, going in name order, sees the capture first.
          const make = stamp({ type: 'make-task', file: 'TODO.md', capture: capture.id }, new Date(Date.parse(capture.time) + 1));
          hold([capture, make], 'Added to TODO.md');
        }}
      />
      <TaskSheet
        item={task}
        todos={notes.todos}
        weekStart={settings.weekStart}
        onClose={() => setTask(undefined)}
        onMake={(file, date) => {
          feedback(settings, 'light');
          hold([stamp({ type: 'make-task', file, date, ...(task!.capture ? { capture: task!.capture } : { line: task!.line }) })], `Added to ${file}`);
        }}
      />
      <Modal visible={picking} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setPicking(false)}>
        <PickScreen
          tasks={pickable}
          files={notes.todos.length}
          max={settings.maxPicks}
          inboxCount={view.inbox.length}
          onClose={() => setPicking(false)}
          onInbox={() => (setPicking(false), setTab('inbox'))}
          onStart={(chosen) => {
            feedback(settings, 'pick');
            send({ type: 'pick', date: isoDay(), items: chosen.map((t) => ({ file: todoFile(t.project), line: t.line })) });
            setPicking(false);
          }}
        />
      </Modal>
    </View>
  );
}
