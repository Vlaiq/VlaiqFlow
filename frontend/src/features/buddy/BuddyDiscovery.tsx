import { useEffect, useState } from 'react';
import { BuddyIntroCard } from './BuddyIntroCard';
import { accountBuddy } from './accountClient';
export function BuddyDiscovery({ onOpen }: { onOpen(): void }) {
  const [completed, setCompleted] = useState<number>();
  useEffect(() => {
    const c = new AbortController();
    accountBuddy
      .state(c.signal)
      .then((s) => {
        if (!c.signal.aborted) setCompleted(s.progress.completed.length);
      })
      .catch(() => {});
    return () => c.abort();
  }, []);
  return (
    <div className="flow-page" style={{ paddingBottom: 0 }}>
      <BuddyIntroCard completed={completed} onOpen={onOpen} />
    </div>
  );
}
