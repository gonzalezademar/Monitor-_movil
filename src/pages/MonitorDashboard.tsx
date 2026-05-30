import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import React, { useState, useEffect, useRef } from 'react';
import { useStore, playTonalSound, type ChatMessage } from '../store/useStore';
import { useNavigate } from 'react-router-dom';
import { QRCode } from 'react-qr-code';
import { Menu, X, QrCode, LogOut, AlertCircle, ShieldAlert, Smartphone, MessageSquare, Send, Mic, Bell, Camera, Sun, Moon, Image, Clock, Zap, Battery } from 'lucide-react';
import { Geolocation } from '@capacitor/geolocation';
import { supabase } from '../supabaseClient';
import developerLogo from '../assets/developer_logo.png';

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
  useEffect(() => {
    if (target) {
      map.flyTo(target, 16, { animate: true, duration: 1.5 });
    }
  }, [target, map]);
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

export default function MonitorDashboard() {
  const [showQR, setShowQR] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  
  const { 
    userId,
    familyId,
    familyCode,
    logout, 
    fenceRadius, 
    setFenceRadius, 
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
    updateTrackingStatus
  } = useStore();

  const navigate = useNavigate();
  const openMenu = () => {
    resetUpdateCheckResult();
    setIsMenuOpen(true);
  };
  const [localRadius, setLocalRadius] = useState(fenceRadius);

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
  const [clients, setClients] = useState<Record<string, { lat: number; lng: number; name: string, lastSeen: number, isOnline: boolean, avatar: string | null, role: 'monitor' | 'client', tracking_enabled?: boolean }>>({});
  const [alarmActive, setAlarmActive] = useState<{ active: boolean; originName: string }>({ active: false, originName: '' });
  const [mapCenterTarget, setMapCenterTarget] = useState<[number, number] | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [mapTheme, setMapTheme] = useState<'dark' | 'light'>('dark');
  const [isSirenOn, setIsSirenOn] = useState(false);
  const [trackingTargetId, setTrackingTargetId] = useState<string>('me');

  const toggleClientTracking = async (clientId: string, currentStatus: boolean) => {
    setClients(prev => {
      const updated = { ...prev };
      if (updated[clientId]) {
        updated[clientId] = {
          ...updated[clientId],
          tracking_enabled: !currentStatus
        };
      }
      return updated;
    });

    const { error } = await updateTrackingStatus(clientId, !currentStatus);
    if (error) {
      setClients(prev => {
        const updated = { ...prev };
        if (updated[clientId]) {
          updated[clientId] = {
            ...updated[clientId],
            tracking_enabled: currentStatus
          };
        }
        return updated;
      });
      alert("Error al actualizar estado de rastreo: " + error);
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
  const [accompaniedClients, setAccompaniedClients] = useState<Record<string, number>>({});

  const markerIconCache = useRef<Record<string, L.DivIcon>>({});
  const getAvatarIcon = (id: string, avatar: string | null, isOnline: boolean, isMonitor: boolean, isAccompanied?: boolean) => {
    const cacheKey = `${id}_${isOnline ? 'on' : 'off'}_${avatar || 'no_avatar'}_${isMonitor ? 'monitor' : 'client'}_${isAccompanied ? 'acc' : 'no_acc'}`;
    if (!markerIconCache.current[cacheKey]) {
      const size = isMonitor ? 36 : 40;
      let color = isMonitor ? '#c084fc' : (isOnline ? '#4ade80' : '#9ca3af');
      if (isAccompanied) {
        color = '#ec4899';
      }
      markerIconCache.current[cacheKey] = L.divIcon({
        className: `custom-avatar-marker ${isAccompanied ? 'accompanied-glow' : ''}`,
        html: avatar 
          ? `<div style="width:${size}px;height:${size}px;border-radius:50%;overflow:hidden;border:3px solid ${color};box-shadow:0 0 10px ${color};"><img src="${avatar}" style="width:100%;height:100%;object-fit:cover;" /></div>` 
          : `<div style="width:${size}px;height:${size}px;background:${color};border-radius:50%;border:2px solid white;"></div>`,
        iconSize: [size, size],
        iconAnchor: [size/2, size/2]
      });
    }
    return markerIconCache.current[cacheKey];
  };

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
    if (wtMediaRecorderRef.current && wtMediaRecorderRef.current.state !== 'inactive') {
      wtMediaRecorderRef.current.stop();
    }
    setIsWtRecording(false);
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

  // 1. Fetch details & Realtime Subscriptions
  useEffect(() => {
    if (!familyId || !userId) return;

    checkUpdates();

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
              tracking_enabled: p.tracking_enabled !== false
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
              membersMap[l.user_id].isOnline = (Date.now() - new Date(l.updated_at).getTime() < 60000);
            }
          });
        }
        setClients(membersMap);
      }
    };

    fetchChatMessages();
    fetchFamilyDetails();

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
                
                // Geofence checking
                if (myLocation) {
                  const dist = getDistance(myLocation[0], myLocation[1], row.latitude, row.longitude);
                  if (dist > localRadius) {
                    const currentStrikes = (geofenceStrikesRef.current[clientName] || 0) + 1;
                    geofenceStrikesRef.current[clientName] = currentStrikes;
                    
                    if (currentStrikes === 3) {
                      showToast(`⚠️ ${clientName} salió de la zona segura (${Math.round(dist)}m)`);
                      playTonalSound('GEOFENCE_BREACH');
                    } else if (currentStrikes > 3 && currentStrikes % 10 === 0) {
                      showToast(`⚠️ ${clientName} sigue fuera de zona (${Math.round(dist)}m)`);
                      playTonalSound('GEOFENCE_BREACH');
                    }
                  } else {
                    if ((geofenceStrikesRef.current[clientName] || 0) >= 3) {
                      showToast(`✅ ${clientName} regresó a la zona segura.`);
                    }
                    geofenceStrikesRef.current[clientName] = 0;
                  }
                }

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
                  tracking_enabled: row.tracking_enabled !== false
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
          const { senderId, expiresAt } = payload.payload;
          setAccompaniedClients(prev => ({
            ...prev,
            [senderId]: expiresAt
          }));
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
  }, [familyId, userId, myLocation, localRadius, addMessage, checkUpdates]);

  // Cleanup active timeouts/intervals on unmount to prevent state updates/audio leaks
  useEffect(() => {
    return () => {
      stopSiren();
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
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
    if (!trackingTargetId) return;
    if (trackingTargetId === 'me') {
      if (myLocation) setMapCenterTarget(myLocation);
    } else {
      const client = clients[trackingTargetId];
      if (client && client.lat !== 0 && client.lng !== 0) {
        setMapCenterTarget([client.lat, client.lng]);
      }
    }
  }, [trackingTargetId, myLocation, clients]);

  // Periodic connection timeouts watcher
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setClients(prev => {
        const updated = { ...prev };
        let changed = false;
        for (let id in updated) {
          if (updated[id].isOnline && (now - updated[id].lastSeen > 60000)) {
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
      {toastMessage && (
        <div style={{ position: 'absolute', top: 75, left: '50%', transform: 'translateX(-50%)', background: 'rgba(30, 27, 75, 0.95)', border: '1px solid rgba(255, 255, 255, 0.1)', color: 'white', padding: '12px 24px', borderRadius: '12px', zIndex: 9999, fontSize: '13px', boxShadow: '0 4px 20px rgba(0,0,0,0.3)', pointerEvents: 'none' }}>
          {toastMessage}
        </div>
      )}

      {gpsError && (
        <div style={{ position: 'absolute', top: 60, left: 0, right: 0, background: '#ef4444', color: 'white', padding: '12px', textAlign: 'center', zIndex: 9999, fontWeight: 'bold' }}>
          {gpsError}
        </div>
      )}

      {alarmActive.active && (
        <div className="alarm-banner" style={{ position: 'absolute', top: '16px', left: '50%', transform: 'translateX(-50%)', zIndex: 9999, background: '#ef4444', padding: '16px 24px', borderRadius: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', boxShadow: '0 8px 32px rgba(239, 68, 68, 0.4)', color: 'white' }}>
          <AlertCircle size={32} style={{ animation: 'bounce 1s infinite' }} />
          <div>
            <h3 style={{ margin: 0, fontSize: '16px' }}>🚨 ¡SOS ACTIVO!</h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', opacity: 0.9 }}>
              {alarmActive.originName} ha iniciado una alerta de emergencia.
            </p>
          </div>
          <button onClick={stopSiren} className="glass-btn secondary" style={{ color: 'white', borderColor: 'white', width: '100%' }}>
            Silenciar Alerta Local
          </button>
        </div>
      )}

      <MapContainer center={myLocation || [-34.6037, -58.3816]} zoom={15} style={{ height: '100dvh', width: '100vw' }} zoomControl={false}>
        <MapAutoCenter target={mapCenterTarget} />
        <TileLayer url={mapTheme === 'dark' ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"} />
        
        {myLocation && (
          <>
            <Marker 
              position={myLocation} 
              icon={getAvatarIcon(userId || 'me', avatarBase64, true, true)}
              eventHandlers={{
                click: () => {
                  setTrackingTargetId('me');
                  setMapCenterTarget(myLocation);
                }
              }}
            >
              <Popup>Tú (Padre / Tutor)</Popup>
            </Marker>
            <Circle center={myLocation} radius={localRadius} pathOptions={{ color: '#ec4899', fillColor: '#ec4899', fillOpacity: 0.08 }} />
          </>
        )}

        {Object.entries(clients).map(([id, client]) => {
          if (client.lat === 0 && client.lng === 0) return null;
          const isAccompanied = !!(accompaniedClients[id] && (accompaniedClients[id] > Date.now()));
          return (
            <React.Fragment key={id}>
              <Marker 
                position={[client.lat, client.lng]} 
                icon={getAvatarIcon(id, client.avatar, client.isOnline, client.role === 'monitor', isAccompanied)}
                eventHandlers={{
                  click: () => {
                    setTrackingTargetId(id);
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
        <button 
          className={`map-avatar-btn ${trackingTargetId === 'me' ? 'active' : ''}`}
          onClick={() => {
            setTrackingTargetId('me');
            if (myLocation) setMapCenterTarget(myLocation);
          }}
          title="Centrar en mí"
        >
          {avatarBase64 ? (
            <img src={avatarBase64} alt="Yo" />
          ) : (
            <div className="map-avatar-placeholder">{(userName || '?').charAt(0).toUpperCase()}</div>
          )}
        </button>

        {Object.entries(clients).map(([id, client]) => (
          <button
            key={id}
            className={`map-avatar-btn ${trackingTargetId === id ? 'active' : ''} ${client.role === 'monitor' ? 'monitor' : ''}`}
            onClick={() => {
              setTrackingTargetId(id);
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
        ))}
      </div>

      {/* Menu floating button */}
      <button 
        className="menu-btn" 
        onClick={openMenu} 
        style={{ position: 'absolute', top: '16px', left: '16px', zIndex: 1000 }}
      >
        <Menu size={24} />
      </button>

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
        <Mic size={24} style={{ animation: isWtRecording ? 'pulse 1s infinite' : 'none' }} />
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

      {/* Logo corporativo flotante en mapa (esquina inferior derecha) */}
      <div className="floating-brand-logo">
        <img src={developerLogo} alt="AG Creation" className="dev-brand-logo" style={{ width: '100%' }} />
      </div>

      {isMenuOpen && <div className="side-menu-overlay" onClick={() => setIsMenuOpen(false)} />}
      <div className={`side-menu ${isMenuOpen ? 'open' : ''}`}>
        <div className="menu-header" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <h2 style={{ fontSize: '18px', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}><ShieldAlert size={20} color="#ec4899" />Radar Familiar</h2>
            <button className="icon-btn" onClick={() => setIsMenuOpen(false)} style={{ marginRight: '-8px' }}><X size={24} /></button>
          </div>
          <div style={{ paddingLeft: '4px', width: '100%' }}>
            <img src={developerLogo} alt="AG Creation" className="dev-brand-logo" style={{ width: '190px' }} />
          </div>
        </div>
        
        <div style={{ marginBottom: '32px' }}>
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
                      <span style={{ fontSize: '11px', opacity: 0.6 }}>{c.isOnline ? 'En línea (Nube)' : 'Desconectado'}</span>
                    </div>
                    <div className={c.isOnline ? 'led-green' : 'led-red'} style={{ width: '8px', height: '8px', borderRadius: '50%' }}></div>
                  </div>
                  
                  {/* Remote tracking / battery toggle */}
                  <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                    <button 
                      onClick={() => toggleClientTracking(id, c.tracking_enabled !== false)}
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
                      title={c.tracking_enabled !== false ? "Pausar rastreo GPS del hijo remotely (Ahorrar batería)" : "Re-activar rastreo GPS del hijo"}
                    >
                      {c.tracking_enabled !== false ? <Zap size={11} className="animate-pulse" /> : <Battery size={11} />}
                      {c.tracking_enabled !== false ? 'GPS: Activo' : 'GPS: Suspendido'}
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
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ marginBottom: '32px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <p style={{ fontSize: '11px', opacity: 0.5, textTransform: 'uppercase', letterSpacing: '1px', margin: 0 }}>Zona Segura</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '14px' }}>Radio: {localRadius}m</span>
            <input 
              type="range" 
              min="50" 
              max="2000" 
              step="50" 
              value={localRadius} 
              onChange={(e) => {
                const val = Number(e.target.value);
                setLocalRadius(val);
                setFenceRadius(val);
              }} 
              style={{ flex: 1, accentColor: '#ec4899' }} 
            />
          </div>
        </div>

        <div style={{ marginBottom: '32px' }}>
          <button 
            className="glass-btn secondary" 
            onClick={() => setShowQR(!showQR)} 
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px 14px', fontSize: '13px' }}
          >
            <QrCode size={16} /> {showQR ? 'Ocultar QR' : 'Mostrar QR para Vincular'}
          </button>
          
          {showQR && familyCode && (
            <div style={{ marginTop: '16px', background: 'white', padding: '16px', borderRadius: '16px', display: 'inline-block', boxShadow: '0 4px 20px rgba(0,0,0,0.2)' }}>
              <QRCode value={familyCode} size={150} />
              <p style={{ color: 'black', fontSize: '10px', margin: '8px 0 0 0', wordBreak: 'break-all' }}>ID: {familyCode}</p>
            </div>
          )}
        </div>

        {/* Sección "Mi Perfil y Aplicación" */}
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
        </div>
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
