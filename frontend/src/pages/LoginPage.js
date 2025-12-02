import React, { useState } from 'react'; // <-- THIS LINE IS NOW CORRECT
import { useNavigate } from 'react-router-dom';
import { login as performLogin } from '../services/apiService';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';
import './LoginPage.css';

const LoginPage = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();
        try {
            const response = await performLogin({ username, password });
            login(response.data.access_token);
            toast.success('Logged in successfully!');
            navigate('/');
        } catch (error) {
            toast.error('Invalid username or password.');
        }
    };

    return (
        <div className="login-page">
            <div className="login-container">
                <div className="login-header-background">
                    <img src="/logo.png" alt="Company Logo" className="login-logo" />
                    <h1>Quality Management System</h1>
                </div>

                <form onSubmit={handleLogin} className="login-form">
                    <div className="form-group">
                        <label htmlFor="username">Username</label>
                        <input id="username" type="text" value={username} onChange={e => setUsername(e.target.value)} required />
                    </div>
                    <div className="form-group">
                        <label htmlFor="password">Password</label>
                        <input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
                    </div>
                    <button type="submit" className="primary-button">Login</button>
                </form>

                <div className="login-public-link">
                    <a href="#/fpy-stats">View FPY Stats without logging in</a>
                </div>
            </div>
        </div>
    );
};

export default LoginPage;
