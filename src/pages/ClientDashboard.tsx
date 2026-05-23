import { useStore } from '../store/useStore';
import { useNavigate } from 'react-router-dom';
import { useRef, useEffect, useState } from 'react';
import Peer from 'peerjs';
import { Geolocation } from '@capacitor/geolocation';

export default function ClientDashboard() {
  const { isSOSActive, setSOSActive, logout, userName, masterServerId, setMyPeerId } = useStore();
  const navigate = useNavigate();

  const sosTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tapCountRef  = useRef(0);

  const peerRef = useRef<Peer | null>(null);
  const connRef = useRef<any>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    return () => {
      if (sosTimerRef.current) clearTimeout(sosTimerRef.current);
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
      if (peerRef.current) peerRef.current.destroy();
    };
  }, []);

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
        console.log('Conectado al monitor');
        setIsConnected(true);
      });
      
      conn.on('close', () => {
        setIsConnected(false);
      });
      
      conn.on('error', () => {
        setIsConnected(false);
      });
    });

    return () => {
      peer.destroy();
    };
  }, [masterServerId, setMyPeerId]);

  // Geolocation
  useEffect(() => {
    let watchId: string | null = null;
    
    const startTracking = async () => {
      try {
        // Solicitar permisos de GPS (nativos)
        const perm = await Geolocation.requestPermissions();
        if (perm.location !== 'granted') {
          console.error('Permiso de ubicación denegado');
          return;
        }

        watchId = await Geolocation.watchPosition(
          { enableHighAccuracy: true, timeout: 10000 },
          (position) => {
             if (position && connRef.current && connRef.current.open) {
                 connRef.current.send({
                     type: 'LOCATION',
                     lat: position.coords.latitude,
                     lng: position.coords.longitude,
                     name: userName || 'Cliente'
                 });
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
    <div className="client-container">
      {userName && (
        <p style={{ fontSize: '14px', opacity: 0.6, marginBottom: '6px' }}>
          Hola, <strong>{userName}</strong>
        </p>
      )}

      <div className="status-indicator">
        <span className="dot" style={{ background: isConnected ? '#4ade80' : '#facc15' }}></span>
        {isConnected ? 'Conectado al monitor' : 'En espera de vinculación'}
      </div>

      <div className="sos-container">
        <button
          className="sos-btn"
          onMouseDown={handleSOSPressStart}
          onMouseUp={handleSOSPressEnd}
          onMouseLeave={handleSOSPressEnd}
          onTouchStart={handleSOSPressStart}
          onTouchEnd={handleSOSPressEnd}
          onTouchMove={handleSOSPressEnd}
          onTouchCancel={handleSOSPressEnd}
        >
          S.O.S
        </button>
        <p className="helper-text">Mantén presionado 2 seg. en emergencia</p>
      </div>

      <button
        className="glass-btn secondary"
        style={{ marginTop: '32px', maxWidth: '220px' }}
        onClick={handleLogout}
      >
        Cerrar sesión
      </button>
    </div>
  );
}
