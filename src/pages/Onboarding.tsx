import { useStore } from '../store/useStore';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import QRCode from 'react-qr-code';
import { Scanner } from '@yudiel/react-qr-scanner';

export default function Onboarding() {
  const { setRole, setUserName, setMasterServerId, role } = useStore();
  const navigate = useNavigate();
  const [nameInput, setNameInput] = useState('');
  const [step, setStep] = useState(1);
  const [tempRole, setTempRole] = useState<'monitor' | 'client' | null>(null);

  const [serverCode] = useState(() => 'RADAR-' + Math.random().toString(36).substring(2, 9).toUpperCase());

  useEffect(() => {
    if (role === 'monitor') navigate('/monitor');
    if (role === 'client') navigate('/client');
  }, [role, navigate]);

  const handleSelectRole = (selectedRole: 'monitor' | 'client') => {
    if (!nameInput.trim()) return alert('Por favor, ingresa tu nombre');
    setTempRole(selectedRole);
    setStep(2);
  };

  const finalizeMonitor = () => {
    setUserName(nameInput);
    setMasterServerId(serverCode);
    setRole('monitor');
    navigate('/monitor');
  };

  const handleScan = (result: any) => {
    if (result && result.length > 0) {
      const text = result[0].rawValue;
      if (text && text.startsWith('RADAR-')) {
        setMasterServerId(text);
        setUserName(nameInput);
        setRole('client');
        navigate('/client');
      }
    }
  };

  return (
    <div className="onboarding-container">
      <div className="glass-panel">
        <h1>Radar Familiar</h1>
        <p>Seguridad privada P2P</p>

        {step === 1 && (
          <>
            <input 
              type="text" 
              placeholder="Tu Nombre (Ej. Papá o Hijo)" 
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              className="glass-input"
            />
            <div className="role-buttons">
              <button className="glass-btn primary" onClick={() => handleSelectRole('monitor')}>
                Soy Monitor (Padre)
              </button>
              <button className="glass-btn secondary" onClick={() => handleSelectRole('client')}>
                Soy Rastreable (Hijo)
              </button>
            </div>
          </>
        )}

        {step === 2 && tempRole === 'monitor' && (
          <div>
            <h3>Tu Código de Servidor</h3>
            <p>Escanea este QR con el teléfono de tu hijo:</p>
            <div style={{ background: 'white', padding: '16px', borderRadius: '10px', display: 'inline-block', margin: '20px 0' }}>
              <QRCode value={serverCode} size={200} />
            </div>
            <button className="glass-btn primary" onClick={finalizeMonitor}>Ir a mi Mapa</button>
          </div>
        )}

        {step === 2 && tempRole === 'client' && (
          <div>
            <h3>Escanear Código</h3>
            <p>Apunta la cámara al código QR del Servidor.</p>
            <div style={{ marginTop: '20px', borderRadius: '10px', overflow: 'hidden' }}>
              <Scanner onScan={handleScan} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
