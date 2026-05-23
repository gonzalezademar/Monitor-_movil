import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ChatMessage {
  id: string;
  senderName: string;
  type: 'TEXT' | 'AUDIO' | 'IMAGE';
  content: string; // text, base64 audio, or base64 image
  timestamp: number;
}

interface AppState {
  role: 'monitor' | 'client' | null;
  userName: string;
  masterServerId: string | null;
  myPeerId: string | null;
  setRole: (role: 'monitor' | 'client') => void;
  setUserName: (name: string) => void;
  avatarBase64: string | null;
  setAvatar: (base64: string) => void;
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
  cleanOldMessages: () => void;
  enqueueOfflineAction: (action: any) => void;
  clearOfflineQueue: () => void;
  
  logout: () => void;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      role: null,
      userName: '',
      avatarBase64: null,
      masterServerId: null,
      myPeerId: null,
      setRole: (role) => set({ role }),
      setUserName: (name) => set({ userName: name }),
      setAvatar: (base64) => set({ avatarBase64: base64 }),
      setMasterServerId: (id) => set({ masterServerId: id }),
      setMyPeerId: (id) => set({ myPeerId: id }),
      isSOSActive: false,
      setSOSActive: (active) => set({ isSOSActive: active }),
      fenceRadius: 100,
      setFenceRadius: (r) => set({ fenceRadius: r }),
      
      messages: [],
      offlineQueue: [],
      addMessage: (msg) => set((state) => ({ messages: [...state.messages, msg].slice(-15) })), // Keep last 15
      cleanOldMessages: () => set((state) => ({ 
        messages: state.messages.filter(m => Date.now() - m.timestamp < 24 * 60 * 60 * 1000) 
      })),
      enqueueOfflineAction: (action) => set((state) => ({ offlineQueue: [...state.offlineQueue, action] })),
      clearOfflineQueue: () => set({ offlineQueue: [] }),

      logout: () => set({ role: null, userName: '', avatarBase64: null, masterServerId: null, myPeerId: null, isSOSActive: false, fenceRadius: 100, messages: [], offlineQueue: [] })
    }),
    {
      name: 'radar-storage',
      partialize: (state) => ({
        ...state,
        messages: state.messages.map(m => 
          m.type === 'AUDIO' ? { ...m, type: 'TEXT', content: '[Audio caducado por ahorro de memoria]' } :
          m.type === 'IMAGE' ? { ...m, type: 'TEXT', content: '[Imagen caducada por ahorro de memoria]' } : m
        )
      })
    }
  )
);
