import { useEffect, useState, useSyncExternalStore } from 'react';
import { VoiceSessionController } from './controller';

export function useVoiceSession() {
  const [controller] = useState(() => new VoiceSessionController());
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  useEffect(() => () => controller.stop(), [controller]);
  return {
    snapshot,
    start: controller.start,
    stop: controller.stop,
    setMuted: controller.setMuted,
    interrupt: controller.interrupt,
    apply: controller.apply,
  };
}
