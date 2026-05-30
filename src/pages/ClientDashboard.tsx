import { useStore, playTonalSound, type ChatMessage } from '../store/useStore';
import { useRef, useEffect, useState, useMemo } from 'react';
import { Geolocation } from '@capacitor/geolocation';
import { MapContainer, TileLayer, Marker, useMap, Popup, Circle } from 'react-leaflet';
import L from 'leaflet';
import { ShieldAlert, Bell, MessageSquare, LogOut, Mic, Send, X, Camera, Menu, Smartphone, Sun, Moon, Image, Radar, Zap, Battery, Check, Clock } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import { supabase } from '../supabaseClient';
import { Scanner } from '@yudiel/react-qr-scanner';

import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import developerLogo from '../assets/developer_logo.png';

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

export default function ClientDashboard() {
  const { 
    userId, 
    familyId, 
    userName, 
    avatarBase64, 
    isSOSActive, 
    setSOSActive, 
    logout, 
    messages, 
    addMessage, 
    checkUpdates, 
    updateAvailable, 
    latestReleaseUrl, 
    isCheckingUpdates, 
    updateCheckResult, 
    resetUpdateCheckResult,
    unlinkFamily,
    joinFamily
  } = useStore();

  const openMenu = () => {
    resetUpdateCheckResult();
    setIsMenuOpen(true);
  };

  const sosTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tapCountRef  = useRef(0);

  const [myLocation, setMyLocation] = useState<[number, number] | null>(null);
  const [familyMembers, setFamilyMembers] = useState<Record<string, { name: string; avatar: string | null; role: 'monitor' | 'client'; lat: number; lng: number; isOnline: boolean }>>({});
  const [ghostModeActive, setGhostModeActive] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Scanning / Linking State (for unlinked clients)
  const [manualCodeInput, setManualCodeInput] = useState('');
  const [formError, setFormError] = useState('');
  const [cameraError, setCameraError] = useState('');
  const [scanError, setScanError] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  // Battery / GPS active tracking status
  const [trackingEnabled, setTrackingEnabled] = useState(true);
  const [mapCenterTarget, setMapCenterTarget] = useState<[number, number] | null>(null);
  const [mapTheme, setMapTheme] = useState<'dark' | 'light'>('dark');
  const [trackingTargetId, setTrackingTargetId] = useState<string>('me');

  const audioCtxRef = useRef<AudioContext | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const [isRemoteAlarmActive, setIsRemoteAlarmActive] = useState(false);

  // Chat State
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessingMic, setIsProcessingMic] = useState(false);
  const [isUnlinkModalOpen, setIsUnlinkModalOpen] = useState(false);
  const [unlinkConfirmName, setUnlinkConfirmName] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
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

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const cancelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wakeLockRef = useRef<any>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const discardRecordingRef = useRef<boolean>(false);

  // Icons caching
  const myIcon = useMemo(() => L.divIcon({ 
    className: 'custom-avatar-marker', 
    html: avatarBase64 
      ? `<div style="width:36px;height:36px;border-radius:50%;overflow:hidden;border:2px solid #4ade80;box-shadow:0 0 10px rgba(74,222,128,0.5);"><img src="${avatarBase64}" style="width:100%;height:100%;object-fit:cover;" /></div>` 
      : `<div style="width:24px;height:24px;background:#4ade80;border-radius:50%;border:2px solid white;"></div>`, 
    iconSize: [36, 36], 
    iconAnchor: [18, 18] 
  }), [avatarBase64]);

  // Walkie-Talkie & Acompáñame States
  const [isWtRecording, setIsWtRecording] = useState(false);
  const [isWtPlaying, setIsWtPlaying] = useState(false);
  const [wtSender, setWtSender] = useState<string | null>(null);
  const wtMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const wtAudioChunksRef = useRef<Blob[]>([]);
  const wtTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Acompáñame States
  const [accompaniedExpiresAt, setAccompaniedExpiresAt] = useState<number | null>(null);
  const [accompaniedTimeLeft, setAccompaniedTimeLeft] = useState<string>('');
  const accompaniedExpiresAtRef = useRef<number | null>(null);

  useEffect(() => {
    accompaniedExpiresAtRef.current = accompaniedExpiresAt;
  }, [accompaniedExpiresAt]);

  const markerIconCache = useRef<Record<string, L.DivIcon>>({});
  const [gpsError, setGpsError] = useState<string | null>(null);

  const getAvatarIcon = (id: string, avatar: string | null, isOnline: boolean, isMonitor: boolean, isAccompanied?: boolean) => {
    const key = `${id}-${avatar || 'noavatar'}-${isOnline ? 'on' : 'off'}-${isAccompanied ? 'acc' : 'noacc'}`;
    if (!markerIconCache.current[key]) {
      let borderColor = isMonitor ? '#8b5cf6' : '#ec4899';
      let shadowColor = isMonitor ? 'rgba(139,92,246,0.4)' : 'rgba(236,72,153,0.4)';
      if (isAccompanied) {
        borderColor = '#ec4899';
        shadowColor = 'rgba(236,72,153,0.8)';
      }
      const opacity = isOnline ? '1' : '0.55';

      markerIconCache.current[key] = L.divIcon({
        className: `custom-member-marker ${isOnline ? 'online' : 'offline'} ${isAccompanied ? 'accompanied-glow' : ''}`,
        html: avatar 
          ? `<div style="width:36px;height:36px;border-radius:50%;overflow:hidden;border:2px solid ${borderColor};box-shadow:0 0 10px ${shadowColor};opacity:${opacity};"><img src="${avatar}" style="width:100%;height:100%;object-fit:cover;" /></div>`
          : `<div style="width:24px;height:24px;background:${borderColor};border-radius:50%;border:2px solid white;opacity:${opacity};"></div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18]
      });
    }
    return markerIconCache.current[key];
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

  const sendCheckIn = () => {
    supabase.channel(`broadcast-${familyId}`).send({
      type: 'broadcast',
      event: 'check-in',
      payload: {
        senderName: userName,
        senderId: userId
      }
    });
    showToast("¡Check-in 'Llegué Bien' enviado!");
    playTonalSound('P2P_HANDSHAKE');
  };

  const toggleAccompaniedMode = () => {
    if (accompaniedExpiresAt) {
      // Cancel
      setAccompaniedExpiresAt(null);
      supabase.channel(`broadcast-${familyId}`).send({
        type: 'broadcast',
        event: 'acompaniame-stop',
        payload: { senderId: userId }
      });
      showToast("Modo Acompáñame desactivado.");
    } else {
      // Start
      const expires = Date.now() + 15 * 60 * 1000;
      setAccompaniedExpiresAt(expires);
      supabase.channel(`broadcast-${familyId}`).send({
        type: 'broadcast',
        event: 'acompaniame-report',
        payload: { senderId: userId, expiresAt: expires, senderName: userName }
      });
      showToast("Modo Acompáñame ACTIVADO por 15 min.");
      playTonalSound('CHAT_RECEIVE');
    }
  };

  // Timer ticker for Acompáñame
  useEffect(() => {
    if (!accompaniedExpiresAt) {
      setAccompaniedTimeLeft('');
      return;
    }

    const updateTimer = () => {
      const diff = accompaniedExpiresAt - Date.now();
      if (diff <= 0) {
        setAccompaniedExpiresAt(null);
        supabase.channel(`broadcast-${familyId}`).send({
          type: 'broadcast',
          event: 'acompaniame-stop',
          payload: { senderId: userId }
        });
        showToast("El tiempo de acompañamiento ha terminado.");
        playTonalSound('P2P_LOST');
        return;
      }
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setAccompaniedTimeLeft(`${mins}:${secs < 10 ? '0' : ''}${secs}`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [accompaniedExpiresAt, familyId, userId]);

  const acquireWakeLock = async () => {
    try {
      if ('wakeLock' in navigator && !wakeLockRef.current) {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
      }
    } catch (e) { console.log('Wakelock failed', e); }
  };

  const releaseWakeLock = () => {
    if (wakeLockRef.current) { wakeLockRef.current.release(); wakeLockRef.current = null; }
  };

  const playRemoteAlarm = () => {
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
    osc.frequency.linearRampToValueAtTime(1200, ctx.currentTime + 0.2);
    osc.frequency.linearRampToValueAtTime(600, ctx.currentTime + 0.4);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    oscillatorRef.current = osc;
    setIsRemoteAlarmActive(true);
    
    if ('vibrate' in navigator) {
      navigator.vibrate([500, 200, 500, 200, 500, 200, 500]);
    }
  };

  const stopRemoteAlarm = () => {
    if (oscillatorRef.current) {
      oscillatorRef.current.stop();
      oscillatorRef.current.disconnect();
      oscillatorRef.current = null;
    }
    setIsRemoteAlarmActive(false);
  };

  // 1. Initial Sync and Realtime subscriptions
  useEffect(() => {
    if (!familyId || !userId) return;

    checkUpdates();

    // Fetch initial chat history
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

    // Fetch initial family members
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
              isOnline: false
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
        setFamilyMembers(membersMap);
      }
    };

    fetchChatMessages();
    fetchFamilyDetails();

    // Subscribe to alerts
    const alertsSub = supabase
      .channel(`alerts-${familyId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'alerts' },
        (payload: any) => {
          if (payload.new && payload.new.family_id === familyId) {
            const data = payload.new;
            // Listen to remote siren trigger (if active and triggered by another profile)
            if (data.siren_active && data.origin_user_id !== userId) {
              playRemoteAlarm();
            } else if (!data.siren_active) {
              stopRemoteAlarm();
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
            setFamilyMembers(prev => {
              if (prev[row.user_id]) {
                return {
                  ...prev,
                  [row.user_id]: {
                    ...prev[row.user_id],
                    lat: row.latitude,
                    lng: row.longitude,
                    isOnline: true
                  }
                };
              }
              return prev;
            });
          }
        }
      )
      .subscribe();

    // Subscribe to new Messages
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
      .on('broadcast', { event: 'request-status' }, () => {
        const expires = accompaniedExpiresAtRef.current;
        if (expires && expires > Date.now()) {
          broadcastChannel.send({
            type: 'broadcast',
            event: 'acompaniame-report',
            payload: { senderId: userId, expiresAt: expires, senderName: userName }
          });
        }
      })
      .subscribe();

    return () => {
      alertsSub.unsubscribe();
      locationsSub.unsubscribe();
      messagesSub.unsubscribe();
      broadcastChannel.unsubscribe();
    };
  }, [familyId, userId, addMessage, checkUpdates]);

  // 1b. Realtime subscription to child's own profile (listens for remote tracking toggle)
  useEffect(() => {
    if (!userId) return;

    const fetchInitialTracking = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('tracking_enabled')
        .eq('id', userId)
        .maybeSingle();
      
      if (!error && data) {
        setTrackingEnabled(data.tracking_enabled !== false);
      }
    };

    fetchInitialTracking();

    const profileSub = supabase
      .channel(`profile-self-${userId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
        (payload: any) => {
          if (payload.new && payload.new.tracking_enabled !== undefined) {
            setTrackingEnabled(payload.new.tracking_enabled !== false);
          }
        }
      )
      .subscribe();

    return () => {
      profileSub.unsubscribe();
    };
  }, [userId]);

  // 2. Geolocation Watcher
  useEffect(() => {
    if (!userId || !familyId || !trackingEnabled) {
      // If tracking is disabled, clean up location
      setMyLocation(null);
      return;
    }

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
          setGpsError("GPS Denegado. Actívalo en los ajustes de tu teléfono.");
          return;
        }
        setGpsError(null);

        watchId = await Geolocation.watchPosition(
          { enableHighAccuracy: true, timeout: 10000 },
          (position) => {
            if (position && active) {
              const coords: [number, number] = [position.coords.latitude, position.coords.longitude];
              setMyLocation(coords);

              // Update coordinates in Supabase Realtime table
              supabase.from('locations').upsert({
                user_id: userId,
                family_id: familyId,
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                updated_at: new Date().toISOString()
              }).then(({ error }) => {
                if (error && active) console.error("Error upserting location:", error);
              });

              // Record to 30-day history logs
              supabase.from('locations_history').insert({
                user_id: userId,
                family_id: familyId,
                latitude: position.coords.latitude,
                longitude: position.coords.longitude
              }).then(({ error }) => {
                if (error && active) console.error("Error writing locations_history:", error);
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
  }, [userId, familyId, trackingEnabled]);

  // Reactive Map Centering
  useEffect(() => {
    if (!trackingTargetId) return;
    if (trackingTargetId === 'me') {
      if (myLocation) {
        setMapCenterTarget(myLocation);
      }
    } else {
      const target = familyMembers[trackingTargetId];
      if (target && target.lat !== 0 && target.lng !== 0) {
        setMapCenterTarget([target.lat, target.lng]);
      }
    }
  }, [trackingTargetId, myLocation, familyMembers]);

  // SOS status trigger
  useEffect(() => {
    if (!familyId || !userId) return;

    const triggerSOS = async () => {
      if (isSOSActive) {
        stopRemoteAlarm();
        acquireWakeLock();
        // Update SOS alerts row
        await supabase.from('alerts').upsert({
          family_id: familyId,
          is_sos_active: true,
          origin_user_id: userId,
          origin_name: userName,
          updated_at: new Date().toISOString()
        });
      } else {
        if (!ghostModeActive) releaseWakeLock();
        await supabase.from('alerts').upsert({
          family_id: familyId,
          is_sos_active: false,
          origin_user_id: null,
          origin_name: null,
          updated_at: new Date().toISOString()
        });
      }
    };
    
    triggerSOS();
  }, [isSOSActive, familyId, userId, userName, ghostModeActive]);

  const dispatchChatMessage = async (msg: ChatMessage) => {
    addMessage(msg);
    if (!familyId || !userId) return;

    // Send chat message directly to database
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

  // SOS Gesture logic
  const handleSOSPressStart = (e?: React.MouseEvent | React.TouchEvent) => {
    if (e && e.type === 'touchstart') {
      e.preventDefault();
    }
    if (sosTimerRef.current) clearTimeout(sosTimerRef.current);
    sosTimerRef.current = setTimeout(() => {
      setSOSActive(true);
    }, 3000);
  };

  const handleSOSPressEnd = (e?: React.MouseEvent | React.TouchEvent) => {
    if (e && e.type === 'touchend') {
      e.preventDefault();
    }
    if (sosTimerRef.current) {
      clearTimeout(sosTimerRef.current);
      sosTimerRef.current = null;
    }
  };

  const startCancelSOS = (e?: React.MouseEvent | React.TouchEvent) => {
    if (e && e.type === 'touchstart') {
      e.preventDefault();
    }
    if (cancelTimerRef.current) clearTimeout(cancelTimerRef.current);
    cancelTimerRef.current = setTimeout(() => {
      setSOSActive(false);
      setGhostModeActive(false);
      releaseWakeLock();
    }, 3000);
  };

  const stopCancelSOS = (e?: React.MouseEvent | React.TouchEvent) => {
    if (e && e.type === 'touchend') {
      e.preventDefault();
    }
    if (cancelTimerRef.current) {
      clearTimeout(cancelTimerRef.current);
      cancelTimerRef.current = null;
    }
  };

  const handleBlackoutTap = () => {
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    tapCountRef.current += 1;
    
    if (tapCountRef.current >= 5) {
      setSOSActive(false);
      setGhostModeActive(false);
      releaseWakeLock();
      tapCountRef.current = 0;
      return;
    }
    
    tapTimerRef.current = setTimeout(() => {
      tapCountRef.current = 0;
    }, 2000);
  };

  const confirmLogout = async () => {
    if (unlinkConfirmName.trim() === userName.trim()) {
      const doubleCheck = window.confirm("¿Estás seguro de desvincular este dispositivo de tu familia en la nube?");
      if (!doubleCheck) return;
      setIsUnlinkModalOpen(false);
      const { error } = await unlinkFamily();
      if (error) {
        alert(error);
      }
    }
  };

  const toggleTracking = async () => {
    const newStatus = !trackingEnabled;
    setTrackingEnabled(newStatus);
    if (userId) {
      await supabase.from('profiles').update({ tracking_enabled: newStatus }).eq('id', userId);
    }
  };

  const handleScan = async (result: any) => {
    if (result && result.length > 0) {
      const text = result[0].rawValue;
      if (text) {
        setScanError(false);
        setIsLoading(true);
        const { error } = await joinFamily(text);
        setIsLoading(false);
        if (error) {
          setScanError(true);
          setTimeout(() => setScanError(false), 3000);
        }
      }
    }
  };

  const handleScanError = (error: unknown) => {
    console.error('Scanner error:', error);
    setCameraError('No se pudo acceder a la cámara. Revisa los permisos e intenta de nuevo.');
    setTimeout(() => setCameraError(''), 5000);
  };

  const handleManualLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCodeInput.trim()) {
      setFormError('Por favor ingrese el código de vinculación.');
      return;
    }
    setFormError('');
    setIsLoading(true);
    const { error } = await joinFamily(manualCodeInput.trim());
    setIsLoading(false);
    if (error) {
      setFormError(error);
    }
  };

  // Cleanup active timeouts/intervals on unmount to prevent state updates on unmounted components
  useEffect(() => {
    return () => {
      if (sosTimerRef.current) clearTimeout(sosTimerRef.current);
      if (cancelTimerRef.current) clearTimeout(cancelTimerRef.current);
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    };
  }, []);

  // Auto scroll chat to bottom when messages list updates or chat is opened
  useEffect(() => {
    if (isChatOpen && chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, isChatOpen]);

  if (!familyId) {
    return (
      <div className="onboarding-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'linear-gradient(135deg, #0f0c20, #15102a, #06020f)', color: 'white', padding: '20px' }}>
        {formError && (
          <div style={{
            position: 'absolute', top: '16px', left: '16px', right: '16px',
            background: 'rgba(220, 38, 38, 0.95)', border: '1px solid #ef4444',
            padding: '12px 16px', borderRadius: '16px', color: 'white', zIndex: 9999,
            fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px',
            boxShadow: '0 8px 32px rgba(239, 68, 68, 0.4)', maxWidth: '380px', margin: '0 auto'
          }}>
            <ShieldAlert size={18} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1, textAlign: 'left' }}>{formError}</span>
            <button type="button" onClick={() => setFormError('')} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontWeight: 'bold', fontSize: '18px' }}>×</button>
          </div>
        )}

        <div className="glass-panel" style={{ width: '100%', maxWidth: '400px', padding: '24px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '20px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '24px', backdropFilter: 'blur(20px)', boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <Radar size={24} color="#ec4899" className="animate-pulse" />
            <h1 style={{ fontSize: '22px', fontWeight: 'bold', margin: 0 }}>Radar Familiar</h1>
          </div>

          <div>
            <h3 style={{ fontSize: '18px', margin: '10px 0 4px 0' }}>Vincular con Tutor / Padre</h3>
            <p style={{ fontSize: '13px', opacity: 0.7, margin: 0, lineHeight: 1.4 }}>
              Este dispositivo está registrado como Rastreable (Hijo/a). Escanea el código QR del Tutor o ingresa el código manual para conectarte.
            </p>
          </div>

          {/* QR Scanner Activation */}
          {!isCameraActive ? (
            <button 
              type="button" 
              onClick={() => { setCameraError(''); setIsCameraActive(true); }} 
              className="glass-btn primary" 
              style={{ background: 'linear-gradient(90deg, #ec4899 0%, #8b5cf6 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '14px', fontSize: '14px', border: 'none', borderRadius: '12px', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}
            >
              <Camera size={18} /> Activar Cámara y Escanear QR
            </button>
          ) : cameraError ? (
            <div className="error-card" style={{ width: '100%', padding: '14px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '12px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
              <Camera size={24} color="#fca5a5" style={{ margin: '0 auto' }} />
              <p style={{ color: '#fca5a5', fontSize: '12px', margin: '8px 0' }}>{cameraError}</p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" className="glass-btn secondary" style={{ fontSize: '12px', padding: '8px', flex: 1 }} onClick={() => { setCameraError(''); }}>Reintentar</button>
                <button type="button" className="glass-btn secondary" style={{ fontSize: '12px', padding: '8px', flex: 1 }} onClick={() => setIsCameraActive(false)}>Cerrar</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', gap: '10px' }}>
              <div style={{ width: '100%', maxWidth: '200px', borderRadius: '16px', overflow: 'hidden', aspectRatio: '1/1' }}>
                <Scanner onScan={handleScan} onError={handleScanError} />
              </div>
              <button type="button" onClick={() => setIsCameraActive(false)} className="glass-btn secondary" style={{ padding: '6px 12px', fontSize: '12px', width: 'auto' }}>
                Apagar Cámara
              </button>
            </div>
          )}

          {scanError && (
            <div style={{ background: 'rgba(252,165,165,0.1)', padding: '8px 12px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldAlert size={14} color="#fca5a5" />
              <span style={{ color: '#fca5a5', fontSize: '12px' }}>Código QR inválido. Intenta de nuevo.</span>
            </div>
          )}

          {/* Manual Link Input */}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <p style={{ fontSize: '12px', opacity: 0.7, margin: 0, textAlign: 'left' }}>O ingresa el código manual:</p>
            <form onSubmit={handleManualLink} style={{ display: 'flex', gap: '8px' }}>
              <input 
                type="text" 
                placeholder="Pegar código (UUID)" 
                value={manualCodeInput}
                onChange={(e) => setManualCodeInput(e.target.value)}
                className="glass-input" 
                style={{ padding: '10px 12px', fontSize: '13px', margin: 0, flex: 1 }}
              />
              <button type="submit" className="glass-btn primary" style={{ width: 'auto', padding: '10px 16px', fontSize: '13px', margin: 0 }} disabled={isLoading}>
                {isLoading ? 'Vinculando...' : 'Vincular'}
              </button>
            </form>
          </div>

          <button type="button" onClick={() => logout()} className="glass-btn secondary" style={{ opacity: 0.8, padding: '10px', fontSize: '13px' }}>
            Cerrar Sesión
          </button>
        </div>

        {/* Brand logo at the bottom */}
        <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
          <img src={developerLogo} alt="AG Creation" style={{ width: '190px', opacity: 1.0, filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.3))' }} />
          <p style={{ fontSize: '11px', opacity: 0.7, color: '#a78bfa', fontWeight: '500' }}>🛡️ Seguridad en la Nube con Supabase</p>
        </div>
      </div>
    );
  }

  if (isSOSActive) {
    return (
      <div className="blackout-screen" onClick={handleBlackoutTap} style={{ userSelect: 'none', cursor: 'default', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: '40px' }}>
         <button 
           onMouseDown={startCancelSOS} onMouseUp={stopCancelSOS} onMouseLeave={stopCancelSOS} 
           onTouchStart={startCancelSOS} onTouchEnd={stopCancelSOS} 
           style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.5)', padding: '12px 24px', borderRadius: '24px', fontSize: '14px', zIndex: 10, touchAction: 'none' }}
         >
           Mantener pulsado para cancelar SOS
         </button>
      </div>
    );
  }

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

      <MapContainer center={myLocation || [-34.6037, -58.3816]} zoom={15} style={{ height: '100dvh', width: '100vw' }} zoomControl={false}>
        <MapAutoCenter target={mapCenterTarget} />
        <TileLayer url={mapTheme === 'dark' ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"} />
        
        {myLocation && (
          <>
            <Marker 
              position={myLocation} 
              icon={myIcon}
              eventHandlers={{
                click: () => {
                  setTrackingTargetId('me');
                  setMapCenterTarget(myLocation);
                }
              }}
            >
              <Popup>Tú (Rastreable)</Popup>
            </Marker>
            {accompaniedExpiresAt && accompaniedExpiresAt > Date.now() && (
              <Circle 
                center={myLocation} 
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
          </>
        )}

        {Object.entries(familyMembers).map(([id, member]) => {
          if (member.lat === 0 && member.lng === 0) return null;
          return (
            <Marker 
              key={id} 
              position={[member.lat, member.lng]} 
              icon={getAvatarIcon(id, member.avatar, member.isOnline, member.role === 'monitor')}
              eventHandlers={{
                click: () => {
                  setTrackingTargetId(id);
                  setMapCenterTarget([member.lat, member.lng]);
                }
              }}
            >
              <Popup>{member.name} ({member.role === 'monitor' ? 'Tutor' : 'Hijo'})</Popup>
            </Marker>
          );
        })}
      </MapContainer>

      <button 
        className="map-theme-btn" 
        onClick={() => setMapTheme(prev => prev === 'dark' ? 'light' : 'dark')}
        title="Cambiar tema de mapa"
      >
        {mapTheme === 'dark' ? <Sun size={24} /> : <Moon size={24} />}
      </button>

      {/* Floating Avatars Tracking panel */}
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

        {Object.entries(familyMembers).map(([id, member]) => (
          <button
            key={id}
            className={`map-avatar-btn ${trackingTargetId === id ? 'active' : ''} ${member.role === 'monitor' ? 'monitor' : ''}`}
            onClick={() => {
              setTrackingTargetId(id);
              if (member.lat !== 0 && member.lng !== 0) {
                setMapCenterTarget([member.lat, member.lng]);
              }
            }}
            title={`Seguir a ${member.name}`}
          >
            {member.avatar ? (
              <img src={member.avatar} alt={member.name} style={{ opacity: member.isOnline ? 1 : 0.5 }} />
            ) : (
              <div className="map-avatar-placeholder" style={{ opacity: member.isOnline ? 1 : 0.5 }}>{(member.name || '?').charAt(0).toUpperCase()}</div>
            )}
          </button>
        ))}
      </div>

      {/* Alerta de Alarma Remota del Padre */}
      {isRemoteAlarmActive && (
        <div style={{ position: 'absolute', top: 80, left: '50%', transform: 'translateX(-50%)', zIndex: 9999, background: '#ef4444', color: 'white', padding: '16px 24px', borderRadius: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', boxShadow: '0 8px 32px rgba(239, 68, 68, 0.4)', animation: 'pulse 1.5s infinite' }}>
          <Bell size={28} />
          <strong style={{ fontSize: '14px' }}>¡Sirena remota activada!</strong>
          <button onClick={stopRemoteAlarm} style={{ background: 'white', color: '#ef4444', border: 'none', padding: '6px 12px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>APAGAR</button>
        </div>
      )}

      {/* Botón flotante del menú lateral */}
      <button 
        className="menu-btn" 
        onClick={openMenu} 
        style={{ position: 'absolute', top: '16px', left: '16px', zIndex: 1000 }}
      >
        <Menu size={24} />
      </button>

      {/* Botón flotante de control de GPS (Ahorro de batería) */}
      <button 
        onClick={toggleTracking}
        style={{ 
          position: 'absolute', 
          top: '16px', 
          right: '16px', 
          zIndex: 1000,
          background: trackingEnabled ? 'rgba(74, 222, 128, 0.15)' : 'rgba(239, 68, 68, 0.15)',
          border: trackingEnabled ? '1px solid rgba(74, 222, 128, 0.4)' : '1px solid rgba(239, 68, 68, 0.4)',
          color: trackingEnabled ? '#4ade80' : '#fca5a5',
          borderRadius: '24px',
          padding: '8px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          cursor: 'pointer',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          fontWeight: 'bold',
          fontSize: '12px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
          transition: 'all 0.3s ease'
        }}
        title={trackingEnabled ? "Pausar rastreo (Ahorrar Batería)" : "Activar rastreo GPS"}
      >
        {trackingEnabled ? <Zap size={14} className="animate-pulse" /> : <Battery size={14} />}
        <span>{trackingEnabled ? 'Rastreo: ACTIVO' : 'Ahorro Batería: ON'}</span>
      </button>

      {/* Panel táctico de SOS (Pulsación de 3 segundos) */}
      <div className="tactical-sos-panel">
        <button 
          onMouseDown={handleSOSPressStart} onMouseUp={handleSOSPressEnd} onMouseLeave={handleSOSPressEnd}
          onTouchStart={handleSOSPressStart} onTouchEnd={handleSOSPressEnd}
          className={`sos-btn ${isSOSActive ? 'active' : ''}`}
          style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'red', border: '3px solid white', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold', fontSize: '18px', boxShadow: '0 4px 20px rgba(255,0,0,0.5)', zIndex: 1000, touchAction: 'none' }}
        >
          SOS
        </button>
      </div>

      {/* Botón de chat táctico */}
      <button 
        className="chat-toggle-btn"
        onClick={() => setIsChatOpen(true)}
        style={{ position: 'absolute', bottom: '16px', left: '16px', zIndex: 1000, background: 'rgba(30,27,75,0.8)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', width: '56px', height: '56px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', cursor: 'pointer' }}
      >
        <MessageSquare size={24} />
      </button>

      {/* Botón flotante Llegué Bien */}
      <button 
        onClick={sendCheckIn}
        style={{ 
          position: 'absolute', 
          bottom: '80px', 
          left: '16px', 
          zIndex: 1000, 
          background: 'rgba(30,27,75,0.85)', 
          border: '1px solid rgba(255,255,255,0.15)', 
          color: '#4ade80', 
          width: '56px', 
          height: '56px', 
          borderRadius: '50%', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)', 
          cursor: 'pointer'
        }}
        title="Check-in: Avisa que llegaste bien"
      >
        <Check size={24} />
      </button>

      {/* Botón flotante Acompáñame a Casa */}
      <button 
        onClick={toggleAccompaniedMode}
        style={{ 
          position: 'absolute', 
          bottom: '144px', 
          left: '16px', 
          zIndex: 1000, 
          background: accompaniedExpiresAt ? '#ec4899' : 'rgba(30,27,75,0.85)', 
          border: accompaniedExpiresAt ? '2px solid #ec4899' : '1px solid rgba(255,255,255,0.15)', 
          color: 'white', 
          width: '56px', 
          height: '56px', 
          borderRadius: '50%', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          boxShadow: accompaniedExpiresAt ? '0 0 15px rgba(236,72,153,0.5)' : '0 4px 12px rgba(0,0,0,0.3)', 
          cursor: 'pointer'
        }}
        title="Acompáñame: Solicita monitoreo activo durante 15 minutos"
      >
        <Clock size={24} style={{ animation: accompaniedExpiresAt ? 'pulse 2s infinite' : 'none' }} />
      </button>

      {/* Botón flotante Walkie-Talkie */}
      <button 
        onMouseDown={startWtRecording} 
        onMouseUp={stopWtRecording}
        onTouchStart={startWtRecording} 
        onTouchEnd={stopWtRecording}
        style={{ 
          position: 'absolute', 
          bottom: '208px', 
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

      {/* Banner de Acompañamiento Activo */}
      {accompaniedExpiresAt && (
        <div style={{ position: 'absolute', top: '16px', left: '50%', transform: 'translateX(-50%)', zIndex: 9999, background: 'rgba(236,72,153,0.95)', color: 'white', padding: '12px 20px', borderRadius: '24px', display: 'flex', alignItems: 'center', gap: '12px', boxShadow: '0 4px 20px rgba(236, 72, 153, 0.4)', fontWeight: 'bold', fontSize: '13px' }}>
          <span>⏱️ Acompañamiento Activo: {accompaniedTimeLeft}</span>
          <button onClick={toggleAccompaniedMode} style={{ background: 'white', color: '#ec4899', border: 'none', padding: '4px 10px', borderRadius: '12px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer' }}>Cancelar</button>
        </div>
      )}

      {/* Walkie-Talkie Playing Equalizer Overlay */}
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

      {/* Side Menu Overlay */}
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
          <p style={{ fontSize: '11px', opacity: 0.5, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>Tutores Vinculados</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
            {Object.values(familyMembers).filter(m => m.role === 'monitor').length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', opacity: 0.7 }}>
                <Smartphone size={20} />
                <span style={{ fontSize: '14px' }}>No hay tutores vinculados</span>
              </div>
            ) : (
              Object.entries(familyMembers).filter(([_, m]) => m.role === 'monitor').map(([id, member]) => (
                <div key={id} style={{ display: 'flex', alignItems: 'center', justifyItems: 'center', gap: '12px', padding: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '12px' }}>
                  {member.avatar ? (
                    <img src={member.avatar} alt={member.name} style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>{(member.name || '?').charAt(0).toUpperCase()}</div>
                  )}
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <p style={{ fontSize: '14px', fontWeight: 'bold', margin: 0 }}>{member.name}</p>
                    <p style={{ fontSize: '11px', opacity: 0.6, margin: 0 }}>{member.isOnline ? 'Conectado (Nube)' : 'Desconectado'}</p>
                  </div>
                  <div className={member.isOnline ? 'led-green' : 'led-red'} style={{ width: '8px', height: '8px', borderRadius: '50%' }}></div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Sección "Mi Perfil y Aplicación" */}
        <div style={{ marginTop: 'auto', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '4px' }}>
            {avatarBase64 ? (
              <img src={avatarBase64} alt={userName} style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover', border: '2px solid #4ade80' }} />
            ) : (
              <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#4ade80', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '16px' }}>{(userName || '?').charAt(0).toUpperCase()}</div>
            )}
            <div style={{ flex: 1, textAlign: 'left' }}>
              <p style={{ fontSize: '14px', fontWeight: 'bold', margin: 0 }}>{userName}</p>
              <p style={{ fontSize: '12px', opacity: 0.6, margin: 0 }}>Rastreable (Hijo/a)</p>
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
              <LogOut size={16} /> Desvincular Dispositivo
            </button>
          </div>
        </div>
      </div>

      {/* UNLINK CONFIRMATION MODAL */}
      {isUnlinkModalOpen && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '340px', padding: '24px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ fontSize: '18px', color: '#fca5a5', margin: 0 }}>Confirmar Desvinculación</h3>
            <p style={{ fontSize: '13px', opacity: 0.8, margin: 0 }}>
              Para desvincularte del grupo familiar en la nube, escribe exactamente tu nombre de usuario <strong>{userName}</strong> a continuación:
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
                Desvincular
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
