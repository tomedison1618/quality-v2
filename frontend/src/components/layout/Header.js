import React from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import './Header.css';

const Header = () => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    if (!user) {
        return null;
    }

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const canUserEdit = user.role === 'admin' || user.role === 'user';
    const isUserAdmin = user.role === 'admin';

    return (
        <header className="app-header no-print">
            <Link to="/" className="logo-title-link">
                <div className="logo-title">
                    <img src="/logo.png" alt="Company Logo" className="logo" />
                    <h1>Quality Management System</h1>
                </div>
            </Link>
            
            <div className="header-right-section">
                <nav>
                
                
                    <NavLink to="/manifest" className={({ isActive }) => isActive ? 'active-link' : ''}>Manifest</NavLink>
                    <NavLink to="/weekly-reports" className={({ isActive }) => isActive ? 'active-link' : ''}>Weekly Reports</NavLink>
                    <NavLink to="/fpy-stats" className={({ isActive }) => isActive ? 'active-link' : ''}>FPY Stats</NavLink>
                
                    {canUserEdit && (
                        <NavLink to="/manage-models" className={({ isActive }) => isActive ? 'active-link' : ''}>Manage Models</NavLink>
                    )}
                    
                    {isUserAdmin && (
                        <NavLink to="/manage-users" className={({ isActive }) => isActive ? 'active-link' : ''}>Manage Users</NavLink>
                    )}
                </nav>

                <div className="user-info">
                    <span>Welcome, {user.username}</span>
                    <NavLink to="/change-password">Change Password</NavLink>
                    <button onClick={handleLogout} className="logout-button">Logout</button>
                </div>
            </div>
        </header>
    );
};

export default Header;
