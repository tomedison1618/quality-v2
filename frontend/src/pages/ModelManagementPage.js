import React, { useState, useEffect, useCallback } from 'react';
import { getModels, addModel, updateModel, checkPartNumber } from '../services/apiService';
import useDebounce from '../hooks/useDebounce';
import { useAuth } from '../contexts/AuthContext';
import './ModelManagementPage.css';

const ModelManagementPage = () => {
    const { user } = useAuth();
    const canManageModels = user && (user.role === 'admin' || user.role === 'user');

    // ... (All state variables and functions remain the same as the last version) ...
    const [models, setModels] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [newModelType, setNewModelType] = useState('');
    const [newPartNumber, setNewPartNumber] = useState('');
    const [newDescription, setNewDescription] = useState('');
    const [editingModelId, setEditingModelId] = useState(null);
    const [editModelType, setEditModelType] = useState('');
    const [editPartNumber, setEditPartNumber] = useState('');
    const [editDescription, setEditDescription] = useState('');
    const [partNumberError, setPartNumberError] = useState('');

    const debouncedPartNumber = useDebounce(newPartNumber, 500);

    const fetchModels = useCallback(async () => {
        try {
            setIsLoading(true);
            const response = await getModels();
            setModels(response.data.all_models);
            setError('');
        } catch (err) {
            setError('Failed to fetch models. Please try again later.');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchModels();
    }, [fetchModels]);

    useEffect(() => {
        const check = async () => {
            if (debouncedPartNumber) {
                try {
                    const res = await checkPartNumber(debouncedPartNumber);
                    if (res.data.exists) {
                        setPartNumberError('This part number already exists.');
                    } else {
                        setPartNumberError('');
                    }
                } catch (err) {
                    console.error('Failed to check part number', err);
                    setPartNumberError(''); // Clear error if check fails
                }
            }
        };
        check();
    }, [debouncedPartNumber]);

    const handleAddSubmit = async (e) => {
        e.preventDefault();
        if (!newModelType || !newPartNumber) {
            alert('Please fill in both Model Type and Part Number.');
            return;
        }
        if (partNumberError) {
            alert(partNumberError);
            return;
        }
        try {
            await addModel({
                model_type: newModelType,
                part_number: newPartNumber,
                description: newDescription
            });
            setNewModelType('');
            setNewPartNumber('');
            setNewDescription('');
            fetchModels();
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to add model.');
        }
    };

    const handleToggleActive = async (model) => {
        try {
            const updatedModel = { ...model, is_active: !model.is_active };
            await updateModel(model.model_id, updatedModel);
            fetchModels();
        } catch (err)
        {
            alert('Failed to update model status.');
        }
    };

    const handleEditClick = (model) => {
        setEditingModelId(model.model_id);
        setEditModelType(model.model_type);
        setEditPartNumber(model.part_number);
        setEditDescription(model.description || '');
    };

    const handleCancelEdit = () => {
        setEditingModelId(null);
    };

    const handleUpdateSubmit = async (e) => {
        e.preventDefault();
        try {
            const originalModel = models.find(m => m.model_id === editingModelId);
            await updateModel(editingModelId, {
                model_type: editModelType,
                part_number: editPartNumber,
                description: editDescription,
                is_active: originalModel.is_active
            });
            setEditingModelId(null);
            fetchModels();
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to update model.');
        }
    };

    if (!canManageModels) {
        return (
            <div className="model-management-page">
                <h2>Manage Product Models</h2>
                <p className="error-message">You do not have permission to access this module.</p>
            </div>
        );
    }

    return (
        <div className="model-management-page">
            <h2>Manage Product Models</h2>

            {/* The "Add New Model" form is already correct, no changes needed here */}
            <form onSubmit={handleAddSubmit} className="add-model-form">
                <h3>Add New Model</h3>
                <div className="form-grid">
                    <input type="text" placeholder="Model Type (e.g., X-Mic, LNB)" value={newModelType} onChange={(e) => setNewModelType(e.target.value)} required />
                    <div className="part-number-input-container">
                        <input type="text" placeholder="Part Number (e.g., LNB-123)" value={newPartNumber} onChange={(e) => setNewPartNumber(e.target.value)} required />
                        {partNumberError && <p className="error-message">{partNumberError}</p>}
                    </div>
                    <textarea placeholder="Description (optional)" value={newDescription} onChange={(e) => setNewDescription(e.target.value)} rows="3" className="description-input"></textarea>
                    <button type="submit" className="add-button" disabled={!!partNumberError}>Add Model</button>
                </div>
            </form>

            {isLoading && <p>Loading models...</p>}
            {error && <p className="error-message">{error}</p>}

            <div className="models-table">
                <table>
                    <thead>
                        <tr>
                            <th>Model Type</th>
                            {/* CHANGE 1: Swapped header order */}
                            <th>Part Number</th>
                            <th>Description</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {models.map((model) => (
                            <tr key={model.model_id}>
                                {editingModelId === model.model_id ? (
                                    // --- EDITING VIEW ---
                                    <td colSpan="5">
                                        <form onSubmit={handleUpdateSubmit} className="edit-form">
                                            {/* CHANGE 2: Reordered input fields to match new header order */}
                                            <input type="text" value={editModelType} onChange={e => setEditModelType(e.target.value)} />
                                            <input type="text" value={editPartNumber} onChange={e => setEditPartNumber(e.target.value)} />
                                            <textarea value={editDescription} onChange={e => setEditDescription(e.target.value)} rows="2"></textarea>
                                            
                                            <div className="edit-actions">
                                                <button type="submit" className="save-btn">Save</button>
                                                <button type="button" onClick={handleCancelEdit} className="cancel-btn">Cancel</button>
                                            </div>
                                        </form>
                                    </td>
                                ) : (
                                    // --- NORMAL VIEW ---
                                    <>
                                        <td>{model.model_type}</td>
                                        {/* CHANGE 3: Swapped columns to match new header order */}
                                        <td>{model.part_number}</td>
                                        <td>{model.description}</td>
                                        <td>
                                            <span className={`status-badge ${model.is_active ? 'active' : 'inactive'}`}>
                                                {model.is_active ? 'Active' : 'Inactive'}
                                            </span>
                                        </td>
                                        <td className="actions">
                                            <button onClick={() => handleEditClick(model)} className="edit-btn">Edit</button>
                                            <button onClick={() => handleToggleActive(model)} className={model.is_active ? 'deactivate-btn' : 'activate-btn'}>
                                                {model.is_active ? 'Deactivate' : 'Activate'}
                                            </button>
                                        </td>
                                    </>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default ModelManagementPage;
