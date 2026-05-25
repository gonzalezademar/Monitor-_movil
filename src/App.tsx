import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Onboarding from './pages/Onboarding';
import MonitorDashboard from './pages/MonitorDashboard';
import ClientDashboard from './pages/ClientDashboard';
import { useStore } from './store/useStore';
import { useEffect, useState } from 'react';

function App() {
  const role = useStore((state: any) => state.role);

  // FIX: Protección de hidratación del store.
  // Zustand persist con localStorage es síncrono, pero esta barrera
  // previene cualquier microgap donde role podría ser null incorrectamente.
  const [hydrated, setHydrated] = useState(() => useStore.persist.hasHydrated());

  useEffect(() => {
    if (hydrated) return;
    const unsub = useStore.persist.onFinishHydration(() => setHydrated(true));
    return unsub;
  }, [hydrated]);

  if (!hydrated) {
    // Mismo fondo que el body para transición imperceptible
    return <div style={{ background: 'linear-gradient(135deg, #1e1b4b, #312e81)', height: '100vh' }} />;
  }

  return (
    <Router>
      <Routes>
        <Route path="/" element={!role ? <Onboarding /> : <Navigate to={role === 'monitor' ? '/monitor' : '/client'} />} />
        <Route path="/monitor" element={role === 'monitor' ? <MonitorDashboard /> : <Navigate to="/" />} />
        <Route path="/client" element={role === 'client' ? <ClientDashboard /> : <Navigate to="/" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
