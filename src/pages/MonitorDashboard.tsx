import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useState } from 'react';

export default function MonitorDashboard() {
  const [fenceRadius, setFenceRadius] = useState(100);

  return (
    <div className="dashboard-container">
      <MapContainer center={[-34.6037, -58.3816]} zoom={13} style={{ height: '100vh', width: '100vw' }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Marker position={[-34.6037, -58.3816]}>
          <Popup>Centro de Monitoreo</Popup>
        </Marker>
        <Circle center={[-34.6037, -58.3816]} radius={fenceRadius} pathOptions={{ color: 'red' }} />
      </MapContainer>

      <div className="floating-panel glass-panel">
        <h3>Panel de Servidor</h3>
        <button className="glass-btn primary">Añadir Dispositivo</button>
        <div style={{ marginTop: '10px' }}>
          <label>Geocerca: {fenceRadius}m</label>
          <input type="range" min="50" max="5000" step="50" value={fenceRadius} onChange={(e) => setFenceRadius(Number(e.target.value))} />
        </div>
        <button className="glass-btn secondary" style={{ marginTop: '10px' }}>Solicitar Entorno (SOS Remoto)</button>
      </div>
    </div>
  );
}
