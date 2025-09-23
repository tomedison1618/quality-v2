import React, { useState, useEffect, useCallback } from 'react';
import { getUsers, createUser, toggleUserActive, adminResetPassword, deleteUser, updateUser } from '../services/apiService';
import toast from 'react-hot-toast';
import './UserManagementPage.css'; // We'll create this CSS file next

const UserManagementPage = () => {
    const [users, setUsers] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    // State for the "Add New User" form
    const [newUsername, setNewUsername] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [newUserRole, setNewUserRole] = useState('user'); // Default to 'user'

    // State for the modals
    const [isResetModalOpen, setIsResetModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState(null);
    const [resetPassword, setResetPassword] = useState('');
    const [editUsername, setEditUsername] = useState('');
    const [editUserRole, setEditUserRole] = useState('user');

    const fetchUsers = useCallback(async () => {
        try {
            setIsLoading(true);
            const response = await getUsers();
            setUsers(response.data);
            setError('');
        } catch (err) {
            setError('Failed to fetch users. You may not have permission.');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    const handleAddUserSubmit = async (e) => {
        e.preventDefault();
        if (!newUsername || !newPassword) {
            toast.error('Username and password are required.');
            return;
        }

        const toastId = toast.loading('Creating user...');
        try {
            await createUser({
                username: newUsername,
                password: newPassword,
                role: newUserRole
            });
            toast.success('User created successfully!', { id: toastId });
            // Reset form and refresh user list
            setNewUsername('');
            setNewPassword('');
            setNewUserRole('user');
            fetchUsers();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to create user.', { id: toastId });
        }
    };

    const handleToggleActive = async (user) => {
        const action = user.is_active ? 'deactivate' : 'activate';
        if (!window.confirm(`Are you sure you want to ${action} the user "${user.username}"?`)) {
            return;
        }

        const toastId = toast.loading('Updating user status...');
        try {
            await toggleUserActive(user.id);
            toast.success('User status updated!', { id: toastId });
            fetchUsers();
        } catch (err) {
            toast.error('Failed to update user status.', { id: toastId });
        }
    };

    const handleDeleteUser = async (user) => {
        if (!window.confirm(`Are you sure you want to permanently delete the user "${user.username}"? This action cannot be undone.`)) {
            return;
        }

        const toastId = toast.loading('Deleting user...');
        try {
            await deleteUser(user.id);
            toast.success('User deleted successfully!', { id: toastId });
            fetchUsers();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to delete user.', { id: toastId });
        }
    };

    const openResetPasswordModal = (user) => {
        setSelectedUser(user);
        setIsResetModalOpen(true);
    };

    const openEditModal = (user) => {
        setSelectedUser(user);
        setEditUsername(user.username);
        setEditUserRole(user.role);
        setIsEditModalOpen(true);
    };

    const handleResetPasswordSubmit = async (e) => {
        e.preventDefault();
        if (!resetPassword) {
            toast.error('Password cannot be empty.');
            return;
        }

        const toastId = toast.loading('Resetting password...');
        try {
            await adminResetPassword(selectedUser.id, resetPassword);
            toast.success('Password has been reset successfully!', { id: toastId });
            setIsResetModalOpen(false);
            setResetPassword('');
            setSelectedUser(null);
        } catch (err) {
            toast.error(err.response?.data?.msg || 'Failed to reset password.', { id: toastId });
        }
    };

    const handleUpdateUserSubmit = async (e) => {
        e.preventDefault();
        if (!editUsername) {
            toast.error('Username cannot be empty.');
            return;
        }

        const toastId = toast.loading('Updating user...');
        try {
            await updateUser(selectedUser.id, { username: editUsername, role: editUserRole });
            toast.success('User updated successfully!', { id: toastId });
            setIsEditModalOpen(false);
            setSelectedUser(null);
            fetchUsers();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to update user.', { id: toastId });
        }
    };

    return (
        <div className="user-management-page card">
            <h2>User Management</h2>

            <form onSubmit={handleAddUserSubmit} className="add-user-form">
                <h3>Add New User</h3>
                <div className="form-row">
                    <input
                        type="text"
                        placeholder="Username"
                        value={newUsername}
                        onChange={(e) => setNewUsername(e.target.value)}
                        required
                    />
                    <input
                        type="password"
                        placeholder="Password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                    />
                    <select value={newUserRole} onChange={(e) => setNewUserRole(e.target.value)}>
                        <option value="user">User</option>
                        <option value="viewer">Viewer</option>
                        <option value="admin">Admin</option>
                    </select>
                    <button type="submit">Add User</button>
                </div>
            </form>

            {isLoading && <p>Loading users...</p>}
            {error && <p className="error-message">{error}</p>}

            <div className="users-table">
                <table>
                    <thead>
                        <tr>
                            <th>Username</th>
                            <th>Role</th>
                            <th>Status</th>
                            <th>Created On</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map((user) => (
                            <tr key={user.id}>
                                <td>{user.username}</td>
                                <td>
                                    <span className={`role-badge ${user.role}`}>
                                        {user.role}
                                    </span>
                                </td>
                                <td>
                                    <span className={`status-badge ${user.is_active ? 'active' : 'inactive'}`}>
                                        {user.is_active ? 'Active' : 'Inactive'}
                                    </span>
                                </td>
                                <td>{new Date(user.created_at).toLocaleDateString()}</td>
                                <td className="actions">
                                    <button onClick={() => openEditModal(user)} className="edit-btn">Edit</button>
                                    <button onClick={() => handleToggleActive(user)} className={user.is_active ? 'deactivate-btn' : 'activate-btn'}>
                                        {user.is_active ? 'Deactivate' : 'Activate'}
                                    </button>
                                    <button onClick={() => openResetPasswordModal(user)} className="reset-password-btn">Reset Password</button>
                                    <button onClick={() => handleDeleteUser(user)} className="delete-btn">Delete</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {isResetModalOpen && (
                <div className="modal-backdrop">
                    <div className="modal">
                        <h3>Reset Password for {selectedUser?.username}</h3>
                        <form onSubmit={handleResetPasswordSubmit}>
                            <input
                                type="password"
                                placeholder="Enter new password"
                                value={resetPassword}
                                onChange={(e) => setResetPassword(e.target.value)}
                                required
                            />
                            <div className="modal-actions">
                                <button type="submit" className="btn-primary">Submit</button>
                                <button type="button" onClick={() => setIsResetModalOpen(false)}>Cancel</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {isEditModalOpen && (
                <div className="modal-backdrop">
                    <div className="modal">
                        <h3>Edit User: {selectedUser?.username}</h3>
                        <form onSubmit={handleUpdateUserSubmit}>
                            <div className="form-row">
                                <input
                                    type="text"
                                    placeholder="Username"
                                    value={editUsername}
                                    onChange={(e) => setEditUsername(e.target.value)}
                                    required
                                />
                                <select value={editUserRole} onChange={(e) => setEditUserRole(e.target.value)}>
                                    <option value="user">User</option>
                                    <option value="viewer">Viewer</option>
                                    <option value="admin">Admin</option>
                                </select>
                            </div>
                            <div className="modal-actions">
                                <button type="submit" className="btn-primary">Save Changes</button>
                                <button type="button" onClick={() => setIsEditModalOpen(false)}>Cancel</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default UserManagementPage;