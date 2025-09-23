import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getShipmentDetails, updateShipmentStatus } from '../services/apiService';
import { useAuth } from '../contexts/AuthContext';
import ChecklistTable from '../components/checklist/ChecklistTable';
import ShippedUnitsSection from '../components/units/ShippedUnitsSection';
import './ChecklistDetailPage.css';
import toast from 'react-hot-toast';

const ChecklistDetailPage = () => {
    const { id } = useParams();
    const { user } = useAuth(); // Get the logged-in user from our context
    const [shipment, setShipment] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Determine if the current user has editing rights ('admin' or 'user')
    const canUserEdit = user?.role === 'admin' || user?.role === 'user';

    const fetchShipmentDetails = useCallback(async () => {
        try {
            setLoading(true);
            const response = await getShipmentDetails(id);
            setShipment(response.data);
            setError('');
        } catch (err) {
            setError('Failed to fetch shipment details. It may have been deleted.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        fetchShipmentDetails();
    }, [fetchShipmentDetails]);

    const handleLocalUpdate = (updatedData) => {
        setShipment(prevShipment => ({
            ...prevShipment,
            ...updatedData
        }));
    };

    const handleStatusChange = async (newStatus) => {
        if (!canUserEdit) {
            toast.error("You do not have permission to change the shipment status.");
            return;
        }

        if (!window.confirm(`Are you sure you want to mark this checklist as "${newStatus}"?`)) {
            return;
        }
        try {
            await updateShipmentStatus(id, newStatus);
            toast.success('Shipment status updated!');
            fetchShipmentDetails(); // Refresh data to show new status and lock/unlock page
        } catch (err) {
            toast.error('Failed to update status.');
        }
    };

    const handlePrint = () => {
        window.print();
    };

    if (loading) return <p>Loading checklist...</p>;
    if (error) return <p className="error-message">{error} <Link to="/">Go back to Dashboard</Link></p>;
    if (!shipment) return <p>No shipment data found.</p>;

    const isCompleted = shipment.status === 'Completed';
    // The page is "locked" if the shipment is completed OR if the logged-in user does not have edit rights.
    const isPageLocked = isCompleted || !canUserEdit;

    return (
        <div className="checklist-detail-page">
            <div className="checklist-header card">
                <div className="header-info">
                    <h1>Job: {shipment.job_number}</h1>
                    <p><strong>Customer:</strong> {shipment.customer_name}</p>
                    <p><strong>Shipping Date:</strong> {shipment.shipping_date}</p>
                    <p><strong>QC Person:</strong> {shipment.qc_name}</p>
                </div>
                <div className="header-status">
                    <span className={`status-badge ${isCompleted ? 'completed' : 'in-progress'}`}>
                        {shipment.status}
                    </span>
                </div>
            </div>

            {/* Only show the main action buttons if the user has edit rights */}
            {canUserEdit && (
                <div className="action-buttons no-print">
                    {isCompleted ? (
                        <button onClick={() => handleStatusChange('In Progress')} className="reopen-button">
                            Re-Open for Edit
                        </button>
                    ) : (
                        <button 
                            onClick={() => handleStatusChange('Completed')} 
                            className="complete-button"
                            disabled={shipment.units.length === 0}
                            title={shipment.units.length === 0 ? 'Add at least one unit to complete' : ''}
                        >
                            Complete Checklist
                        </button>
                    )}
                    <button onClick={handlePrint} className="print-button">Print</button>
                </div>
            )}
            
            {/* If the user is NOT an editor (i.e., a viewer), show a simpler layout */}
            {!canUserEdit && (
                 <div className="action-buttons no-print">
                    <p><i>View-only mode.</i></p>
                    <button onClick={handlePrint} className="print-button">Print</button>
                </div>
            )}
            
            <div className="card">
                <h2>Shipment Checklist</h2>
                <ChecklistTable
                    items={shipment.checklist_items}
                    shipmentId={shipment.id}
                    qcName={shipment.qc_name}
                    shippingDate={shipment.shipping_date}
                    onUpdate={handleLocalUpdate}
                    disabled={isPageLocked}
                />
            </div>
            
            <div className="card">
                <ShippedUnitsSection
                    units={shipment.units}
                    shipmentId={shipment.id}
                    onUpdate={handleLocalUpdate}
                    disabled={isPageLocked}
                    jobNumberPrefix={shipment.job_number}
                />
            </div>
        </div>
    );
};

export default ChecklistDetailPage;