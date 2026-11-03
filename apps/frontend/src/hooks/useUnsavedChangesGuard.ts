import { useEffect } from 'react';
import { useBlocker } from 'react-router-dom';

// Guards unsaved form changes: shows the browser's own prompt on refresh / tab close,
// and returns a router blocker that is 'blocked' when an in-app navigation needs confirming
export function useUnsavedChangesGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  return useBlocker(({ currentLocation, nextLocation }) =>
    dirty && currentLocation.pathname !== nextLocation.pathname);
}
