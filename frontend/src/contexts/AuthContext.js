import React, { createContext, useState, useContext, useEffect } from 'react';
import { getUser as getUserFromToken, logout as performLogout } from '../services/authService';
import { setupAuthHeaders } from '../services/apiService';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const token = localStorage.getItem('accessToken');
        if (token) {
            // Setup Axios headers with the token on initial app load
            setupAuthHeaders(token);
            const currentUser = getUserFromToken();
            if (currentUser) {
                setUser(currentUser);
            } else {
                // Token was invalid or expired, so clear it
                localStorage.removeItem('accessToken');
            }
        }
        setIsLoading(false);
    }, []);

    const login = (token) => {
        localStorage.setItem('accessToken', token);
        // Setup Axios headers immediately after login
        setupAuthHeaders(token);
        const loggedInUser = getUserFromToken();
        setUser(loggedInUser);
    };

    const logout = () => {
        // Clear Axios headers on logout
        setupAuthHeaders(null); 
        performLogout();
        setUser(null);
    };

    const value = { user, login, logout, isLoading };

    // Display a loading message while the token is being verified
    if (isLoading) {
        return <div>Loading Application...</div>;
    }

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    return useContext(AuthContext);
};