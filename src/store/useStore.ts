import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
      logout: () => set({ role: null, userName: '', masterServerId: null, myPeerId: null })
    }),
    {
      name: 'radar-storage',
    }
  )
);
