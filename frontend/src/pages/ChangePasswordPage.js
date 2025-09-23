import React, { useState } from 'react';
import { changePassword } from '../services/apiService';
import toast from 'react-hot-toast';
import './ChangePasswordPage.css';

const ChangePasswordPage = () => {
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (newPassword !== confirmPassword) {
            toast.error('Passwords do not match.');
            return;
        }
        if (!newPassword) {
            toast.error('Password cannot be empty.');
            return;
        }

        const toastId = toast.loading('Changing password...');
        try {
            await changePassword(newPassword);
            toast.success('Password changed successfully!', { id: toastId });
            setNewPassword('');
            setConfirmPassword('');
        } catch (err) {
            toast.error(err.response?.data?.msg || 'Failed to change password.', { id: toastId });
        }
    };

    return (
        <div className="change-password-page card">
            <h2>Change Your Password</h2>
            <form onSubmit={handleSubmit}>
                <div className="form-group">
                    <label htmlFor="new-password">New Password</label>
                    <input
                        id="new-password"
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                    />
                </div>
                <div className="form-group">
                    <label htmlFor="confirm-password">Confirm New Password</label>
                    <input
                        id="confirm-password"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                    />
                </div>
                <button type="submit" className="btn-primary">Update Password</button>
            </form>
        </div>
    );
};

export default ChangePasswordPage;
