import { useStore } from '../store/useStore';
import { useNavigate } from 'react-router-dom';
import { useRef, useEffect } from 'react';

export default function ClientDashboard() {
  const { isSOSActive, setSOSActive, logout, userName } = useStore();
  const navigate = useNavigate();

  const sosTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // FIX: useRef en vez de useState para tapCount → evita stale closure en toques rápidos
  const tapCountRef  = useRef(0);

  useEffect(() => {
    return () => {
      if (sosTimerRef.current) clearTimeout(sosTimerRef.current);
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    };
  }, []);

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

  // Salida secreta: 5 toques en ≤3 segundos. El ref garantiza conteo correcto aunque los toques sean rápidos.
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
      {/* Saludo personalizado con el nombre configurado */}
      {userName && (
        <p style={{ fontSize: '14px', opacity: 0.6, marginBottom: '6px' }}>
          Hola, <strong>{userName}</strong>
        </p>
      )}

      <div className="status-indicator">
        <span className="dot"></span>
        En espera de vinculación
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
