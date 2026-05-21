import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Onboarding from './pages/Onboarding';
import MonitorDashboard from './pages/MonitorDashboard';
import ClientDashboard from './pages/ClientDashboard';
import { useStore } from './store/useStore';

function App() {
  const role = useStore((state) => state.role);

  return (
    <Router>
      <Routes>
        <Route path="/" element={!role ? <Onboarding /> : <Navigate to={role === 'monitor' ? '/monitor' : '/client'} />} />
        <Route path="/monitor" element={role === 'monitor' ? <MonitorDashboard /> : <Navigate to="/" />} />
        <Route path="/client" element={role === 'client' ? <ClientDashboard /> : <Navigate to="/" />} />
      </Routes>
    </Router>
  );
}

export default App;
