
import React from 'react';
import { HashRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuth } from './contexts/AuthContext';
// --- ADD THIS LINE ---
import Header from './components/layout/Header'; // Import the Header component

// Import all your pages
import HomePage from './pages/HomePage';
import ChecklistDetailPage from './pages/ChecklistDetailPage';
import ChecklistManagementPage from './pages/ChecklistManagementPage';
import ModelManagementPage from './pages/ModelManagementPage';
import ManifestPage from './pages/ManifestPage';
import WeeklyReportsPage from './pages/WeeklyReportsPage';
import LoginPage from './pages/LoginPage';
import UserManagementPage from './pages/UserManagementPage';
import ChangePasswordPage from './pages/ChangePasswordPage';
import FPYStatsPage from './pages/FPYStatsPage';

import './App.css';

const ProtectedRoute = ({ children, allowedRoles }) => {
    const { user } = useAuth();
    if (!user) {
        return <Navigate to="/login" replace />;
    }

    if (allowedRoles?.length && !allowedRoles.includes(user.role)) {
        return <Navigate to="/" replace />;
    }

    return children;
};

function App() {
  const { user } = useAuth();

  return (
    <Router>
        <Toaster position="top-right" />
        {/* Only show the header if logged in */}
        {user && <Header />} 
        <main className="container">
            <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
                <Route path="/shipment/:id" element={<ProtectedRoute><ChecklistDetailPage /></ProtectedRoute>} />
                <Route path="/manage-checklist" element={<ProtectedRoute allowedRoles={['admin']}><ChecklistManagementPage /></ProtectedRoute>} />
                
                <Route path="/manage-models" element={<ProtectedRoute allowedRoles={['admin', 'user']}><ModelManagementPage /></ProtectedRoute>} />
                <Route path="/manifest" element={<ProtectedRoute><ManifestPage /></ProtectedRoute>} />
                <Route path="/weekly-reports" element={<ProtectedRoute><WeeklyReportsPage /></ProtectedRoute>} />
                <Route path="/fpy-stats" element={<FPYStatsPage />} />
                <Route path="/manage-users" element={<ProtectedRoute allowedRoles={['admin']}><UserManagementPage /></ProtectedRoute>} />
                <Route path="/change-password" element={<ProtectedRoute><ChangePasswordPage /></ProtectedRoute>} />
                <Route path="*" element={<Navigate to={user ? "/" : "/login"} replace />} />
            </Routes>
        </main>
    </Router>
  );
}

export default App;
