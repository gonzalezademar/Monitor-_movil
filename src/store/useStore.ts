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
  familyCode: string | null;
  tutorSlot: 'T1' | 'T2' | null;
  setRole: (role: 'monitor' | 'client') => void;
  setUserName: (name: string) => void;
  avatarBase64: string | null;
  setAvatar: (base64: string) => void;
  setMasterServerId: (id: string) => void;
  setMyPeerId: (id: string) => void;
  setFamilyCode: (code: string | null) => void;
  setTutorSlot: (slot: 'T1' | 'T2' | null) => void;
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
      familyCode: null,
      tutorSlot: null,
      setRole: (role) => set({ role }),
      setUserName: (name) => set({ userName: name }),
      setAvatar: (base64) => set({ avatarBase64: base64 }),
      setMasterServerId: (id) => set({ masterServerId: id }),
      setMyPeerId: (id) => set({ myPeerId: id }),
      setFamilyCode: (code) => set({ familyCode: code }),
      setTutorSlot: (slot) => set({ tutorSlot: slot }),
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

      logout: () => set({ role: null, userName: '', avatarBase64: null, masterServerId: null, myPeerId: null, familyCode: null, tutorSlot: null, isSOSActive: false, fenceRadius: 100, messages: [], offlineQueue: [] })
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

export const playTonalSound = (type: 'CHAT_RECEIVE' | 'P2P_HANDSHAKE' | 'P2P_LOST' | 'GEOFENCE_BREACH' | 'PTT_START') => {
  try {
    if (!(window as any).globalAudioCtx) {
      (window as any).globalAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    const ctx = (window as any).globalAudioCtx;
    if (!ctx) return;
    
    // Auto-resume if context was suspended by browser autoplays
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;

    switch (type) {
      case 'CHAT_RECEIVE':
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.12, now);
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.setValueAtTime(1100, now + 0.08);
        gain.gain.setValueAtTime(0, now + 0.16);
        osc.start(now);
        osc.stop(now + 0.16);
        break;

      case 'P2P_HANDSHAKE':
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.08, now);
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
        break;

      case 'P2P_LOST':
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.08, now);
        osc.frequency.setValueAtTime(480, now);
        osc.frequency.exponentialRampToValueAtTime(240, now + 0.3);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
        break;

      case 'GEOFENCE_BREACH':
        osc.type = 'triangle';
        gain.gain.setValueAtTime(0.15, now);
        osc.frequency.setValueAtTime(580, now);
        gain.gain.setValueAtTime(0, now + 0.1);
        
        gain.gain.setValueAtTime(0.15, now + 0.2);
        osc.frequency.setValueAtTime(580, now + 0.2);
        gain.gain.setValueAtTime(0, now + 0.3);
        
        gain.gain.setValueAtTime(0.15, now + 0.4);
        osc.frequency.setValueAtTime(580, now + 0.4);
        gain.gain.setValueAtTime(0, now + 0.5);

        osc.start(now);
        osc.stop(now + 0.5);
        break;

      case 'PTT_START':
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.08, now);
        osc.frequency.setValueAtTime(520, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.05);
        break;
    }
  } catch (e) {
    console.warn("Could not play tonal sound:", e);
  }
};

// Desbloqueador nativo en interacción de usuario para Web Audio API
const unlockAudio = () => {
  if (!(window as any).globalAudioCtx) {
    (window as any).globalAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  const ctx = (window as any).globalAudioCtx;
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().then(() => {
      document.removeEventListener('click', unlockAudio);
      document.removeEventListener('touchstart', unlockAudio);
    }).catch((e: any) => console.warn("Failed to resume AudioContext:", e));

  } else if (ctx && ctx.state === 'running') {
    document.removeEventListener('click', unlockAudio);
    document.removeEventListener('touchstart', unlockAudio);
  }
};

if (typeof window !== 'undefined') {
  document.addEventListener('click', unlockAudio);
  document.addEventListener('touchstart', unlockAudio);
}

