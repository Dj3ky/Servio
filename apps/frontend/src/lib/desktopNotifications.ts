import { canPlayNotificationSound, isSoundMuted } from './notificationSound';

// Windows / OS notifications through the browser Notification API.
// Only available in secure contexts (HTTPS or localhost) and while the app is open (even minimized).

export function desktopNotificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window && window.isSecureContext;
}

export function desktopNotificationPermission(): NotificationPermission | 'unsupported' {
  return desktopNotificationsSupported() ? Notification.permission : 'unsupported';
}

export async function requestDesktopNotifications(): Promise<NotificationPermission | 'unsupported'> {
  if (!desktopNotificationsSupported()) return 'unsupported';
  return Notification.requestPermission();
}

// The same `tag` from several open tabs collapses into one notification
export function showDesktopNotification(opts: { title: string; body: string; tag: string; onClick?: () => void }): boolean {
  if (desktopNotificationPermission() !== 'granted') return false;
  try {
    // Windows' own sound is unreliable, so our chime replaces it whenever the chime can play.
    // Before the first click in the app it can't, so Windows' sound is left on as the fallback.
    const silent = isSoundMuted() || canPlayNotificationSound();
    const n = new Notification(opts.title, { body: opts.body, tag: opts.tag, icon: '/icons/icon-192.svg', silent });
    n.onclick = () => {
      window.focus();
      opts.onClick?.();
      n.close();
    };
    return true;
  } catch {
    // Some browsers only allow notifications from a service worker
    return false;
  }
}

// Where clicking a notification should take the user
export function notificationLink(n: { entityType?: string | null; entityId?: string | null }): string | null {
  if (n.entityType === 'pm_project' && n.entityId) return `/pm/projects/${n.entityId}`;
  return null;
}
