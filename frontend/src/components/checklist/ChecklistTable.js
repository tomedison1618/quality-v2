import React, { useState, useEffect, useRef } from 'react';
import { saveChecklistResponse } from '../../services/apiService';
import useDebounce from '../../hooks/useDebounce';
import { useAuth } from '../../contexts/AuthContext';

const ChecklistTable = ({ items, shipmentId, qcName, shippingDate, onUpdate, disabled }) => {
    const { user } = useAuth();
    const [editingRowId, setEditingRowId] = useState(null);
    const [editCompletedBy, setEditCompletedBy] = useState('');
    const [editCompletionDate, setEditCompletionDate] = useState('');

    const [commentText, setCommentText] = useState('');
    const [editingCommentRowId, setEditingCommentRowId] = useState(null);
    const debouncedComment = useDebounce(commentText, 750);
    
    const nameInputRef = useRef(null);

    useEffect(() => {
        if (editingRowId !== null) {
            const currentItem = items.find(item => item.item_id === editingRowId);
            if (currentItem) {
                setEditCompletedBy(currentItem.completed_by || user.username);
                setEditCompletionDate(currentItem.completion_date ? currentItem.completion_date.split('T')[0] : shippingDate.split('T')[0]);
                setTimeout(() => {
                    nameInputRef.current?.focus();
                    nameInputRef.current?.select();
                }, 0);
            }
        }
    }, [editingRowId, items, user.username, shippingDate]);

    useEffect(() => {
        if (editingCommentRowId !== null) {
            const itemToUpdate = items.find(i => i.item_id === editingCommentRowId);
            if (itemToUpdate && debouncedComment !== (itemToUpdate.comments || '')) {
                const updatedItem = { ...itemToUpdate, comments: debouncedComment };
                const updatedItems = items.map(i => i.item_id === editingCommentRowId ? updatedItem : i);
                onUpdate({ checklist_items: updatedItems });
                saveResponse(updatedItem);
            }
        }
    }, [debouncedComment, editingCommentRowId, items, onUpdate]);


    const saveResponse = async (item) => {
        if (!shipmentId || !item.item_id || !item.status || !item.completed_by || !item.completion_date) {
            return;
        }
        const payload = {
            shipment_id: shipmentId,
            item_id: item.item_id,
            status: item.status,
            completed_by: item.completed_by,
            completion_date: item.completion_date,
            comments: item.comments || null
        };
        try {
            await saveChecklistResponse(payload);
        } catch (error) {
            alert('Failed to save response. Your changes may not be persisted.');
        }
    };

    const handleStatusClick = (itemId, newStatus) => {
        if (disabled) return;
        
        const updatedItems = items.map(item => {
            if (item.item_id === itemId) {
                const isTogglingOff = item.status === newStatus;
                return { 
                    ...item, 
                    status: isTogglingOff ? null : newStatus,
                    completed_by: isTogglingOff ? null : user.username,
                    completion_date: isTogglingOff ? null : shippingDate
                };
            }
            return item;
        });

        onUpdate({ checklist_items: updatedItems });
        
        const finalItemState = updatedItems.find(i => i.item_id === itemId);
        if (finalItemState.status) {
            saveResponse(finalItemState);
        }
    };
    
    const handleDoubleClick = (item) => {
        if (disabled || !item.status) return;
        setEditingRowId(item.item_id);
    };

    const handleCancelEdit = () => {
        setEditingRowId(null);
    };

    const handleSaveEdit = async (itemId) => {
        if (disabled) return;
        const currentItem = items.find(item => item.item_id === itemId);
        const updatedItem = { ...currentItem, completed_by: editCompletedBy, completion_date: editCompletionDate };
        
        const updatedItems = items.map(i => i.item_id === itemId ? updatedItem : i);
        onUpdate({ checklist_items: updatedItems });
        
        setEditingRowId(null);
        saveResponse(updatedItem);
    };

    const handleKeyDown = (e, itemId) => {
        if (e.key === 'Enter') handleSaveEdit(itemId);
        else if (e.key === 'Escape') handleCancelEdit();
    };

    const handleCommentFocus = (item) => {
        setEditingCommentRowId(item.item_id);
        setCommentText(item.comments || '');
    };
    
    const handleCommentBlur = () => {
        setEditingCommentRowId(null);
    };

    return (
        <table className="checklist-table professional-edit">
            <thead>
                <tr>
                    <th>Checklist Item</th>
                    <th>Status</th>
                    <th>Completed By</th>
                    <th>Date</th>
                    <th>Comments</th>
                </tr>
            </thead>
            <tbody>
                {items.map(item => (
                    <tr key={item.item_id} className={editingRowId === item.item_id ? 'is-editing' : ''}>
                        <td>{item.item_text}</td>
                        <td>
                            <div className="status-buttons">
                                <button
                                    className={`pass-btn ${item.status === 'Passed' ? 'active' : ''}`}
                                    onClick={() => handleStatusClick(item.item_id, 'Passed')}
                                    disabled={disabled}
                                >✓ Pass</button>
                                <button
                                    className={`na-btn ${item.status === 'NA' ? 'active' : ''}`}
                                    onClick={() => handleStatusClick(item.item_id, 'NA')}
                                    disabled={disabled}
                                >N/A</button>
                            </div>
                        </td>
                        
                        <td onDoubleClick={() => handleDoubleClick(item)} className={!disabled && item.status ? 'editable-cell' : ''}>
                            {editingRowId === item.item_id && !disabled ? (
                                <input
                                    ref={nameInputRef}
                                    type="text"
                                    value={editCompletedBy}
                                    onChange={e => setEditCompletedBy(e.target.value)}
                                    onKeyDown={e => handleKeyDown(e, item.item_id)}
                                    className="edit-input"
                                />
                            ) : (
                                item.completed_by || '...'
                            )}
                        </td>
                        <td onDoubleClick={() => handleDoubleClick(item)} className={!disabled && item.status ? 'editable-cell' : ''}>
                            {editingRowId === item.item_id && !disabled ? (
                                <div className="edit-cell-with-actions">
                                    <input
                                        type="date"
                                        value={editCompletionDate}
                                        onChange={e => setEditCompletionDate(e.target.value)}
                                        onKeyDown={e => handleKeyDown(e, item.item_id)}
                                        className="edit-input"
                                    />
                                    <div className="inline-actions">
                                        <button onClick={() => handleSaveEdit(item.item_id)} className="confirm-btn">✓</button>
                                        <button onClick={handleCancelEdit} className="cancel-btn">×</button>
                                    </div>
                                </div>
                            ) : (
                                item.completion_date ? item.completion_date.split('T')[0] : '...'
                            )}
                        </td>

                        <td>
                            {/* --- THIS LOGIC IS UPDATED --- */}
                            {/* Only show the input if the item has a status AND the page is NOT disabled */}
                            {item.status && !disabled ? (
                                <input
                                    type="text"
                                    placeholder="Add a comment..."
                                    className="comment-input"
                                    value={editingCommentRowId === item.item_id ? commentText : (item.comments || '')}
                                    onChange={(e) => setCommentText(e.target.value)}
                                    onFocus={() => handleCommentFocus(item)}
                                    onBlur={handleCommentBlur}
                                />
                            ) : (
                                <span className="comment-display">{item.comments}</span>
                            )}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
};

export default ChecklistTable;
