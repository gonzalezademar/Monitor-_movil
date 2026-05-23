import { useStore } from '../store/useStore';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { QRCode } from 'react-qr-code';
import { Scanner } from '@yudiel/react-qr-scanner';
import { ShieldAlert, User, QrCode, Scan, ArrowLeft, Camera, RefreshCcw, Radar } from 'lucide-react';
import { Geolocation } from '@capacitor/geolocation';

export default function Onboarding() {
  const { setRole, setUserName, setMasterServerId, role } = useStore();
  const navigate = useNavigate();
  const [nameInput, setNameInput] = useState('');
  const [nameError, setNameError] = useState('');
  const [cameraError, setCameraError] = useState('');
  const [step, setStep] = useState(1);
  const [tempRole, setTempRole] = useState<'monitor' | 'client' | null>(null);
  const [scanError, setScanError] = useState(false);
  const [avatarInput, setAvatarInput] = useState<string | null>(null);

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

  const handleSelectRole = async (selectedRole: 'monitor' | 'client') => {
    if (!nameInput.trim()) {
      setNameError('Por favor ingresa tu nombre antes de continuar.');
      return;
    }
    setNameError('');
    
    // Solicitar permisos críticos anticipadamente
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => stream.getTracks().forEach(t => t.stop())).catch(() => console.log('Mic no autorizado aún'));
      await Geolocation.requestPermissions();
    } catch (e) {
      console.log('Error pidiendo permisos anticipados', e);
    }

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
    if (avatarInput) useStore.getState().setAvatar(avatarInput);
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
        if (avatarInput) useStore.getState().setAvatar(avatarInput);
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

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_SIZE = 128;
          let width = img.width;
          let height = img.height;
          if (width > height) {
            if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; }
          } else {
            if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          setAvatarInput(canvas.toDataURL('image/jpeg', 0.6));
        };
        img.src = ev.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="onboarding-container">
      <div className="glass-panel">
        
        {/* Header - Siempre visible pero más compacto en pasos avanzados */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', marginBottom: step === 1 ? '10px' : '0' }}>
          <div style={{ background: 'rgba(255,255,255,0.1)', padding: '12px', borderRadius: '50%' }}>
            <Radar size={32} color="#ec4899" />
          </div>
          <div>
            <h1 style={{ fontSize: step === 1 ? '24px' : '18px', fontWeight: 'bold', margin: 0, transition: 'all 0.3s' }}>
              Radar Familiar
            </h1>
            {step === 1 && <p style={{ fontSize: '13px', opacity: 0.7, margin: '4px 0 0' }}>Seguridad privada P2P</p>}
          </div>
        </div>

        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <div style={{ position: 'relative', marginBottom: '12px' }}>
                <User size={18} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
                <input
                  type="text"
                  placeholder="Tu Nombre (Ej. Papá o Hijo)"
                  value={nameInput}
                  maxLength={50}
                  onChange={(e) => { setNameInput(e.target.value); setNameError(''); }}
                  className="glass-input"
                  style={{ paddingLeft: '44px', margin: 0 }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)' }}>
                {avatarInput ? (
                  <img src={avatarInput} alt="Avatar" style={{ width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover', border: '2px solid #ec4899' }} />
                ) : (
                  <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Camera size={20} opacity={0.5} />
                  </div>
                )}
                <div style={{ flex: 1 }}>
                  <label htmlFor="avatar-upload" style={{ background: 'transparent', color: '#ec4899', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer', display: 'block' }}>
                    {avatarInput ? 'Cambiar Foto' : 'Añadir Foto (Opcional)'}
                  </label>
                  <input id="avatar-upload" type="file" accept="image/*" capture="user" onChange={handleAvatarChange} style={{ display: 'none' }} />
                  <p style={{ fontSize: '10px', opacity: 0.6, margin: '2px 0 0' }}>Para reconocerte en el mapa</p>
                </div>
              </div>

              {nameError && (
                <p style={{ color: '#fca5a5', fontSize: '12px', marginTop: '6px', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <ShieldAlert size={14} /> {nameError}
                </p>
              )}
            </div>

            <div className="role-buttons">
              <button className="glass-btn primary" onClick={() => handleSelectRole('monitor')}>
                <QrCode size={18} /> Soy Monitor (Padre)
              </button>
              <button className="glass-btn secondary" onClick={() => handleSelectRole('client')}>
                <Scan size={18} /> Soy Rastreable (Hijo)
              </button>
            </div>
          </div>
        )}

        {step === 2 && tempRole === 'monitor' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center' }}>
            <div>
              <h3 style={{ fontSize: '18px', margin: 0 }}>Tu Código</h3>
              <p style={{ fontSize: '13px', opacity: 0.7, margin: '4px 0 0' }}>Escanea esto con el teléfono de tu hijo</p>
            </div>
            
            <div style={{ background: 'white', padding: '16px', borderRadius: '16px', display: 'inline-block', boxShadow: '0 4px 20px rgba(0,0,0,0.2)' }}>
              <QRCode value={serverCode} size={180} />
            </div>
            
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button className="glass-btn primary" onClick={finalizeMonitor}>
                Ir a mi Mapa
              </button>
              <button className="glass-btn secondary" style={{ opacity: 0.75, border: 'none', background: 'rgba(255,255,255,0.05)' }} onClick={handleBack}>
                <ArrowLeft size={16} /> Volver
              </button>
            </div>
          </div>
        )}

        {step === 2 && tempRole === 'client' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center', width: '100%' }}>
            <div>
              <h3 style={{ fontSize: '18px', margin: 0 }}>Escanear</h3>
              <p style={{ fontSize: '13px', opacity: 0.7, margin: '4px 0 0' }}>Apunta al código QR del Padre</p>
            </div>

            {cameraError ? (
              <div className="error-card">
                <Camera size={32} color="#fca5a5" />
                <p style={{ color: '#fca5a5', fontSize: '13px', margin: 0 }}>
                  No pudimos acceder a la cámara. Por favor, revisa los permisos.
                </p>
                <button 
                  className="glass-btn secondary" 
                  style={{ marginTop: '4px', fontSize: '14px', border: '1px solid rgba(252, 165, 165, 0.4)', color: '#fca5a5' }} 
                  onClick={handleRetryCamera}
                >
                  <RefreshCcw size={14} /> Reintentar
                </button>
              </div>
            ) : (
              <div style={{ width: '100%', maxWidth: '250px', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.2)' }}>
                <Scanner onScan={handleScan} onError={handleScanError} />
              </div>
            )}

            {scanError && (
              <div style={{ background: 'rgba(252,165,165,0.1)', padding: '10px 16px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldAlert size={16} color="#fca5a5" />
                <span style={{ color: '#fca5a5', fontSize: '13px' }}>QR inválido — usa el del Padre</span>
              </div>
            )}

            <button className="glass-btn secondary" style={{ opacity: 0.75, border: 'none', background: 'rgba(255,255,255,0.05)' }} onClick={handleBack}>
              <ArrowLeft size={16} /> Volver
            </button>
          </div>
        )}
      </div>
      
      <div style={{ marginTop: '24px', textAlign: 'center' }}>
        <p style={{ fontSize: '12px', fontWeight: 'bold', color: 'rgba(255,255,255,0.9)', letterSpacing: '0.5px', margin: 0, textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
          🚀 Desarrollado por <span style={{ color: '#ec4899' }}>Adelio Gonzalez</span>
        </p>
        <p style={{ fontSize: '10px', opacity: 0.6, margin: '4px 0 0' }}>Seguridad Táctica P2P 🛡️</p>
      </div>
    </div>
  );
}
