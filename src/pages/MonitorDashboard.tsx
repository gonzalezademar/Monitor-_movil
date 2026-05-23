import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useState, useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { useNavigate } from 'react-router-dom';
import { QRCode } from 'react-qr-code';
import { Menu, X, QrCode, LogOut, Focus, AlertCircle, ShieldAlert, Smartphone, BellOff } from 'lucide-react';
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

// Haversine formula to calculate distance in meters
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
  
  const { logout, masterServerId, fenceRadius, setFenceRadius, userName } = useStore();
  const navigate = useNavigate();
  const [localRadius, setLocalRadius] = useState(fenceRadius);

  const [myLocation, setMyLocation] = useState<[number, number] | null>(null);

  const [clients, setClients] = useState<Record<string, { lat: number; lng: number; name: string, lastSeen: number, isOnline: boolean }>>({});
  const [alarmActive, setAlarmActive] = useState<{ active: boolean; originName: string }>({ active: false, originName: '' });
  const [mapCenterTarget, setMapCenterTarget] = useState<[number, number] | null>(null);
  
  const audioCtxRef = useRef<AudioContext | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const peerRef = useRef<Peer | null>(null);

  const [toasts, setToasts] = useState<{id: number, msg: string}[]>([]);
  const [remoteSOSActive, setRemoteSOSActive] = useState(false);

  // Helper to show toasts
  const showToast = (msg: string) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, msg }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 6000);
  };

  // Monitor's own GPS
  useEffect(() => {
    let watchId: string | null = null;
    Geolocation.requestPermissions().then(perm => {
      if (perm.location === 'granted') {
        Geolocation.watchPosition({ enableHighAccuracy: true }, (pos) => {
           if (pos) setMyLocation([pos.coords.latitude, pos.coords.longitude]);
        }).then(id => watchId = id);
      }
    });
    return () => { if (watchId) Geolocation.clearWatch({ id: watchId }); }
  }, []);

  // P2P Setup
  useEffect(() => {
    if (!masterServerId) return;

    const peer = new Peer(masterServerId);
    peerRef.current = peer;

    peer.on('connection', (conn) => {
      conn.on('data', (data: any) => {
        const now = Date.now();
        
        if (data.type === 'HEARTBEAT') {
          setClients(prev => ({
            ...prev,
            [conn.peer]: { ...(prev[conn.peer] || { lat: 0, lng: 0 }), name: data.name, lastSeen: now, isOnline: true }
          }));
        }
        
        if (data.type === 'LOCATION') {
          setClients((prev) => {
            if (Object.keys(prev).length === 0) setMapCenterTarget([data.lat, data.lng]);
            return {
              ...prev,
              [conn.peer]: { lat: data.lat, lng: data.lng, name: data.name, lastSeen: now, isOnline: true }
            };
          });

          // Check Geofence
          if (myLocation) {
            const dist = getDistance(myLocation[0], myLocation[1], data.lat, data.lng);
            if (dist > localRadius) {
              showToast(`⚠️ ${data.name} está fuera de la zona segura (${Math.round(dist)}m)`);
            }
          }
        }
        
        if (data.type === 'SOS_ALERT') {
          setAlarmActive({ active: true, originName: data.name });
          playSiren();
        }

        if (data.type === 'CHECK_IN') {
          showToast(`✅ ${data.name} reporta que llegó bien.`);
        }

        if (data.type === 'PICK_ME_UP') {
          showToast(`🚗 ${data.name} pide que lo vayas a buscar.`);
        }
      });
    });

    return () => {
      peer.destroy();
      stopSiren();
    };
  }, [masterServerId, myLocation, localRadius]);

  // Heartbeat Checker Loop
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
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
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

  const toggleRemoteSOS = () => {
    const peer = peerRef.current;
    if (peer) {
      const newState = !remoteSOSActive;
      for (const peerId in peer.connections) {
        (peer.connections as any)[peerId].forEach((conn: any) => {
           conn.send({ type: newState ? 'REMOTE_SOS' : 'STOP_REMOTE_SOS' });
        });
      }
      setRemoteSOSActive(newState);
      if (newState) {
         showToast("🚨 Alarma remota activada en dispositivos hijos");
      } else {
         showToast("✅ Alarma remota apagada");
      }
    }
  };

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

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const handleCenterMap = () => {
    const firstClient = Object.values(clients).find(c => c.isOnline);
    if (firstClient) {
      setMapCenterTarget([firstClient.lat, firstClient.lng]);
    } else if (myLocation) {
      setMapCenterTarget(myLocation);
    }
  };

  return (
    <div className="dashboard-container">
      <MapContainer center={myLocation || [-34.6037, -58.3816]} zoom={13} style={{ height: '100dvh', width: '100vw' }}>
        <MapAutoCenter target={mapCenterTarget} />
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        
        {/* Padre (Real GPS) */}
        {myLocation && (
          <>
            <Marker position={myLocation}>
              <Popup>Tú (Monitor)</Popup>
            </Marker>
            <Circle center={myLocation} radius={localRadius} pathOptions={{ color: '#4f46e5', fillOpacity: 0.1, weight: 2, dashArray: "5, 5" }} />
          </>
        )}

        {/* Hijos */}
        {Object.entries(clients).map(([id, client]) => {
          if (client.lat === 0 && client.lng === 0) return null; // Wait until we have a real location
          return (
            <Marker key={id} position={[client.lat, client.lng]} opacity={client.isOnline ? 1 : 0.5}>
              <Popup>
                <strong>{client.name}</strong> <br/>
                {client.isOnline ? 'GPS en tiempo real' : 'Última ubicación conocida'}
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {/* TOASTS NOTIFICATIONS */}
      <div style={{ position: 'absolute', top: 80, left: 20, right: 20, zIndex: 1100, display: 'flex', flexDirection: 'column', gap: '8px' }}>
         {toasts.map(t => (
           <div key={t.id} style={{ background: 'rgba(0,0,0,0.8)', color: 'white', padding: '12px 16px', borderRadius: '8px', fontSize: '14px', backdropFilter: 'blur(4px)', animation: 'slideDown 0.3s ease-out', display: 'flex', alignItems: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
              {t.msg}
           </div>
         ))}
      </div>

      {alarmActive.active && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(220, 38, 38, 0.9)', zIndex: 9999, display: 'flex',
          flexDirection: 'column', justifyContent: 'center', alignItems: 'center', color: 'white'
        }}>
          <AlertCircle size={80} color="white" style={{ marginBottom: 20, animation: 'dotPulse 1s infinite' }} />
          <h1 style={{ fontSize: '32px', textAlign: 'center', margin: '0 20px' }}>¡EMERGENCIA S.O.S!</h1>
          <p style={{ fontSize: '20px', marginTop: '10px' }}>{alarmActive.originName} pide ayuda</p>
          <button onClick={stopSiren} style={{ marginTop: '40px', padding: '16px 32px', background: 'white', color: '#dc2626', fontSize: '18px', fontWeight: 'bold', border: 'none', borderRadius: '30px', cursor: 'pointer', display: 'flex', gap: '10px', alignItems: 'center' }}>
            <BellOff size={24} /> Entendido, apagar sirena
          </button>
        </div>
      )}

      {!isOnline && (
        <div style={{
          position: 'absolute', top: 76, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(220, 38, 38, 0.9)', color: 'white',
          padding: '8px 20px', borderRadius: '20px', fontSize: '14px',
          zIndex: 1100, backdropFilter: 'blur(4px)', whiteSpace: 'nowrap',
          boxShadow: '0 2px 12px rgba(0,0,0,0.3)'
        }}>
          ⚠️ Sin conexión — el mapa no puede cargar
        </div>
      )}

      <div className="top-bar">
        <button className="icon-btn" onClick={() => setIsMenuOpen(true)}>
          <Menu size={24} />
        </button>
        <div className="top-bar-title">
          {userName} - Monitor
        </div>
        <div style={{ width: 40 }}></div>
      </div>

      <div className="bottom-bar">
        <button className="bottom-action" onClick={handleCenterMap}>
          <Focus size={22} />
          <span>Centrar</span>
        </button>
        <button className={`bottom-action ${remoteSOSActive ? 'danger-active' : 'danger'}`} onClick={toggleRemoteSOS}>
          <AlertCircle size={22} color={remoteSOSActive ? '#fff' : '#dc2626'} />
          <span style={{ color: remoteSOSActive ? '#fff' : 'inherit' }}>{remoteSOSActive ? 'Apagar Remoto' : 'SOS Remoto'}</span>
        </button>
      </div>

      {isMenuOpen && <div className="side-menu-overlay" onClick={() => setIsMenuOpen(false)} />}
      <div className={`side-menu ${isMenuOpen ? 'open' : ''}`}>
        <div className="menu-header">
          <h2 style={{ fontSize: '18px', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldAlert size={20} color="#ec4899" />
            Radar Familiar
          </h2>
          <button className="icon-btn" onClick={() => setIsMenuOpen(false)} style={{ marginRight: '-8px' }}>
            <X size={24} />
          </button>
        </div>

        <div style={{ marginBottom: '32px' }}>
          <p style={{ fontSize: '11px', opacity: 0.5, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>Dispositivos</p>
          {Object.values(clients).length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', opacity: 0.7 }}>
              <Smartphone size={20} />
              <span style={{ fontSize: '14px' }}>Aún no hay hijos conectados</span>
            </div>
          ) : (
            Object.values(clients).map((c, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: c.isOnline ? 'rgba(79, 70, 229, 0.2)' : 'rgba(156, 163, 175, 0.2)', borderRadius: '12px', marginBottom: '8px' }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: c.isOnline ? '#4ade80' : '#9ca3af' }}></div>
                <span style={{ fontSize: '15px', fontWeight: 'bold', color: c.isOnline ? 'inherit' : '#9ca3af' }}>{c.name}</span>
                {!c.isOnline && <span style={{ fontSize: '11px', opacity: 0.5, marginLeft: 'auto' }}>Offline</span>}
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
            <p style={{ fontSize: '11px', opacity: 0.6, marginTop: '10px' }}>Centrado en la ubicación del Monitor.</p>
          </div>
        </div>

        <div style={{ marginTop: 'auto' }}>
          <button className="menu-item" onClick={handleLogout} style={{ color: '#fca5a5' }}>
            <LogOut size={18} />
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
}
