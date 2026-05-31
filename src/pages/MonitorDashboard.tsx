import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useStore, playTonalSound, type ChatMessage } from '../store/useStore';
import { useNavigate } from 'react-router-dom';
import { QRCode } from 'react-qr-code';
import { Menu, X, QrCode, LogOut, AlertCircle, ShieldAlert, Smartphone, MessageSquare, Send, Mic, Bell, Camera, Sun, Moon, Image, Clock, Zap, Battery, ArrowLeft } from 'lucide-react';
import { Geolocation } from '@capacitor/geolocation';
import { supabase } from '../supabaseClient';
import { AgIsotype, AgLogoFull } from '../components/BrandLogo';

import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

function MapAutoCenter({ target }: { target: [number, number] | null }) {
  const map = useMap();
  const lat = target?.[0];
  const lng = target?.[1];

  useEffect(() => {
    if (lat !== undefined && lng !== undefined) {
      map.flyTo([lat, lng], 16, { animate: true, duration: 1.5 });
    }
  }, [lat, lng, map]);
  return null;
}

function MapInteractionHandler({ onInteraction }: { onInteraction: () => void }) {
  useMapEvents({
    dragstart() {
      onInteraction();
    },
    zoomstart() {
      onInteraction();
    }
  });
  return null;
}

