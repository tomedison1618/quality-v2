import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getShipments, createShipment, getDashboardStats, getTimeSeriesStats } from '../services/apiService';
import { Doughnut, Bar } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, LineController, BarController } from 'chart.js';
import { useAuth } from '../contexts/AuthContext';
import useDebounce from '../hooks/useDebounce';
import './HomePage.css';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, LineController, BarController);

const HomePage = () => {
    const { user } = useAuth();
    const canUserCreate = user?.role === 'admin' || user?.role === 'user';

    const [shipments, setShipments] = useState([]);
    const [stats, setStats] = useState(null);
    const [timeSeriesData, setTimeSeriesData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const [customerName, setCustomerName] = useState('');
    const [jobNumber, setJobNumber] = useState('');
    const [shippingDate, setShippingDate] = useState(new Date().toISOString().split('T')[0]);
    const [qcName, setQcName] = useState('');

    const [searchTerm, setSearchTerm] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [statusFilter, setStatusFilter] = useState('All');
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [activeWeekKey, setActiveWeekKey] = useState(''); // State to manage active tab

    const debouncedSearchTerm = useDebounce(searchTerm, 500);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const today = new Date();
            const fourWeeksAgo = new Date(today.setDate(today.getDate() - 28));
            const formattedFourWeeksAgo = fourWeeksAgo.toISOString().split('T')[0];
            const formattedToday = new Date().toISOString().split('T')[0];

            const filterParams = {
                search: debouncedSearchTerm,
                status: statusFilter === 'All' ? '' : statusFilter,
            };

            if (statusFilter !== 'In Progress') {
                filterParams.start_date = startDate || formattedFourWeeksAgo;
                filterParams.end_date = endDate || formattedToday;
            }
            
            const shipmentListParams = { ...filterParams, page: currentPage, limit: (debouncedSearchTerm || statusFilter === 'In Progress') ? 1000 : 100 };
            
            const [statsResponse, timeSeriesResponse, shipmentsResponse] = await Promise.all([
                getDashboardStats(filterParams),
                getTimeSeriesStats(filterParams),
                getShipments(shipmentListParams)
            ]);
            
            setStats(statsResponse.data);
            setTimeSeriesData(timeSeriesResponse.data);
            setShipments(shipmentsResponse.data.shipments);
            setTotalPages(shipmentsResponse.data.total_pages);
            setError('');
        } catch (err) {
            setError('Failed to fetch dashboard data. Please try again later.');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    }, [currentPage, debouncedSearchTerm, startDate, endDate, statusFilter]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    useEffect(() => {
        // Reset to the first page whenever filters change
        setCurrentPage(1);
    }, [debouncedSearchTerm, startDate, endDate, statusFilter]);

    const groupShipmentsByWeek = useCallback((shipmentList) => {
        const weeks = {};
        shipmentList.forEach(shipment => {
            const shippingDate = new Date(shipment.shipping_date);
            // Calculate the start of the week (Sunday) for the shipping date
            const dayOfWeek = shippingDate.getDay(); // Sunday is 0, Monday is 1, etc.
            const startOfWeek = new Date(shippingDate);
            startOfWeek.setDate(shippingDate.getDate() - dayOfWeek);
            startOfWeek.setHours(0, 0, 0, 0); // Normalize to start of day

            const endOfWeek = new Date(startOfWeek);
            endOfWeek.setDate(startOfWeek.getDate() + 6);
            endOfWeek.setHours(23, 59, 59, 999); // Normalize to end of day

            const weekKey = `${startOfWeek.toISOString().split('T')[0]} - ${endOfWeek.toISOString().split('T')[0]}`;

            if (!weeks[weekKey]) {
                weeks[weekKey] = [];
            }
            weeks[weekKey].push(shipment);
        });

        // Sort weeks by their start date (key)
        const sortedWeekKeys = Object.keys(weeks).sort((a, b) => {
            const dateA = new Date(a.split(' ')[0]);
            const dateB = new Date(b.split(' ')[0]);
            return dateB - dateA; // Newest week first
        });

        const grouped = {};
        sortedWeekKeys.forEach(key => {
            grouped[key] = weeks[key];
        });
        return grouped;
    }, []);

    const groupedShipments = useMemo(() => groupShipmentsByWeek(shipments), [shipments, groupShipmentsByWeek]);

    useEffect(() => {
        const weekKeys = Object.keys(groupedShipments);
        if (weekKeys.length > 0) {
            // If the active week is not in the new list of weeks, default to the first one.
            // This handles the case where a search/filter changes the available weeks.
            if (!weekKeys.includes(activeWeekKey)) {
                setActiveWeekKey(weekKeys[0]);
            }
        } else {
            // If no shipments are found, clear the active week.
            setActiveWeekKey('');
        }
    }, [groupedShipments, activeWeekKey]);

    const handleCreateShipment = async (e) => {
        e.preventDefault();
        if (!customerName || !jobNumber || !shippingDate || !qcName) {
            alert('Please fill out all fields to create a shipment.');
            return;
        }
        try {
            const response = await createShipment({
                customer_name: customerName,
                job_number: jobNumber,
                shipping_date: shippingDate,
                qc_name: qcName
            });
            navigate(`/shipment/${response.data.id}`);
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to create shipment.');
        }
    };

    const handleClearFilters = () => {
        setSearchTerm('');
        setStartDate('');
        setEndDate('');
        setStatusFilter('All');
        setCurrentPage(1);
    };

    const doughnutChartData = {
        labels: stats?.retest_reasons?.map(r => r.retest_reason) || [],
        datasets: [{
            label: '# of Units',
            data: stats?.retest_reasons?.map(r => r.count) || [],
            backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40'],
            borderColor: '#fff',
            borderWidth: 2,
        }],
    };
    
    const failedEquipmentChartData = {
        labels: stats?.failed_equipment_stats?.map(s => s.equipment) || [],
        datasets: [{
            label: '# of Units',
            data: stats?.failed_equipment_stats?.map(s => s.count) || [],
            backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40', '#C9CBCF'], // Added one more color for 'Other'
            borderColor: '#fff',
            borderWidth: 2,
        }],
    };

    const doughnutChartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'right',
                labels: {
                    boxWidth: 20,
                    padding: 15,
                }
            }
        }
    };

    const timeSeriesChartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { position: 'top' },
            title: { display: true, text: 'Monthly Shipments and First Pass Yield' }
        },
        scales: {
            y: {
                type: 'linear',
                display: true,
                position: 'left',
                title: { display: true, text: 'Total Units Shipped' }
            },
            y1: {
                type: 'linear',
                display: true,
                position: 'right',
                title: { display: true, text: 'FPY %' },
                grid: { drawOnChartArea: false },
                min: 0,
                max: 100
            },
        },
    };

    const timeSeriesChartData = {
        labels: timeSeriesData?.labels || [],
        datasets: [
            {
                type: 'bar',
                label: 'Units Shipped',
                data: timeSeriesData?.totalUnits || [],
                backgroundColor: 'rgba(54, 162, 235, 0.6)',
                yAxisID: 'y',
            },
            {
                type: 'line',
                label: 'First Pass Yield',
                data: timeSeriesData?.fpy || [],
                borderColor: 'rgb(255, 99, 132)',
                backgroundColor: 'rgba(255, 99, 132, 0.5)',
                yAxisID: 'y1',
                tension: 0.1
            }
        ]
    };

    return (
        <div className="home-page">
            {canUserCreate && (
                <div className="card create-shipment-form">
                    <h2>Create New Shipment Checklist</h2>
                    <form onSubmit={handleCreateShipment}>
                        <div className="form-group"><label htmlFor="customerName">Customer Name</label><input id="customerName" type="text" value={customerName} onChange={e => setCustomerName(e.target.value)} required /></div>
                        <div className="form-group"><label htmlFor="jobNumber">Job Number</label><input id="jobNumber" type="text" value={jobNumber} onChange={e => setJobNumber(e.target.value)} required /></div>
                        <div className="form-group"><label htmlFor="shippingDate">Shipping Date</label><input id="shippingDate" type="date" value={shippingDate} onChange={e => setShippingDate(e.target.value)} required /></div>
                        <div className="form-group"><label htmlFor="qcName">QC Name</label><input id="qcName" type="text" value={qcName} onChange={e => setQcName(e.target.value)} required /></div>
                        <div className="form-group">
                           <button type="submit" className="primary-button">Create Checklist</button>
                        </div>
                    </form>
                </div>
            )}

            <div className="card shipments-list">
                <h2>Existing Shipments</h2>
                <div className="filter-bar">
                    <input type="text" placeholder="Search customer, job, S/N..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} disabled={statusFilter === 'In Progress'} />
                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} disabled={statusFilter === 'In Progress'} />
                    <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                        <option value="All">All Statuses</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Completed">Completed</option>
                    </select>
                    {(searchTerm || startDate || endDate || statusFilter !== 'All') && <button onClick={handleClearFilters} className="clear-btn">Clear</button>}
                </div>
                
                {isLoading ? <p>Loading shipments...</p> : error ? <p className="error-message">{error}</p> : 
                (<>
                    {(debouncedSearchTerm || statusFilter === 'In Progress') ? (
                        <table className="shipments-list-table">
                            <thead>
                                <tr>
                                    <th>Customer</th>
                                    <th>Job Number</th>
                                    <th>Shipping Date</th>
                                    <th>Total Units</th>
                                    <th>Shipped Units (by Type)</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {shipments.map(shipment => (
                                    <tr key={shipment.id}>
                                        <td>{shipment.customer_name}</td>
                                        <td><Link to={`/shipment/${shipment.id}`}>{shipment.job_number}</Link></td>
                                        <td>{shipment.shipping_date}</td>
                                        <td className="total-units-cell">{shipment.total_units || 0}</td>
                                        <td>
                                            {shipment.shipped_units_summary?.length > 0 ? (
                                                <ul className="unit-summary-list">{shipment.shipped_units_summary.map((s, i) => <li key={i}>{s.model_type} ({s.count})</li>)}</ul>
                                            ) : ('No units added')}
                                        </td>
                                        <td><span className={`status-badge ${shipment.status.toLowerCase().replace(' ', '-')}`}>{shipment.status}</span></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <>
                            <div className="tabs">
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
                            <table className="shipments-list-table">
                                <thead>
                                    <tr>
                                        <th>Customer</th>
                                        <th>Job Number</th>
                                        <th>Shipping Date</th>
                                        <th>Total Units</th>
                                        <th>Shipped Units (by Type)</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {activeWeekKey && groupedShipments[activeWeekKey] ? (
                                        groupedShipments[activeWeekKey].map(shipment => (
                                            <tr key={shipment.id}>
                                                <td>{shipment.customer_name}</td>
                                                <td><Link to={`/shipment/${shipment.id}`}>{shipment.job_number}</Link></td>
                                                <td>{shipment.shipping_date}</td>
                                                <td className="total-units-cell">{shipment.total_units || 0}</td>
                                                <td>
                                                    {shipment.shipped_units_summary?.length > 0 ? (
                                                        <ul className="unit-summary-list">{shipment.shipped_units_summary.map((s, i) => <li key={i}>{s.model_type} ({s.count})</li>)}</ul>
                                                    ) : ('No units added')}
                                                </td>
                                                <td><span className={`status-badge ${shipment.status.toLowerCase().replace(' ', '-')}`}>{shipment.status}</span></td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan="6">Select a week to view shipments.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                            <div className="pagination">
                                <button onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} disabled={currentPage === 1}>Previous</button>
                                <span>Page {currentPage} of {totalPages}</span>
                                <button onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))} disabled={currentPage === totalPages || totalPages === 0}>Next</button>
                            </div>
                        </>
                    )}
                </>)}
            </div>
            
            <div className="dashboard-grid">
                <div className="card stats-card">
                    <h3>Total Shipments</h3>
                    <p>{stats?.total_shipments ?? '...'}</p>
                </div>
                <div className="card stats-card">
                    <h3>Total Units Shipped</h3>
                    <p>{stats?.total_units_shipped ?? '...'}</p>
                </div>
                <div className="card stats-card fpy-card">
                    <h3>First Pass Yield (FPY)</h3>
                    <p>{stats?.first_pass_yield ?? '...'}%</p>
                </div>

                <div className="card chart-card">
                    <h3>Retest Reasons</h3>
                    {stats && stats.retest_reasons && stats.retest_reasons.length > 0 ? (
                        <div className="chart-container">
                            <Doughnut data={doughnutChartData} options={doughnutChartOptions} />
                        </div>
                    ) : (
                        <div className="no-data-wrapper">
                            <p className="no-data-msg">No retest data available.</p>
                        </div>
                    )}
                </div>

                <div className="card chart-card">
                    <h3>Failed Equipment</h3>
                    {stats && stats.failed_equipment_stats && stats.failed_equipment_stats.length > 0 ? (
                        <div className="chart-container">
                            <Doughnut data={failedEquipmentChartData} options={doughnutChartOptions} />
                        </div>
                    ) : (
                        <div className="no-data-wrapper">
                            <p className="no-data-msg">No failed equipment data available.</p>
                        </div>
                    )}
                </div>

                <div className="card chart-card-large">
                    <h3>Monthly Performance</h3>
                    {timeSeriesData && timeSeriesData.labels && timeSeriesData.labels.length > 0 ? (
                        <div style={{ height: '400px' }}>
                            <Bar options={timeSeriesChartOptions} data={timeSeriesChartData} />
                        </div>
                    ) : (
                         <div className="no-data-wrapper">
                            <p className="no-data-msg">Not enough data for time-series chart.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default HomePage;