import { ExtensionStorage } from '@bacons/apple-targets';
import { File, Paths } from 'expo-file-system';
import { useState } from 'react';
import { Button, StyleSheet, Text, TextInput, View } from 'react-native';

const BASE = 'group.dev.demic.poco';

// SideStore re-signs with the free Apple ID and renames App Groups to
// `group.dev.demic.poco.<TEAMID>`, so read the real one from our profile.
function findAppGroup(): string {
  try {
    const bytes = new File(Paths.bundle, 'embedded.mobileprovision').bytesSync();
    const raw = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
    return raw.match(/<string>(group\.dev\.demic\.poco[^<]*)<\/string>/)?.[1] ?? BASE;
  } catch {
    return BASE;
  }
}

const appGroup = findAppGroup();
const storage = new ExtensionStorage(appGroup);

export default function App() {
  const [text, setText] = useState('');
  const [saved, setSaved] = useState(() => storage.get('value') ?? '');

  function save() {
    storage.set('value', text);
    ExtensionStorage.reloadWidget();
    setSaved(storage.get('value') ?? '');
  }

  return (
    <View style={styles.container}>
      <Text>App Group: {appGroup}</Text>
      <Text>Stored: {saved || '(nothing)'}</Text>
      <TextInput style={styles.input} value={text} onChangeText={setText} onSubmitEditing={save} placeholder="Value for the widget" />
      <Button title="Save" onPress={save} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F6F2', justifyContent: 'center', padding: 24, gap: 12 },
  input: { borderWidth: 1, borderColor: '#1C1B19', padding: 8 },
});
