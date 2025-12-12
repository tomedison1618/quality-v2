import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import {
    getChecklistMasterItems,
    createChecklistMasterItem,
    updateChecklistMasterItem,
    deleteChecklistMasterItem,
} from '../services/apiService';
import './ChecklistManagementPage.css';

const ChecklistManagementPage = () => {
    const { user } = useAuth();
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [newItemText, setNewItemText] = useState('');
    const [newItemOrder, setNewItemOrder] = useState('');
    const [editingItemId, setEditingItemId] = useState(null);
    const [editItemText, setEditItemText] = useState('');
    const [editItemOrder, setEditItemOrder] = useState('');
    const [editItemActive, setEditItemActive] = useState(true);

    const fetchItems = useCallback(async () => {
        try {
            setLoading(true);
            const response = await getChecklistMasterItems();
            setItems(Array.isArray(response.data) ? response.data : []);
            setError('');
        } catch (err) {
            console.error('Failed to load checklist master items:', err);
            setError('Failed to load checklist items. Please try again later.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (user?.role === 'admin') {
            fetchItems();
        } else if (user) {
            setLoading(false);
        }
    }, [fetchItems, user]);

    if (!user || user.role !== 'admin') {
        return (
            <div className="checklist-management-page">
                <h2>Manage Shipment Checklist</h2>
                <p className="error-message">Administrator access is required to view this page.</p>
            </div>
        );
    }

    const resetEditState = () => {
        setEditingItemId(null);
        setEditItemText('');
        setEditItemOrder('');
        setEditItemActive(true);
    };

    const handleAddItem = async (e) => {
        e.preventDefault();
        if (!newItemText.trim()) {
            toast.error('Checklist item text is required.');
            return;
        }

        const parsedOrder = newItemOrder ? parseInt(newItemOrder, 10) : null;

        try {
            await createChecklistMasterItem({
                item_text: newItemText.trim(),
                item_order: Number.isNaN(parsedOrder) ? null : parsedOrder,
                is_active: true,
            });
            toast.success('Checklist item added.');
            setNewItemText('');
            setNewItemOrder('');
            fetchItems();
        } catch (err) {
            console.error('Failed to add checklist item:', err);
            toast.error(err.response?.data?.error || 'Failed to add checklist item.');
        }
    };

    const handleEditClick = (item) => {
        setEditingItemId(item.item_id);
        setEditItemText(item.item_text);
        setEditItemOrder(item.item_order);
        setEditItemActive(item.is_active);
    };

    const handleUpdateItem = async (e) => {
        e.preventDefault();
        if (!editItemText.trim()) {
            toast.error('Checklist item text is required.');
            return;
        }

        const parsedOrder = parseInt(editItemOrder, 10);
        if (Number.isNaN(parsedOrder)) {
            toast.error('Item order must be a number.');
            return;
        }

        try {
            await updateChecklistMasterItem(editingItemId, {
                item_text: editItemText.trim(),
                item_order: parsedOrder,
                is_active: editItemActive,
            });
            toast.success('Checklist item updated.');
            resetEditState();
            fetchItems();
        } catch (err) {
            console.error('Failed to update checklist item:', err);
            toast.error(err.response?.data?.error || 'Failed to update checklist item.');
        }
    };

    const handleDeleteItem = async (item) => {
        if (!window.confirm(`Are you sure you want to delete "${item.item_text}"?`)) {
            return;
        }
        try {
            await deleteChecklistMasterItem(item.item_id);
            toast.success('Checklist item deleted.');
            if (editingItemId === item.item_id) {
                resetEditState();
            }
            fetchItems();
        } catch (err) {
            console.error('Failed to delete checklist item:', err);
            toast.error(err.response?.data?.error || 'Failed to delete checklist item.');
        }
    };

    return (
        <div className="checklist-management-page">
            <h2>Manage Shipment Checklist</h2>

            <form className="add-item-form" onSubmit={handleAddItem}>
                <h3>Add Checklist Item</h3>
                <div className="form-grid">
                    <textarea
                        placeholder="Describe the checklist requirement..."
                        value={newItemText}
                        onChange={(e) => setNewItemText(e.target.value)}
                        rows="2"
                        required
                    />
                    <input
                        type="number"
                        placeholder="Display order (optional)"
                        value={newItemOrder}
                        onChange={(e) => setNewItemOrder(e.target.value)}
                    />
                    <button type="submit" className="primary-btn">Add Item</button>
                </div>
            </form>

            {loading && <p>Loading checklist...</p>}
            {error && <p className="error-message">{error}</p>}

            {!loading && !items.length && <p>No checklist items found.</p>}

            {items.length > 0 && (
                <div className="items-table">
                    <table>
                        <thead>
                            <tr>
                                <th>Description</th>
                                <th>Order</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((item) => (
                                <tr key={item.item_id}>
                                    {editingItemId === item.item_id ? (
                                        <td colSpan="4">
                                            <form className="edit-item-form" onSubmit={handleUpdateItem}>
                                                <textarea
                                                    value={editItemText}
                                                    onChange={(e) => setEditItemText(e.target.value)}
                                                    rows="2"
                                                    required
                                                />
                                                <input
                                                    type="number"
                                                    value={editItemOrder}
                                                    onChange={(e) => setEditItemOrder(e.target.value)}
                                                    required
                                                />
                                                <label className="toggle">
                                                    <input
                                                        type="checkbox"
                                                        checked={editItemActive}
                                                        onChange={(e) => setEditItemActive(e.target.checked)}
                                                    />
                                                    <span>{editItemActive ? 'Active' : 'Inactive'}</span>
                                                </label>
                                                <div className="edit-actions">
                                                    <button type="submit" className="primary-btn">Save</button>
                                                    <button type="button" className="secondary-btn" onClick={resetEditState}>Cancel</button>
                                                </div>
                                            </form>
                                        </td>
                                    ) : (
                                        <>
                                            <td>{item.item_text}</td>
                                            <td>{item.item_order}</td>
                                            <td>
                                                <span className={`status-badge ${item.is_active ? 'active' : 'inactive'}`}>
                                                    {item.is_active ? 'Active' : 'Inactive'}
                                                </span>
                                            </td>
                                            <td className="actions">
                                                <button className="secondary-btn" onClick={() => handleEditClick(item)}>Edit</button>
                                                <button className="danger-btn" onClick={() => handleDeleteItem(item)}>Delete</button>
                                            </td>
                                        </>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default ChecklistManagementPage;
