import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { getManifestData } from '../services/apiService';
import './ManifestPage.css';

const ManifestPage = () => {
    const [shipments, setShipments] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    
    const [searchTerm, setSearchTerm] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [activeWeekKey, setActiveWeekKey] = useState('');

    const fetchManifestData = useCallback(async () => {
        setIsLoading(true);
        try {
            const params = {
                search: searchTerm,
                start_date: startDate,
                end_date: endDate,
            };
            const response = await getManifestData(params);
            setShipments(response.data);
            setError('');
        } catch (err) {
            setError('Failed to fetch manifest data.');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    }, [searchTerm, startDate, endDate]);

    useEffect(() => {
        const handler = setTimeout(() => {
            fetchManifestData();
        }, 500);
        return () => clearTimeout(handler);
    }, [fetchManifestData]);

    const groupShipmentsByWeek = (shipmentList) => {
        const weeks = {};
        shipmentList.forEach(shipment => {
            const shippingDate = new Date(shipment.shipping_date);
            const dayOfWeek = shippingDate.getDay();
            const startOfWeek = new Date(shippingDate);
            startOfWeek.setDate(shippingDate.getDate() - dayOfWeek);
            startOfWeek.setHours(0, 0, 0, 0);

            const endOfWeek = new Date(startOfWeek);
            endOfWeek.setDate(startOfWeek.getDate() + 6);
            endOfWeek.setHours(23, 59, 59, 999);

            const weekKey = `${startOfWeek.toISOString().split('T')[0]} - ${endOfWeek.toISOString().split('T')[0]}`;

            if (!weeks[weekKey]) {
                weeks[weekKey] = [];
            }
            weeks[weekKey].push(shipment);
        });

        const sortedWeekKeys = Object.keys(weeks).sort((a, b) => {
            const dateA = new Date(a.split(' ')[0]);
            const dateB = new Date(b.split(' ')[0]);
            return dateB - dateA;
        });

        const grouped = {};
        sortedWeekKeys.forEach(key => {
            grouped[key] = weeks[key];
        });
        return grouped;
    };

    const groupedShipments = useMemo(() => groupShipmentsByWeek(shipments), [shipments]);

    useEffect(() => {
        const weekKeys = Object.keys(groupedShipments);
        if (weekKeys.length > 0) {
            if (!weekKeys.includes(activeWeekKey)) {
                setActiveWeekKey(weekKeys[0]);
            }
        } else {
            setActiveWeekKey('');
        }
    }, [groupedShipments, activeWeekKey]);

    const handlePrint = () => { window.print(); };

    return (
        <div className="manifest-page">
            <div className="card manifest-controls no-print">
                <h2>Generate Shipment Manifest</h2>
                <div className="filter-bar">
                    <input type="text" placeholder="Search by customer, job, S/N..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                    <button onClick={handlePrint} className="print-button">Print Manifest</button>
                </div>
            </div>

            <div className="manifest-content">
                {isLoading && <p>Loading manifest...</p>}
                {error && <p className="error-message">{error}</p>}

                {searchTerm ? (
                    shipments.map(shipment => (
                        <div key={shipment.id} className="manifest-card card">
                            <h3>Manifest for Job: {shipment.job_number}</h3>
                            <div className="manifest-details">
                                <span><strong>Customer:</strong> {shipment.customer_name}</span>
                                <span><strong>Shipping Date:</strong> {shipment.shipping_date}</span>
                                <span><strong>Total Units:</strong> {shipment.total_units}</span>
                            </div>

                            <div className="manifest-summary">
                                <strong>Summary by Type:</strong>
                                {shipment.shipped_units_summary && shipment.shipped_units_summary.length > 0 ? (
                                    <ul className="summary-list">
                                        {shipment.shipped_units_summary.map((summary, index) => (
                                            <li key={index}>{summary.model_type} ({summary.count})</li>
                                        ))}
                                    </ul>
                                ) : (
                                    <span> No units in this shipment.</span>
                                )}
                            </div>
                            
                            <table className="manifest-unit-table">
                                <thead>
                                    <tr>
                                        <th>Model Type</th>
                                        <th>Part Number</th>
                                        <th>Original S/N</th>
                                        <th>Serial Number</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {shipment.units && shipment.units.length > 0 ? (
                                        shipment.units.map((unit, index) => (
                                            <tr key={index}>
                                                <td>{unit.model_type}</td>
                                                <td>{unit.part_number}</td>
                                                <td>{unit.original_serial_number || 'N/A'}</td>
                                                <td>{unit.serial_number}</td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr><td colSpan="4">No units in this shipment.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    ))
                ) : (
                    <>
                        <div className="tabs no-print">
                            {Object.keys(groupedShipments).map(weekKey => (
                                <div
                                    key={weekKey}
                                    className={`tab ${activeWeekKey === weekKey ? 'active' : ''}`}
                                    onClick={() => setActiveWeekKey(weekKey)}
                                >
                                    Week of {weekKey.split(' ')[0]}
                                </div>
                            ))}
                        </div>

                        {activeWeekKey && groupedShipments[activeWeekKey] ? (
                            groupedShipments[activeWeekKey].map(shipment => (
                                <div key={shipment.id} className="manifest-card card">
                                    <h3>Manifest for Job: {shipment.job_number}</h3>
                                    <div className="manifest-details">
                                        <span><strong>Customer:</strong> {shipment.customer_name}</span>
                                        <span><strong>Shipping Date:</strong> {shipment.shipping_date}</span>
                                        <span><strong>Total Units:</strong> {shipment.total_units}</span>
                                    </div>

                                    <div className="manifest-summary">
                                        <strong>Summary by Type:</strong>
                                        {shipment.shipped_units_summary && shipment.shipped_units_summary.length > 0 ? (
                                            <ul className="summary-list">
                                                {shipment.shipped_units_summary.map((summary, index) => (
                                                    <li key={index}>{summary.model_type} ({summary.count})</li>
                                                ))}
                                            </ul>
                                        ) : (
                                            <span> No units in this shipment.</span>
                                        )}
                                    </div>
                                    
                                    <table className="manifest-unit-table">
                                        <thead>
                                            <tr>
                                                <th>Model Type</th>
                                                <th>Part Number</th>
                                                <th>Original S/N</th>
                                                <th>Serial Number</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {shipment.units && shipment.units.length > 0 ? (
                                                shipment.units.map((unit, index) => (
                                                    <tr key={index}>
                                                        <td>{unit.model_type}</td>
                                                        <td>{unit.part_number}</td>
                                                        <td>{unit.original_serial_number || 'N/A'}</td>
                                                        <td>{unit.serial_number}</td>
                                                    </tr>
                                                ))
                                            ) : (
                                                <tr><td colSpan="4">No units in this shipment.</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            ))
                        ) : (
                            !isLoading && <p>No shipments found for the selected filters.</p>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default ManifestPage;