import { jwtDecode } from 'jwt-decode';

export const getUser = () => {
    try {
        const token = localStorage.getItem('accessToken');
        if (token) {
            const decodedToken = jwtDecode(token);
            // Check if token is expired
            if (decodedToken.exp * 1000 < Date.now()) {
                console.error("Token is expired.");
                localStorage.removeItem('accessToken'); // Clean up expired token
                return null;
            }
            return decodedToken.sub; // The 'sub' claim holds our user object {id, username, role}
        }
        return null;
    } catch (error) {
        // If token is invalid (e.g., malformed), it will throw an error
        console.error("Invalid token:", error);
        localStorage.removeItem('accessToken'); // Clean up invalid token
        return null;
    }
};

export const logout = () => {
    localStorage.removeItem('accessToken');
};

export const isAdmin = () => {
    const user = getUser();
    return user && user.role === 'admin';
};