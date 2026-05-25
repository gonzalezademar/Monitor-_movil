import { useStore } from '../store/useStore';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import developerLogo from '../assets/developer_logo.png';
import { QRCode } from 'react-qr-code';
import { Scanner } from '@yudiel/react-qr-scanner';
import { ShieldAlert, User, QrCode, ArrowLeft, Camera, RefreshCcw, Radar, Mail, Lock, Eye, EyeOff, Clock, MapPin } from 'lucide-react';
import { Geolocation } from '@capacitor/geolocation';

const translateError = (err: string): string => {
  if (!err) return '';
  const e = err.toLowerCase();
  let translated = err;
  
  if (e.includes('already exists') || e.includes('already registered')) {
    translated = 'Este correo electrónico ya está registrado.';
  } else if (e.includes('at least 6 characters') || e.includes('should be at least 6')) {
    translated = 'La contraseña debe tener al menos 6 caracteres.';
  } else if (e.includes('invalid format') || e.includes('unable to validate email') || e.includes('invalid email')) {
    translated = 'El correo electrónico ingresado no tiene un formato válido.';
  } else if (e.includes('invalid login credentials')) {
    translated = 'El correo o la contraseña son incorrectos.';
  } else if (e.includes('email not confirmed')) {
    translated = 'Debes confirmar tu correo electrónico. Por favor, revisa tu bandeja de entrada.';
  } else if (e.includes('rate limit')) {
    translated = 'Límite de solicitudes alcanzado. Por favor, espera un momento.';
  } else if (e.includes('network error') || e.includes('fetch')) {
    translated = 'Error de conexión. Verifica tu conexión a internet o si un bloqueador (como Brave Shields) está interfiriendo.';
  }

  if (translated === err) {
    return err;
  }
  return `${translated} (${err})`;
};

