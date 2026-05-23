import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useState, useEffect, useRef } from 'react';
import { useStore, type ChatMessage } from '../store/useStore';
import { useNavigate } from 'react-router-dom';
import { QRCode } from 'react-qr-code';
import { Menu, X, QrCode, LogOut, Focus, AlertCircle, ShieldAlert, Smartphone, BellOff, MessageSquare, Send, Mic, MapPin, Ghost, Bell } from 'lucide-react';
import Peer from 'peerjs';
import { Geolocation } from '@capacitor/geolocation';

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
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  const { logout, masterServerId, fenceRadius, setFenceRadius, userName, avatarBase64, messages, addMessage, cleanOldMessages } = useStore();
  const navigate = useNavigate();
  const [localRadius, setLocalRadius] = useState(fenceRadius);
  const [myLocation, setMyLocation] = useState<[number, number] | null>(null);

  const [clients, setClients] = useState<Record<string, { lat: number; lng: number; name: string, lastSeen: number, isOnline: boolean, avatar: string | null }>>({});
  const [alarmActive, setAlarmActive] = useState<{ active: boolean; originName: string }>({ active: false, originName: '' });
  const [mapCenterTarget, setMapCenterTarget] = useState<[number, number] | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  
  // Caché de íconos para evitar parpadeos masivos del mapa
  const markerIconCache = useRef<Record<string, L.DivIcon>>({});
  const getAvatarIcon = (id: string, avatar: string | null, isOnline: boolean, isMonitor: boolean) => {
    const cacheKey = `${id}_${isOnline ? 'on' : 'off'}_${avatar ? 'avatar' : 'no_avatar'}`;
    if (!markerIconCache.current[cacheKey]) {
      const size = isMonitor ? 36 : 40;
      const color = isMonitor ? '#8b5cf6' : (isOnline ? '#4ade80' : '#9ca3af');
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
  const peerRef = useRef<Peer | null>(null);

  const [toasts, setToasts] = useState<{id: number, msg: string}[]>([]);
  const [remoteSOSActive, setRemoteSOSActive] = useState(false);
  const geofenceStrikesRef = useRef<Record<string, number>>({});

  // Chat UI
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const showToast = (msg: string) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, msg }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 6000);
  };

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

  // P2P Setup
  useEffect(() => {
    if (!masterServerId) return;

    const peer = new Peer(masterServerId);
    peerRef.current = peer;

    peer.on('connection', (conn) => {
      
      conn.on('open', () => {
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
            [conn.peer]: { ...(prev[conn.peer] || { lat: 0, lng: 0, lastSeen: now }), name: data.name, isOnline: true, avatar: data.avatar || null }
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
            return { ...prev, [conn.peer]: { ...(prev[conn.peer] || { avatar: null }), lat: data.lat, lng: data.lng, name: data.name, lastSeen: now, isOnline: true } };
          });

          if (myLocation) {
            const dist = getDistance(myLocation[0], myLocation[1], data.lat, data.lng);
            if (dist > localRadius) {
              const currentStrikes = (geofenceStrikesRef.current[data.name] || 0) + 1;
              geofenceStrikesRef.current[data.name] = currentStrikes;
              
              if (currentStrikes === 3) {
                showToast(`⚠️ ${data.name} salió de la zona segura (${Math.round(dist)}m)`);
              } else if (currentStrikes > 3 && currentStrikes % 10 === 0) {
                showToast(`⚠️ ${data.name} sigue fuera de zona (${Math.round(dist)}m)`);
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

        if (data.type === 'CHECK_IN') showToast(`✅ ${data.name} reporta que llegó bien.`);
        if (data.type === 'PICK_ME_UP') showToast(`🚗 ${data.name} pide que lo vayas a buscar.`);
        if (data.type === 'CHAT_MSG') {
           addMessage(data.message);
           showToast(`💬 Mensaje de ${data.message.senderName}`);
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
       setClients(prev => {
          let changed = false;
          const updated = { ...prev };
          for (let id in updated) {
             if (updated[id].isOnline && (now - updated[id].lastSeen > 15000)) {
                updated[id].isOnline = false;
                changed = true;
                showToast(`❌ Se perdió conexión con ${updated[id].name}`);
             }
          }
          return changed ? updated : prev;
       });
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const playSiren = () => {
    if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') ctx.resume();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'square';
    osc.frequency.setValueAtTime(400, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(800, ctx.currentTime + 0.4);
    osc.frequency.linearRampToValueAtTime(400, ctx.currentTime + 0.8);
    setInterval(() => {
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
      showToast('🚨 Sirena Remota disparada.');
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

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];
      mediaRecorderRef.current.ondataavailable = (e) => audioChunksRef.current.push(e.data);
      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          dispatchChatMessage({ id: Date.now().toString(), senderName: userName, type: 'AUDIO', content: reader.result as string, timestamp: Date.now() });
        };
        stream.getTracks().forEach(track => track.stop());
      };
      mediaRecorderRef.current.start();
      setIsRecording(true);
    } catch (err) {
      showToast('Error al acceder al micrófono');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
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
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
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
            <Marker key={id} position={[client.lat, client.lng]} opacity={client.isOnline ? 1 : 0.5} icon={getAvatarIcon(id, client.avatar, client.isOnline, false)}>
              <Popup><strong>{client.name}</strong> <br/>{client.isOnline ? 'GPS en tiempo real' : 'Última ubicación conocida'}</Popup>
            </Marker>
          );
        })}
      </MapContainer>

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
        <button className="icon-btn" onClick={() => setIsMenuOpen(true)}><Menu size={24} /></button>
        <div className="top-bar-title">{userName} - Monitor</div>
        <button className="icon-btn" onClick={() => setIsChatOpen(true)}><MessageSquare size={24} /></button>
      </div>

      <div className="bottom-bar">
        <button className="bottom-action" onClick={handleCenterMap}><Focus size={22} /><span>Centrar</span></button>
        <button className={`bottom-action ${remoteSOSActive ? 'danger-active' : 'danger'}`} onClick={toggleGhostMode} style={{ background: remoteSOSActive ? '#8b5cf6' : 'rgba(0,0,0,0.6)' }}>
          <Ghost size={22} color={remoteSOSActive ? '#fff' : '#c084fc'} />
          <span style={{ color: remoteSOSActive ? '#fff' : '#c084fc' }}>{remoteSOSActive ? 'Apagar Sigilo' : 'Modo Sigilo'}</span>
        </button>
      </div>

      {isMenuOpen && <div className="side-menu-overlay" onClick={() => setIsMenuOpen(false)} />}
      <div className={`side-menu ${isMenuOpen ? 'open' : ''}`}>
        <div className="menu-header">
          <h2 style={{ fontSize: '18px', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}><ShieldAlert size={20} color="#ec4899" />Radar Familiar</h2>
          <button className="icon-btn" onClick={() => setIsMenuOpen(false)} style={{ marginRight: '-8px' }}><X size={24} /></button>
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
                {c.avatar ? (
                  <img src={c.avatar} alt={c.name} style={{ width: '32px', height: '32px', borderRadius: '50%', border: `2px solid ${c.isOnline ? '#4ade80' : '#9ca3af'}` }} />
                ) : (
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: c.isOnline ? '#4ade80' : '#9ca3af' }}></div>
                )}
                <span style={{ fontSize: '15px', fontWeight: 'bold', color: c.isOnline ? 'inherit' : '#9ca3af', flex: 1 }}>{c.name}</span>
                {!c.isOnline && <span style={{ fontSize: '11px', opacity: 0.5 }}>Offline</span>}
                {c.isOnline && (
                  <>
                    <button onClick={() => triggerLoudAlarm(id)} style={{ background: 'none', border: 'none', color: '#dc2626', padding: '4px', display: 'flex', alignItems: 'center', cursor: 'pointer' }} title="Hacer Sonar Alarma">
                      <Bell size={18} />
                    </button>
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

        <div style={{ marginTop: 'auto' }}><button className="menu-item" onClick={() => { logout(); navigate('/'); }} style={{ color: '#fca5a5' }}><LogOut size={18} />Cerrar sesión</button></div>
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
                  {msg.type === 'TEXT' ? <span style={{ fontSize: '14px' }}>{msg.content}</span> : <audio controls src={msg.content} style={{ height: '30px', maxWidth: '100%' }} />}
                </div>
              </div>
            );
          })}
          {messages.length === 0 && <p style={{ textAlign: 'center', opacity: 0.5, marginTop: '50px' }}>No hay mensajes. Usa el PTT para enviar un audio táctico.</p>}
        </div>

        <div style={{ padding: '20px', background: 'rgba(255,255,255,0.05)', display: 'flex', gap: '10px', alignItems: 'center' }}>
          <input type="text" value={textInput} onChange={(e) => setTextInput(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleSendText()} placeholder="Mensaje rápido..." style={{ flex: 1, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', padding: '12px 16px', borderRadius: '24px', color: 'white', outline: 'none' }} />
          {textInput.trim() ? (
            <button onClick={handleSendText} style={{ background: '#4f46e5', border: 'none', color: 'white', width: '44px', height: '44px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Send size={18} /></button>
          ) : (
            <button onMouseDown={startRecording} onMouseUp={stopRecording} onMouseLeave={stopRecording} onTouchStart={startRecording} onTouchEnd={stopRecording} onTouchMove={stopRecording} onTouchCancel={stopRecording} style={{ background: isRecording ? '#ef4444' : '#8b5cf6', border: 'none', color: 'white', width: '44px', height: '44px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s', animation: isRecording ? 'pulse 1s infinite' : 'none' }}>
              <Mic size={20} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
