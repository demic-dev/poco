import { ExtensionStorage } from '@bacons/apple-targets';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Modal, View } from 'react-native';
import { type Account, loadAccount, readNotes, refresh, saveAccount, shared } from './src/sync';
import { DoneScreen, InboxScreen, isoDay, PickScreen, Screen, SetupScreen, type SyncState, type Tab, TabBar, TodayScreen, useColors } from './src/ui';

export default function App() {
  const c = useColors();
  const [account, setAccount] = useState<Account | null>();
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState(readNotes);
  const [sync, setSync] = useState<SyncState>({ syncedAt: notes.syncedAt });
  const [tab, setTab] = useState<Tab>('today');
  const [picking, setPicking] = useState(false);

  useEffect(() => void loadAccount().then(setAccount), []);

  const pull = useCallback(async () => {
    if (!account) return;
    try {
      await refresh(account);
      const n = readNotes();
      setNotes(n);
      setSync({ ok: true, syncedAt: n.syncedAt });
    } catch (e) {
      setSync((s) => ({ ...s, ok: false, error: e instanceof Error ? e.message : String(e) }));
    }
  }, [account]);

  useEffect(() => {
    pull();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && pull());
    return () => sub.remove();
  }, [pull]);

  // The widget shows Next (phase 5 gives it its real look).
  const next = notes.today.date === isoDay() ? notes.today.items.find((i) => !i.done) : undefined;
  useEffect(() => {
    shared.set('value', next?.text ?? 'Nothing next');
    ExtensionStorage.reloadWidget();
  }, [next?.text]);

  if (account === undefined) return <View style={{ flex: 1, backgroundColor: c.paper }} />;

  if (!account || editing) {
    return (
      <SetupScreen
        initial={account ?? undefined}
        onCancel={account ? () => setEditing(false) : undefined}
        onSave={async (a) => {
          await refresh(a); // throws on a wrong URL or password, and the form shows why
          await saveAccount(a);
          const n = readNotes();
          setNotes(n);
          setSync({ ok: true, syncedAt: n.syncedAt });
          setAccount(a);
          setEditing(false);
        }}
      />
    );
  }

  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long' }) + ', ' + new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
  const todoFiles = new Set(notes.tasks.map((t) => t.project)).size;

  return (
    <View style={{ flex: 1, backgroundColor: c.paper }}>
      {tab === 'today' && (
        <Screen title="Today" subtitle={today} sync={sync} onRefresh={pull}>
          <TodayScreen today={notes.today} tasks={notes.tasks} onPick={() => setPicking(true)} />
        </Screen>
      )}
      {tab === 'inbox' && (
        <Screen title="Inbox" subtitle="Read here, sort on the laptop" sync={sync} onRefresh={pull}>
          <InboxScreen inbox={notes.inbox} />
        </Screen>
      )}
      {tab === 'done' && (
        <Screen title="Done" subtitle="Settings live here for now" sync={sync} onRefresh={pull}>
          <DoneScreen account={account} sync={sync} onEditAccount={() => setEditing(true)} />
        </Screen>
      )}
      <TabBar tab={tab} onTab={setTab} />
      <Modal visible={picking} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setPicking(false)}>
        <PickScreen
          tasks={notes.tasks}
          files={todoFiles}
          inboxCount={notes.inbox.length}
          onClose={() => setPicking(false)}
          onInbox={() => (setPicking(false), setTab('inbox'))}
        />
      </Modal>
    </View>
  );
}
