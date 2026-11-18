'use client';

/**
 * Whether the browser currently has no connection (`screens/03` and `screens/04` Offline states).
 *
 * This is the one fact a server render cannot know, so it is the only reason these forms hydrate
 * beyond the submit indicator: the banner states the reason in text, the primary control is
 * disabled with the same reason, and the held form is exactly what the DOM already holds. Without
 * scripting the banner does not render and the control stays enabled — the submission then fails
 * the way an offline POST always has, and the flow cookies bring the visitor back to an intact
 * form (`apps/web/AGENTS.md`, server first).
 */
import { useEffect, useState } from 'react';

/** Reads the browser's connection state and follows its change events. */
export function useOffline(): boolean {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    setOffline(!navigator.onLine);
    const goOffline = (): void => setOffline(true);
    const goOnline = (): void => setOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  return offline;
}
