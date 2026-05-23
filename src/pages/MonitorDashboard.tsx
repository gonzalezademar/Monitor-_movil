import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { useNavigate } from 'react-router-dom';
import { QRCode } from 'react-qr-code';
import { Menu, X, QrCode, LogOut, Focus, AlertCircle, ShieldAlert, Smartphone, BellOff } from 'lucide-react';
import Peer from 'peerjs';

// FIX: Leaflet no resuelve sus íconos PNG en Vite/Capacitor builds.
// Se importan como módulos ES para que Vite los procese y hashee correctamente.
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

export default function MonitorDashboard() {
  const [showQR, setShowQR] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  const { logout, masterServerId, fenceRadius, setFenceRadius, userName } = useStore();
  const navigate = useNavigate();
  const [localRadius, setLocalRadius] = useState(fenceRadius);

  // Estado para los Hijos conectados { peerId: { lat, lng, name } }
  const [clients, setClients] = useState<Record<string, { lat: number; lng: number; name: string }>>({});
  const [alarmActive, setAlarmActive] = useState<{ active: boolean; originName: string }>({ active: false, originName: '' });
  const audioCtxRef = useRef<AudioContext | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);

  // Efecto para inicializar el Servidor P2P
  useEffect(() => {
    if (!masterServerId) return;

    // El monitor "adopta" el código exacto del QR para que los hijos lo encuentren
    const peer = new Peer(masterServerId);

    peer.on('connection', (conn) => {
      conn.on('data', (data: any) => {
        if (data.type === 'LOCATION') {
          setClients((prev) => ({
            ...prev,
            [conn.peer]: { lat: data.lat, lng: data.lng, name: data.name }
          }));
        }
        
        if (data.type === 'SOS_ALERT') {
          setAlarmActive({ active: true, originName: data.name });
          playSiren();
        }
      });
    });

    return () => {
      peer.destroy();
      stopSiren();
    };
  }, [masterServerId]);

  // Sintetizador de Sirena usando Web Audio API (Sin archivos externos)
  const playSiren = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') ctx.resume();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'square';
    // Modulación de frecuencia (Sirena clásica)
    osc.frequency.setValueAtTime(400, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(800, ctx.currentTime + 0.4);
    osc.frequency.linearRampToValueAtTime(400, ctx.currentTime + 0.8);
    // Repetir el ciclo simulando sirena
    setInterval(() => {
      if (oscillatorRef.current) {
        osc.frequency.setValueAtTime(400, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(800, ctx.currentTime + 0.4);
        osc.frequency.linearRampToValueAtTime(400, ctx.currentTime + 0.8);
      }
    }, 800);

    gain.gain.value = 1; // Volumen máximo
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

  // Detección de conectividad para alertar cuando los tiles no pueden cargar
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

  return (
    <div className="dashboard-container">
      <MapContainer center={[-34.6037, -58.3816]} zoom={13} style={{ height: '100dvh', width: '100vw' }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        
        {/* Padre */}
        <Marker position={[-34.6037, -58.3816]}>
          <Popup>Tú (Monitor)</Popup>
        </Marker>
        <Circle center={[-34.6037, -58.3816]} radius={localRadius} pathOptions={{ color: 'blue', fillOpacity: 0.1, weight: 1 }} />

        {/* Hijos */}
        {Object.entries(clients).map(([id, client]) => (
          <Marker key={id} position={[client.lat, client.lng]}>
            <Popup>
              <strong>{client.name}</strong> <br/>
              GPS en tiempo real
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* ALERTA SONORA SOS */}
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

      {/* Aviso de sin conexión superpuesto sobre el mapa */}
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

      {/* Barra Superior */}
      <div className="top-bar">
        <button className="icon-btn" onClick={() => setIsMenuOpen(true)}>
          <Menu size={24} />
        </button>
        <div className="top-bar-title">
          {userName} - Monitor
        </div>
        <div style={{ width: 40 }}></div> {/* Espaciador para centrar el título */}
      </div>

      {/* Barra Inferior (Acciones Rápidas) */}
      <div className="bottom-bar">
        <button className="bottom-action">
          <Focus size={22} />
          <span>Centrar</span>
        </button>
        <button className="bottom-action danger">
          <AlertCircle size={22} />
          <span>SOS Remoto</span>
        </button>
      </div>

      {/* Menú Lateral (Hamburguesa) */}
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
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: 'rgba(79, 70, 229, 0.2)', borderRadius: '12px', marginBottom: '8px' }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#4ade80' }}></div>
                <span style={{ fontSize: '15px', fontWeight: 'bold' }}>{c.name}</span>
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
          <p style={{ fontSize: '11px', opacity: 0.5, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>Geocerca</p>
          <div style={{ padding: '0 10px' }}>
            <label style={{ fontSize: '14px', marginBottom: '12px', display: 'block', opacity: 0.9 }}>Radio de seguridad: <strong>{localRadius}m</strong></label>
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
