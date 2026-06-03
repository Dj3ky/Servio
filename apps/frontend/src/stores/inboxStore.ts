import { create } from 'zustand';

export interface InboxMessage {
  uid: number;
  from: string;
  subject: string;
  date: string;
  seen: boolean;
}

interface InboxState {
  unreadCount: number;
  messages: InboxMessage[];
  enabled: boolean;
  setInbox: (enabled: boolean, unreadCount: number, messages: InboxMessage[]) => void;
  setUnreadCount: (count: number) => void;
  markSeen: (uid: number) => void;
}

export const useInboxStore = create<InboxState>()((set) => ({
  unreadCount: 0,
  messages: [],
  enabled: false,
  setInbox: (enabled, unreadCount, messages) => set({ enabled, unreadCount, messages }),
  setUnreadCount: (unreadCount) => set({ unreadCount }),
  markSeen: (uid) =>
    set((state) => ({
      messages: state.messages.map((m) => (m.uid === uid ? { ...m, seen: true } : m)),
      unreadCount: Math.max(0, state.unreadCount - (state.messages.find((m) => m.uid === uid && !m.seen) ? 1 : 0)),
    })),
}));
