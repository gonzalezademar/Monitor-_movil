import { useStore } from '../store/useStore';
import { useNavigate } from 'react-router-dom';
import { useRef, useEffect, useState } from 'react';
import Peer from 'peerjs';
import { Geolocation } from '@capacitor/geolocation';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import { ShieldAlert, Bell, MessageSquare, LogOut, CheckCircle } from 'lucide-react';
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
  const { isSOSActive, setSOSActive, logout, userName, masterServerId, setMyPeerId } = useStore();
  const navigate = useNavigate();

  const sosTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tapCountRef  = useRef(0);

  const peerRef = useRef<Peer | null>(null);
  const connRef = useRef<any>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [myLocation, setMyLocation] = useState<[number, number] | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const [isRemoteAlarmActive, setIsRemoteAlarmActive] = useState(false);

  useEffect(() => {
    return () => {
      if (sosTimerRef.current) clearTimeout(sosTimerRef.current);
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
      if (peerRef.current) peerRef.current.destroy();
      stopRemoteAlarm();
    };
  }, []);

  // Audio Synth for Remote SOS
  const playRemoteAlarm = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    const ctx = audioCtxRef.current;
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

    const peer = new Peer();
    peerRef.current = peer;

    peer.on('open', (id) => {
      setMyPeerId(id);
      const conn = peer.connect(masterServerId);
      connRef.current = conn;
      
      conn.on('open', () => {
        setIsConnected(true);
        // Start Heartbeat
        setInterval(() => {
          if (connRef.current && connRef.current.open) {
            connRef.current.send({ type: 'HEARTBEAT', name: userName });
          }
        }, 5000);
      });

      conn.on('data', (data: any) => {
        if (data.type === 'REMOTE_SOS') {
          playRemoteAlarm();
        }
        if (data.type === 'STOP_REMOTE_SOS') {
          stopRemoteAlarm();
        }
      });
      
      conn.on('close', () => setIsConnected(false));
      conn.on('error', () => setIsConnected(false));
    });

    return () => {
      peer.destroy();
    };
  }, [masterServerId, setMyPeerId, userName]);

  // Geolocation
  useEffect(() => {
    let watchId: string | null = null;
    
    const startTracking = async () => {
      try {
        const perm = await Geolocation.requestPermissions();
        if (perm.location !== 'granted') {
          console.error('Permiso de ubicación denegado');
          return;
        }

        watchId = await Geolocation.watchPosition(
          { enableHighAccuracy: true, timeout: 10000 },
          (position) => {
             if (position) {
                 setMyLocation([position.coords.latitude, position.coords.longitude]);
                 if (connRef.current && connRef.current.open) {
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
      if (watchId) {
        Geolocation.clearWatch({ id: watchId });
      }
    };
  }, [userName]);

  // SOS status
  useEffect(() => {
    if (isSOSActive && connRef.current && connRef.current.open) {
      connRef.current.send({
         type: 'SOS_ALERT',
         name: userName || 'Cliente'
      });
    }
  }, [isSOSActive, userName]);

  const sendAction = (type: string) => {
    if (connRef.current && connRef.current.open) {
      connRef.current.send({ type, name: userName });
    }
  };

  const handleSOSPressStart = () => {
    sosTimerRef.current = setTimeout(() => {
      setSOSActive(true);
    }, 2000);
  };

  const handleSOSPressEnd = () => {
    if (sosTimerRef.current) {
      clearTimeout(sosTimerRef.current);
      sosTimerRef.current = null;
    }
  };

  const handleBlackoutTap = () => {
    tapCountRef.current += 1;
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    if (tapCountRef.current >= 5) {
      tapCountRef.current = 0;
      setSOSActive(false);
    } else {
      tapTimerRef.current = setTimeout(() => {
        tapCountRef.current = 0;
      }, 3000);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  if (isSOSActive) {
    return (
      <div
        className="blackout-screen"
        onClick={handleBlackoutTap}
        style={{ userSelect: 'none', cursor: 'default' }}
      />
    );
  }

  return (
    <div className="client-container" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px', height: '100dvh' }}>
      
      {/* Header Info */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.05)', padding: '12px 20px', borderRadius: '16px' }}>
        <div>
          <p style={{ fontSize: '13px', opacity: 0.6, margin: 0 }}>Hub de Seguridad</p>
          <strong style={{ fontSize: '18px' }}>{userName}</strong>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(0,0,0,0.2)', padding: '6px 12px', borderRadius: '20px' }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: isConnected ? '#4ade80' : '#facc15' }} />
          <span style={{ fontSize: '12px', fontWeight: 'bold', color: isConnected ? '#4ade80' : '#facc15' }}>
            {isConnected ? 'Protegido' : 'Buscando red'}
          </span>
        </div>
      </div>

      {isRemoteAlarmActive && (
        <div style={{ background: '#ef4444', color: 'white', padding: '16px', borderRadius: '16px', textAlign: 'center', animation: 'pulse 1.5s infinite' }}>
          <Bell size={32} style={{ margin: '0 auto 8px' }} />
          <h3 style={{ margin: 0 }}>ALARMA ACTIVADA POR EL MONITOR</h3>
          <button onClick={stopRemoteAlarm} style={{ marginTop: '12px', background: 'white', color: '#ef4444', border: 'none', padding: '8px 16px', borderRadius: '8px', fontWeight: 'bold' }}>APAGAR</button>
        </div>
      )}

      {/* Mini Map */}
      <div style={{ flex: 1, minHeight: '200px', borderRadius: '20px', overflow: 'hidden', border: '2px solid rgba(255,255,255,0.1)', position: 'relative' }}>
        <MapContainer center={myLocation || [-34.6037, -58.3816]} zoom={15} style={{ height: '100%', width: '100%' }} zoomControl={false} dragging={false}>
          <MapAutoCenter target={myLocation} />
          <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
          {myLocation && (
            <Marker position={myLocation} />
          )}
        </MapContainer>
        <div style={{ position: 'absolute', bottom: 10, left: 10, right: 10, zIndex: 1000, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(10px)', padding: '8px 12px', borderRadius: '12px', textAlign: 'center', fontSize: '12px', color: '#ccc' }}>
          {myLocation ? 'Compartiendo ubicación en tiempo real' : 'Obteniendo GPS...'}
        </div>
      </div>

      {/* Action Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <button 
          className="glass-btn" 
          style={{ background: 'linear-gradient(135deg, #16a34a, #15803d)', border: 'none', padding: '16px', flexDirection: 'column', gap: '8px' }}
          onClick={() => sendAction('CHECK_IN')}
        >
          <CheckCircle size={28} />
          <span style={{ fontSize: '14px', fontWeight: 'bold' }}>Llegué Bien</span>
        </button>

        <button 
          className="glass-btn" 
          style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', border: 'none', padding: '16px', flexDirection: 'column', gap: '8px' }}
          onClick={() => sendAction('PICK_ME_UP')}
        >
          <MessageSquare size={28} />
          <span style={{ fontSize: '14px', fontWeight: 'bold' }}>Ven a buscarme</span>
        </button>
      </div>

      {/* S.O.S Button */}
      <button
        className="sos-btn"
        style={{ width: '100%', borderRadius: '24px', margin: 0, height: '80px', fontSize: '24px' }}
        onMouseDown={handleSOSPressStart}
        onMouseUp={handleSOSPressEnd}
        onMouseLeave={handleSOSPressEnd}
        onTouchStart={handleSOSPressStart}
        onTouchEnd={handleSOSPressEnd}
        onTouchMove={handleSOSPressEnd}
        onTouchCancel={handleSOSPressEnd}
      >
        <ShieldAlert size={28} style={{ marginRight: '12px', display: 'inline-block', verticalAlign: 'middle' }} />
        S.O.S TÁCTICO
      </button>
      <p style={{ fontSize: '11px', opacity: 0.5, textAlign: 'center', margin: '-10px 0 0 0' }}>Mantén presionado 2s en emergencia</p>

      {/* Logout */}
      <button className="glass-btn secondary" onClick={handleLogout} style={{ opacity: 0.6, marginTop: 'auto' }}>
        <LogOut size={18} /> Salir
      </button>

    </div>
  );
}