function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3; 
  const p1 = lat1 * Math.PI/180;
  const p2 = lat2 * Math.PI/180;
  const dp = (lat2-lat1) * Math.PI/180;
  const dl = (lon2-lon1) * Math.PI/180;
  const a = Math.sin(dp/2) * Math.sin(dp/2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl/2) * Math.sin(dl/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function MapClickHandler({ onClick, onLongPress }: { onClick: (e: any) => void; onLongPress?: (e: any) => void }) {
  useMapEvents({
    click(e) {
      onClick(e);
    },
    contextmenu(e) {
      if (e.originalEvent) {
        e.originalEvent.preventDefault();
      }
      if (onLongPress) {
        onLongPress(e);
      }
    }
  });
  return null;
}

const safeZoneIcon = L.divIcon({
  className: 'custom-safezone-marker',
  html: `<div style="width:36px;height:36px;background:#ec4899;border-radius:50%;border:3px solid white;display:flex;align-items:center;justify-content:center;box-shadow:0 0 10px rgba(236,72,153,0.6);color:white;"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18]
});

export default function MonitorDashboard() {
  const [sidebarView, setSidebarView] = useState<'main' | 'qr' | 'zones'>('main');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  
  const { 
    userId,
    familyId,
    familyCode,
    logout, 
    fenceCenterLat,
    fenceCenterLng,
    setFenceCenter,
    userName, 
    avatarBase64, 
    messages, 
    addMessage, 
    checkUpdates, 
    updateAvailable, 
    latestReleaseUrl, 
    isCheckingUpdates, 
    updateCheckResult, 
    resetUpdateCheckResult,
    updateTrackingStatus,
    safeZones,
    addSafeZone,
    updateSafeZone,
    deleteSafeZone,
    toggleSafeZone,
    fetchSafeZones
  } = useStore();

  const navigate = useNavigate();
  const openMenu = () => {
    resetUpdateCheckResult();
    setIsMenuOpen(true);
  };
  const [isSelectingCenterOnMap, setIsSelectingCenterOnMap] = useState(false);

  // States for multiple safe zones
  const [isProgrammingSafeZone, setIsProgrammingSafeZone] = useState(false);
  const [editingSafeZoneId, setEditingSafeZoneId] = useState<string | null>(null);
  const [newZoneName, setNewZoneName] = useState('');
  const [newZoneRadius, setNewZoneRadius] = useState(100);
  const [newZoneLat, setNewZoneLat] = useState<number | null>(null);
  const [newZoneLng, setNewZoneLng] = useState<number | null>(null);
  const [newZoneChildId, setNewZoneChildId] = useState<string>('');

  const [isAutoCentering, setIsAutoCentering] = useState(true);
  const [safeZoneSubMenu, setSafeZoneSubMenu] = useState<'menu' | 'create_select_child' | 'manage'>('menu');

  const confirmLogout = () => {
    if (unlinkConfirmName.trim() === userName.trim()) {
      const doubleCheck = window.confirm("¿Está completamente seguro de que desea desvincular el dispositivo? Perderá el acceso de monitoreo.");
      if (!doubleCheck) return;

      setIsUnlinkModalOpen(false);
      stopSiren();
      logout();
      navigate('/');
    }
  };

  const [myLocation, setMyLocation] = useState<[number, number] | null>(null);
  const [clients, setClients] = useState<Record<string, { 
    lat: number; 
    lng: number; 
    name: string; 
    lastSeen: number; 
    isOnline: boolean; 
    avatar: string | null; 
    role: 'monitor' | 'client'; 
    tracking_enabled?: boolean;
    tracking_expires_at?: string | null;
    battery_level?: number;
    battery_charging?: boolean;
  }>>({});
  const [alarmActive, setAlarmActive] = useState<{ active: boolean; originName: string }>({ active: false, originName: '' });
  const [sosHistory, setSosHistory] = useState<{ id: string; name: string; timestamp: number }[]>([]);
  const [mapCenterTarget, setMapCenterTarget] = useState<[number, number] | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [mapTheme, setMapTheme] = useState<'dark' | 'light'>('dark');
  const [isSirenOn, setIsSirenOn] = useState(false);
  const [trackingTargetId, setTrackingTargetId] = useState<string>('me');
  const [expandedTrackingMenuId, setExpandedTrackingMenuId] = useState<string | null>(null);

  const getRemainingTimeText = (expiresAt: string | null | undefined) => {
    if (!expiresAt) return 'Manual';
    const diffMs = new Date(expiresAt).getTime() - Date.now();
    if (diffMs <= 0) return 'Expirado';
    const diffMins = Math.ceil(diffMs / 60000);
    if (diffMins > 60) {
      const hours = Math.floor(diffMins / 60);
      const mins = diffMins % 60;
      return `${hours}h ${mins}m`;
    }
    return `${diffMins}m`;
  };

  const handleToggleTrackingWithExpiry = async (clientId: string, trackingActive: boolean, expiresAt: string | null) => {
    setClients(prev => {
      const updated = { ...prev };
      if (updated[clientId]) {
        updated[clientId] = {
          ...updated[clientId],
          tracking_enabled: trackingActive,
          tracking_expires_at: expiresAt
        };
      }
      return updated;
    });

    const { error } = await updateTrackingStatus(clientId, trackingActive, expiresAt);
    if (error) {
      setClients(prev => {
        const updated = { ...prev };
        if (updated[clientId]) {
          updated[clientId] = {
            ...updated[clientId],
            tracking_enabled: !trackingActive,
            tracking_expires_at: undefined
          };
        }
        return updated;
      });
      showToast("❌ Error: " + error);
    } else {
      showToast(trackingActive ? "🟢 Rastreo continuo activado" : "🔴 Rastreo suspendido (Ahorro de batería)");
    }
  };

  // History path coordinates
  const [historyPath, setHistoryPath] = useState<[number, number][]>([]);
  const [historyUser, setHistoryUser] = useState<string | null>(null);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [selectedChildForHistory, setSelectedChildForHistory] = useState<{ id: string; name: string } | null>(null);
  const [customHistoryDate, setCustomHistoryDate] = useState('');

  // Walkie-Talkie & Acompáñame States
  const [isWtRecording, setIsWtRecording] = useState(false);
  const [isWtPlaying, setIsWtPlaying] = useState(false);
  const [wtSender, setWtSender] = useState<string | null>(null);
  const wtMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const wtAudioChunksRef = useRef<Blob[]>([]);
  const wtTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [wtCountdown, setWtCountdown] = useState(7);
  const wtCountdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [accompaniedClients, setAccompaniedClients] = useState<Record<string, number>>({});

  const markerIconCache = useRef<Record<string, L.DivIcon>>({});
  const getAvatarIcon = useCallback((
    id: string, 
    avatar: string | null, 
    isOnline: boolean, 
    isMonitor: boolean, 
    isAccompanied?: boolean,
    trackingActive?: boolean,
    batteryLevel?: number,
    batteryCharging?: boolean,
    name?: string
  ) => {
    const avatarKey = avatar ? `avatar_len_${avatar.length}` : 'no_avatar';
    const trackingKey = trackingActive ? 'act' : 'inact';
    const batteryKey = batteryLevel !== undefined ? `bat_${batteryLevel}` : 'no_bat';
    const chargingKey = batteryCharging ? 'chg' : 'no_chg';
    const cacheKey = `${id}_${isOnline ? 'on' : 'off'}_${avatarKey}_${isMonitor ? 'monitor' : 'client'}_${isAccompanied ? 'acc' : 'no_acc'}_${trackingKey}_${batteryKey}_${chargingKey}`;
    
    if (!markerIconCache.current[cacheKey]) {
      const size = isMonitor ? 36 : 40;
      let color = '#ef4444'; // Inactive client by default (red border)
      if (isMonitor) {
        color = '#c084fc';
      } else if (isAccompanied) {
        color = '#ec4899';
      } else if (trackingActive) {
        color = '#4ade80';
      }
      
      const initial = (name || '?').charAt(0).toUpperCase();
      const batteryColor = (batteryLevel !== undefined && batteryLevel < 20) ? '#fca5a5' : '#4ade80';
      const batteryHtml = (!isMonitor && batteryLevel !== undefined)
        ? `<span style="position:absolute;bottom:-18px;font-size:11px;font-weight:bold;color:${batteryColor};text-shadow:1px 1px 0 #000,-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,0 2px 4px rgba(0,0,0,0.8);white-space:nowrap;z-index:999;">${batteryLevel}%${batteryCharging ? '⚡' : ''}</span>`
        : '';

      markerIconCache.current[cacheKey] = L.divIcon({
        className: `custom-avatar-marker ${isAccompanied ? 'accompanied-glow' : ''}`,
        html: `
          <div style="position:relative;width:${size}px;height:${size}px;display:flex;justify-content:center;align-items:center;">
            <div style="width:${size}px;height:${size}px;border-radius:50%;overflow:hidden;border:3px solid ${color};box-shadow:0 0 10px ${color};background:#15102a;display:flex;align-items:center;justify-content:center;">
              ${avatar 
                ? `<img src="${avatar}" style="width:100%;height:100%;object-fit:cover;" />` 
                : `<span style="font-weight:bold;color:white;font-size:16px;">${initial}</span>`
              }
            </div>
            ${batteryHtml}
          </div>
        `,
        iconSize: [size, size],
        iconAnchor: [size/2, size/2]
      });
    }
    return markerIconCache.current[cacheKey];
  }, []);

  const playWalkieTalkie = (base64Audio: string, senderName: string) => {
    try {
      playTonalSound('PTT_START');
      setWtSender(senderName);
      setIsWtPlaying(true);
      const audioUrl = `data:audio/wav;base64,${base64Audio}`;
      const audio = new Audio(audioUrl);
      audio.play().then(() => {
        audio.onended = () => {
          setIsWtPlaying(false);
          setWtSender(null);
        };
      }).catch(err => {
        console.error("Audio playback error:", err);
        setIsWtPlaying(false);
        setWtSender(null);
      });
    } catch (e) {
      console.error("WT decoding error:", e);
      setIsWtPlaying(false);
      setWtSender(null);
    }
  };

  const startWtRecording = async (e?: React.MouseEvent | React.TouchEvent) => {
    if (e) {
      if (e.type === 'touchstart' || e.type === 'touchend') e.preventDefault();
    }
    if (isWtRecording) return;
    try {
      playTonalSound('PTT_START');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      wtAudioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      wtMediaRecorderRef.current = mediaRecorder;
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) wtAudioChunksRef.current.push(event.data);
      };
      
      mediaRecorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop());
        const audioBlob = new Blob(wtAudioChunksRef.current, { type: 'audio/wav' });
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result as string;
          const cleanBase64 = base64.split(',')[1];
          
          supabase.channel(`broadcast-${familyId}`).send({
            type: 'broadcast',
            event: 'walkie-talkie',
            payload: {
              audio: cleanBase64,
              senderName: userName,
              senderId: userId
            }
          });
          showToast("🎙️ Walkie-Talkie enviado!");
        };
        reader.readAsDataURL(audioBlob);
      };
      
      mediaRecorder.start();
      setIsWtRecording(true);
      setWtCountdown(7);

      if (wtCountdownIntervalRef.current) clearInterval(wtCountdownIntervalRef.current);
      let count = 7;
      wtCountdownIntervalRef.current = setInterval(() => {
        count -= 1;
        setWtCountdown(count);
        if (count <= 0) {
          if (wtCountdownIntervalRef.current) {
            clearInterval(wtCountdownIntervalRef.current);
            wtCountdownIntervalRef.current = null;
          }
        }
      }, 1000);
      
      wtTimeoutRef.current = setTimeout(() => {
        stopWtRecording();
      }, 7000);
    } catch (err) {
      console.error("Error starting WT recording:", err);
    }
  };

  const stopWtRecording = (e?: React.MouseEvent | React.TouchEvent) => {
    if (e) {
      if (e.type === 'touchstart' || e.type === 'touchend') e.preventDefault();
    }
    if (wtTimeoutRef.current) {
      clearTimeout(wtTimeoutRef.current);
      wtTimeoutRef.current = null;
    }
    if (wtCountdownIntervalRef.current) {
      clearInterval(wtCountdownIntervalRef.current);
      wtCountdownIntervalRef.current = null;
    }
    if (wtMediaRecorderRef.current && wtMediaRecorderRef.current.state !== 'inactive') {
      wtMediaRecorderRef.current.stop();
    }
    setIsWtRecording(false);
    setWtCountdown(7);
  };
  
  const audioCtxRef = useRef<AudioContext | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const sirenIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (msg: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage(msg);
    toastTimeoutRef.current = setTimeout(() => setToastMessage(null), 4000);
  };

  const geofenceStrikesRef = useRef<Record<string, number>>({});

  // Chat overlay
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessingMic, setIsProcessingMic] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const discardRecordingRef = useRef<boolean>(false);
  const [isUnlinkModalOpen, setIsUnlinkModalOpen] = useState(false);
  const [unlinkConfirmName, setUnlinkConfirmName] = useState('');

  // Audio elements for local alerts
  const playSiren = () => {
    if (sirenIntervalRef.current) return; // Ya reproduciendo
    
    if (!(window as any).globalAudioCtx) {
      (window as any).globalAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    audioCtxRef.current = (window as any).globalAudioCtx;
    const ctx = audioCtxRef.current!;
    if (ctx.state === 'suspended') ctx.resume();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(600, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(1200, ctx.currentTime + 0.25);
    osc.frequency.linearRampToValueAtTime(600, ctx.currentTime + 0.5);
    
    sirenIntervalRef.current = setInterval(() => {
      osc.frequency.setValueAtTime(600, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(1200, ctx.currentTime + 0.25);
      osc.frequency.linearRampToValueAtTime(600, ctx.currentTime + 0.5);
    }, 500);

    gain.gain.value = 1.0;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    oscillatorRef.current = osc;

    if ('vibrate' in navigator) {
      navigator.vibrate([1000, 500, 1000, 500, 1000]);
    }
  };

  const stopSiren = () => {
    if (sirenIntervalRef.current) {
      clearInterval(sirenIntervalRef.current);
      sirenIntervalRef.current = null;
    }
    if (oscillatorRef.current) {
      oscillatorRef.current.stop();
      oscillatorRef.current.disconnect();
      oscillatorRef.current = null;
    }
    setAlarmActive({ active: false, originName: '' });
    setSosHistory([]);
  };

  useEffect(() => {
    const requestAllPermissions = async () => {
      try {
        await Geolocation.requestPermissions();
      } catch (e) {
        console.warn("Could not request Geolocation permission via Capacitor:", e);
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach(t => t.stop());
      } catch (e) {
        console.warn("Could not request Camera permission:", e);
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(t => t.stop());
      } catch (e) {
        console.warn("Could not request Microphone permission:", e);
      }
    };
    requestAllPermissions();
  }, []);

  // Check updates once on load
  useEffect(() => {
    checkUpdates();
  }, [checkUpdates]);

  // 1. Fetch details & Realtime Subscriptions
  useEffect(() => {
    if (!familyId || !userId) return;

    // Fetch initial chat
    const fetchChatMessages = async () => {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('family_id', familyId)
        .order('timestamp', { ascending: true })
        .limit(20);

      if (data) {
        const formatted = data.map(m => ({
          id: m.id,
          senderName: m.sender_name,
          type: m.type as any,
          content: m.content,
          timestamp: m.timestamp
        }));
        useStore.setState({ messages: formatted });
      }
    };

    // Fetch family members
    const fetchFamilyDetails = async () => {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('*')
        .eq('family_id', familyId);

      if (profiles) {
        const membersMap: any = {};
        profiles.forEach(p => {
          if (p.id !== userId) {
            membersMap[p.id] = {
              name: p.name,
              avatar: p.avatar,
              role: p.role,
              lat: 0,
              lng: 0,
              isOnline: false,
              lastSeen: Date.now(),
              tracking_enabled: p.tracking_enabled !== false,
              tracking_expires_at: p.tracking_expires_at,
              battery_level: p.battery_level !== undefined ? p.battery_level : 100,
              battery_charging: p.battery_charging === true
            };
          }
        });

        const { data: locs } = await supabase
          .from('locations')
          .select('*')
          .eq('family_id', familyId);

        if (locs) {
          locs.forEach(l => {
            if (membersMap[l.user_id]) {
              membersMap[l.user_id].lat = l.latitude;
              membersMap[l.user_id].lng = l.longitude;
              membersMap[l.user_id].isOnline = (Date.now() - new Date(l.updated_at).getTime() < 360000);
            }
          });
        }
        setClients(membersMap);
      }
    };

    fetchChatMessages();
    fetchFamilyDetails();
    fetchSafeZones();

    // Subscribe to Alerts
    const alertsSub = supabase
      .channel(`alerts-${familyId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'alerts' },
        (payload: any) => {
          if (payload.new && payload.new.family_id === familyId) {
            const data = payload.new;
            if (data.is_sos_active) {
              setAlarmActive({ active: true, originName: data.origin_name || 'Familiar' });
              setSosHistory(prev => {
                const alreadyExists = prev.some(item => item.name === data.origin_name && (Date.now() - item.timestamp < 10000));
                if (alreadyExists) return prev;
                return [
                  { id: data.origin_user_id || Date.now().toString(), name: data.origin_name || 'Familiar', timestamp: Date.now() },
                  ...prev
                ].slice(0, 5);
              });
              playSiren();
              showToast(`🚨 ¡SOS de ${data.origin_name || 'un familiar'}!`);
            } else {
              stopSiren();
            }
          }
        }
      )
      .subscribe();

    // Subscribe to Locations
    const locationsSub = supabase
      .channel(`locations-${familyId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'locations' },
        (payload: any) => {
          if (payload.new && payload.new.family_id === familyId && payload.new.user_id !== userId) {
            const row = payload.new;
            setClients(prev => {
              const updated = { ...prev };
              if (updated[row.user_id]) {
                const clientName = updated[row.user_id].name;
                
                // New multiple geofences checking
                const currentZones = useStore.getState().safeZones || [];
                const childZones = currentZones.filter(z => z.is_active && z.child_id === row.user_id);
                
                childZones.forEach(zone => {
                  const dist = getDistance(zone.latitude, zone.longitude, row.latitude, row.longitude);
                  const strikeKey = `${row.user_id}-${zone.id}`;
                  if (dist > zone.radius) {
                    const currentStrikes = (geofenceStrikesRef.current[strikeKey] || 0) + 1;
                    geofenceStrikesRef.current[strikeKey] = currentStrikes;
                    
                    if (currentStrikes === 3) {
                      showToast(`⚠️ ${clientName} salió de la zona segura "${zone.name}" (${Math.round(dist)}m)`);
                      playTonalSound('GEOFENCE_BREACH');
                    } else if (currentStrikes > 3 && currentStrikes % 10 === 0) {
                      showToast(`⚠️ ${clientName} sigue fuera de la zona "${zone.name}" (${Math.round(dist)}m)`);
                      playTonalSound('GEOFENCE_BREACH');
                    }
                  } else {
                    if ((geofenceStrikesRef.current[strikeKey] || 0) >= 3) {
                      showToast(`✅ ${clientName} regresó a la zona segura "${zone.name}".`);
                    }
                    geofenceStrikesRef.current[strikeKey] = 0;
                  }
                });

                updated[row.user_id] = {
                  ...updated[row.user_id],
                  lat: row.latitude,
                  lng: row.longitude,
                  isOnline: true,
                  lastSeen: Date.now()
                };
              }
              return updated;
            });
          }
        }
      )
      .subscribe();

    // Subscribe to Profiles (for remote tracking changes)
    const profilesSub = supabase
      .channel(`profiles-${familyId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles' },
        (payload: any) => {
          if (payload.new && payload.new.family_id === familyId && payload.new.id !== userId) {
            const row = payload.new;
            setClients(prev => {
              const updated = { ...prev };
              if (updated[row.id]) {
                updated[row.id] = {
                  ...updated[row.id],
                  name: row.name,
                  avatar: row.avatar,
                  tracking_enabled: row.tracking_enabled !== false,
                  tracking_expires_at: row.tracking_expires_at,
                  battery_level: row.battery_level !== undefined ? row.battery_level : 100,
                  battery_charging: row.battery_charging === true
                };
              }
              return updated;
            });
          }
        }
      )
      .subscribe();

    // Subscribe to Messages
    const messagesSub = supabase
      .channel(`messages-${familyId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload: any) => {
          if (payload.new && payload.new.family_id === familyId && payload.new.sender_id !== userId) {
            const m = payload.new;
            addMessage({
              id: m.id,
              senderName: m.sender_name,
              type: m.type as any,
              content: m.content,
              timestamp: m.timestamp
            });
            showToast(`💬 Mensaje de ${m.sender_name}`);
            playTonalSound('CHAT_RECEIVE');
          }
        }
      )
      .subscribe();

    // Subscribe to Broadcast Channel (Walkie-Talkie & Check-in & Status Queries)
    const broadcastChannel = supabase.channel(`broadcast-${familyId}`);
    
    broadcastChannel
      .on('broadcast', { event: 'walkie-talkie' }, (payload: any) => {
        if (payload.payload && payload.payload.senderId !== userId) {
          playWalkieTalkie(payload.payload.audio, payload.payload.senderName);
        }
      })
      .on('broadcast', { event: 'check-in' }, (payload: any) => {
        if (payload.payload && payload.payload.senderId !== userId) {
          showToast(`✓ Check-in de ${payload.payload.senderName}: ¡Llegué bien!`);
          playTonalSound('CHAT_RECEIVE');
        }
      })
      .on('broadcast', { event: 'acompaniame-report' }, (payload: any) => {
        if (payload.payload) {
          const { senderId, expiresAt, senderName } = payload.payload;
          setAccompaniedClients(prev => {
            if (!prev[senderId] || prev[senderId] <= Date.now()) {
              const name = senderName || clients[senderId]?.name || 'Hijo';
              showToast(`⏱️ Acompañamiento iniciado por ${name}`);
              playTonalSound('ACCOMPANY_START');
            }
            return {
              ...prev,
              [senderId]: expiresAt
            };
          });
        }
      })
      .on('broadcast', { event: 'acompaniame-stop' }, (payload: any) => {
        if (payload.payload) {
          const { senderId } = payload.payload;
          setAccompaniedClients(prev => {
            const next = { ...prev };
            delete next[senderId];
            return next;
          });
        }
      })
      .on('broadcast', { event: 'request-status' }, () => {
        // Monitor has no trackable status to report
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // Query active statuses when we connect
          broadcastChannel.send({
            type: 'broadcast',
            event: 'request-status',
            payload: {}
          });
        }
      });

    return () => {
      alertsSub.unsubscribe();
      locationsSub.unsubscribe();
      profilesSub.unsubscribe();
      messagesSub.unsubscribe();
      broadcastChannel.unsubscribe();
    };
  }, [familyId, userId, myLocation, fenceCenterLat, fenceCenterLng, addMessage, checkUpdates, fetchSafeZones]);

  // Cleanup active timeouts/intervals on unmount to prevent state updates/audio leaks
  useEffect(() => {
    return () => {
      stopSiren();
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
      if (wtCountdownIntervalRef.current) clearInterval(wtCountdownIntervalRef.current);
    };
  }, []);

  // Auto scroll chat to bottom when messages list updates or chat is opened
  useEffect(() => {
    if (isChatOpen && chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, isChatOpen]);

  // 2. Geolocation Watcher
  useEffect(() => {
    if (!userId || !familyId) return;

    let active = true;
    let watchId: string | null = null;
    
    const startTracking = async () => {
      try {
        let perm = { location: 'granted' };
        try {
          perm = await Geolocation.requestPermissions();
        } catch (e) {
          console.warn("Implicit geolocation permissions on web platform:", e);
        }
        if (!active) return;
        if (perm.location !== 'granted') {
          setGpsError("El GPS no tiene permisos. Actívalo en ajustes.");
          return;
        }
        setGpsError(null);

        watchId = await Geolocation.watchPosition(
          { enableHighAccuracy: true, timeout: 10000 },
          (position) => {
            if (position && active) {
              const coords: [number, number] = [position.coords.latitude, position.coords.longitude];
              setMyLocation(coords);
              
              // Upload my Monitor location in Realtime
              supabase.from('locations').upsert({
                user_id: userId,
                family_id: familyId,
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                updated_at: new Date().toISOString()
              }).then(({ error }) => {
                if (error && active) console.error("Error upserting location:", error);
              });
            }
          }
        );
        if (!active && watchId) {
          Geolocation.clearWatch({ id: watchId });
        }
      } catch (e) {
        if (active) console.error('Error starting location watcher', e);
      }
    };
    
    startTracking();
    
    return () => {
      active = false;
      if (watchId) Geolocation.clearWatch({ id: watchId });
    };
  }, [userId, familyId]);

  // Reactive Map Centering
  useEffect(() => {
    if (!isAutoCentering || !trackingTargetId || isProgrammingSafeZone) return;
    if (trackingTargetId === 'me') {
      if (myLocation) {
        setMapCenterTarget(prev => {
          if (prev && prev[0] === myLocation[0] && prev[1] === myLocation[1]) return prev;
          return myLocation;
        });
      }
    } else {
      const client = clients[trackingTargetId];
      if (client && client.lat !== 0 && client.lng !== 0) {
        setMapCenterTarget(prev => {
          if (prev && prev[0] === client.lat && prev[1] === client.lng) return prev;
          return [client.lat, client.lng];
        });
      }
    }
  }, [trackingTargetId, myLocation, clients, isAutoCentering, isProgrammingSafeZone]);

  // Periodic connection timeouts watcher
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setClients(prev => {
        const updated = { ...prev };
        let changed = false;
        for (let id in updated) {
          if (updated[id].isOnline && (now - updated[id].lastSeen > 360000)) {
            updated[id].isOnline = false;
            changed = true;
          }
        }
        return changed ? updated : prev;
      });
    }, 15000);

    return () => clearInterval(interval);
  }, []);

  // Fetch filtered location history
  const showHistoricalRoute = async (
    childId: string, 
    childName: string, 
    rangeType: 'today' | 'yesterday' | 'custom' | 'all',
    customDate?: string
  ) => {
    let startDateTime: Date;
    let endDateTime: Date = new Date();

    if (rangeType === 'today') {
      startDateTime = new Date();
      startDateTime.setHours(0, 0, 0, 0);
    } else if (rangeType === 'yesterday') {
      startDateTime = new Date();
      startDateTime.setDate(startDateTime.getDate() - 1);
      startDateTime.setHours(0, 0, 0, 0);
      
      endDateTime = new Date();
      endDateTime.setDate(endDateTime.getDate() - 1);
      endDateTime.setHours(23, 59, 59, 999);
    } else if (rangeType === 'custom' && customDate) {
      const parts = customDate.split('-');
      if (parts.length === 3) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        startDateTime = new Date(year, month, day, 0, 0, 0, 0);
        endDateTime = new Date(year, month, day, 23, 59, 59, 999);
      } else {
        showToast("Fecha no válida.");
        return;
      }
    } else {
      // 'all' (30 days)
      startDateTime = new Date();
      startDateTime.setDate(startDateTime.getDate() - 30);
    }

    const { data, error } = await supabase
      .from('locations_history')
      .select('*')
      .eq('user_id', childId)
      .gte('created_at', startDateTime.toISOString())
      .lte('created_at', endDateTime.toISOString())
      .order('created_at', { ascending: true });

    if (error) {
      showToast("Error al cargar historial.");
      return;
    }

    if (!data || data.length === 0) {
      let rangeLabel = "el período seleccionado";
      if (rangeType === 'today') rangeLabel = "hoy";
      else if (rangeType === 'yesterday') rangeLabel = "ayer";
      else if (rangeType === 'custom' && customDate) rangeLabel = customDate;
      showToast(`No hay historial de ubicación para ${childName} (${rangeLabel})`);
      setHistoryPath([]);
      setHistoryUser(null);
      return;
    }

    const path = data.map((h: any) => [h.latitude, h.longitude] as [number, number]);
    setHistoryPath(path);
    setHistoryUser(childName);

    let rangeLabel = "últimos 30 días";
    if (rangeType === 'today') rangeLabel = "hoy";
    else if (rangeType === 'yesterday') rangeLabel = "ayer";
    else if (rangeType === 'custom' && customDate) rangeLabel = customDate;
    
    showToast(`Mostrando ruta de ${childName} (${rangeLabel})`);
    
    // Auto-center on the beginning of the path
    setMapCenterTarget(path[0]);
  };

  const clearHistoricalRoute = () => {
    setHistoryPath([]);
    setHistoryUser(null);
    showToast("Historial borrado del mapa.");
  };

  // Trigger remote siren
  const handleToggleRemoteSiren = async () => {
    const nextState = !isSirenOn;
    setIsSirenOn(nextState);

    await supabase.from('alerts').upsert({
      family_id: familyId,
      siren_active: nextState,
      origin_user_id: userId,
      origin_name: userName,
      updated_at: new Date().toISOString()
    });

    showToast(nextState ? "Sirena remota enviada a los dispositivos" : "Sirena desactivada");
  };

  // Chat action
  const dispatchChatMessage = async (msg: ChatMessage) => {
    addMessage(msg);
    if (!familyId || !userId) return;

    const { error } = await supabase.from('messages').insert({
      family_id: familyId,
      sender_id: userId,
      sender_name: userName,
      type: msg.type,
      content: msg.content,
      timestamp: msg.timestamp
    });
    if (error) {
      console.error("Error inserting message to Supabase:", error);
      showToast("❌ Error al enviar mensaje");
    }
  };

  const handleSendText = () => {
    if (!textInput.trim()) return;
    const msg: ChatMessage = {
      id: Date.now().toString(),
      senderName: userName,
      type: 'TEXT',
      content: textInput.trim(),
      timestamp: Date.now()
    };
    dispatchChatMessage(msg);
    setTextInput('');
  };

  const handleSendImage = (base64: string) => {
    const msg: ChatMessage = {
      id: Date.now().toString(),
      senderName: userName,
      type: 'IMAGE',
      content: base64,
      timestamp: Date.now()
    };
    dispatchChatMessage(msg);
  };

  const handleSendAudio = (base64: string) => {
    const msg: ChatMessage = {
      id: Date.now().toString(),
      senderName: userName,
      type: 'AUDIO',
      content: base64,
      timestamp: Date.now()
    };
    dispatchChatMessage(msg);
  };

  const toggleRecording = async (e?: React.MouseEvent | React.TouchEvent) => {
    if (e && (e.type === 'touchstart' || e.type === 'touchend')) {
      e.preventDefault();
    }
    if (isRecording) {
      if (mediaRecorderRef.current) mediaRecorderRef.current.stop();
      setIsRecording(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioChunksRef.current = [];
        discardRecordingRef.current = false;
        
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) audioChunksRef.current.push(event.data);
        };
        
        mediaRecorder.onstop = () => {
          stream.getTracks().forEach(track => track.stop());
          if (discardRecordingRef.current) return;
          setIsProcessingMic(true);
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64 = reader.result as string;
            handleSendAudio(base64);
            setIsProcessingMic(false);
          };
          reader.readAsDataURL(audioBlob);
        };
        
        mediaRecorder.start();
        setIsRecording(true);
      } catch (e) {
        console.error('Error starting recording', e);
        alert('Permiso de micrófono denegado o no disponible.');
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        handleSendImage(base64);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="dashboard-container" style={{ position: 'relative', overflow: 'hidden' }}>
      <header className="app-header">
        <div className="header-left">
          <AgIsotype size={32} />
        </div>
        <div className="header-center">
          Radar Familiar
        </div>
        <div className="header-right">
          <button className="header-menu-btn" onClick={openMenu} title="Abrir Menú">
            <Menu size={28} color="white" />
          </button>
        </div>
      </header>

      {isProgrammingSafeZone && (
        <div style={{ 
          position: 'absolute', 
          top: '75px', 
          left: '50%', 
          transform: 'translateX(-50%)', 
          background: 'rgba(15, 12, 41, 0.98)', 
          border: '2px solid #8b5cf6', 
          color: 'white', 
          padding: '16px', 
          borderRadius: '16px', 
          zIndex: 9999, 
          width: '90%', 
          maxWidth: '360px', 
          boxShadow: '0 8px 32px rgba(139, 92, 246, 0.3)',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          <h3 style={{ margin: 0, fontSize: '15px', color: '#a78bfa', display: 'flex', alignItems: 'center', gap: '6px' }}>
            📍 {editingSafeZoneId ? 'Editar Zona Segura' : 'Nueva Zona Segura'}
          </h3>
          <p style={{ margin: 0, fontSize: '11px', opacity: 0.9 }}>
            Familiar: <strong style={{ color: '#ec4899' }}>{clients[newZoneChildId]?.name || 'Hijo'}</strong>
          </p>
          <p style={{ margin: 0, fontSize: '11px', opacity: 0.8 }}>
            {newZoneLat !== null && newZoneLng !== null 
              ? "✅ Punto seleccionado. Completa el nombre y radio." 
              : "👉 Mantén pulsado en el mapa durante 2 segundos para marcar el centro de la zona."}
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <input 
              type="text" 
              placeholder="Nombre de la zona (ej: Colegio)" 
              value={newZoneName}
              onChange={(e) => setNewZoneName(e.target.value)}
              className="glass-input"
              style={{ margin: 0, fontSize: '13px', padding: '8px', background: 'rgba(255, 255, 255, 0.05)', color: 'white', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px' }}
            />

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                <span style={{ opacity: 0.6 }}>Radio:</span>
                <span style={{ fontWeight: 'bold' }}>{newZoneRadius}m</span>
              </div>
              <input 
                type="range" 
                min="50" 
                max="2000" 
                step="50" 
                value={newZoneRadius} 
                onChange={(e) => setNewZoneRadius(Number(e.target.value))} 
                style={{ accentColor: '#8b5cf6', width: '100%' }} 
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
            <button 
              onClick={async () => {
                if (!newZoneName.trim()) {
                  alert("Por favor, ingresa un nombre para la zona.");
                  return;
                }
                if (newZoneLat === null || newZoneLng === null) {
                  alert("Por favor, mantén pulsado en el mapa para ubicar el centro de la zona.");
                  return;
                }

                if (editingSafeZoneId) {
                  await updateSafeZone({
                    id: editingSafeZoneId,
                    family_id: familyId || '',
                    child_id: newZoneChildId,
                    name: newZoneName.trim(),
                    latitude: newZoneLat,
                    longitude: newZoneLng,
                    radius: newZoneRadius,
                    is_active: true
                  });
                  showToast(`✅ Zona "${newZoneName}" actualizada`);
                } else {
                  await addSafeZone({
                    child_id: newZoneChildId,
                    name: newZoneName.trim(),
                    latitude: newZoneLat,
                    longitude: newZoneLng,
                    radius: newZoneRadius,
                    is_active: true
                  });
                  showToast(`✅ Zona "${newZoneName}" creada`);
                }

                setIsProgrammingSafeZone(false);
                setEditingSafeZoneId(null);
                setIsAutoCentering(true);
                setSafeZoneSubMenu('manage');
              }}
              className="glass-btn primary"
              style={{ flex: 1, padding: '8px', fontSize: '12px', background: '#ec4899', borderColor: '#ec4899', color: 'white' }}
            >
              Aceptar
            </button>
            <button 
              onClick={() => {
                setIsProgrammingSafeZone(false);
                setEditingSafeZoneId(null);
                setIsAutoCentering(true);
                setSafeZoneSubMenu('menu');
              }}
              className="glass-btn secondary"
              style={{ flex: 1, padding: '8px', fontSize: '12px' }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
      {isSelectingCenterOnMap && (
        <div style={{ position: 'absolute', top: 75, left: '50%', transform: 'translateX(-50%)', background: '#ec4899', color: 'white', padding: '12px 24px', borderRadius: '12px', zIndex: 9999, fontSize: '13px', fontWeight: 'bold', boxShadow: '0 4px 20px rgba(236, 72, 153, 0.4)', animation: 'pulse 2s infinite' }}>
          📍 Toca en cualquier lugar del mapa para fijar la zona segura
        </div>
      )}
      {toastMessage && (
        <div style={{ position: 'absolute', top: 75, left: '50%', transform: 'translateX(-50%)', background: 'rgba(30, 27, 75, 0.95)', border: '1px solid rgba(255, 255, 255, 0.1)', color: 'white', padding: '12px 24px', borderRadius: '12px', zIndex: 9999, fontSize: '13px', boxShadow: '0 4px 20px rgba(0,0,0,0.3)', pointerEvents: 'none' }}>
          {toastMessage}
        </div>
      )}

      {gpsError && (
        <div style={{ position: 'absolute', top: 70, left: 0, right: 0, background: '#ef4444', color: 'white', padding: '12px', textAlign: 'center', zIndex: 9999, fontWeight: 'bold' }}>
          {gpsError}
        </div>
      )}

      {alarmActive.active && (
        <div className="alarm-banner" style={{ position: 'absolute', top: '80px', left: '50%', transform: 'translateX(-50%)', zIndex: 9999, background: '#ef4444', padding: '16px 24px', borderRadius: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', boxShadow: '0 8px 32px rgba(239, 68, 68, 0.4)', color: 'white', width: '280px', boxSizing: 'border-box' }}>
          <AlertCircle size={32} style={{ animation: 'bounce 1s infinite' }} />
          <div style={{ textAlign: 'center' }}>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold' }}>🚨 ¡SOS ACTIVO!</h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', opacity: 0.9 }}>
              Última señal de: {alarmActive.originName}
            </p>
          </div>

          {sosHistory.length > 1 && (
            <div style={{ background: 'rgba(0,0,0,0.2)', padding: '8px', borderRadius: '8px', width: '100%', fontSize: '11px', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '4px', boxSizing: 'border-box' }}>
              <span style={{ fontWeight: 'bold', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '2px', display: 'block' }}>Secuencia Reciente:</span>
              {sosHistory.map((item, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', opacity: idx === 0 ? 1 : 0.7 }}>
                  <span>⚠️ {item.name}</span>
                  <span>{new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                </div>
              ))}
            </div>
          )}

          <button onClick={stopSiren} className="glass-btn secondary" style={{ color: 'white', borderColor: 'white', width: '100%', padding: '8px', fontSize: '12px' }}>
            Silenciar Alerta Local
          </button>
        </div>
      )}

      {Object.entries(accompaniedClients).some(([_, expires]) => expires > Date.now()) && (
        <div style={{ position: 'absolute', top: alarmActive.active ? '250px' : '80px', left: '50%', transform: 'translateX(-50%)', zIndex: 9998, background: 'rgba(236,72,153,0.95)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '12px 24px', borderRadius: '16px', display: 'flex', alignItems: 'center', gap: '10px', boxShadow: '0 4px 20px rgba(236, 72, 153, 0.4)', fontSize: '13px', fontWeight: 'bold' }}>
          <Clock size={18} className="animate-pulse" />
          <span>Acompañamiento Activo: {Object.entries(accompaniedClients).filter(([_, expires]) => expires > Date.now()).map(([childId]) => clients[childId]?.name || 'Hijo').join(', ')}</span>
        </div>
      )}

      <MapContainer center={myLocation || [-34.6037, -58.3816]} zoom={15} style={{ height: 'calc(100dvh - 70px)', width: '100vw' }} zoomControl={false}>
        {isAutoCentering && mapCenterTarget && (
          <MapAutoCenter target={mapCenterTarget} />
        )}
        <MapInteractionHandler onInteraction={() => setIsAutoCentering(false)} />
        <MapClickHandler onClick={(e) => {
          if (isSelectingCenterOnMap) {
            setFenceCenter(e.latlng.lat, e.latlng.lng);
            setIsSelectingCenterOnMap(false);
            showToast("📍 Zona segura fijada en el mapa");
          }
        }} onLongPress={(e) => {
          if (isProgrammingSafeZone) {
            setNewZoneLat(e.latlng.lat);
            setNewZoneLng(e.latlng.lng);
            showToast("📍 Centro de zona seleccionado");
          }
        }} />
        <TileLayer url={mapTheme === 'dark' ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"} />
        
        {myLocation && (
          <Marker 
            key={userId || 'me'}
            position={myLocation} 
            icon={getAvatarIcon(userId || 'me', avatarBase64, true, true)}
            eventHandlers={{
              click: () => {
                setTrackingTargetId('me');
                setIsAutoCentering(true);
                setMapCenterTarget(myLocation);
              }
            }}
          >
            <Popup>Tú (Padre / Tutor)</Popup>
          </Marker>
        )}

        {/* Preview circle during programming */}
        {isProgrammingSafeZone && newZoneLat !== null && newZoneLng !== null && (
          <>
            <Circle 
              center={[newZoneLat, newZoneLng]} 
              radius={newZoneRadius} 
              pathOptions={{ color: '#8b5cf6', fillColor: '#8b5cf6', fillOpacity: 0.15, dashArray: '5, 5' }} 
            />
            <Marker 
              position={[newZoneLat, newZoneLng]} 
              icon={safeZoneIcon}
            >
              <Popup>Centro de la Nueva Zona</Popup>
            </Marker>
          </>
        )}

        {/* Render Multiple Active Safe Zones */}
        {safeZones.map(zone => {
          if (!zone.is_active) return null;
          const childName = clients[zone.child_id]?.name || 'Hijo';
          return (
            <React.Fragment key={zone.id}>
              <Circle 
                center={[zone.latitude, zone.longitude]} 
                radius={zone.radius} 
                pathOptions={{ color: '#ec4899', fillColor: '#ec4899', fillOpacity: 0.05, weight: 1.5 }} 
              />
              <Marker 
                position={[zone.latitude, zone.longitude]} 
                icon={safeZoneIcon}
              >
                <Popup>
                  <div style={{ textAlign: 'center', fontSize: '12px' }}>
                    <strong>{zone.name}</strong><br/>
                    Asignado a: {childName}<br/>
                    Radio: {zone.radius}m
                  </div>
                </Popup>
              </Marker>
            </React.Fragment>
          );
        })}

        {Object.entries(clients).map(([id, client]) => {
          if (client.lat === 0 && client.lng === 0) return null;
          const isAccompanied = !!(accompaniedClients[id] && (accompaniedClients[id] > Date.now()));
          const trackingActive = client.tracking_enabled !== false;
          const battery = client.battery_level !== undefined ? client.battery_level : 100;
          const charging = client.battery_charging === true;
          return (
            <React.Fragment key={id}>
              <Marker 
                key={id}
                position={[client.lat, client.lng]} 
                icon={getAvatarIcon(id, client.avatar, client.isOnline, client.role === 'monitor', isAccompanied, trackingActive, battery, charging, client.name)}
                eventHandlers={{
                  click: () => {
                    setTrackingTargetId(id);
                    setIsAutoCentering(true);
                    setMapCenterTarget([client.lat, client.lng]);
                  }
                }}
              >
                <Popup>
                  <div style={{ textAlign: 'center' }}>
                    <strong>{client.name}</strong> ({client.role === 'monitor' ? 'Tutor' : 'Hijo'})
                    {isAccompanied && (
                      <span style={{ display: 'block', color: '#ec4899', fontSize: '11px', marginTop: '4px', fontWeight: 'bold' }}>
                        ⏱️ Acompañamiento Activo
                      </span>
                    )}
                  </div>
                </Popup>
              </Marker>
              
              {isAccompanied && (
                <Circle 
                  center={[client.lat, client.lng]} 
                  radius={60} 
                  pathOptions={{ 
                    color: '#ec4899', 
                    fillColor: '#ec4899', 
                    fillOpacity: 0.15,
                    weight: 2,
                    className: 'pulse-circle' 
                  }} 
                />
              )}
            </React.Fragment>
          );
        })}

        {/* Historical Route Draw */}
        {historyPath.length > 0 && (
          <Polyline positions={historyPath} pathOptions={{ color: '#ec4899', weight: 4, dashArray: '5, 10' }} />
        )}
      </MapContainer>

      {/* Clear history floating button if showing */}
      {historyPath.length > 0 && (
        <button 
          onClick={clearHistoricalRoute} 
          style={{ position: 'absolute', top: '75px', left: '16px', zIndex: 1000, background: '#ef4444', color: 'white', padding: '10px 16px', borderRadius: '12px', border: 'none', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 'bold', boxShadow: '0 4px 12px rgba(239, 68, 68, 0.4)', cursor: 'pointer' }}
        >
          <X size={16} /> Ocultar Ruta de {historyUser}
        </button>
      )}

      {/* Floating map controls */}
      <button 
        className="map-theme-btn" 
        onClick={() => setMapTheme(prev => prev === 'dark' ? 'light' : 'dark')}
        title="Cambiar tema de mapa"
      >
        {mapTheme === 'dark' ? <Sun size={24} /> : <Moon size={24} />}
      </button>

      {/* Symmetrical Avatars Panel for fast focus */}
      <div className="map-avatars-container">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
          <button 
            className={`map-avatar-btn ${trackingTargetId === 'me' ? 'active' : ''}`}
            onClick={() => {
              setTrackingTargetId('me');
              setIsAutoCentering(true);
              if (myLocation) setMapCenterTarget(myLocation);
            }}
            title="Centrar en mí"
            style={{
              borderColor: '#4ade80',
              boxShadow: '0 0 10px rgba(74, 222, 128, 0.5)'
            }}
          >
            {avatarBase64 ? (
              <img src={avatarBase64} alt="Yo" />
            ) : (
              <div className="map-avatar-placeholder">{(userName || '?').charAt(0).toUpperCase()}</div>
            )}
          </button>
        </div>

        {Object.entries(clients).map(([id, client]) => {
          const isTrackingActive = client.tracking_enabled !== false;
          const battery = client.battery_level !== undefined ? client.battery_level : 100;
          const charging = client.battery_charging === true;
          return (
            <div key={id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
              <button
                className={`map-avatar-btn ${trackingTargetId === id ? 'active' : ''} ${client.role === 'monitor' ? 'monitor' : ''} ${isTrackingActive ? 'tracking-active' : 'tracking-inactive'}`}
                onClick={() => {
                  setTrackingTargetId(id);
                  setIsAutoCentering(true);
                  if (client.lat !== 0 && client.lng !== 0) {
                    setMapCenterTarget([client.lat, client.lng]);
                  }
                }}
                title={`Seguir a ${client.name}`}
              >
                {client.avatar ? (
                  <img src={client.avatar} alt={client.name} style={{ opacity: client.isOnline ? 1 : 0.5 }} />
                ) : (
                  <div className="map-avatar-placeholder" style={{ opacity: client.isOnline ? 1 : 0.5 }}>{(client.name || '?').charAt(0).toUpperCase()}</div>
                )}
              </button>
              {client.role === 'client' && (
                <span style={{
                  fontSize: '11px',
                  fontWeight: 'bold',
                  color: battery >= 20 ? '#4ade80' : '#fca5a5',
                  textShadow: '1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 0 2px 4px rgba(0,0,0,0.8)',
                  marginTop: '-2px'
                }}>
                  {battery}%{charging ? '⚡' : ''}
                </span>
              )}
            </div>
          );
        })}
      </div>



      {/* Floating action buttons */}
      <div className="tactical-actions" style={{ position: 'absolute', bottom: '16px', right: '16px', zIndex: 1000, display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <button 
          className={`action-circle-btn ${isSirenOn ? 'active' : ''}`}
          onClick={handleToggleRemoteSiren}
          title="Disparar Sirena Remota"
          style={{ width: '56px', height: '56px', borderRadius: '50%', background: isSirenOn ? '#ef4444' : 'rgba(30,27,75,0.8)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', cursor: 'pointer', transition: 'all 0.3s' }}
        >
          <Bell size={24} />
        </button>
      </div>

      <button 
        className="chat-toggle-btn"
        onClick={() => setIsChatOpen(true)}
        style={{ position: 'absolute', bottom: '16px', left: '16px', zIndex: 1000, background: 'rgba(30,27,75,0.8)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', width: '56px', height: '56px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', cursor: 'pointer' }}
      >
        <MessageSquare size={24} />
      </button>

      {/* Floating Walkie-Talkie Microphone Button */}
      <button 
        onMouseDown={startWtRecording} 
        onMouseUp={stopWtRecording}
        onTouchStart={startWtRecording} 
        onTouchEnd={stopWtRecording}
        style={{ 
          position: 'absolute', 
          bottom: '80px', 
          left: '16px', 
          zIndex: 1000, 
          background: isWtRecording ? '#ef4444' : 'rgba(30,27,75,0.85)', 
          border: isWtRecording ? '2px solid #ef4444' : '1px solid rgba(255,255,255,0.15)', 
          color: 'white', 
          width: '56px', 
          height: '56px', 
          borderRadius: '50%', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          boxShadow: isWtRecording ? '0 0 20px #ef4444' : '0 4px 12px rgba(0,0,0,0.3)', 
          cursor: 'pointer',
          touchAction: 'none'
        }}
        title="Walkie-Talkie: Mantén pulsado para hablar"
      >
        {isWtRecording ? (
          <span style={{ fontSize: '15px', fontWeight: '900', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {wtCountdown}s
          </span>
        ) : (
          <Mic size={24} />
        )}
      </button>

      {/* Walkie-Talkie Listening Equalizer Overlay */}
      {isWtPlaying && (
        <div style={{ position: 'absolute', top: '80px', left: '50%', transform: 'translateX(-50%)', zIndex: 9999, background: 'rgba(15, 23, 42, 0.95)', border: '1px solid #4ade80', borderRadius: '24px', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: '12px', boxShadow: '0 4px 20px rgba(74, 222, 128, 0.3)', color: 'white' }}>
          <div className="eq-container">
            <div className="eq-bar"></div>
            <div className="eq-bar"></div>
            <div className="eq-bar"></div>
            <div className="eq-bar"></div>
            <div className="eq-bar"></div>
          </div>
          <span style={{ fontSize: '13px', fontWeight: 'bold' }}>🎙️ Escuchando a {wtSender}...</span>
        </div>
      )}



      {isMenuOpen && <div className="side-menu-overlay" onClick={() => setIsMenuOpen(false)} />}
      <div className={`side-menu ${isMenuOpen ? 'open' : ''}`}>
        {sidebarView === 'main' && (
          <>
            <div className="menu-header" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <h2 style={{ fontSize: '18px', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}><ShieldAlert size={20} color="#ec4899" />Radar Familiar</h2>
                <button className="icon-btn" onClick={() => setIsMenuOpen(false)} style={{ marginRight: '-8px' }}><X size={24} /></button>
              </div>
              <div style={{ paddingLeft: '4px', width: '100%', marginTop: '4px' }}>
                <AgLogoFull size={40} />
              </div>
            </div>
            
            <div style={{ marginBottom: '24px' }}>
              <p style={{ fontSize: '11px', opacity: 0.5, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>Dispositivos</p>
              {Object.values(clients).length === 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', opacity: 0.7 }}>
                  <Smartphone size={20} />
                  <span style={{ fontSize: '14px' }}>Aún no hay hijos conectados</span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {Object.entries(clients).map(([id, c]) => (
                    <div key={id} style={{ background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                        {c.avatar ? (
                          <img src={c.avatar} alt={c.name} style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }} />
                        ) : (
                          <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#a78bfa', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>{(c.name || '?').charAt(0).toUpperCase()}</div>
                        )}
                        <div style={{ flex: 1, textAlign: 'left' }}>
                          <span style={{ fontSize: '14px', fontWeight: 'bold', display: 'block' }}>{c.name}</span>
                          <span style={{ fontSize: '11px', opacity: 0.6 }}>
                            {c.isOnline ? 'En línea (Nube)' : 'Desconectado'}
                            {c.role === 'client' && ` • 🔋 ${c.battery_level !== undefined ? c.battery_level : 100}%${c.battery_charging ? '⚡' : ''}`}
                          </span>
                        </div>
                        <div className={c.isOnline ? 'led-green' : 'led-red'} style={{ width: '8px', height: '8px', borderRadius: '50%' }}></div>
                      </div>
                      
                      {/* Remote tracking / battery toggle (2-tap workflow) */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
                        {expandedTrackingMenuId === id ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: 'rgba(0,0,0,0.2)', padding: '8px', borderRadius: '12px' }}>
                            <span style={{ fontSize: '11px', opacity: 0.8, textAlign: 'left', fontWeight: 'bold', color: '#a78bfa' }}>⏰ Establecer límite de rastreo:</span>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                              {[
                                { label: '30m', mins: 30 },
                                { label: '1h', mins: 60 },
                                { label: '2h', mins: 120 },
                                { label: '4h', mins: 240 },
                                { label: 'Manual', mins: null }
                              ].map((opt) => (
                                <button
                                  key={opt.label}
                                  type="button"
                                  onClick={async () => {
                                    const expiresAt = opt.mins 
                                      ? new Date(Date.now() + opt.mins * 60000).toISOString() 
                                      : null;
                                    setExpandedTrackingMenuId(null);
                                    await handleToggleTrackingWithExpiry(id, true, expiresAt);
                                  }}
                                  className="glass-btn secondary"
                                  style={{ fontSize: '10px', padding: '6px', flex: '1 0 30%', background: 'rgba(255,255,255,0.05)' }}
                                >
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                            <button
                              type="button"
                              onClick={() => setExpandedTrackingMenuId(null)}
                              className="glass-btn secondary"
                              style={{ fontSize: '10px', padding: '4px', marginTop: '4px', borderColor: 'rgba(255,255,255,0.1)' }}
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button 
                              onClick={() => {
                                const isActive = c.tracking_enabled !== false;
                                if (isActive) {
                                  // Direct toggle off in 1 tap
                                  handleToggleTrackingWithExpiry(id, false, null);
                                } else {
                                  // Open duration selector
                                  setExpandedTrackingMenuId(id);
                                }
                              }}
                              className="glass-btn secondary"
                              style={{ 
                                fontSize: '11px', 
                                padding: '6px 10px', 
                                flex: 1, 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center', 
                                gap: '4px',
                                background: c.tracking_enabled !== false ? 'rgba(74, 222, 128, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                borderColor: c.tracking_enabled !== false ? 'rgba(74, 222, 128, 0.3)' : 'rgba(239, 68, 68, 0.3)',
                                color: c.tracking_enabled !== false ? '#4ade80' : '#fca5a5'
                              }}
                              title={c.tracking_enabled !== false ? "Pausar rastreo GPS remotely (Ahorrar batería)" : "Establecer duración del rastreo GPS"}
                            >
                              {c.tracking_enabled !== false ? <Zap size={11} className="animate-pulse" /> : <Battery size={11} />}
                              <span>
                                {c.tracking_enabled !== false 
                                  ? `GPS: Activo (${getRemainingTimeText(c.tracking_expires_at)})` 
                                  : 'GPS: Suspendido'}
                              </span>
                            </button>
                            <button 
                              onClick={() => {
                                setSelectedChildForHistory({ id, name: c.name });
                                setIsHistoryModalOpen(true);
                              }}
                              className="glass-btn secondary"
                              style={{ fontSize: '11px', padding: '6px 10px', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                            >
                              <Clock size={12} /> Ver Ruta
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
              <p style={{ fontSize: '11px', opacity: 0.5, textTransform: 'uppercase', letterSpacing: '1px', margin: 0, textAlign: 'left' }}>Configuración</p>
              
              <button
                onClick={() => {
                  setSidebarView('zones');
                  setSafeZoneSubMenu('menu');
                }}
                className="glass-btn secondary"
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '10px', padding: '12px 16px', fontSize: '13px', background: 'rgba(236,72,153,0.05)', borderColor: 'rgba(236,72,153,0.2)', color: '#f472b6' }}
              >
                <ShieldAlert size={16} /> 📍 Gestionar Zonas Seguras
              </button>

              <button
                onClick={() => setSidebarView('qr')}
                className="glass-btn secondary"
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '10px', padding: '12px 16px', fontSize: '13px', background: 'rgba(139,92,246,0.05)', borderColor: 'rgba(139,92,246,0.2)', color: '#a78bfa' }}
              >
                <QrCode size={16} /> 🔗 Vincular Nuevo Dispositivo
              </button>
            </div>

            <div style={{ marginTop: 'auto', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '4px' }}>
                {avatarBase64 ? (
                  <img src={avatarBase64} alt={userName} style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover', border: '2px solid #8b5cf6' }} />
                ) : (
                  <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '16px' }}>{userName.charAt(0).toUpperCase()}</div>
                )}
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <p style={{ fontSize: '14px', fontWeight: 'bold', margin: 0 }}>{userName}</p>
                  <p style={{ fontSize: '12px', opacity: 0.6, margin: 0 }}>Tutor Principal (Padre)</p>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {updateAvailable ? (
                  <a 
                    href={latestReleaseUrl} 
                    target="_blank" 
                    rel="noreferrer"
                    className="glass-btn" 
                    style={{ background: 'rgba(236,72,153,0.2)', border: '1px solid #ec4899', color: '#f472b6', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px 14px', fontSize: '13px' }}
                  >
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f472b6', animation: 'pulse 1s infinite' }} />
                    ¡Nueva Versión {updateAvailable} Lista!
                  </a>
                ) : (
                  <button 
                    onClick={() => checkUpdates()} 
                    disabled={isCheckingUpdates}
                    className="glass-btn secondary" 
                    style={{ fontSize: '13px', padding: '10px 14px' }}
                  >
                    {isCheckingUpdates ? 'Buscando...' : 'Buscar Actualización'}
                  </button>
                )}

                {updateCheckResult === 'no_updates' && (
                  <p style={{ fontSize: '11px', color: '#4ade80', margin: '4px 0 0 0' }}>✓ La aplicación está al día v1.0.0</p>
                )}
                {updateCheckResult === 'error' && (
                  <p style={{ fontSize: '11px', color: '#fca5a5', margin: '4px 0 0 0' }}>❌ Error al consultar actualizaciones.</p>
                )}

                <button 
                  className="glass-btn secondary" 
                  style={{ border: '1px solid rgba(239, 68, 68, 0.3)', color: '#fca5a5', background: 'rgba(239, 68, 68, 0.05)', fontSize: '13px', padding: '10px 14px' }}
                  onClick={() => setIsUnlinkModalOpen(true)}
                >
                  <LogOut size={16} /> Cerrar Sesión
                </button>
              </div>

              <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', opacity: 0.6 }}>
                <span style={{ fontSize: '9px', color: 'rgba(255, 255, 255, 0.4)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600 }}>Desarrollado por</span>
                <span style={{ fontSize: '12px', color: '#fb923c', fontWeight: 'bold', textShadow: '0 0 8px rgba(251, 146, 60, 0.2)' }}>Adelio González</span>
              </div>
            </div>
          </>
        )}

        {sidebarView === 'qr' && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div className="menu-header" style={{ display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '16px', marginBottom: '24px' }}>
              <button 
                onClick={() => setSidebarView('main')}
                className="icon-btn" 
                style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '50%', padding: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <ArrowLeft size={20} />
              </button>
              <h2 style={{ fontSize: '16px', margin: 0, fontWeight: 'bold', color: 'white' }}>Vincular Dispositivo</h2>
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '20px' }}>
              <p style={{ fontSize: '13px', opacity: 0.8, textAlign: 'center', margin: 0, padding: '0 8px' }}>
                Escanea este código QR desde el dispositivo móvil de tu hijo para vincularlo a tu grupo familiar:
              </p>

              {familyCode ? (
                <div style={{ background: 'white', padding: '16px', borderRadius: '24px', display: 'inline-block', boxShadow: '0 8px 32px rgba(0,0,0,0.4)', border: '2px solid rgba(255,255,255,0.1)' }}>
                  <QRCode value={familyCode} size={180} />
                </div>
              ) : (
                <div style={{ opacity: 0.5, fontSize: '14px' }}>Cargando código de familia...</div>
              )}

              <div style={{ width: '100%', background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', boxSizing: 'border-box' }}>
                <span style={{ fontSize: '11px', opacity: 0.5, display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>Código de Vinculación Manual</span>
                <strong style={{ fontSize: '16px', color: '#a78bfa', fontFamily: 'monospace', letterSpacing: '1px', wordBreak: 'break-all' }}>{familyCode || '---'}</strong>
              </div>
            </div>

            <button 
              onClick={() => setSidebarView('main')}
              className="glass-btn primary"
              style={{ marginTop: 'auto', width: '100%', padding: '12px', fontSize: '13px', background: '#8b5cf6', borderColor: '#8b5cf6' }}
            >
              Volver al Menú Principal
            </button>
          </div>
        )}

        {sidebarView === 'zones' && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div className="menu-header" style={{ display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '16px', marginBottom: '24px' }}>
              <button 
                onClick={() => {
                  if (safeZoneSubMenu !== 'menu') {
                    setSafeZoneSubMenu('menu');
                  } else {
                    setSidebarView('main');
                  }
                }}
                className="icon-btn" 
                style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '50%', padding: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <ArrowLeft size={20} />
              </button>
              <h2 style={{ fontSize: '16px', margin: 0, fontWeight: 'bold', color: 'white' }}>
                {safeZoneSubMenu === 'create_select_child' ? 'Programar Zona' : safeZoneSubMenu === 'manage' ? 'Gestionar Zonas' : 'Zonas Seguras'}
              </h2>
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {safeZoneSubMenu === 'menu' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', justifyContent: 'center', flex: 1 }}>
                  <p style={{ fontSize: '13px', opacity: 0.8, textAlign: 'center', marginBottom: '16px' }}>
                    Las zonas seguras te avisan de forma instantánea cuando tus hijos entran o salen de áreas de interés.
                  </p>
                  <button 
                    onClick={() => setSafeZoneSubMenu('create_select_child')}
                    className="glass-btn primary"
                    style={{ width: '100%', padding: '14px 16px', fontSize: '13px', background: '#ec4899', borderColor: '#ec4899', color: 'white', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                  >
                    ✏️ Programar Nueva Zona
                  </button>
                  <button 
                    onClick={() => setSafeZoneSubMenu('manage')}
                    className="glass-btn secondary"
                    style={{ width: '100%', padding: '14px 16px', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                  >
                    ⚙️ Activar / Gestionar Zonas ({safeZones.length})
                  </button>
                </div>
              )}

              {safeZoneSubMenu === 'create_select_child' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', textAlign: 'left' }}>
                  <p style={{ fontSize: '13px', opacity: 0.8, margin: 0 }}>
                    Selecciona para cuál de tus hijos deseas crear una nueva zona segura:
                  </p>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '11px', opacity: 0.5, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Familiar:</label>
                    <select
                      value={newZoneChildId}
                      onChange={(e) => setNewZoneChildId(e.target.value)}
                      className="glass-input"
                      style={{ margin: 0, fontSize: '14px', padding: '10px', background: 'rgba(30, 27, 75, 0.95)', color: 'white', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '10px', width: '100%' }}
                    >
                      <option value="" disabled>Seleccionar un hijo...</option>
                      {Object.entries(clients)
                        .filter(([_, c]) => c.role === 'client')
                        .map(([id, c]) => (
                          <option key={id} value={id}>{c.name}</option>
                        ))
                      }
                    </select>
                  </div>

                  <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
                    <button
                      onClick={() => {
                        if (!newZoneChildId) {
                          alert("Por favor, selecciona un familiar.");
                          return;
                        }
                        setIsProgrammingSafeZone(true);
                        setEditingSafeZoneId(null);
                        setNewZoneName('');
                        setNewZoneRadius(100);
                        setNewZoneLat(null);
                        setNewZoneLng(null);
                        setIsAutoCentering(false);
                        setIsMenuOpen(false);
                        showToast("📍 Modo libre: Navega por el mapa y mantén presionado (1-2s) para ubicar el centro.");
                      }}
                      className="glass-btn primary"
                      style={{ flex: 1, padding: '12px', fontSize: '13px', background: '#ec4899', borderColor: '#ec4899', color: 'white', fontWeight: 'bold' }}
                    >
                      Siguiente
                    </button>
                    <button
                      onClick={() => setSafeZoneSubMenu('menu')}
                      className="glass-btn secondary"
                      style={{ flex: 1, padding: '12px', fontSize: '13px' }}
                    >
                      Atrás
                    </button>
                  </div>
                </div>
              )}

              {safeZoneSubMenu === 'manage' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', height: '100%' }}>
                  <span style={{ fontSize: '12px', opacity: 0.8, textAlign: 'left' }}>Listado de zonas configuradas:</span>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: 'calc(100vh - 240px)', overflowY: 'auto', paddingRight: '4px' }}>
                    {safeZones.length === 0 ? (
                      <p style={{ fontSize: '13px', opacity: 0.5, textAlign: 'center', margin: '32px 0' }}>Aún no has configurado ninguna zona segura.</p>
                    ) : (
                      safeZones.map(zone => {
                        const childName = clients[zone.child_id]?.name || 'Hijo';
                        return (
                          <div key={zone.id} style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.06)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#f472b6', textAlign: 'left' }}>
                                Zona de {childName}
                              </span>
                              <input 
                                type="checkbox" 
                                checked={zone.is_active}
                                onChange={(e) => toggleSafeZone(zone.id, e.target.checked)}
                                style={{ accentColor: '#ec4899', cursor: 'pointer', width: '16px', height: '16px' }}
                                title={zone.is_active ? "Desactivar zona" : "Activar zona"}
                              />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', opacity: 0.8 }}>
                              <span style={{ fontWeight: '600', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '140px', textAlign: 'left' }}>
                                {zone.name}
                              </span>
                              <span>Radio: {zone.radius}m</span>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                              <button
                                onClick={() => {
                                  setIsProgrammingSafeZone(true);
                                  setEditingSafeZoneId(zone.id);
                                  setNewZoneName(zone.name);
                                  setNewZoneRadius(zone.radius);
                                  setNewZoneLat(zone.latitude);
                                  setNewZoneLng(zone.longitude);
                                  setNewZoneChildId(zone.child_id);
                                  setIsAutoCentering(false);
                                  setIsMenuOpen(false);
                                  showToast("✏️ Editando zona. Mantén pulsado el mapa para reubicar si lo deseas.");
                                }}
                                className="glass-btn secondary"
                                style={{ flex: 1, padding: '6px', fontSize: '11px' }}
                              >
                                Editar
                              </button>
                              <button
                                onClick={() => {
                                  if (window.confirm(`¿Seguro que deseas eliminar la zona "${zone.name}" de ${childName}?`)) {
                                    deleteSafeZone(zone.id);
                                  }
                                }}
                                className="glass-btn secondary"
                                style={{ flex: 1, padding: '6px', fontSize: '11px', color: '#fca5a5', borderColor: 'rgba(239, 68, 68, 0.2)' }}
                              >
                                Eliminar
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  <button
                    onClick={() => setSafeZoneSubMenu('create_select_child')}
                    className="glass-btn primary"
                    style={{ width: '100%', padding: '12px', fontSize: '13px', background: '#ec4899', borderColor: '#ec4899', color: 'white', marginTop: 'auto' }}
                  >
                    ➕ Crear Nueva Zona Segura
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* LOGOUT CONFIRMATION MODAL */}
      {isUnlinkModalOpen && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '340px', padding: '24px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ fontSize: '18px', color: '#fca5a5', margin: 0 }}>Confirmar Salida</h3>
            <p style={{ fontSize: '13px', opacity: 0.8, margin: 0 }}>
              Para cerrar sesión o desvincular este dispositivo, escribe exactamente tu nombre de usuario <strong>{userName}</strong> a continuación:
            </p>
            <input 
              type="text" 
              value={unlinkConfirmName}
              onChange={(e) => setUnlinkConfirmName(e.target.value)}
              className="glass-input"
              placeholder="Escribe tu nombre de usuario"
              style={{ margin: 0 }}
            />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                onClick={confirmLogout}
                disabled={unlinkConfirmName.trim() !== userName.trim()}
                className="glass-btn primary"
                style={{ flex: 1, background: '#ef4444', borderColor: '#ef4444', opacity: unlinkConfirmName.trim() === userName.trim() ? 1 : 0.4 }}
              >
                Cerrar Sesión
              </button>
              <button 
                onClick={() => { setIsUnlinkModalOpen(false); setUnlinkConfirmName(''); }}
                className="glass-btn secondary"
                style={{ flex: 1 }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SELECTOR DE RANGO HISTÓRICO */}
      {isHistoryModalOpen && selectedChildForHistory && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '340px', padding: '24px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ fontSize: '18px', color: '#ec4899', margin: 0 }}>Ruta de {selectedChildForHistory.name}</h3>
            <p style={{ fontSize: '13px', opacity: 0.8, margin: 0 }}>
              Selecciona el período o fecha que deseas ver en el mapa:
            </p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button 
                onClick={() => {
                  showHistoricalRoute(selectedChildForHistory.id, selectedChildForHistory.name, 'today');
                  setIsHistoryModalOpen(false);
                }}
                className="glass-btn primary"
                style={{ background: 'rgba(236, 72, 153, 0.1)', borderColor: '#ec4899', color: 'white' }}
              >
                📅 Hoy (Últimas horas)
              </button>
              
              <button 
                onClick={() => {
                  showHistoricalRoute(selectedChildForHistory.id, selectedChildForHistory.name, 'yesterday');
                  setIsHistoryModalOpen(false);
                }}
                className="glass-btn primary"
                style={{ background: 'rgba(139, 92, 246, 0.1)', borderColor: '#8b5cf6', color: 'white' }}
              >
                📅 Ayer
              </button>
              
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '10px', marginTop: '4px' }}>
                <p style={{ fontSize: '12px', opacity: 0.6, margin: '0 0 6px 0', textAlign: 'left' }}>Fecha específica:</p>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input 
                    type="date"
                    value={customHistoryDate}
                    max={new Date().toISOString().split('T')[0]}
                    onChange={(e) => setCustomHistoryDate(e.target.value)}
                    className="glass-input"
                    style={{ margin: 0, flex: 1, padding: '8px', fontSize: '13px', color: 'white', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                  />
                  <button
                    onClick={() => {
                      if (!customHistoryDate) return;
                      showHistoricalRoute(selectedChildForHistory.id, selectedChildForHistory.name, 'custom', customHistoryDate);
                      setIsHistoryModalOpen(false);
                    }}
                    disabled={!customHistoryDate}
                    className="glass-btn primary"
                    style={{ padding: '8px 12px', fontSize: '13px', opacity: customHistoryDate ? 1 : 0.5 }}
                  >
                    Ver
                  </button>
                </div>
              </div>

              <button 
                onClick={() => {
                  showHistoricalRoute(selectedChildForHistory.id, selectedChildForHistory.name, 'all');
                  setIsHistoryModalOpen(false);
                }}
                className="glass-btn secondary"
                style={{ fontSize: '12px', padding: '8px', marginTop: '6px' }}
              >
                🔄 Ver todo el historial (30 días)
              </button>
            </div>

            <button 
              onClick={() => { setIsHistoryModalOpen(false); setSelectedChildForHistory(null); setCustomHistoryDate(''); }}
              className="glass-btn secondary"
              style={{ width: '100%', marginTop: '4px' }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* PANEL DE CHAT TÁCTICO */}
      {isChatOpen && (
        <div className="tactical-chat-overlay" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 12, 41, 0.95)', zIndex: 9999, display: 'flex', flexDirection: 'column' }}>
          <div className="chat-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            <h3 style={{ fontSize: '18px', margin: 0, color: 'white', display: 'flex', alignItems: 'center', gap: '8px' }}><MessageSquare size={20} color="#ec4899" /> Chat Familiar</h3>
            <button className="icon-btn" onClick={() => setIsChatOpen(false)}><X size={24} /></button>
          </div>

          <div ref={chatScrollRef} className="chat-messages" style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {messages.length === 0 ? (
              <div style={{ margin: 'auto', opacity: 0.5, fontSize: '14px' }}>Historial vacío. Envía un mensaje táctico.</div>
            ) : (
              messages.map(m => {
                const isMe = m.senderName === userName;
                return (
                  <div key={m.id} style={{ alignSelf: isMe ? 'flex-end' : 'flex-start', maxWidth: '75%', display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                    <span style={{ fontSize: '10px', opacity: 0.5, marginBottom: '2px' }}>{m.senderName}</span>
                    <div style={{ background: isMe ? '#8b5cf6' : 'rgba(255,255,255,0.1)', padding: '10px 14px', borderRadius: '16px', border: isMe ? 'none' : '1px solid rgba(255,255,255,0.1)', color: 'white', fontSize: '14px', textAlign: 'left', wordBreak: 'break-word' }}>
                      {m.type === 'TEXT' && m.content}
                      {m.type === 'IMAGE' && <img src={m.content} alt="Image" style={{ maxWidth: '100%', borderRadius: '10px', display: 'block' }} />}
                      {m.type === 'AUDIO' && (
                        <audio src={m.content} controls style={{ maxWidth: '180px', height: '36px' }} />
                      )}
                    </div>
                    <span style={{ fontSize: '9px', opacity: 0.4, marginTop: '2px' }}>{new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                );
              })
            )}
          </div>

          <div className="chat-input-area" style={{ padding: '16px', background: 'rgba(0,0,0,0.4)', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <input 
              type="file" 
              ref={fileInputRef} 
              accept="image/*" 
              onChange={handleFileChange} 
              style={{ display: 'none' }} 
            />
            <input 
              type="file" 
              ref={cameraInputRef} 
              accept="image/*" 
              capture="environment" 
              onChange={handleFileChange} 
              style={{ display: 'none' }} 
            />

            <button 
              className="chat-action-btn"
              onClick={() => cameraInputRef.current?.click()}
              title="Tomar Foto"
              style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', width: '40px', height: '40px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            >
              <Camera size={18} />
            </button>
            <button 
              className="chat-action-btn"
              onClick={() => fileInputRef.current?.click()}
              title="Adjuntar Imagen"
              style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', width: '40px', height: '40px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            >
              <Image size={18} />
            </button>

            <input 
              type="text" 
              value={textInput} 
              onChange={(e) => setTextInput(e.target.value)} 
              placeholder="Mensaje..." 
              onKeyDown={(e) => { if (e.key === 'Enter') handleSendText(); }}
              className="glass-input"
              style={{ flex: 1, margin: 0, padding: '8px 16px', fontSize: '14px' }}
            />

            {textInput.trim() ? (
              <button 
                onClick={handleSendText}
                style={{ background: '#ec4899', border: 'none', color: 'white', width: '40px', height: '40px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              >
                <Send size={18} />
              </button>
            ) : (
              <button 
                onMouseDown={toggleRecording} 
                onMouseUp={toggleRecording}
                onTouchStart={toggleRecording}
                onTouchEnd={toggleRecording}
                disabled={isProcessingMic}
                style={{ background: isRecording ? '#ef4444' : 'rgba(255,255,255,0.1)', border: 'none', color: 'white', width: '40px', height: '40px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', position: 'relative' }}
              >
                <Mic size={18} />
                {isRecording && <span style={{ position: 'absolute', top: '-10px', right: '-10px', background: '#ef4444', borderRadius: '50%', width: '12px', height: '12px', animation: 'pulse 1s infinite' }} />}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
