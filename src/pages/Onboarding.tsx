import { useStore } from '../store/useStore';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import QRCode from 'react-qr-code';
import { Scanner } from '@yudiel/react-qr-scanner';

export default function Onboarding() {
  const { setRole, setUserName, setMasterServerId, role } = useStore();
  const navigate = useNavigate();
  const [nameInput, setNameInput] = useState('');
  const [nameError, setNameError] = useState('');
  const [cameraError, setCameraError] = useState('');
  const [step, setStep] = useState(1);
  const [tempRole, setTempRole] = useState<'monitor' | 'client' | null>(null);
  const [scanError, setScanError] = useState(false);

  // ESTABILIDAD: refs para cleanup de timers — evita fugas y estado huérfano al desmontar
  const scanErrorTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cameraErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [serverCode] = useState(() => 'RADAR-' + Math.random().toString(36).substring(2, 9).toUpperCase());

  // Limpieza de todos los timers al desmontar
  useEffect(() => {
    return () => {
      if (scanErrorTimerRef.current)   clearTimeout(scanErrorTimerRef.current);
      if (cameraErrorTimerRef.current) clearTimeout(cameraErrorTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (role === 'monitor') navigate('/monitor');
    if (role === 'client') navigate('/client');
  }, [role, navigate]);

  const handleSelectRole = (selectedRole: 'monitor' | 'client') => {
    if (!nameInput.trim()) {
      setNameError('Por favor ingresa tu nombre antes de continuar.');
      return;
    }
    setNameError('');
    setTempRole(selectedRole);
    setStep(2);
  };

  // Cancela timers pendientes al volver — evita que mensajes de error aparezcan en step 1
  const handleBack = () => {
    setStep(1);
    setTempRole(null);
    setScanError(false);
    setCameraError('');
    if (scanErrorTimerRef.current)   clearTimeout(scanErrorTimerRef.current);
    if (cameraErrorTimerRef.current) clearTimeout(cameraErrorTimerRef.current);
  };

  const finalizeMonitor = () => {
    setUserName(nameInput);
    setMasterServerId(serverCode);
    setRole('monitor');
  };

  const handleScan = (result: any) => {
    if (result && result.length > 0) {
      const text = result[0].rawValue;
      if (text && text.startsWith('RADAR-')) {
        setScanError(false);
        if (scanErrorTimerRef.current) clearTimeout(scanErrorTimerRef.current);
        setMasterServerId(text);
        setUserName(nameInput);
        setRole('client');
      } else {
        setScanError(true);
        // ESTABILIDAD: timer con ref — se cancela correctamente en desmontaje y en re-scan
        if (scanErrorTimerRef.current) clearTimeout(scanErrorTimerRef.current);
        scanErrorTimerRef.current = setTimeout(() => setScanError(false), 3000);
      }
    }
  };

  const handleScanError = (error: unknown) => {
    console.error('Scanner error:', error);
    // ESTABILIDAD: auto-limpia el error de cámara en 4 segundos.
    // Evita que un error transitorio de la librería bloquee permanentemente el scanner.
    if (cameraErrorTimerRef.current) clearTimeout(cameraErrorTimerRef.current);
    setCameraError('No se pudo acceder a la cámara. Cierra otras apps que puedan usarla y reintenta.');
    cameraErrorTimerRef.current = setTimeout(() => setCameraError(''), 4000);
  };

  const handleRetryCamera = () => {
    if (cameraErrorTimerRef.current) clearTimeout(cameraErrorTimerRef.current);
    setCameraError('');
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
              maxLength={50}
              onChange={(e) => { setNameInput(e.target.value); setNameError(''); }}
              className="glass-input"
            />
            {nameError && (
              <p style={{ color: '#f87171', fontSize: '13px', marginTop: '-10px', marginBottom: '10px', textAlign: 'center' }}>
                ⚠️ {nameError}
              </p>
            )}
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
            <button className="glass-btn secondary" style={{ marginTop: '8px', opacity: 0.75 }} onClick={handleBack}>
              ← Volver
            </button>
          </div>
        )}

        {step === 2 && tempRole === 'client' && (
          <div>
            <h3>Escanear Código</h3>
            <p>Apunta la cámara al código QR del Servidor.</p>

            {cameraError ? (
              <div style={{ marginTop: '20px', background: 'rgba(220,38,38,0.15)', border: '1px solid rgba(220,38,38,0.4)', borderRadius: '10px', padding: '16px' }}>
                <p style={{ color: '#f87171', fontSize: '14px' }}>📷 {cameraError}</p>
                <button className="glass-btn secondary" style={{ marginTop: '12px', fontSize: '13px' }} onClick={handleRetryCamera}>
                  🔄 Reintentar cámara
                </button>
              </div>
            ) : (
              <div style={{ marginTop: '20px', borderRadius: '10px', overflow: 'hidden' }}>
                <Scanner onScan={handleScan} onError={handleScanError} />
              </div>
            )}

            {scanError && (
              <p style={{ color: '#f87171', fontSize: '14px', marginTop: '12px' }}>
                ⚠️ QR inválido — usa el código del Servidor Radar
              </p>
            )}

            <button className="glass-btn secondary" style={{ marginTop: '16px', opacity: 0.75 }} onClick={handleBack}>
              ← Volver
            </button>
          </div>
        )}
      </div>
      <p style={{ fontSize: '11px', opacity: 0.35, marginTop: '16px', textAlign: 'center', letterSpacing: '0.3px' }}>
        Desarrollado por Adelio González
      </p>
    </div>
  );
}
