import axios from 'axios';
import { jwtDecode } from 'jwt-decode';

const API_URL = process.env.REACT_APP_API_URL || 'http://127.0.0.1:5000/api';

const api = axios.create({
  baseURL: API_URL,
});

// A dedicated function to set the Authorization header for all requests
export const setupAuthHeaders = (token) => {
    if (token) {
        // Apply the token to the header for all subsequent requests
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
        // Remove the header if logging out or if there's no token
        delete api.defaults.headers.common['Authorization'];
    }
};

// This interceptor will run on every RESPONSE from the API.
// It's a safety net for handling token expiration.
api.interceptors.response.use(
    (response) => response,
    (error) => {
        // If we get a 401 Unauthorized, the token is likely expired or invalid.
        // We log the user out to force a new login.
        if (error.response && (error.response.status === 401 || error.response.status === 422)) {
            console.error("Auth error. Token may be invalid or expired. Logging out.");
            localStorage.removeItem('accessToken');
            // We don't use the context's logout here to avoid circular dependencies
            window.location.href = '/login';
        }
        return Promise.reject(error);
    }
);


// --- All API calls below this line remain the same ---

// Auth API calls
export const login = (credentials) => api.post('/auth/login', credentials);

// User Management API calls
export const getUsers = () => api.get('/users');
export const createUser = (userData) => api.post('/users', userData);
export const updateUser = (userId, userData) => api.put(`/users/${userId}`, userData);
export const toggleUserActive = (userId) => api.put(`/users/${userId}/toggle-active`);
export const adminResetPassword = (userId, password) => api.put(`/users/${userId}/password`, { password });
export const deleteUser = (userId) => api.delete(`/users/${userId}`);

// Account management
export const changePassword = (password) => api.put('/users/account/password', { password });

// Shipment / Dashboard API calls
export const getShipments = (params) => api.get('/shipments', { params });
export const createShipment = (shipmentData) => api.post('/shipments', shipmentData);
export const getShipmentDetails = (id) => api.get(`/shipments/${id}`);
export const updateShipmentStatus = (id, status) => api.put(`/shipments/${id}/status`, { status });
export const getDashboardStats = (params) => api.get('/shipments/stats', { params });
export const getTimeSeriesStats = (params) => api.get('/shipments/stats/over-time', { params });
export const getManifestData = (params) => api.get('shipments/manifest', { params });

// Model Management API calls
export const getModels = () => api.get('/models');
export const addModel = (modelData) => api.post('/models', modelData);
export const updateModel = (id, modelData) => api.put(`/models/${id}`, modelData);

// Shipped Units API calls
export const addUnit = (unitData) => api.post('/units', unitData);
export const updateUnit = (id, unitData) => api.put(`/units/${id}`, unitData);
export const deleteUnit = (id) => api.delete(`/units/${id}`);
export const checkSerialUnique = (serialNumber) => api.get('/units/check-serial', { params: { serial_number: serialNumber } });
export const checkOriginalSerialUnique = (originalSerialNumber) => api.get('/units/check-original-serial', { params: { original_serial_number: originalSerialNumber } });

// Checklist API calls
export const saveChecklistResponse = (responseData) => api.post('/checklist/responses', responseData);

export default api;

// --- ADD THIS NEW LINE ---
export const getWeeklyShipments = (date) => {
    const params = date ? { date } : {};
    return api.get('/shipments/weekly', { params });
};