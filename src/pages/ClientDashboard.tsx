// Radar Familiar - Production Version - Code Freeze
import { useStore, playTonalSound, type ChatMessage } from '../store/useStore';
import { useNavigate } from 'react-router-dom';
import { useRef, useEffect, useState } from 'react';
import Peer from 'peerjs';
import { Geolocation } from '@capacitor/geolocation';
import { MapContainer, TileLayer, Marker, useMap, Popup } from 'react-leaflet';
import L from 'leaflet';
import { ShieldAlert, Bell, MessageSquare, LogOut, CheckCircle, Mic, Send, X, Clock, Camera, Menu, Focus, Trash, Smartphone, Sun, Moon, Image } from 'lucide-react';
import 'leaflet/dist/leaflet.css';

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

export default function ClientDashboard() {
  const { isSOSActive, setSOSActive, logout, userName, avatarBase64, masterServerId, setMyPeerId, messages, addMessage, offlineQueue, enqueueOfflineAction, cleanOldMessages } = useStore();
  const navigate = useNavigate();

  const sosTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tapCountRef  = useRef(0);

  const peerRef = useRef<Peer | null>(null);
  const connRef = useRef<any>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [myLocation, setMyLocation] = useState<[number, number] | null>(null);
  const [monitorLocation, setMonitorLocation] = useState<{lat: number, lng: number, avatar: string | null} | null>(null);
  const [ghostModeActive, setGhostModeActive] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [mapCenterTarget, setMapCenterTarget] = useState<[number, number] | null>(null);
  const [mapTheme, setMapTheme] = useState<'dark' | 'light'>('dark');

  const audioCtxRef = useRef<AudioContext | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const [isRemoteAlarmActive, setIsRemoteAlarmActive] = useState(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Chat State
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessingMic, setIsProcessingMic] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const cancelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wakeLockRef = useRef<any>(null);
  const lastPingRef = useRef<number>(Date.now());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const discardRecordingRef = useRef<boolean>(false);
  const isConnectedRef = useRef(false);

  // Caché de íconos para evitar parpadeos
  const myIconRef = useRef(L.divIcon({ className: 'custom-avatar-marker', html: avatarBase64 ? `<div style="width:36px;height:36px;border-radius:50%;overflow:hidden;border:2px solid #4ade80;box-shadow:0 0 10px rgba(74,222,128,0.5);"><img src="${avatarBase64}" style="width:100%;height:100%;object-fit:cover;" /></div>` : `<div style="width:24px;height:24px;background:#4ade80;border-radius:50%;border:2px solid white;"></div>`, iconSize: [36, 36], iconAnchor: [18, 18] }));
  const monitorIconCache = useRef<Record<string, L.DivIcon>>({});
  
  // Anti-Spam Reconnection Backoff
  const reconnectAttemptsRef = useRef(0);
  const lastReconnectTimeRef = useRef(0);
  const [gpsError, setGpsError] = useState<string | null>(null);

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

  useEffect(() => {
    return () => {
      if (sosTimerRef.current) clearTimeout(sosTimerRef.current);
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
      if (cancelTimerRef.current) clearTimeout(cancelTimerRef.current);
      if (peerRef.current) peerRef.current.destroy();
      stopRemoteAlarm();
      releaseWakeLock();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      if (reconnectTimerRef.current) clearInterval(reconnectTimerRef.current);
    };
  }, []);

  // Auto-scroll chat
  useEffect(() => {
    if (isChatOpen && chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, isChatOpen]);

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
    
    setInterval(() => {
      if (oscillatorRef.current) {
        osc.frequency.setValueAtTime(600, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(1200, ctx.currentTime + 0.2);
        osc.frequency.linearRampToValueAtTime(600, ctx.currentTime + 0.4);
      }
    }, 400);

    gain.gain.value = 1;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    oscillatorRef.current = osc;
    setIsRemoteAlarmActive(true);
    
    // Fallback disuasivo: Vibración máxima si el dispositivo está silenciado
    if ('vibrate' in navigator) {
      navigator.vibrate([500, 200, 500, 200, 500, 200, 500]);
      setInterval(() => { if (isRemoteAlarmActive) navigator.vibrate([500, 200, 500]); }, 2000);
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

  // P2P Connection
  useEffect(() => {
    if (!masterServerId) return;

    const connectPeer = () => {
      const now = Date.now();
      const delay = Math.min(5000 * Math.pow(2, reconnectAttemptsRef.current), 60000);
      if (now - lastReconnectTimeRef.current < delay && reconnectAttemptsRef.current > 0) {
        return; // Esperar backoff
      }
      lastReconnectTimeRef.current = now;
      reconnectAttemptsRef.current += 1;

      if (peerRef.current) peerRef.current.destroy();
      // FIJAR PEER ID: Evita crear clones zombis en el monitor si se reconecta.
      const savedPeerId = useStore.getState().myPeerId;
      const peer = savedPeerId ? new Peer(savedPeerId) : new Peer();
      peerRef.current = peer;

      peer.on('open', (id) => {
        setMyPeerId(id);
        const conn = peer.connect(masterServerId);
        connRef.current = conn;
        
        conn.on('open', () => {
          setIsConnected(true);
          isConnectedRef.current = true;
          reconnectAttemptsRef.current = 0; // Reset backoff
          playTonalSound('P2P_HANDSHAKE');
          
          // Enviar perfil pesado SOLO una vez al conectar
          conn.send({ type: 'USER_PROFILE', name: userName, avatar: avatarBase64 });
          
          // Flush Offline Queue con Deduplicación (Aduana Anti-Spam)
          const currentQueue = useStore.getState().offlineQueue;
          if (currentQueue.length > 0) {
             const uniqueQueue = currentQueue.filter((v, i, a) => {
                if (v.type === 'CHECK_IN') {
                   return a.findIndex(t => t.type === 'CHECK_IN') === i;
                }
                return true;
             });
             uniqueQueue.forEach(action => conn.send(action));
             useStore.getState().clearOfflineQueue();
          }

          setInterval(() => {
            if (connRef.current && connRef.current.open) {
              connRef.current.send({ type: 'HEARTBEAT', name: userName }); // Sin avatar, ultra ligero
            }
          }, 5000);
        });

        conn.on('data', (data: any) => {
          if (data.type === 'REMOTE_SOS') {
             setGhostModeActive(false); // Anula sigilo visual si suena sirena
             releaseWakeLock();
             if (!useStore.getState().isSOSActive) playRemoteAlarm();
          }
          if (data.type === 'STOP_REMOTE_SOS') {
             stopRemoteAlarm();
             setGhostModeActive(false);
             if (!useStore.getState().isSOSActive) releaseWakeLock();
          }
          if (data.type === 'GHOST_MODE') {
             setGhostModeActive(true);
             acquireWakeLock(); // Prohibe apagar pantalla
             stopRemoteAlarm(); // Prioridad sigilo
          }
          if (data.type === 'SOS_ALERT') {
             // Eco comunitario: suena sirena por otro miembro
             if (!useStore.getState().isSOSActive) {
                playRemoteAlarm();
             }
          }
          if (data.type === 'MONITOR_LOCATION') {
             setMonitorLocation({ lat: data.lat, lng: data.lng, avatar: data.avatar });
          }
          if (data.type === 'CHAT_MSG') {
             addMessage(data.message);
             playTonalSound('CHAT_RECEIVE');
          }
          // Activar latido (Anti-Zombi)
          lastPingRef.current = Date.now();

          if (data.type === 'SILENT_PING' || data.type === 'GHOST_MODE') {
             // Force update location without alerting user
             Geolocation.getCurrentPosition({ enableHighAccuracy: true }).then(pos => {
               if (connRef.current && connRef.current.open) {
                 connRef.current.send({ type: 'LOCATION', lat: pos.coords.latitude, lng: pos.coords.longitude, name: userName || 'Cliente' });
               }
             }).catch(e => console.log('Silent ping failed', e));
          }
        });
        
        conn.on('close', () => {
          if (isConnectedRef.current) playTonalSound('P2P_LOST');
          setIsConnected(false);
          isConnectedRef.current = false;
        });
        conn.on('error', () => {
          if (isConnectedRef.current) playTonalSound('P2P_LOST');
          setIsConnected(false);
          isConnectedRef.current = false;
        });
      });
    };

    connectPeer();

    reconnectTimerRef.current = setInterval(() => {
      const now = Date.now();
      // Auto-reconnect Watchdog & Zombie killer
      if (!connRef.current || !connRef.current.open || (now - lastPingRef.current > 15000)) {
        console.log("Destruyendo conexión zombi y reconectando...");
        connectPeer();
      }
    }, 5000);

    return () => {
      if (reconnectTimerRef.current) clearInterval(reconnectTimerRef.current);
      if (peerRef.current) peerRef.current.destroy();
    };
  }, [masterServerId, setMyPeerId, userName, addMessage]);

  // Geolocation
  useEffect(() => {
    let watchId: string | null = null;
    
    const startTracking = async () => {
      try {
        const perm = await Geolocation.requestPermissions();
        if (perm.location !== 'granted') {
          setGpsError("GPS Denegado. La app no puede protegerte sin ubicación. Por favor, actívalo en los ajustes de tu teléfono.");
          return;
        }
        setGpsError(null);

        watchId = await Geolocation.watchPosition(
          { enableHighAccuracy: true, timeout: 10000 },
          (position) => {
             if (position) {
                 const coords: [number, number] = [position.coords.latitude, position.coords.longitude];
                 setMyLocation(coords);
                 if (connRef.current && connRef.current.open && useStore.getState().isSOSActive) {
                     connRef.current.send({
                         type: 'LOCATION',
                         lat: position.coords.latitude,
                         lng: position.coords.longitude,
                         name: userName || 'Cliente'
                     });
                 }
             }
          }
        );
      } catch (e) {
        console.error('Error al iniciar geolocalización', e);
      }
    };
    
    startTracking();
    
    return () => {
      if (watchId) Geolocation.clearWatch({ id: watchId });
    };
  }, [userName, avatarBase64]);

  // SOS status
  useEffect(() => {
    if (isSOSActive) {
      stopRemoteAlarm(); // Prioridad sigilo
      acquireWakeLock(); // No dormir en pánico
      if (connRef.current && connRef.current.open) {
        connRef.current.send({ type: 'SOS_ALERT', name: userName || 'Cliente' });
      } else {
        enqueueOfflineAction({ type: 'SOS_ALERT', name: userName || 'Cliente' });
      }
    } else {
      if (!ghostModeActive) releaseWakeLock();
    }
  }, [isSOSActive, userName, ghostModeActive, enqueueOfflineAction]);

  const sendAction = (type: string) => {
    const action: any = { type, name: userName };
    if (type === 'CHECK_IN' && myLocation) {
      action.lat = myLocation[0];
      action.lng = myLocation[1];
    }
    if (connRef.current && connRef.current.open) {
      connRef.current.send(action);
    } else {
      enqueueOfflineAction(action);
    }
  };

  const dispatchChatMessage = (msg: ChatMessage) => {
    addMessage(msg);
    const action = { type: 'CHAT_MSG', message: msg };
    if (connRef.current && connRef.current.open) {
      connRef.current.send(action);
    } else {
      // Evitar cuelgue de memoria por notas de voz offline (Límite LocalStorage)
      if (msg.type !== 'AUDIO') {
        enqueueOfflineAction(action);
      } else {
        alert("Sin conexión: La nota de voz no se pudo enviar y fue descartada para ahorrar memoria.");
      }
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
      
      mediaRecorderRef.current.ondataavailable = (e) => {
        audioChunksRef.current.push(e.data);
      };

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
          const base64Audio = reader.result as string;
          const msg: ChatMessage = {
            id: Date.now().toString(),
            senderName: userName,
            type: 'AUDIO',
            content: base64Audio,
            timestamp: Date.now()
          };
          dispatchChatMessage(msg);
          setIsProcessingMic(false);
        };
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      playTonalSound('PTT_START');
    } catch (err) {
      console.error('Error al acceder al micrófono', err);
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

        const msg: ChatMessage = {
          id: Date.now().toString(),
          senderName: userName,
          type: 'IMAGE',
          content: compressedBase64,
          timestamp: Date.now()
        };
        dispatchChatMessage(msg);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleSOSPressStart = () => {
    sosTimerRef.current = setTimeout(() => setSOSActive(true), 2000);
  };

  const handleSOSPressEnd = () => {
    if (sosTimerRef.current) {
      clearTimeout(sosTimerRef.current);
      sosTimerRef.current = null;
    }
  };

  const cancelSOS = () => {
    setSOSActive(false);
    stopRemoteAlarm(); // Apagado forzoso de cualquier alarma que esté sonando de fondo
    if (connRef.current && connRef.current.open) {
      connRef.current.send({ type: 'SOS_CANCELED', name: userName });
    }
  };

  const startCancelSOS = (e: any) => {
    e.stopPropagation();
    cancelTimerRef.current = setTimeout(() => {
      cancelSOS();
    }, 2000);
  };

  const stopCancelSOS = (e: any) => {
    e.stopPropagation();
    if (cancelTimerRef.current) clearTimeout(cancelTimerRef.current);
  };

  const handleBlackoutTap = () => {
    tapCountRef.current += 1;
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    if (tapCountRef.current >= 5) {
      tapCountRef.current = 0;
      cancelSOS();
    } else {
      tapTimerRef.current = setTimeout(() => tapCountRef.current = 0, 3000);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

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

  // Effect to clean old messages periodically (Barredor 24hs real)
  useEffect(() => {
    cleanOldMessages();
    const interval = setInterval(cleanOldMessages, 60 * 60 * 1000); // Cada 1 hora
    return () => clearInterval(interval);
  }, [cleanOldMessages]);

  return (
    <div className="dashboard-container" style={{ position: 'relative', overflow: 'hidden' }}>
      {gpsError && (
        <div style={{ position: 'absolute', top: 60, left: 0, right: 0, background: '#ef4444', color: 'white', padding: '12px', textAlign: 'center', zIndex: 9999, fontWeight: 'bold' }}>
          {gpsError}
        </div>
      )}

      <MapContainer center={myLocation || [-34.6037, -58.3816]} zoom={15} style={{ height: '100dvh', width: '100vw' }} zoomControl={false}>
        <MapAutoCenter target={mapCenterTarget} />
        <TileLayer url={mapTheme === 'dark' ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"} />
        
        {myLocation && (
          <Marker position={myLocation} icon={myIconRef.current}>
            <Popup>Tú (Rastreable)</Popup>
          </Marker>
        )}

        {monitorLocation && (
          <Marker position={[monitorLocation.lat, monitorLocation.lng]} icon={(() => {
            const cacheKey = monitorLocation.avatar ? 'avatar' : 'no_avatar';
            if (!monitorIconCache.current[cacheKey]) {
              monitorIconCache.current[cacheKey] = L.divIcon({ 
                className: 'monitor-avatar-marker', 
                html: monitorLocation.avatar 
                  ? `<div style="width:36px;height:36px;border-radius:50%;overflow:hidden;border:2px solid #8b5cf6;box-shadow:0 0 10px rgba(139,92,246,0.5);"><img src="${monitorLocation.avatar}" style="width:100%;height:100%;object-fit:cover;" /></div>` 
                  : `<div style="width:24px;height:24px;background:#8b5cf6;border-radius:50%;border:2px solid white;"></div>`, 
                iconSize: [36, 36], 
                iconAnchor: [18, 18] 
              });
            }
            return monitorIconCache.current[cacheKey];
          })()}>
            <Popup>Monitor (Padre)</Popup>
          </Marker>
        )}
      </MapContainer>

      <button 
        className="map-theme-btn" 
        onClick={() => setMapTheme(prev => prev === 'dark' ? 'light' : 'dark')}
        title="Cambiar tema de mapa"
      >
        {mapTheme === 'dark' ? <Sun size={24} /> : <Moon size={24} />}
      </button>

      {/* Alerta de Alarma Remota del Padre */}
      {isRemoteAlarmActive && (
        <div style={{ position: 'absolute', top: 80, left: '50%', transform: 'translateX(-50%)', zIndex: 9999, background: '#ef4444', color: 'white', padding: '16px 24px', borderRadius: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', boxShadow: '0 8px 32px rgba(239, 68, 68, 0.4)', animation: 'pulse 1.5s infinite' }}>
          <Bell size={28} />
          <strong style={{ fontSize: '14px' }}>¡Sirena remota activada!</strong>
          <button onClick={stopRemoteAlarm} style={{ background: 'white', color: '#ef4444', border: 'none', padding: '6px 12px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>APAGAR</button>
        </div>
      )}

      {!isConnected && (
        <div style={{ position: 'absolute', top: 76, left: '50%', transform: 'translateX(-50%)', background: 'rgba(220, 38, 38, 0.9)', color: 'white', padding: '8px 20px', borderRadius: '20px', fontSize: '14px', zIndex: 1100, display: 'flex', alignItems: 'center', gap: '8px' }}>
          {offlineQueue.length > 0 && <Clock size={14} color="#facc15" />}
          <span>⚠️ Desconectado</span>
        </div>
      )}

      {/* Top Bar Overlay */}
      <div className="top-bar">
        <button className="icon-btn" onClick={() => setIsMenuOpen(true)}><Menu size={24} /></button>
        <div className="top-bar-title">{userName} - Rastreable</div>
        <button className="icon-btn" onClick={() => setIsChatOpen(true)}>
          <MessageSquare size={24} />
        </button>
      </div>

      {/* Bottom Bar Overlay */}
      <div className="bottom-bar">
        <button className="bottom-action" onClick={() => myLocation && setMapCenterTarget(myLocation)}><Focus size={30} /><span>Centrar</span></button>
        
        {/* Llegué Bien Action */}
        <button className="bottom-action" onClick={() => sendAction('CHECK_IN')}>
          <CheckCircle size={30} color="#4ade80" />
          <span style={{ color: '#4ade80' }}>Llegué Bien</span>
        </button>

        {/* SOS Button inside bottom-bar */}
        <button 
          className="bottom-action" 
          onMouseDown={handleSOSPressStart} onMouseUp={handleSOSPressEnd} onMouseLeave={handleSOSPressEnd}
          onTouchStart={handleSOSPressStart} onTouchEnd={handleSOSPressEnd} onTouchMove={handleSOSPressEnd} onTouchCancel={handleSOSPressEnd}
          style={{
            color: isSOSActive ? '#4ade80' : 'rgba(251, 113, 133, 0.5)',
            animation: isSOSActive ? 'pulse-green 1s infinite' : 'none'
          }}
        >
          <ShieldAlert size={30} color={isSOSActive ? '#4ade80' : 'rgba(251, 113, 133, 0.5)'} />
          <span>{isSOSActive ? '🚨 SOS: TRANSMITIENDO' : '🛡️ SOS: DESACTIVADO'}</span>
        </button>
      </div>

      {/* Side Menu Overlay */}
      {isMenuOpen && <div className="side-menu-overlay" onClick={() => setIsMenuOpen(false)} />}
      <div className={`side-menu ${isMenuOpen ? 'open' : ''}`}>
        <div className="menu-header">
          <h2 style={{ fontSize: '18px', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}><ShieldAlert size={20} color="#ec4899" />Radar Familiar</h2>
          <button className="icon-btn" onClick={() => setIsMenuOpen(false)} style={{ marginRight: '-8px' }}><X size={24} /></button>
        </div>

        <div style={{ marginBottom: '32px' }}>
          <p style={{ fontSize: '11px', opacity: 0.5, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>Estado del Sistema</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', marginBottom: '8px' }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: isConnected ? '#4ade80' : '#facc15' }} />
            <span style={{ fontSize: '14px', fontWeight: 'bold' }}>{isConnected ? 'En Línea (Protegido)' : 'Fuera de Línea'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', opacity: 0.7 }}>
            <Smartphone size={20} />
            <span style={{ fontSize: '14px' }}>Código: {masterServerId}</span>
          </div>
        </div>

        <button className="menu-item" onClick={handleLogout} style={{ marginTop: 'auto', display: 'flex', gap: '12px', color: '#fb7185' }}>
          <LogOut size={18} />
          <span>Desvincular / Salir</span>
        </button>
      </div>

      {/* Chat Overlay */}
      <div style={{ position: 'absolute', top: isChatOpen ? 0 : '100%', left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.95)', backdropFilter: 'blur(10px)', zIndex: 2000, transition: 'top 0.3s cubic-bezier(0.4, 0, 0.2, 1)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '20px', background: 'rgba(255,255,255,0.05)' }}>
          <h2 style={{ margin: 0, fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
            <MessageSquare size={20} color="#8b5cf6" /> Comunicación P2P
          </h2>
          <button onClick={() => setIsChatOpen(false)} style={{ background: 'none', border: 'none', color: '#ccc' }}>
            <X size={24} />
          </button>
        </div>

        <div ref={chatScrollRef} style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {messages.map((msg) => {
            const isMe = msg.senderName === userName;
            return (
              <div key={msg.id} style={{ alignSelf: isMe ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
                <div style={{ fontSize: '11px', opacity: 0.5, marginBottom: '4px', textAlign: isMe ? 'right' : 'left' }}>
                  {msg.senderName} • {new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                </div>
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

        {/* Input Area WhatsApp Style */}
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
    </div>
  );
}
