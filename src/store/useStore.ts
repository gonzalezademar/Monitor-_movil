import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ChatMessage {
  id: string;
  senderName: string;
  type: 'TEXT' | 'AUDIO';
  content: string; // text or base64 audio
  timestamp: number;
}

interface AppState {
  role: 'monitor' | 'client' | null;
  userName: string;
  masterServerId: string | null;
  myPeerId: string | null;
  setRole: (role: 'monitor' | 'client') => void;
  setUserName: (name: string) => void;
  setMasterServerId: (id: string) => void;
  setMyPeerId: (id: string) => void;
  isSOSActive: boolean;
  setSOSActive: (active: boolean) => void;
  fenceRadius: number;
  setFenceRadius: (r: number) => void;
  
  // Tactical Chat & Offline queue
  messages: ChatMessage[];
  offlineQueue: any[]; // Stores raw P2P objects to be sent later
  addMessage: (msg: ChatMessage) => void;
  enqueueOfflineAction: (action: any) => void;
  clearOfflineQueue: () => void;
  
  logout: () => void;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      role: null,
      userName: '',
      masterServerId: null,
      myPeerId: null,
      setRole: (role) => set({ role }),
      setUserName: (name) => set({ userName: name }),
      setMasterServerId: (id) => set({ masterServerId: id }),
      setMyPeerId: (id) => set({ myPeerId: id }),
      isSOSActive: false,
      setSOSActive: (active) => set({ isSOSActive: active }),
      fenceRadius: 100,
      setFenceRadius: (r) => set({ fenceRadius: r }),
      
      messages: [],
      offlineQueue: [],
      addMessage: (msg) => set((state) => ({ messages: [...state.messages, msg].slice(-50) })), // Keep last 50
      enqueueOfflineAction: (action) => set((state) => ({ offlineQueue: [...state.offlineQueue, action] })),
      clearOfflineQueue: () => set({ offlineQueue: [] }),

      logout: () => set({ role: null, userName: '', masterServerId: null, myPeerId: null, isSOSActive: false, fenceRadius: 100, messages: [], offlineQueue: [] })
    }),
    {
      name: 'radar-storage',
    }
  )
);
