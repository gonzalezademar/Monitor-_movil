import { useStore } from '../store/useStore';

export default function ClientDashboard() {
  const { isSOSActive, setSOSActive } = useStore();

  const triggerSOS = () => {
    setSOSActive(true);
    // Aquí implementaremos la lógica del brillo al 0% con Capacitor
    // y la captura silenciosa de cámara y micrófono.
  };

  if (isSOSActive) {
    return <div className="blackout-screen"></div>;
  }

  return (
    <div className="client-container">
      <div className="status-indicator">
        <span className="dot green"></span> Transmitiendo GPS seguro
      </div>
      
      <div className="sos-container">
        <button className="sos-btn" onClick={triggerSOS}>
          S.O.S
        </button>
        <p className="helper-text">Manten presionado en caso de emergencia</p>
      </div>
    </div>
  );
}
