import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { useNavigate } from 'react-router-dom';
import QRCode from 'react-qr-code';

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
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const { logout, masterServerId, fenceRadius, setFenceRadius, userName } = useStore();
  const navigate = useNavigate();
  // ESTABILIDAD: localRadius para preview en tiempo real.
  // Solo se persiste en el store al soltar el slider (no en cada tick).
  const [localRadius, setLocalRadius] = useState(fenceRadius);

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
      <MapContainer center={[-34.6037, -58.3816]} zoom={13} style={{ height: '100vh', width: '100vw' }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Marker position={[-34.6037, -58.3816]}>
          <Popup>Centro de Monitoreo</Popup>
        </Marker>
        <Circle center={[-34.6037, -58.3816]} radius={localRadius} pathOptions={{ color: 'red' }} />
      </MapContainer>

      {/* Aviso de sin conexión superpuesto sobre el mapa */}
      {!isOnline && (
        <div style={{
          position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(220, 38, 38, 0.9)', color: 'white',
          padding: '8px 20px', borderRadius: '20px', fontSize: '14px',
          zIndex: 1100, backdropFilter: 'blur(4px)', whiteSpace: 'nowrap',
          boxShadow: '0 2px 12px rgba(0,0,0,0.3)'
        }}>
          ⚠️ Sin conexión — el mapa no puede cargar
        </div>
      )}

      <div className="floating-panel glass-panel">
        <h3>Panel de Servidor</h3>
        {/* Nombre del Monitor */}
        {userName && (
          <p style={{ fontSize: '13px', opacity: 0.6, marginBottom: '8px' }}>
            Monitor: <strong>{userName}</strong>
          </p>
        )}
        <button className="glass-btn primary">Añadir Dispositivo</button>

        <div style={{ marginTop: '10px' }}>
          <label>Geocerca: {localRadius}m</label>
          <input
            type="range" min="50" max="5000" step="50"
            value={localRadius}
            onChange={(e) => setLocalRadius(Number(e.target.value))}
            onMouseUp={(e) => setFenceRadius(Number((e.target as HTMLInputElement).value))}
            onTouchEnd={(e) => setFenceRadius(Number((e.target as HTMLInputElement).value))}
          />
        </div>

        <button className="glass-btn secondary" style={{ marginTop: '10px' }}>
          Solicitar Entorno (SOS Remoto)
        </button>

        {/* Re-vinculación: el Padre puede mostrar su QR de nuevo sin reiniciar */}
        {masterServerId && (
          <>
            <button
              className="glass-btn secondary"
              style={{ marginTop: '10px', fontSize: '13px' }}
              onClick={() => setShowQR(v => !v)}
            >
              {showQR ? 'Ocultar QR' : '📱 Vincular Hijo (mostrar QR)'}
            </button>
            {showQR && (
              <div style={{
                background: 'white', padding: '12px', borderRadius: '10px',
                display: 'inline-block', marginTop: '10px'
              }}>
                <QRCode value={masterServerId} size={140} />
              </div>
            )}
          </>
        )}

        <button
          className="glass-btn secondary"
          style={{ marginTop: '10px', borderColor: 'rgba(255,255,255,0.3)', opacity: 0.7 }}
          onClick={handleLogout}
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
