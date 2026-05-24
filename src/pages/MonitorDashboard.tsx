import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useState, useEffect, useRef } from 'react';
import { useStore, playTonalSound, type ChatMessage } from '../store/useStore';
import { useNavigate } from 'react-router-dom';
import { QRCode } from 'react-qr-code';
import { Menu, X, QrCode, LogOut, Focus, AlertCircle, ShieldAlert, Smartphone, BellOff, MessageSquare, Send, Mic, MapPin, Ghost, Bell, Camera, Trash, Sun, Moon, Image } from 'lucide-react';
import Peer from 'peerjs';
import { Geolocation } from '@capacitor/geolocation';

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
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  const { logout, masterServerId, fenceRadius, setFenceRadius, userName, avatarBase64, messages, addMessage, cleanOldMessages, tutorSlot, checkUpdates, updateAvailable, latestReleaseUrl, isCheckingUpdates, updateCheckResult, resetUpdateCheckResult } = useStore();
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
      
      // Detener peer, conexiones y sirenas de inmediato
      if (peerRef.current) {
        peerRef.current.destroy();
        peerRef.current = null;
      }
      if (tutor1ConnRef.current) {
        tutor1ConnRef.current.close();
        tutor1ConnRef.current = null;
      }
      if (oscillatorRef.current) {
        oscillatorRef.current.stop();
        oscillatorRef.current.disconnect();
        oscillatorRef.current = null;
      }
      if (sirenIntervalRef.current) {
        clearInterval(sirenIntervalRef.current);
        sirenIntervalRef.current = null;
      }

      logout();
      navigate('/');
    }
  };
  const [myLocation, setMyLocation] = useState<[number, number] | null>(null);

  const [clients, setClients] = useState<Record<string, { lat: number; lng: number; name: string, lastSeen: number, isOnline: boolean, avatar: string | null, role?: 'client' | 'monitor' }>>({});
  const [alarmActive, setAlarmActive] = useState<{ active: boolean; originName: string }>({ active: false, originName: '' });
  const [mapCenterTarget, setMapCenterTarget] = useState<[number, number] | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [mapTheme, setMapTheme] = useState<'dark' | 'light'>('dark');
  const [activeRemoteAlarms, setActiveRemoteAlarms] = useState<Record<string, boolean>>({});
  const [trackingTargetId, setTrackingTargetId] = useState<string>('me');

  
  // Caché de íconos para evitar parpadeos masivos del mapa
  const markerIconCache = useRef<Record<string, L.DivIcon>>({});
  const getAvatarIcon = (id: string, avatar: string | null, isOnline: boolean, isMonitor: boolean) => {
    const cacheKey = `${id}_${isOnline ? 'on' : 'off'}_${avatar ? 'avatar' : 'no_avatar'}_${isMonitor ? 'monitor' : 'client'}`;
    if (!markerIconCache.current[cacheKey]) {
      const size = isMonitor ? 36 : 40;
      const color = isMonitor ? '#c084fc' : (isOnline ? '#4ade80' : '#9ca3af');
      markerIconCache.current[cacheKey] = L.divIcon({
        className: 'custom-avatar-marker',
        html: avatar 
          ? `<div style="width:${size}px;height:${size}px;border-radius:50%;overflow:hidden;border:3px solid ${color};box-shadow:0 0 10px ${color};"><img src="${avatar}" style="width:100%;height:100%;object-fit:cover;" /></div>` 
          : `<div style="width:${size}px;height:${size}px;background:${color};border-radius:50%;border:2px solid white;"></div>`,
        iconSize: [size, size],
        iconAnchor: [size/2, size/2]
      });
    }
    return markerIconCache.current[cacheKey];
  };
  
  const audioCtxRef = useRef<AudioContext | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const sirenIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const peerRef = useRef<Peer | null>(null);

  const [toasts, setToasts] = useState<{id: number, msg: string}[]>([]);
  const [remoteSOSActive, setRemoteSOSActive] = useState(false);
  const geofenceStrikesRef = useRef<Record<string, number>>({});

  // Chat UI
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessingMic, setIsProcessingMic] = useState(false);
  const [isUnlinkModalOpen, setIsUnlinkModalOpen] = useState(false);
  const [unlinkConfirmName, setUnlinkConfirmName] = useState('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const discardRecordingRef = useRef<boolean>(false);
  const isConnectedRef = useRef<Record<string, boolean>>({});

  const showToast = (msg: string) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, msg }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 6000);
  };

  useEffect(() => {
    checkUpdates();
  }, [checkUpdates]);

  useEffect(() => {
    let watchId: string | null = null;
    Geolocation.requestPermissions().then(perm => {
      if (perm.location === 'granted') {
        setGpsError(null);
        Geolocation.watchPosition({ enableHighAccuracy: true }, (pos) => {
           if (pos) {
             setMyLocation([pos.coords.latitude, pos.coords.longitude]);
             broadcastAction({ type: 'MONITOR_LOCATION', lat: pos.coords.latitude, lng: pos.coords.longitude, avatar: avatarBase64 });
           }
        }).then(id => watchId = id);
      } else {
        setGpsError("GPS Denegado. La app no puede protegerte sin ubicación. Por favor, actívalo en los ajustes de tu teléfono.");
      }
    });
    
    cleanOldMessages();
    const interval = setInterval(cleanOldMessages, 60 * 60 * 1000); // Barredor 24hs continuo
    return () => { 
      if (watchId) Geolocation.clearWatch({ id: watchId }); 
      clearInterval(interval);
    }
  }, [avatarBase64, cleanOldMessages]);

  // Auto-centrado reactivo según el objetivo de seguimiento
  useEffect(() => {
    if (!trackingTargetId) return;
    if (trackingTargetId === 'me') {
      if (myLocation) {
        setMapCenterTarget(myLocation);
      }
    } else {
      const target = clients[trackingTargetId];
      if (target && target.lat !== 0 && target.lng !== 0) {
        setMapCenterTarget([target.lat, target.lng]);
      }
    }
  }, [trackingTargetId, clients, myLocation]);

  const tutor1ConnRef = useRef<any>(null);
  const tutor1DisconnectedAtRef = useRef<number | null>(null);
  const tutor1LastAttemptRef = useRef<number>(0);

  const connectToTutor1 = () => {
    if (!peerRef.current || peerRef.current.destroyed || peerRef.current.disconnected) return;
    if (tutor1ConnRef.current && tutor1ConnRef.current.open) return;

    console.log(`Tutor T2 conectándose a Tutor T1 (${masterServerId}-T1)...`);
    try {
      const conn = peerRef.current.connect(`${masterServerId}-T1`, {
        serialization: 'json'
      });
      tutor1ConnRef.current = conn;

      conn.on('open', () => {
        console.log("¡Conectado exitosamente con Tutor T1!");
        tutor1DisconnectedAtRef.current = null;
        conn.send({ type: 'USER_PROFILE', name: userName, avatar: avatarBase64, role: 'monitor' });
        
        // CHAT SYNC: Sincronizar historial con Tutor 1 al conectar
        conn.send({ type: 'CHAT_SYNC', messages: useStore.getState().messages });
      });

      conn.on('data', (data: any) => {
        const now = Date.now();
        if (data.type === 'MONITOR_HEARTBEAT') {
          conn.send({ type: 'HEARTBEAT', name: userName });
          return;
        }
        if (data.type === 'CHAT_MSG') {
          addMessage(data.message);
          showToast(`💬 Mensaje de ${data.message.senderName}`);
          playTonalSound('CHAT_RECEIVE');
        }
        if (data.type === 'CHAT_SYNC') {
          const monitorMessages = useStore.getState().messages;
          const clientMessages = data.messages || [];
          const combined = [...monitorMessages, ...clientMessages];
          const uniqueMessages = Array.from(new Map(combined.map(m => [m.id, m])).values())
            .sort((a, b) => a.timestamp - b.timestamp)
            .slice(-15);
          useStore.setState({ messages: uniqueMessages });
          conn.send({ type: 'CHAT_SYNC_CONFIRM', messages: uniqueMessages });
        }
        if (data.type === 'CHAT_SYNC_CONFIRM') {
          const monitorMessages = useStore.getState().messages;
          const consolidatedMessages = data.messages || [];
          const combined = [...monitorMessages, ...consolidatedMessages];
          const uniqueMessages = Array.from(new Map(combined.map(m => [m.id, m])).values())
            .sort((a, b) => a.timestamp - b.timestamp)
            .slice(-15);
          useStore.setState({ messages: uniqueMessages });
        }
        if (data.type === 'SOS_ALERT') {
          setAlarmActive({ active: true, originName: data.name });
          playSiren();
        }
        if (data.type === 'SOS_CANCELED') {
          stopSiren();
          showToast(`⚠️ ${data.name} canceló el SOS.`);
        }
        if (data.type === 'MONITOR_LOCATION') {
          setClients(prev => ({
            ...prev,
            [conn.peer]: { ...(prev[conn.peer] || { lastSeen: now }), lat: data.lat, lng: data.lng, name: 'Tutor Principal', isOnline: true, avatar: data.avatar, role: 'monitor' }
          }));
        }
        if (data.type === 'LOCATION') {
          setClients(prev => ({
            ...prev,
            [data.clientPeerId || conn.peer]: { ...(prev[data.clientPeerId || conn.peer] || { lastSeen: now }), lat: data.lat, lng: data.lng, name: data.name, isOnline: true, avatar: data.avatar, role: 'client' }
          }));
        }
      });

      conn.on('close', () => {
        console.log("Conexión con Tutor T1 cerrada.");
        tutor1ConnRef.current = null;
      });

      conn.on('error', (err) => {
        console.warn("Error en la conexión con Tutor T1:", err);
        tutor1ConnRef.current = null;
      });
    } catch (e) {
      console.error("Error al iniciar conexión con Tutor T1:", e);
    }
  };


  // P2P Setup
  useEffect(() => {
    if (!masterServerId) return;

    const myTutorId = `${masterServerId}-${tutorSlot || 'T1'}`;
    console.log("Inicializando Peer de Tutor en:", myTutorId);

    const peerConfig = {
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          { urls: 'stun:stun3.l.google.com:19302' },
          { urls: 'stun:stun4.l.google.com:19302' },
          {
            urls: 'turn:openrelay.metered.ca:80',
            username: 'openrelay',
            credential: 'openrelay'
          },
          {
            urls: 'turn:openrelay.metered.ca:443',
            username: 'openrelay',
            credential: 'openrelay'
          },
          {
            urls: 'turns:openrelay.metered.ca:443?transport=tcp',
            username: 'openrelay',
            credential: 'openrelay'
          }
        ],
        sdpSemantics: 'unified-plan'
      }
    };
    const peer = new Peer(myTutorId, peerConfig);
    peerRef.current = peer;

    peer.on('open', () => {
      console.log("Peer de Tutor listo:", myTutorId);
      if (tutorSlot === 'T2') {
        connectToTutor1();
      }
    });

    peer.on('error', (err) => {
      console.warn("Monitor PeerJS error:", err);
      if (peer.disconnected) {
        peer.reconnect();
      }
    });

    peer.on('connection', (conn) => {
      conn.on('open', () => {
         isConnectedRef.current[conn.peer] = true;
         playTonalSound('P2P_HANDSHAKE');
         
         // Enviar perfil al conectar
         conn.send({ type: 'MONITOR_HEARTBEAT', tutorSlot });

         const currentQueue = useStore.getState().offlineQueue;
         if (currentQueue.length > 0) {
            currentQueue.forEach(action => conn.send(action));
            useStore.getState().clearOfflineQueue();
         }
      });

      conn.on('data', (data: any) => {
        const now = Date.now();
        
        if (data.type === 'USER_PROFILE') {
          setClients(prev => ({
            ...prev,
            [conn.peer]: { 
              ...(prev[conn.peer] || { lat: 0, lng: 0, lastSeen: now }), 
              name: data.name, 
              isOnline: true, 
              avatar: data.avatar || null,
              role: data.role || 'client'
            }
          }));
        }

        if (data.type === 'HEARTBEAT') {
          setClients(prev => ({
            ...prev,
            [conn.peer]: { ...(prev[conn.peer] || { lat: 0, lng: 0, avatar: null }), name: data.name, lastSeen: now, isOnline: true }
          }));
        }
        
        if (data.type === 'LOCATION') {
          setClients((prev) => {
            if (Object.keys(prev).length === 0) setMapCenterTarget([data.lat, data.lng]);
            return { 
              ...prev, 
              [conn.peer]: { 
                ...(prev[conn.peer] || { avatar: null, role: 'client' }), 
                lat: data.lat, 
                lng: data.lng, 
                name: data.name, 
                lastSeen: now, 
                isOnline: true 
              } 
            };
          });

          if (myLocation) {
            const dist = getDistance(myLocation[0], myLocation[1], data.lat, data.lng);
            if (dist > localRadius) {
              const currentStrikes = (geofenceStrikesRef.current[data.name] || 0) + 1;
              geofenceStrikesRef.current[data.name] = currentStrikes;
              
              if (currentStrikes === 3) {
                showToast(`⚠️ ${data.name} salió de la zona segura (${Math.round(dist)}m)`);
                playTonalSound('GEOFENCE_BREACH');
              } else if (currentStrikes > 3 && currentStrikes % 10 === 0) {
                showToast(`⚠️ ${data.name} sigue fuera de zona (${Math.round(dist)}m)`);
                playTonalSound('GEOFENCE_BREACH');
              }
            } else {
              if ((geofenceStrikesRef.current[data.name] || 0) >= 3) {
                showToast(`✅ ${data.name} volvió a la zona segura.`);
              }
              geofenceStrikesRef.current[data.name] = 0;
            }
          }
        }
        
        if (data.type === 'SOS_ALERT') {
          setAlarmActive({ active: true, originName: data.name });
          playSiren();
          // Malla P2P: Rebotar el SOS a los demás familiares
          broadcastAction({ type: 'SOS_ALERT', name: data.name });
        }

        if (data.type === 'SOS_CANCELED') {
          stopSiren();
          showToast(`⚠️ ${data.name} canceló el SOS. Recomendamos rastreo en sigilo.`);
        }

        if (data.type === 'CHECK_IN') {
          showToast(`✅ ${data.name} reporta que llegó bien.`);
          if (data.lat !== undefined && data.lng !== undefined) {
            setClients(prev => ({
              ...prev,
              [conn.peer]: { ...(prev[conn.peer] || { avatar: null }), name: data.name, lat: data.lat, lng: data.lng, lastSeen: now, isOnline: true }
            }));
            setMapCenterTarget([data.lat, data.lng]);
          }
        }
        if (data.type === 'PICK_ME_UP') showToast(`🚗 ${data.name} pide que lo vayas a buscar.`);
        if (data.type === 'CHAT_MSG') {
           addMessage(data.message);
           showToast(`💬 Mensaje de ${data.message.senderName}`);
           playTonalSound('CHAT_RECEIVE');
           if (tutorSlot === 'T1') {
             broadcastAction(data);
           }
        }
        if (data.type === 'CHAT_SYNC') {
          const monitorMessages = useStore.getState().messages;
          const clientMessages = data.messages || [];
          const combined = [...monitorMessages, ...clientMessages];
          const uniqueMessages = Array.from(new Map(combined.map(m => [m.id, m])).values())
            .sort((a, b) => a.timestamp - b.timestamp)
            .slice(-15);
          useStore.setState({ messages: uniqueMessages });
          conn.send({ type: 'CHAT_SYNC_CONFIRM', messages: uniqueMessages });
          
          if (tutorSlot === 'T1') {
            broadcastAction({ type: 'CHAT_SYNC_CONFIRM', messages: uniqueMessages });
          }
        }
        if (data.type === 'CHAT_SYNC_CONFIRM') {
          const monitorMessages = useStore.getState().messages;
          const consolidatedMessages = data.messages || [];
          const combined = [...monitorMessages, ...consolidatedMessages];
          const uniqueMessages = Array.from(new Map(combined.map(m => [m.id, m])).values())
            .sort((a, b) => a.timestamp - b.timestamp)
            .slice(-15);
          useStore.setState({ messages: uniqueMessages });
        }

      });

      conn.on('close', () => {
        const peerId = conn.peer;
        const activeConns = (peerRef.current?.connections as any)?.[peerId] || [];
        const hasOpenConn = activeConns.some((c: any) => c.open);
        
        if (!hasOpenConn) {
          if (isConnectedRef.current[peerId]) {
            playTonalSound('P2P_LOST');
          }
          isConnectedRef.current[peerId] = false;
          setClients(prev => {
            if (prev[peerId]) {
              return { ...prev, [peerId]: { ...prev[peerId], isOnline: false } };
            }
            return prev;
          });
        }
      });

      conn.on('error', () => {
        const peerId = conn.peer;
        const activeConns = (peerRef.current?.connections as any)?.[peerId] || [];
        const hasOpenConn = activeConns.some((c: any) => c.open);
        
        if (!hasOpenConn) {
          if (isConnectedRef.current[peerId]) {
            playTonalSound('P2P_LOST');
          }
          isConnectedRef.current[peerId] = false;
          setClients(prev => {
            if (prev[peerId]) {
              return { ...prev, [peerId]: { ...prev[peerId], isOnline: false } };
            }
            return prev;
          });
        }
      });
    });

    return () => {
      peer.destroy();
      stopSiren();
    };
  }, [masterServerId, myLocation, localRadius, addMessage]);

  useEffect(() => {
    const interval = setInterval(() => {
        const now = Date.now();
        
        // 1. Check Clients Timeout (30s threshold)
        setClients(prev => {
           let changed = false;
           const updated = { ...prev };
           for (let id in updated) {
              if (updated[id].isOnline && (now - updated[id].lastSeen > 30000)) {
                 updated[id].isOnline = false;
                 changed = true;
                 showToast(`❌ Se perdió conexión con ${updated[id].name}`);
              }
           }
           return changed ? updated : prev;
        });

        // 2. T2 to T1 connection watchdog
        if (tutorSlot === 'T2') {
          const isT1Active = tutor1ConnRef.current && tutor1ConnRef.current.open;
          if (!isT1Active) {
            if (tutor1ConnRef.current) {
              tutor1ConnRef.current.close();
              tutor1ConnRef.current = null;
            }
            
            if (tutor1DisconnectedAtRef.current === null) {
              tutor1DisconnectedAtRef.current = now;
            }
            
            const elapsed = now - tutor1DisconnectedAtRef.current;
            let interval = 5000;
            if (elapsed > 600000) { // 10 minutos
              interval = 60000;
            } else if (elapsed > 180000) { // 3 minutos
              interval = 30000;
            }
            
            if (now - tutor1LastAttemptRef.current >= interval) {
              tutor1LastAttemptRef.current = now;
              connectToTutor1();
            }
          } else {
            tutor1DisconnectedAtRef.current = null;
          }
        }

        // 3. Heartbeat all clients to keep WebRTC connections alive
        const peer = peerRef.current;
        if (peer) {
          for (const peerId in peer.connections) {
            (peer.connections as any)[peerId].forEach((conn: any) => {
               if (conn.open) {
                 conn.send({ type: 'MONITOR_HEARTBEAT', tutorSlot });
               }
            });
          }
        }
        if (tutor1ConnRef.current && tutor1ConnRef.current.open) {
          tutor1ConnRef.current.send({ type: 'MONITOR_HEARTBEAT', tutorSlot });
        }
    }, 5000);
    return () => clearInterval(interval);
  }, [tutorSlot, masterServerId]);

  const playSiren = () => {
    if (!(window as any).globalAudioCtx) {
      (window as any).globalAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    audioCtxRef.current = (window as any).globalAudioCtx;
    const ctx = audioCtxRef.current!;
    if (ctx.state === 'suspended') ctx.resume();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'square';
    osc.frequency.setValueAtTime(400, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(800, ctx.currentTime + 0.4);
    osc.frequency.linearRampToValueAtTime(400, ctx.currentTime + 0.8);
    sirenIntervalRef.current = setInterval(() => {
      if (oscillatorRef.current) {
        osc.frequency.setValueAtTime(400, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(800, ctx.currentTime + 0.4);
        osc.frequency.linearRampToValueAtTime(400, ctx.currentTime + 0.8);
      }
    }, 800);

    gain.gain.value = 1;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    oscillatorRef.current = osc;
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

  const broadcastAction = (action: any) => {
     const peer = peerRef.current;
     if (peer) {
       for (const peerId in peer.connections) {
         (peer.connections as any)[peerId].forEach((conn: any) => {
            if (conn.open) conn.send(action);
         });
       }
     }
     if (tutor1ConnRef.current && tutor1ConnRef.current.open) {
       tutor1ConnRef.current.send(action);
     }
  }

  const requestSilentLocation = (peerId: string) => {
    const peer = peerRef.current;
    if (peer && (peer.connections as any)[peerId]) {
      (peer.connections as any)[peerId].forEach((conn: any) => {
        if (conn.open) conn.send({ type: 'SILENT_PING' });
      });
      showToast('📡 Solicitando ubicación en sigilo...');
    }
  };

  const toggleGhostMode = () => {
    const newState = !remoteSOSActive;
    broadcastAction({ type: newState ? 'GHOST_MODE' : 'STOP_REMOTE_SOS' });
    setRemoteSOSActive(newState);
    if (newState) showToast("👻 Modo Sigilo activado en dispositivos hijos");
    else showToast("✅ Modo Sigilo apagado");
  };

  const triggerLoudAlarm = (peerId: string) => {
    const peer = peerRef.current;
    if (peer && (peer.connections as any)[peerId]) {
      (peer.connections as any)[peerId].forEach((conn: any) => {
        if (conn.open) conn.send({ type: 'REMOTE_SOS' });
      });
      setActiveRemoteAlarms(prev => ({ ...prev, [peerId]: true }));
      showToast('🚨 Sirena Remota disparada.');
    }
  };

  const stopLoudAlarm = (peerId: string) => {
    const peer = peerRef.current;
    if (peer && (peer.connections as any)[peerId]) {
      (peer.connections as any)[peerId].forEach((conn: any) => {
        if (conn.open) conn.send({ type: 'STOP_REMOTE_SOS' });
      });
      setActiveRemoteAlarms(prev => ({ ...prev, [peerId]: false }));
      showToast('✅ Sirena Remota apagada.');
    }
  };

  const dispatchChatMessage = (msg: ChatMessage) => {
    addMessage(msg);
    broadcastAction({ type: 'CHAT_MSG', message: msg });
  };

  const handleSendText = () => {
    if (!textInput.trim()) return;
    dispatchChatMessage({ id: Date.now().toString(), senderName: userName, type: 'TEXT', content: textInput.trim(), timestamp: Date.now() });
    setTextInput('');
  };

  const toggleRecording = async () => {
    if (isRecording) {
      if (mediaRecorderRef.current) mediaRecorderRef.current.stop();
      setIsRecording(false);
      return;
    }

    if (isProcessingMic) return;

    setIsProcessingMic(true);
    discardRecordingRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];
      mediaRecorderRef.current.ondataavailable = (e) => audioChunksRef.current.push(e.data);
      mediaRecorderRef.current.onstop = () => {
        if (discardRecordingRef.current) {
          discardRecordingRef.current = false;
          setIsProcessingMic(false);
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          dispatchChatMessage({ id: Date.now().toString(), senderName: userName, type: 'AUDIO', content: reader.result as string, timestamp: Date.now() });
          setIsProcessingMic(false);
        };
        stream.getTracks().forEach(track => track.stop());
      };
      mediaRecorderRef.current.start();
      setIsRecording(true);
      playTonalSound('PTT_START');
    } catch (err) {
      showToast('Error al acceder al micrófono');
      setIsProcessingMic(false);
    }
  };

  const cancelRecording = () => {
    discardRecordingRef.current = true;
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 400; // Táctico: ultra liviano
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_SIZE) {
            height *= MAX_SIZE / width;
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width *= MAX_SIZE / height;
            height = MAX_SIZE;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);

        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.5);

        dispatchChatMessage({
          id: Date.now().toString(),
          senderName: userName,
          type: 'IMAGE',
          content: compressedBase64,
          timestamp: Date.now()
        });
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (isChatOpen && chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, isChatOpen]);

  useEffect(() => {
    const handleOnline  = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleCenterMap = () => {
    const firstClient = Object.values(clients).find(c => c.isOnline);
    if (firstClient) setMapCenterTarget([firstClient.lat, firstClient.lng]);
    else if (myLocation) setMapCenterTarget(myLocation);
  };

  return (
    <div className="dashboard-container" style={{ position: 'relative', overflow: 'hidden' }}>
      {gpsError && (
        <div style={{ position: 'absolute', top: 60, left: 0, right: 0, background: '#ef4444', color: 'white', padding: '12px', textAlign: 'center', zIndex: 9999, fontWeight: 'bold' }}>
          {gpsError}
        </div>
      )}
      <MapContainer center={myLocation || [-34.6037, -58.3816]} zoom={13} style={{ height: '100dvh', width: '100vw' }} zoomControl={false}>
        <MapAutoCenter target={mapCenterTarget} />
        <TileLayer url={mapTheme === 'dark' ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"} />
        {myLocation && (
          <>
            <Marker position={myLocation} icon={getAvatarIcon('monitor', avatarBase64, true, true)}>
              <Popup>Tú (Monitor)</Popup>
            </Marker>
            <Circle center={myLocation} radius={localRadius} pathOptions={{ color: '#4f46e5', fillOpacity: 0.1, weight: 2, dashArray: "5, 5" }} />
          </>
        )}
        {Object.entries(clients).map(([id, client]) => {
          if (client.lat === 0 && client.lng === 0) return null;
          return (
            <Marker key={id} position={[client.lat, client.lng]} opacity={client.isOnline ? 1 : 0.5} icon={getAvatarIcon(id, client.avatar, client.isOnline, client.role === 'monitor')}>
              <Popup><strong>{client.name}</strong> <br/>{client.isOnline ? 'GPS en tiempo real' : 'Última ubicación conocida'}</Popup>
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

      {/* Panel flotante de Avatares para Seguimiento */}
      <div className="map-avatars-container">
        <button 
          className={`map-avatar-btn monitor ${trackingTargetId === 'me' ? 'active' : ''}`}
          onClick={() => {
            setTrackingTargetId('me');
            if (myLocation) {
              setMapCenterTarget(myLocation);
            }
          }}
          title="Centrar en mí"
        >
          {avatarBase64 ? (
            <img src={avatarBase64} alt="Yo" />
          ) : (
            <div className="map-avatar-placeholder">{userName.charAt(0).toUpperCase()}</div>
          )}
        </button>

        {Object.entries(clients).map(([id, c]) => {
          const isTargetActive = trackingTargetId === id;
          return (
            <button
              key={id}
              className={`map-avatar-btn ${isTargetActive ? 'active' : ''} ${c.role === 'monitor' ? 'monitor' : ''}`}
              onClick={() => {
                setTrackingTargetId(id);
                if (c.lat !== 0 && c.lng !== 0) {
                  setMapCenterTarget([c.lat, c.lng]);
                }
              }}
              title={`Seguir a ${c.name}`}
            >
              {c.avatar ? (
                <img src={c.avatar} alt={c.name} style={{ opacity: c.isOnline ? 1 : 0.5 }} />
              ) : (
                <div className="map-avatar-placeholder" style={{ opacity: c.isOnline ? 1 : 0.5 }}>{c.name.charAt(0).toUpperCase()}</div>
              )}
            </button>
          );
        })}
      </div>


      {/* TOASTS */}
      <div style={{ position: 'absolute', top: 80, left: 20, right: 20, zIndex: 1100, display: 'flex', flexDirection: 'column', gap: '8px' }}>
         {toasts.map(t => (
           <div key={t.id} style={{ background: 'rgba(0,0,0,0.8)', color: 'white', padding: '12px 16px', borderRadius: '8px', fontSize: '14px', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center' }}>{t.msg}</div>
         ))}
      </div>

      {alarmActive.active && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(220, 38, 38, 0.9)', zIndex: 9999, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', color: 'white' }}>
          <AlertCircle size={80} style={{ marginBottom: 20, animation: 'dotPulse 1s infinite' }} />
          <h1 style={{ fontSize: '32px', textAlign: 'center', margin: '0 20px' }}>¡EMERGENCIA S.O.S!</h1>
          <p style={{ fontSize: '20px', marginTop: '10px' }}>{alarmActive.originName} pide ayuda</p>
          <button onClick={stopSiren} style={{ marginTop: '40px', padding: '16px 32px', background: 'white', color: '#dc2626', fontSize: '18px', fontWeight: 'bold', border: 'none', borderRadius: '30px', display: 'flex', gap: '10px', alignItems: 'center' }}><BellOff size={24} /> Entendido, apagar sirena</button>
        </div>
      )}

      {!isOnline && (
        <div style={{ position: 'absolute', top: 76, left: '50%', transform: 'translateX(-50%)', background: 'rgba(220, 38, 38, 0.9)', color: 'white', padding: '8px 20px', borderRadius: '20px', fontSize: '14px', zIndex: 1100 }}>⚠️ Sin conexión</div>
      )}

      <div className="top-bar">
        <button className="icon-btn" onClick={openMenu} style={{ position: 'relative' }}>
          <Menu size={24} />
          {updateAvailable && (
            <span style={{ position: 'absolute', top: -2, right: -2, width: '10px', height: '10px', background: '#ec4899', borderRadius: '50%', border: '2px solid #0f172a', animation: 'dotPulse 1.5s infinite' }} />
          )}
        </button>
        <div className="top-bar-title" style={{ display: "flex", alignItems: "center", gap: "8px" }}><span className={`led-indicator ${isOnline ? "led-green" : "led-red"}`} /><span>{userName} - {tutorSlot === "T2" ? "Tutor Secundario" : "Tutor Principal"}</span></div>
        <button className="icon-btn" onClick={() => setIsChatOpen(true)}><MessageSquare size={24} /></button>
      </div>

      <div className="bottom-bar">
        <button className="bottom-action" onClick={handleCenterMap}><Focus size={30} /><span>Centrar</span></button>
        <button 
          className="bottom-action" 
          onClick={toggleGhostMode} 
          style={{ 
            color: remoteSOSActive ? '#4ade80' : 'rgba(251, 113, 133, 0.5)',
            animation: remoteSOSActive ? 'pulse-green 1s infinite' : 'none'
          }}
        >
          <Ghost size={30} color={remoteSOSActive ? '#4ade80' : 'rgba(251, 113, 133, 0.5)'} />
          <span>{remoteSOSActive ? '👻 Sigilo: TRANSMITIENDO' : '👻 Sigilo: APAGADO'}</span>
        </button>
      </div>

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
            <img src={developerLogo} alt="AG Creation" className="dev-brand-logo" style={{ width: '120px' }} />
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
            Object.entries(clients).map(([id, c]) => (
              <div key={id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: c.isOnline ? 'rgba(79, 70, 229, 0.2)' : 'rgba(156, 163, 175, 0.2)', borderRadius: '12px', marginBottom: '8px' }}>
                <span className={`led-indicator ${c.isOnline ? 'led-green' : 'led-red'}`} />
                {c.avatar && (
                  <img src={c.avatar} alt={c.name} style={{ width: '32px', height: '32px', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.1)' }} />
                )}
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                  <span style={{ fontSize: '15px', fontWeight: 'bold', color: c.isOnline ? 'inherit' : '#9ca3af' }}>{c.name}</span>
                  <span style={{ fontSize: '11px', opacity: 0.6 }}>{c.role === 'monitor' ? 'Tutor' : 'Hijo'}</span>
                </div>
                {!c.isOnline && <span style={{ fontSize: '11px', opacity: 0.5 }}>Offline</span>}
                {c.isOnline && (
                  <>
                    {activeRemoteAlarms[id] ? (
                      <button onClick={() => stopLoudAlarm(id)} style={{ background: 'rgba(74,222,128,0.2)', border: 'none', color: '#4ade80', padding: '6px', borderRadius: '50%', display: 'flex', alignItems: 'center', cursor: 'pointer', animation: 'pulse-green 1s infinite' }} title="Apagar Alarma Remota">
                        <BellOff size={18} />
                      </button>
                    ) : (
                      <button onClick={() => triggerLoudAlarm(id)} style={{ background: 'none', border: 'none', color: '#dc2626', padding: '4px', display: 'flex', alignItems: 'center', cursor: 'pointer' }} title="Hacer Sonar Alarma">
                        <Bell size={18} />
                      </button>
                    )}
                    <button onClick={() => requestSilentLocation(id)} style={{ background: 'none', border: 'none', color: '#ec4899', padding: '4px', display: 'flex', alignItems: 'center', cursor: 'pointer' }} title="Actualizar GPS en sigilo">
                      <MapPin size={18} />
                    </button>
                  </>
                )}
              </div>
            ))
          )}
        </div>

        <div style={{ marginBottom: '32px' }}>
          <p style={{ fontSize: '11px', opacity: 0.5, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>Vinculación</p>
          <button className="menu-item" onClick={() => setShowQR(!showQR)}>
            <QrCode size={18} />
            {showQR ? 'Ocultar código QR' : 'Añadir Dispositivo (QR)'}
          </button>
          {showQR && masterServerId && (
            <div style={{ background: 'white', padding: '12px', borderRadius: '16px', display: 'inline-block', margin: '16px 0 0 10px', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
              <QRCode value={masterServerId} size={140} />
            </div>
          )}
        </div>

        <div style={{ marginBottom: '32px' }}>
          <p style={{ fontSize: '11px', opacity: 0.5, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>Geocerca Activa</p>
          <div style={{ padding: '0 10px' }}>
            <label style={{ fontSize: '14px', marginBottom: '12px', display: 'block', opacity: 0.9 }}>Radio de alerta: <strong>{localRadius}m</strong></label>
            <input
              type="range" min="50" max="5000" step="50"
              value={localRadius}
              onChange={(e) => setLocalRadius(Number(e.target.value))}
              onMouseUp={(e) => setFenceRadius(Number((e.target as HTMLInputElement).value))}
              onTouchEnd={(e) => setFenceRadius(Number((e.target as HTMLInputElement).value))}
              style={{ width: '100%', accentColor: '#4f46e5' }}
            />
          </div>
        </div>

        <div style={{ marginBottom: '32px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '20px' }}>
          <p style={{ fontSize: '11px', opacity: 0.5, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>Mi Perfil y Aplicación</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', marginBottom: '12px' }}>
            {avatarBase64 ? (
              <img src={avatarBase64} alt={userName} style={{ width: '40px', height: '40px', borderRadius: '50%', border: '2px solid rgba(255,255,255,0.2)' }} />
            ) : (
              <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>{userName.charAt(0).toUpperCase()}</div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '14px', fontWeight: 'bold' }}>{userName}</span>
              <span style={{ fontSize: '11px', opacity: 0.6 }}>{tutorSlot === 'T2' ? 'Tutor Secundario' : 'Tutor Principal'} (v1.0.0)</span>
            </div>
          </div>
          
          <button 
            className="menu-item" 
            onClick={() => checkUpdates()}
            disabled={isCheckingUpdates}
            style={{ width: '100%', display: 'flex', gap: '10px', alignItems: 'center', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            <span>🔍</span>
            <span>{isCheckingUpdates ? 'Buscando actualizaciones...' : 'Buscar Actualizaciones'}</span>
          </button>
          
          {updateCheckResult === 'no_updates' && (
            <p style={{ fontSize: '12px', color: '#4ade80', marginTop: '8px', paddingLeft: '8px' }}>✓ Tu aplicación está al día (v1.0.0)</p>
          )}
          {updateCheckResult === 'error' && (
            <p style={{ fontSize: '12px', color: '#ef4444', marginTop: '8px', paddingLeft: '8px' }}>❌ Error al consultar actualizaciones.</p>
          )}
        </div>

        {updateAvailable && (
          <div style={{ margin: '10px', padding: '12px', background: 'rgba(236, 72, 153, 0.15)', border: '1px solid rgba(236, 72, 153, 0.3)', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontSize: '13px', color: '#fbcfe8', fontWeight: 'bold' }}>📢 Actualización pendiente ({updateAvailable})</span>
            <button 
              onClick={() => window.open(latestReleaseUrl, '_blank')} 
              style={{ background: '#ec4899', color: 'white', border: 'none', padding: '8px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', textAlign: 'center' }}
            >
              Descargar APK ahora
            </button>
          </div>
        )}

        <div style={{ marginTop: 'auto' }}><button className="menu-item" onClick={() => { setIsUnlinkModalOpen(true); setUnlinkConfirmName(''); }} style={{ color: '#fca5a5' }}><LogOut size={18} />Desvincular Dispositivo</button></div>
      </div>

      {/* Chat Overlay */}
      <div style={{ position: 'absolute', top: isChatOpen ? 0 : '100%', left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.95)', backdropFilter: 'blur(10px)', zIndex: 2000, transition: 'top 0.3s cubic-bezier(0.4, 0, 0.2, 1)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '20px', background: 'rgba(255,255,255,0.05)' }}>
          <h2 style={{ margin: 0, fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
            <MessageSquare size={20} color="#8b5cf6" /> Chat Familiar P2P
          </h2>
          <button onClick={() => setIsChatOpen(false)} style={{ background: 'none', border: 'none', color: '#ccc' }}><X size={24} /></button>
        </div>

        <div ref={chatScrollRef} style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {messages.map((msg) => {
            const isMe = msg.senderName === userName;
            return (
              <div key={msg.id} style={{ alignSelf: isMe ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
                <div style={{ fontSize: '11px', opacity: 0.5, marginBottom: '4px', textAlign: isMe ? 'right' : 'left' }}>{msg.senderName} • {new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                <div style={{ background: isMe ? '#4f46e5' : 'rgba(255,255,255,0.1)', padding: '12px', borderRadius: '16px', borderBottomRightRadius: isMe ? '4px' : '16px', borderBottomLeftRadius: isMe ? '16px' : '4px' }}>
                  {msg.type === 'TEXT' ? (
                    <span style={{ fontSize: '14px' }}>{msg.content}</span>
                  ) : msg.type === 'AUDIO' ? (
                    <audio controls src={msg.content} style={{ height: '30px', maxWidth: '100%' }} />
                  ) : (
                    <img src={msg.content} alt="táctica" className="chat-image-preview" onClick={() => {
                      const win = window.open();
                      win?.document.write(`<body style="background:#000;display:flex;justify-content:center;align-items:center;margin:0;"><img src="${msg.content}" style="max-width:100%;max-height:100%;object-fit:contain;" /></body>`);
                    }} />
                  )}
                </div>
              </div>
            );
          })}
          {messages.length === 0 && <p style={{ textAlign: 'center', opacity: 0.5, marginTop: '50px' }}>No hay mensajes. Usa el PTT para enviar un audio táctico o fotos.</p>}
        </div>

        <div style={{ padding: '20px', background: 'rgba(255,255,255,0.05)', display: 'flex', gap: '10px', alignItems: 'center' }}>
          <input type="file" ref={fileInputRef} accept="image/*" style={{ display: 'none' }} onChange={handleImageSelect} />
          <input type="file" ref={cameraInputRef} accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleImageSelect} />

          {/* Si está grabando, oculta los botones de foto e input de texto */}
          {isRecording ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button onClick={cancelRecording} style={{ background: 'none', border: 'none', color: '#ef4444', padding: '8px' }}>
                <Trash size={20} />
              </button>
              <div style={{ flex: 1, color: '#4ade80', fontSize: '14px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>Grabando Audio Táctico...</span>
                <div className="eq-container">
                  <div className="eq-bar" />
                  <div className="eq-bar" />
                  <div className="eq-bar" />
                  <div className="eq-bar" />
                  <div className="eq-bar" />
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Botón de Cámara Directa */}
              <button onClick={() => cameraInputRef.current?.click()} style={{ background: 'none', border: 'none', color: '#ccc', padding: '6px' }} title="Hacer Foto">
                <Camera size={22} />
              </button>
              {/* Botón de Galería */}
              <button onClick={() => fileInputRef.current?.click()} style={{ background: 'none', border: 'none', color: '#ccc', padding: '6px' }} title="Elegir de Galería">
                <Image size={22} />
              </button>
              <input type="text" value={textInput} onChange={(e) => setTextInput(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleSendText()} placeholder="Mensaje rápido..." style={{ flex: 1, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', padding: '12px 16px', borderRadius: '24px', color: 'white', outline: 'none' }} />
            </>
          )}

          {/* Botones de acción derecha (Mic / Enviar) */}
          {!isRecording && !textInput.trim() ? (
            <button 
              onClick={toggleRecording} 
              style={{ background: 'rgba(139,92,246,0.3)', border: 'none', color: '#a78bfa', width: '44px', height: '44px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <Mic size={20} />
            </button>
          ) : (
            <button 
              onClick={isRecording ? toggleRecording : handleSendText} 
              style={{ background: '#4ade80', border: 'none', color: '#0f172a', width: '44px', height: '44px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: isRecording ? 'pulse-green 1s infinite' : 'none' }}
            >
              <Send size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Modal de Desvinculación de Emergencia con Doble Confirmación */}
      {isUnlinkModalOpen && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(8px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: 'rgba(30, 41, 59, 0.8)', border: '1px solid rgba(255, 255, 255, 0.1)', padding: '24px', borderRadius: '24px', width: '100%', maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '16px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)' }}>
            <h3 style={{ margin: 0, fontSize: '18px', color: '#f87171', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldAlert size={24} /> Desvincular Dispositivo
            </h3>
            <p style={{ fontSize: '14px', margin: 0, opacity: 0.8, lineHeight: 1.5 }}>
              ⚠️ Esta acción cortará el enlace de seguridad P2P permanente 24/7 con sus familiares vinculados.
            </p>
            <p style={{ fontSize: '14px', margin: 0, opacity: 0.9 }}>
              Escriba su nombre de usuario registrado <strong>({userName})</strong> para confirmar:
            </p>
            <input 
              type="text" 
              value={unlinkConfirmName} 
              onChange={(e) => setUnlinkConfirmName(e.target.value)} 
              placeholder="Escriba su nombre aquí" 
              style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', padding: '12px 16px', borderRadius: '12px', color: 'white', outline: 'none', fontSize: '14px' }} 
            />
            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
              <button 
                onClick={() => setIsUnlinkModalOpen(false)} 
                style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '12px', borderRadius: '12px', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button 
                onClick={confirmLogout} 
                disabled={unlinkConfirmName.trim() !== userName.trim()} 
                style={{ 
                  flex: 1, 
                  background: unlinkConfirmName.trim() === userName.trim() ? '#ef4444' : 'rgba(239, 68, 68, 0.2)', 
                  border: 'none', 
                  color: unlinkConfirmName.trim() === userName.trim() ? 'white' : 'rgba(255,255,255,0.3)', 
                  padding: '12px', 
                  borderRadius: '12px', 
                  fontSize: '14px', 
                  fontWeight: 'bold', 
                  cursor: unlinkConfirmName.trim() === userName.trim() ? 'pointer' : 'not-allowed',
                  transition: 'background 0.3s'
                }}
              >
                Desvincular
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
