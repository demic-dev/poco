import { requireNativeModule } from 'expo';

type PocoNative = {
  appGroup: string;
  containerPath: string | null;
  beginBackgroundTask(): number;
  endBackgroundTask(id: number): void;
};

export default requireNativeModule<PocoNative>('PocoNative');
