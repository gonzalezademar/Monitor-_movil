import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '../supabaseClient';

export interface ChatMessage {
  id: string;
  senderName: string;
  type: 'TEXT' | 'AUDIO' | 'IMAGE';
  content: string; // text, base64 audio, or base64 image
  timestamp: number;
}

export interface SafeZone {
  id: string;
  family_id: string;
  child_id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius: number;
  is_active: boolean;
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
  fenceCenterLat: number | null;
  fenceCenterLng: number | null;
  setFenceCenter: (lat: number | null, lng: number | null) => void;
  
  // Safe Zones
  safeZones: SafeZone[];
  setSafeZones: (zones: SafeZone[]) => void;
  fetchSafeZones: () => Promise<void>;
  addSafeZone: (zone: Omit<SafeZone, 'id' | 'family_id'>) => Promise<{ error: string | null }>;
  updateSafeZone: (zone: SafeZone) => Promise<{ error: string | null }>;
  deleteSafeZone: (id: string) => Promise<{ error: string | null }>;
  toggleSafeZone: (id: string, active: boolean) => Promise<{ error: string | null }>;
  
  // Tactical Chat & Offline queue
  messages: ChatMessage[];
  offlineQueue: any[]; // Stores raw P2P objects to be sent later
  addMessage: (msg: ChatMessage) => void;
  cleanOldMessages: () => void;
  enqueueOfflineAction: (action: any) => void;
  clearOfflineQueue: () => void;
  
  logout: () => void;
  appVersion: string;
  updateAvailable: string | null;
  latestReleaseUrl: string;
  isCheckingUpdates: boolean;
  updateCheckResult: 'no_updates' | 'found' | 'error' | null;
  checkUpdates: () => Promise<void>;
  resetUpdateCheckResult: () => void;

  // Supabase Authentication & Session State
  userId: string | null;
  userEmail: string | null;
  familyId: string | null;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, name: string, role: 'monitor' | 'client', avatar: string | null) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  joinFamily: (familyCode: string) => Promise<{ error: string | null }>;
  loadSession: () => Promise<void>;
  unlinkFamily: () => Promise<{ error: string | null }>;
  updateTrackingStatus: (targetUserId: string, enabled: boolean, expiresAt?: string | null) => Promise<{ error: string | null }>;
}