export default function Onboarding() {
  const { role, familyCode, signIn, signUp, joinFamily, loadSession, resetPassword } = useStore();
  const navigate = useNavigate();

  // Mode state: 'welcome' | 'login' | 'signup' | 'forgot' | 'scan' | 'show_qr'
  const [mode, setMode] = useState<'welcome' | 'login' | 'signup' | 'forgot' | 'scan' | 'show_qr'>('welcome');
  
  // Input fields
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [avatarInput, setAvatarInput] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<'monitor' | 'client'>('monitor');

  // Error and UI state
  const [formError, setFormError] = useState('');
  const [cameraError, setCameraError] = useState('');
  const [scanError, setScanError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  // Refs for timers
  const scanErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cameraErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load existing session on mount
  useEffect(() => {
    loadSession();
  }, [loadSession]);

  // Redirect if logged in and profile matches a role
  useEffect(() => {
    if (role === 'monitor') {
      navigate('/monitor');
    } else if (role === 'client') {
      if (familyCode) {
        navigate('/client');
      } else {
        setMode('scan');
      }
    }
  }, [role, familyCode, navigate]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (scanErrorTimerRef.current) clearTimeout(scanErrorTimerRef.current);
      if (cameraErrorTimerRef.current) clearTimeout(cameraErrorTimerRef.current);
    };
  }, []);

  // Request permissions early on interaction
  const requestAppPermissions = async () => {
    try {
      await navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => stream.getTracks().forEach((t) => t.stop()))
        .catch(() => console.log('Mic no autorizado aún'));
      await Geolocation.requestPermissions();
    } catch (e) {
      console.log('Error pidiendo permisos anticipados', e);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput || !passwordInput) {
      setFormError('Por favor complete correo y contraseña.');
      return;
    }
    setFormError('');
    setIsLoading(true);
    await requestAppPermissions();

    const { error } = await signIn(emailInput, passwordInput);
    setIsLoading(false);
    if (error) {
      setFormError(translateError(error));
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput || !passwordInput || !nameInput) {
      setFormError('Por favor ingrese Nombre, Correo y Contraseña.');
      return;
    }
    setFormError('');
    setIsLoading(true);
    await requestAppPermissions();

    const { error } = await signUp(emailInput, passwordInput, nameInput, selectedRole, avatarInput);
    setIsLoading(false);
    
    if (error) {
      setFormError(translateError(error));
    } else {
      if (selectedRole === 'monitor') {
        setMode('show_qr');
      } else {
        setMode('scan');
      }
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput) {
      setFormError('Por favor ingrese su correo electrónico.');
      return;
    }
    setFormError('');
    setIsLoading(true);

    const { error } = await resetPassword(emailInput);
    setIsLoading(false);

    if (error) {
      setFormError(translateError(error));
    } else {
      setSuccessMessage('Se ha enviado un enlace para restablecer tu contraseña a tu correo.');
      setTimeout(() => {
        setSuccessMessage('');
        setMode('login');
      }, 5000);
    }
  };

  const handleScan = async (result: any) => {
    if (result && result.length > 0) {
      const text = result[0].rawValue;
      if (text) {
        setScanError(false);
        if (scanErrorTimerRef.current) clearTimeout(scanErrorTimerRef.current);
        
        setIsLoading(true);
        const { error } = await joinFamily(text);
        setIsLoading(false);

        if (!error) {
          navigate('/client');
        } else {
          setScanError(true);
          if (scanErrorTimerRef.current) clearTimeout(scanErrorTimerRef.current);
          scanErrorTimerRef.current = setTimeout(() => setScanError(false), 3000);
        }
      }
    }
  };

  const handleScanError = (error: unknown) => {
    console.error('Scanner error:', error);
    if (cameraErrorTimerRef.current) clearTimeout(cameraErrorTimerRef.current);
    setCameraError('No se pudo acceder a la cámara. Revisa los permisos e intenta de nuevo.');
    cameraErrorTimerRef.current = setTimeout(() => setCameraError(''), 5000);
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
      <div className="glass-panel" style={{ width: '100%', maxWidth: '400px' }}>
        
        {/* Header */}
        {mode !== 'welcome' && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '10px' }}>
            <Radar size={20} color="#ec4899" />
            <h1 style={{ fontSize: '18px', fontWeight: 'bold', margin: 0 }}>
              Radar Familiar
            </h1>
          </div>
        )}

        {/* Errors / Success alerts */}
        {formError && mode !== 'welcome' && (
          <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid #ef4444', padding: '10px 14px', borderRadius: '12px', color: '#fca5a5', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', textAlign: 'left' }}>
            <ShieldAlert size={16} style={{ flexShrink: 0 }} />
            <span>{formError}</span>
          </div>
        )}

        {successMessage && mode !== 'welcome' && (
          <div style={{ background: 'rgba(74,222,128,0.15)', border: '1px solid #4ade80', padding: '10px 14px', borderRadius: '12px', color: '#86efac', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', textAlign: 'left' }}>
            <ShieldAlert size={16} style={{ flexShrink: 0 }} />
            <span>{successMessage}</span>
          </div>
        )}

        {/* WELCOME LANDING MODE */}
        {mode === 'welcome' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center', width: '100%' }}>
            <div className="welcome-radar-container">
              <div className="radar-ping"></div>
              <div className="radar-ping radar-ping-delay"></div>
              <div className="radar-core">
                <Radar size={18} color="#fff" />
              </div>
            </div>

            <div style={{ textAlign: 'center' }}>
              <h2 style={{ fontSize: '21px', fontWeight: 'bold', margin: 0, color: 'white', letterSpacing: '-0.3px' }}>
                Radar Familiar
              </h2>
              <p style={{ fontSize: '12px', opacity: 0.7, margin: '4px 0 0', lineHeight: '1.4' }}>
                Protección invisible y paz mental para cuidar a tus hijos, abuelos y seres queridos en tiempo real.
              </p>
            </div>

            <div className="features-grid">
              <div className="feature-card">
                <div className="feature-icon-wrapper">
                  <MapPin size={16} />
                </div>
                <div className="feature-card-content">
                  <h3>Rastreo Activo</h3>
                  <p>Tu familia siempre en el mapa.</p>
                </div>
              </div>

              <div className="feature-card">
                <div className="feature-icon-wrapper">
                  <Clock size={16} />
                </div>
                <div className="feature-card-content">
                  <h3>Zonas Seguras</h3>
                  <p>Avisos automáticos de llegada.</p>
                </div>
              </div>

              <div className="feature-card">
                <div className="feature-icon-wrapper">
                  <ShieldAlert size={16} style={{ color: '#ef4444' }} />
                </div>
                <div className="feature-card-content">
                  <h3>Botón SOS</h3>
                  <p>Ubicación, audio y video en vivo.</p>
                </div>
              </div>
            </div>

            <div style={{ width: '100%', display: 'flex', gap: '8px', marginTop: '4px' }}>
              <button 
                type="button"
                onClick={() => setMode('login')} 
                className="glass-btn primary"
                style={{ background: 'linear-gradient(90deg, #ec4899 0%, #8b5cf6 100%)', border: 'none', margin: 0, flex: 1, padding: '12px 10px', fontSize: '14px' }}
              >
                Ingresar
              </button>
              <button 
                type="button"
                onClick={() => setMode('signup')} 
                className="glass-btn secondary"
                style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.15)', margin: 0, flex: 1, padding: '12px 10px', fontSize: '14px' }}
              >
                Crear Cuenta
              </button>
            </div>
          </div>
        )}

        {/* LOGIN MODE */}
        {mode === 'login' && (
          <form onSubmit={handleSignIn} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ position: 'relative' }}>
              <Mail size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
              <input
                type="email"
                placeholder="Correo Electrónico"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                className="glass-input"
                style={{ padding: '12px 14px 12px 38px', fontSize: '14px', margin: 0 }}
                required
              />
            </div>

            <div style={{ position: 'relative' }}>
              <Lock size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Contraseña"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                className="glass-input"
                style={{ padding: '12px 38px 12px 38px', fontSize: '14px', margin: 0 }}
                required
              />
              <button 
                type="button" 
                onClick={() => setShowPassword(!showPassword)} 
                style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'white', opacity: 0.6, cursor: 'pointer', padding: 0 }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            <button type="submit" disabled={isLoading} className="glass-btn primary" style={{ padding: '12px', fontSize: '14px', marginTop: '4px' }}>
              {isLoading ? 'Iniciando Sesión...' : 'Iniciar Sesión'}
            </button>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginTop: '4px' }}>
              <button type="button" onClick={() => { setMode('forgot'); setFormError(''); }} style={{ background: 'none', border: 'none', color: '#ec4899', cursor: 'pointer', padding: 0 }}>
                ¿Olvidaste tu contraseña?
              </button>
              <button type="button" onClick={() => { setMode('signup'); setFormError(''); }} style={{ background: 'none', border: 'none', color: 'white', opacity: 0.8, cursor: 'pointer', padding: 0, fontWeight: 'bold' }}>
                Crear una Cuenta
              </button>
            </div>
          </form>
        )}

        {/* REGISTER MODE */}
        {mode === 'signup' && (
          <form onSubmit={handleSignUp} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ position: 'relative' }}>
              <User size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
              <input
                type="text"
                placeholder="Nombre Completo (ej. Papá, Sofía)"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                className="glass-input"
                style={{ padding: '12px 14px 12px 38px', fontSize: '14px', margin: 0 }}
                required
              />
            </div>

            <div style={{ position: 'relative' }}>
              <Mail size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
              <input
                type="email"
                placeholder="Correo Electrónico"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                className="glass-input"
                style={{ padding: '12px 14px 12px 38px', fontSize: '14px', margin: 0 }}
                required
              />
            </div>

            <div style={{ position: 'relative' }}>
              <Lock size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Contraseña"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                className="glass-input"
                style={{ padding: '12px 38px 12px 38px', fontSize: '14px', margin: 0 }}
                required
              />
              <button 
                type="button" 
                onClick={() => setShowPassword(!showPassword)} 
                style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'white', opacity: 0.6, cursor: 'pointer', padding: 0 }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {/* Avatar Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(255,255,255,0.03)', padding: '8px 12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
              {avatarInput ? (
                <img src={avatarInput} alt="Avatar" style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover', border: '2px solid #ec4899' }} />
              ) : (
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Camera size={16} opacity={0.5} />
                </div>
              )}
              <div style={{ flex: 1, textAlign: 'left' }}>
                <label htmlFor="avatar-upload" style={{ background: 'transparent', color: '#ec4899', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', display: 'block' }}>
                  {avatarInput ? 'Cambiar Foto' : 'Añadir Foto (Opcional)'}
                </label>
                <input id="avatar-upload" type="file" accept="image/*" capture="user" onChange={handleAvatarChange} style={{ display: 'none' }} />
              </div>
            </div>

            {/* Role selection tabs */}
            <div>
              <p style={{ fontSize: '12px', opacity: 0.7, margin: '0 0 4px 0', textAlign: 'left' }}>Selecciona tu Rol:</p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button 
                  type="button" 
                  onClick={() => setSelectedRole('monitor')}
                  className={`glass-btn ${selectedRole === 'monitor' ? 'primary' : 'secondary'}`} 
                  style={{ 
                    flex: 1, 
                    padding: '8px', 
                    fontSize: '13px',
                    border: selectedRole === 'monitor' ? '2px solid #a78bfa' : '1px solid rgba(255,255,255,0.1)',
                    boxShadow: selectedRole === 'monitor' ? '0 0 12px rgba(167, 139, 250, 0.4)' : 'none'
                  }}
                >
                  <QrCode size={14} /> {selectedRole === 'monitor' ? '✓ Tutor / Padre' : 'Tutor / Padre'}
                </button>
                <button 
                  type="button" 
                  onClick={() => setSelectedRole('client')}
                  className={`glass-btn ${selectedRole === 'client' ? 'primary' : 'secondary'}`} 
                  style={{ 
                    flex: 1, 
                    padding: '8px', 
                    fontSize: '13px',
                    border: selectedRole === 'client' ? '2px solid #a78bfa' : '1px solid rgba(255,255,255,0.1)',
                    boxShadow: selectedRole === 'client' ? '0 0 12px rgba(167, 139, 250, 0.4)' : 'none'
                  }}
                >
                  <User size={14} /> {selectedRole === 'client' ? '✓ Rastreable' : 'Rastreable'}
                </button>
              </div>
            </div>

            <button type="submit" disabled={isLoading} className="glass-btn primary" style={{ padding: '12px', fontSize: '14px', marginTop: '4px' }}>
              {isLoading ? 'Registrando...' : 'Registrar y Continuar'}
            </button>

            <button type="button" onClick={() => { setMode('login'); setFormError(''); }} style={{ background: 'none', border: 'none', color: 'white', opacity: 0.8, cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', marginTop: '4px' }}>
              ¿Ya tienes cuenta? Inicia Sesión
            </button>
          </form>
        )}

        {/* FORGOT PASSWORD MODE */}
        {mode === 'forgot' && (
          <form onSubmit={handleResetPassword} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <p style={{ fontSize: '12px', opacity: 0.8, textAlign: 'left', margin: 0, lineHeight: '1.4' }}>
              Ingresa tu correo electrónico y te enviaremos las instrucciones para restablecer tu contraseña.
            </p>

            <div style={{ position: 'relative' }}>
              <Mail size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
              <input
                type="email"
                placeholder="Correo Electrónico"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                className="glass-input"
                style={{ padding: '12px 14px 12px 38px', fontSize: '14px', margin: 0 }}
                required
              />
            </div>

            <button type="submit" disabled={isLoading} className="glass-btn primary" style={{ padding: '12px', fontSize: '14px', marginTop: '4px' }}>
              {isLoading ? 'Enviando...' : 'Restablecer Contraseña'}
            </button>

            <button type="button" onClick={() => { setMode('login'); setFormError(''); }} style={{ background: 'none', border: 'none', color: 'white', opacity: 0.8, cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginTop: '4px' }}>
              <ArrowLeft size={14} /> Volver al Inicio de Sesión
            </button>
          </form>
        )}

        {/* SHOW QR MODE (Monitor registration finished, shows QR for vinculation) */}
        {mode === 'show_qr' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center' }}>
            <div>
              <h3 style={{ fontSize: '18px', margin: 0 }}>¡Registro Completo!</h3>
              <p style={{ fontSize: '13px', opacity: 0.7, margin: '4px 0 0' }}>
                Haz que el dispositivo del hijo escanee este código para vincularse de inmediato:
              </p>
            </div>
            
            <div style={{ background: 'white', padding: '16px', borderRadius: '16px', display: 'inline-block', boxShadow: '0 4px 20px rgba(0,0,0,0.2)' }}>
              {familyCode ? (
                <QRCode value={familyCode} size={180} />
              ) : (
                <div style={{ width: '180px', height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}>Cargando QR...</div>
              )}
            </div>

            <div style={{ width: '100%' }}>
              <button className="glass-btn primary" onClick={() => navigate('/monitor')}>
                Ir a mi Mapa Monitor
              </button>
            </div>
          </div>
        )}

        {/* SCAN QR MODE (Client needs to link family) */}
        {mode === 'scan' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center', width: '100%' }}>
            <div>
              <h3 style={{ fontSize: '18px', margin: 0 }}>Vincular con Tutor</h3>
              <p style={{ fontSize: '13px', opacity: 0.7, margin: '4px 0 0' }}>
                Apunta tu cámara al código QR en la pantalla del Tutor/Padre:
              </p>
            </div>

            {cameraError ? (
              <div className="error-card" style={{ width: '100%' }}>
                <Camera size={32} color="#fca5a5" />
                <p style={{ color: '#fca5a5', fontSize: '13px', margin: '8px 0' }}>
                  No se pudo abrir la cámara. Por favor asegúrate de otorgar los permisos.
                </p>
                <button 
                  type="button"
                  className="glass-btn secondary" 
                  style={{ fontSize: '14px', border: '1px solid rgba(252, 165, 165, 0.4)', color: '#fca5a5' }} 
                  onClick={() => setCameraError('')}
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
                <span style={{ color: '#fca5a5', fontSize: '13px' }}>QR inválido: Asegúrese de escanear el del Tutor.</span>
              </div>
            )}

            <button type="button" onClick={() => { setMode('login'); }} className="glass-btn secondary" style={{ opacity: 0.8 }}>
              Cerrar Sesión / Volver
            </button>
          </div>
        )}

      </div>
      
      <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
        <img src={developerLogo} alt="AG Creation" className="dev-brand-logo" style={{ width: '130px', opacity: 0.8 }} />
        <p style={{ fontSize: '10px', opacity: 0.5, margin: 0 }}>🛡️ Seguridad en la Nube con Supabase</p>
      </div>
    </div>
  );
}