export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      role: null as 'monitor' | 'client' | null,
      userName: '',
      avatarBase64: null as string | null,
      masterServerId: null as string | null,
      myPeerId: null as string | null,
      familyCode: null as string | null,
      tutorSlot: null as 'T1' | 'T2' | null,
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
      fenceCenterLat: null,
      fenceCenterLng: null,
      setFenceCenter: (lat, lng) => set({ fenceCenterLat: lat, fenceCenterLng: lng }),
      
      safeZones: [] as SafeZone[],
      setSafeZones: (zones) => set({ safeZones: zones }),
      fetchSafeZones: async () => {
        const familyId = get().familyId;
        if (!familyId) return;
        try {
          const { data, error } = await supabase
            .from('safe_zones')
            .select('*')
            .eq('family_id', familyId);
          if (error) {
            console.warn("Supabase safe_zones error, using local fallback:", error.message);
            return;
          }
          if (data) {
            const formatted = data.map((z: any) => ({
              id: z.id,
              family_id: z.family_id,
              child_id: z.child_id,
              name: z.name,
              latitude: z.latitude,
              longitude: z.longitude,
              radius: z.radius,
              is_active: z.is_active
            }));
            set({ safeZones: formatted });
          }
        } catch (e: any) {
          console.warn("Failed to fetch safe zones from Supabase:", e);
        }
      },
      addSafeZone: async (zone) => {
        const familyId = get().familyId;
        if (!familyId) return { error: "No hay grupo familiar" };
        const id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2);
        const newZone: SafeZone = { ...zone, id, family_id: familyId };
        
        set((state) => ({ safeZones: [...state.safeZones, newZone] }));

        try {
          const { error } = await supabase.from('safe_zones').insert({
            id,
            family_id: familyId,
            child_id: zone.child_id,
            name: zone.name,
            latitude: zone.latitude,
            longitude: zone.longitude,
            radius: zone.radius,
            is_active: zone.is_active
          });
          if (error) {
            console.warn("Failed to insert safe zone to Supabase, local-only saved:", error.message);
          }
        } catch (e: any) {
          console.warn("Exception inserting safe zone to Supabase:", e);
        }
        return { error: null };
      },
      updateSafeZone: async (zone) => {
        set((state) => ({
          safeZones: state.safeZones.map(z => z.id === zone.id ? zone : z)
        }));

        try {
          const { error } = await supabase.from('safe_zones').update({
            child_id: zone.child_id,
            name: zone.name,
            latitude: zone.latitude,
            longitude: zone.longitude,
            radius: zone.radius,
            is_active: zone.is_active
          }).eq('id', zone.id);
          if (error) {
            console.warn("Failed to update safe zone in Supabase, updated locally:", error.message);
          }
        } catch (e: any) {
          console.warn("Exception updating safe zone in Supabase:", e);
        }
        return { error: null };
      },
      deleteSafeZone: async (id) => {
        set((state) => ({
          safeZones: state.safeZones.filter(z => z.id !== id)
        }));

        try {
          const { error } = await supabase.from('safe_zones').delete().eq('id', id);
          if (error) {
            console.warn("Failed to delete safe zone from Supabase, deleted locally:", error.message);
          }
        } catch (e: any) {
          console.warn("Exception deleting safe zone from Supabase:", e);
        }
        return { error: null };
      },
      toggleSafeZone: async (id, active) => {
        set((state) => ({
          safeZones: state.safeZones.map(z => z.id === id ? { ...z, is_active: active } : z)
        }));

        try {
          const { error } = await supabase.from('safe_zones').update({ is_active: active }).eq('id', id);
          if (error) {
            console.warn("Failed to toggle safe zone in Supabase, toggled locally:", error.message);
          }
        } catch (e: any) {
          console.warn("Exception toggling safe zone in Supabase:", e);
        }
        return { error: null };
      },
      
      messages: [] as ChatMessage[],
      offlineQueue: [] as any[],
      addMessage: (msg) => set((state) => ({ messages: [...state.messages, msg].slice(-15) })), // Keep last 15
      cleanOldMessages: () => set((state) => ({ 
         messages: state.messages.filter(m => Date.now() - m.timestamp < 24 * 60 * 60 * 1000) 
      })),
      enqueueOfflineAction: (action) => set((state) => ({ offlineQueue: [...state.offlineQueue, action] })),
      clearOfflineQueue: () => set({ offlineQueue: [] }),

      appVersion: '1.0.0',
      updateAvailable: null as string | null,
      latestReleaseUrl: '',
      isCheckingUpdates: false,
      updateCheckResult: null as 'no_updates' | 'found' | 'error' | null,
      resetUpdateCheckResult: () => set({ updateCheckResult: null }),
      checkUpdates: async () => {
        set({ isCheckingUpdates: true, updateCheckResult: null });
        try {
          const response = await fetch('https://api.github.com/repos/gonzalezademar/Monitor-_movil/releases/latest');
          if (!response.ok) {
            if (response.status === 404) {
              set({ 
                updateAvailable: null,
                updateCheckResult: 'no_updates',
                isCheckingUpdates: false
              });
            } else {
              set({ isCheckingUpdates: false, updateCheckResult: 'error' });
            }
            return;
          }
          const data = await response.json();
          const remoteVersion = data.tag_name;
          if (!remoteVersion) {
            set({ isCheckingUpdates: false, updateCheckResult: 'error' });
            return;
          }
          
          const local = '1.0.0';
          const cleanLocal = local.replace(/^v/, '');
          const cleanRemote = remoteVersion.replace(/^v/, '');
          
          const localParts = cleanLocal.split('.').map(Number);
          const remoteParts = cleanRemote.split('.').map(Number);
          
          let isNewer = false;
          for (let i = 0; i < Math.max(localParts.length, remoteParts.length); i++) {
            const locVal = localParts[i] || 0;
            const remVal = remoteParts[i] || 0;
            if (remVal > locVal) {
              isNewer = true;
              break;
            } else if (remVal < locVal) {
              break;
            }
          }
          
          if (isNewer) {
            set({ 
              updateAvailable: remoteVersion,
              latestReleaseUrl: data.html_url || 'https://github.com/gonzalezademar/Monitor-_movil/releases/latest',
              updateCheckResult: 'found',
              isCheckingUpdates: false
            });
          } else {
            set({ 
              updateAvailable: null,
              updateCheckResult: 'no_updates',
              isCheckingUpdates: false
            });
          }
        } catch (e) {
          console.log('Error checking updates:', e);
          set({ isCheckingUpdates: false, updateCheckResult: 'error' });
        }
      },

      // Supabase Authentication & Session State
      userId: null as string | null,
      userEmail: null as string | null,
      familyId: null as string | null,

      loadSession: async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (session && session.user) {
          const u = session.user;
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', u.id)
            .single();

          if (profile) {
            set({
              userId: u.id,
              userEmail: u.email || null,
              userName: profile.name,
              avatarBase64: profile.avatar,
              role: profile.role,
              familyCode: profile.family_id,
              familyId: profile.family_id,
              masterServerId: profile.family_id,
            });
            get().fetchSafeZones();
          }
        }
      },

      signIn: async (email, password) => {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) return { error: error.message };
        
        if (data.user) {
          const u = data.user;
          const { data: profile, error: profErr } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', u.id)
            .maybeSingle();

          if (profErr || !profile) {
            // Profile is missing! Let's auto-create a default profile to heal this user
            let defaultFamilyId: string | null = null;
            
            // Try to create a family first
            const { data: family, error: famErr } = await supabase
              .from('families')
              .insert({})
              .select()
              .single();
            
            if (!famErr && family) {
              defaultFamilyId = family.id;
            }

            const defaultName = u.email ? u.email.split('@')[0] : 'Usuario';
            
            const { error: insertErr } = await supabase
              .from('profiles')
              .insert({
                id: u.id,
                email: u.email,
                name: defaultName,
                role: 'monitor',
                avatar: null,
                family_id: defaultFamilyId
              });

            if (insertErr) {
              return { error: "No se encontró el perfil y no pudo ser auto-creado: " + insertErr.message };
            }

            if (defaultFamilyId) {
              await supabase.from('alerts').insert({
                family_id: defaultFamilyId,
                is_sos_active: false,
                siren_active: false
              });
            }

            set({
              userId: u.id,
              userEmail: u.email || null,
              userName: defaultName,
              avatarBase64: null,
              role: 'monitor',
              familyCode: defaultFamilyId,
              familyId: defaultFamilyId,
              masterServerId: defaultFamilyId,
            });

            return { error: null };
          }

          // Self-healing: If user is a monitor but has no family_id, create it now
          let activeFamilyId = profile.family_id;
          if (profile.role === 'monitor' && !activeFamilyId) {
            const { data: family, error: famErr } = await supabase
              .from('families')
              .insert({})
              .select()
              .single();
            
            if (!famErr && family) {
              activeFamilyId = family.id;
              await supabase
                .from('profiles')
                .update({ family_id: activeFamilyId })
                .eq('id', u.id);

              await supabase.from('alerts').insert({
                family_id: activeFamilyId,
                is_sos_active: false,
                siren_active: false
              });
            }
          }

          set({
            userId: u.id,
            userEmail: u.email || null,
            userName: profile.name,
            avatarBase64: profile.avatar,
            role: profile.role,
            familyCode: activeFamilyId,
            familyId: activeFamilyId,
            masterServerId: activeFamilyId,
          });
          get().fetchSafeZones();
        }
        return { error: null };
      },

      signUp: async (email, password, name, role, avatar) => {
        let signUpData;
        let signUpError;
        
        // 1. Attempt to sign up the user, redirecting back to the current web path (handles hosting / subfolders correctly)
        const res = await supabase.auth.signUp({ 
          email, 
          password,
          options: {
            emailRedirectTo: window.location.origin + window.location.pathname
          }
        });
        signUpData = res.data;
        signUpError = res.error;

        let user = signUpData?.user;

        // 2. If it fails with "already registered", try to sign in and heal the profile
        if (signUpError && (
          signUpError.message.toLowerCase().includes('already exists') || 
          signUpError.message.toLowerCase().includes('already registered') ||
          signUpError.message.toLowerCase().includes('use another email') ||
          (signUpError as any).status === 422
        )) {
          // Attempt sign in with the provided password
          const signInRes = await supabase.auth.signInWithPassword({ email, password });
          if (signInRes.error) {
            return { error: "Este correo ya está registrado con otra contraseña." };
          }
          user = signInRes.data.user;
        } else if (signUpError) {
          return { error: signUpError.message };
        }

        if (user) {
          const u = user;
          let newFamilyId: string | null = null;

          // Check if profile already exists
          const { data: existingProfile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', u.id)
            .maybeSingle();

          if (existingProfile) {
            // Profile already exists! Load it and self-heal if it's a monitor without family_id
            let activeFamilyId = existingProfile.family_id;
            if (existingProfile.role === 'monitor' && !activeFamilyId) {
              const { data: family, error: famErr } = await supabase
                .from('families')
                .insert({})
                .select()
                .single();
              
              if (!famErr && family) {
                activeFamilyId = family.id;
                await supabase
                  .from('profiles')
                  .update({ family_id: activeFamilyId })
                  .eq('id', u.id);

                await supabase.from('alerts').insert({
                  family_id: activeFamilyId,
                  is_sos_active: false,
                  siren_active: false
                });
              }
            }

            set({
              userId: u.id,
              userEmail: u.email || null,
              userName: existingProfile.name,
              avatarBase64: existingProfile.avatar,
              role: existingProfile.role,
              familyCode: activeFamilyId,
              familyId: activeFamilyId,
              masterServerId: activeFamilyId,
            });
            get().fetchSafeZones();
            return { error: null };
          }

          // Profile does not exist, create it!
          // Note: If email confirmation is enabled, these inserts might fail due to RLS if the session is not yet active.
          if (role === 'monitor') {
            const { data: family, error: famErr } = await supabase
              .from('families')
              .insert({})
              .select()
              .single();

            if (famErr) return { error: "Error al crear el grupo familiar: " + famErr.message };
            newFamilyId = family.id;
          }

          const { error: profErr } = await supabase
            .from('profiles')
            .insert({
              id: u.id,
              email: u.email,
              name,
              role,
              avatar,
              family_id: newFamilyId
            });

          if (profErr) return { error: "Error al guardar perfil de usuario: " + profErr.message };

          if (role === 'monitor' && newFamilyId) {
            await supabase.from('alerts').insert({
              family_id: newFamilyId,
              is_sos_active: false,
              siren_active: false
            });
          }

          set({
            userId: u.id,
            userEmail: u.email || null,
            userName: name,
            avatarBase64: avatar,
            role,
            familyCode: newFamilyId,
            familyId: newFamilyId,
            masterServerId: newFamilyId,
          });
          get().fetchSafeZones();
        }
        return { error: null };
      },

      signOut: async () => {
        await supabase.auth.signOut();
        set({
          role: null,
          userName: '',
          avatarBase64: null,
          masterServerId: null,
          myPeerId: null,
          familyCode: null,
          tutorSlot: null,
          isSOSActive: false,
          fenceRadius: 100,
          messages: [],
          offlineQueue: [],
          userId: null,
          userEmail: null,
          familyId: null,
          safeZones: []
        });
      },

      logout: () => {
        get().signOut();
      },

      resetPassword: async (email) => {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin + '/reset-password',
        });
        if (error) return { error: error.message };
        return { error: null };
      },

      joinFamily: async (familyCode) => {
        const userId = get().userId;
        if (!userId) return { error: "No hay sesión iniciada." };

        const { data: family, error: famErr } = await supabase
          .from('families')
          .select('id')
          .eq('id', familyCode)
          .single();

        if (famErr || !family) {
          return { error: "Código de familia inválido o inexistente." };
        }

        const { error: profErr } = await supabase
          .from('profiles')
          .update({ family_id: familyCode })
          .eq('id', userId);

        if (profErr) return { error: "No se pudo actualizar el vínculo: " + profErr.message };

        set({
          familyCode,
          familyId: familyCode,
          masterServerId: familyCode
        });

        get().fetchSafeZones();
        return { error: null };
      },

      unlinkFamily: async () => {
        const userId = get().userId;
        if (!userId) return { error: "No hay sesión iniciada." };

        const { error: profErr } = await supabase
          .from('profiles')
          .update({ family_id: null })
          .eq('id', userId);

        if (profErr) return { error: "No se pudo desvincular el dispositivo: " + profErr.message };

        set({
          familyCode: null,
          familyId: null,
          masterServerId: null,
          messages: []
        });

        return { error: null };
      },

      updateTrackingStatus: async (targetUserId: string, enabled: boolean, expiresAt: string | null = null) => {
        const { error } = await supabase
          .from('profiles')
          .update({ 
            tracking_enabled: enabled,
            tracking_expires_at: expiresAt
          })
          .eq('id', targetUserId);
        if (error) return { error: error.message };
        return { error: null };
      }
    }),
    {
      name: 'radar-storage',
      partialize: (state) => ({
        role: state.role,
        userName: state.userName,
        avatarBase64: state.avatarBase64,
        masterServerId: state.masterServerId,
        familyCode: state.familyCode,
        userId: state.userId,
        userEmail: state.userEmail,
        familyId: state.familyId,
        fenceRadius: state.fenceRadius,
        fenceCenterLat: state.fenceCenterLat,
        fenceCenterLng: state.fenceCenterLng,
        safeZones: state.safeZones,
        appVersion: state.appVersion
      })
    }
  )
);

export const playTonalSound = (type: 'CHAT_RECEIVE' | 'P2P_HANDSHAKE' | 'P2P_LOST' | 'GEOFENCE_BREACH' | 'PTT_START' | 'ACCOMPANY_START') => {
  try {
    if (!(window as any).globalAudioCtx) {
      (window as any).globalAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    const ctx = (window as any).globalAudioCtx;
    if (!ctx) return;
    
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

      case 'ACCOMPANY_START':
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.1, now);
        osc.frequency.setValueAtTime(523, now);
        osc.frequency.setValueAtTime(659, now + 0.08);
        osc.frequency.setValueAtTime(784, now + 0.16);
        osc.frequency.setValueAtTime(1046, now + 0.24);
        gain.gain.setValueAtTime(0, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
        break;
    }
  } catch (e) {
    console.warn("Could not play tonal sound:", e);
  }
};

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
