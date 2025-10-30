import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getShipments, createShipment, getDashboardStats, getTimeSeriesStats } from '../services/apiService';
import { Doughnut, Bar } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, LineController, BarController } from 'chart.js';
import { useAuth } from '../contexts/AuthContext';
import useDebounce from '../hooks/useDebounce';
import './HomePage.css';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, LineController, BarController);

const VISIBLE_WEEK_COUNT = 6;

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
    const [weekWindowStart, setWeekWindowStart] = useState(0);

    const debouncedSearchTerm = useDebounce(searchTerm, 500);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const filterParams = {
                search: debouncedSearchTerm,
                status: statusFilter === 'All' ? '' : statusFilter,
                start_date: startDate,
                end_date: endDate,
            };
            
            const shipmentListParams = { ...filterParams, page: currentPage, limit: (debouncedSearchTerm || statusFilter === 'In Progress') ? 1000 : 100 };
            
            const timeSeriesFilterParams = { search: debouncedSearchTerm };

            const [statsResponse, timeSeriesResponse, shipmentsResponse] = await Promise.all([
                getDashboardStats(filterParams),
                getTimeSeriesStats(timeSeriesFilterParams), // Use separate params for this chart
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
        const formatLocal = (dateObj) => {
            const y = dateObj.getFullYear();
            const m = String(dateObj.getMonth() + 1).padStart(2, '0');
            const d = String(dateObj.getDate()).padStart(2, '0');
            return `${y}-${m}-${d}`;
        };

        const weeks = {};
        shipmentList.forEach(shipment => {
            const shippingDate = new Date(shipment.shipping_date);
            // Calculate the start of the week (Sunday) for the shipping date (local time)
            const dayOfWeek = shippingDate.getDay(); // Sunday is 0, Monday is 1, etc.
            const startOfWeek = new Date(shippingDate.getFullYear(), shippingDate.getMonth(), shippingDate.getDate() - dayOfWeek);
            startOfWeek.setHours(0, 0, 0, 0);

            const endOfWeek = new Date(startOfWeek.getFullYear(), startOfWeek.getMonth(), startOfWeek.getDate() + 6);
            endOfWeek.setHours(23, 59, 59, 999);

            const weekKey = `${formatLocal(startOfWeek)} - ${formatLocal(endOfWeek)}`;

            if (!weeks[weekKey]) {
                weeks[weekKey] = [];
            }
            weeks[weekKey].push(shipment);
        });

        // Ensure the current week is present even if there are no shipments yet
        const todayLocal = new Date();
        const dow = todayLocal.getDay();
        const currentStart = new Date(todayLocal.getFullYear(), todayLocal.getMonth(), todayLocal.getDate() - dow);
        const currentEnd = new Date(currentStart.getFullYear(), currentStart.getMonth(), currentStart.getDate() + 6);
        const currentWeekKey = `${formatLocal(currentStart)} - ${formatLocal(currentEnd)}`;
        if (!weeks[currentWeekKey]) {
            weeks[currentWeekKey] = [];
        }

        const parseKey = (key) => {
            const [y, m, d] = key.split(' ')[0].split('-').map(Number);
            return new Date(y, m - 1, d);
        };

        // Sort weeks by their start date (newest first)
        const sortedWeekKeys = Object.keys(weeks).sort((a, b) => parseKey(b) - parseKey(a));

        const grouped = {};
        sortedWeekKeys.forEach(key => {
            grouped[key] = weeks[key];
        });
        return grouped;
    }, []);

    const groupedShipments = useMemo(() => groupShipmentsByWeek(shipments), [shipments, groupShipmentsByWeek]);
    const weekKeys = useMemo(() => Object.keys(groupedShipments), [groupedShipments]);

    useEffect(() => {
        if (weekKeys.length === 0) {
            setActiveWeekKey('');
            setWeekWindowStart(0);
            return;
        }

        // Only set a default when none is selected or the current selection disappeared
        if (!activeWeekKey || !weekKeys.includes(activeWeekKey)) {
            const todayLocal = new Date();
            const dow = todayLocal.getDay();
            const start = new Date(todayLocal.getFullYear(), todayLocal.getMonth(), todayLocal.getDate() - dow);
            const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
            const formatLocal = (dt) => `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
            const currentWeekKey = `${formatLocal(start)} - ${formatLocal(end)}`;
            setActiveWeekKey(weekKeys.includes(currentWeekKey) ? currentWeekKey : weekKeys[0]);
        }
        // If there is a valid selection, do nothing so user choice sticks
    }, [weekKeys, activeWeekKey]);

    useEffect(() => {
        if (weekKeys.length === 0) {
            return;
        }
        setWeekWindowStart(prevStart => {
            const maxStart = Math.max(0, weekKeys.length - VISIBLE_WEEK_COUNT);
            const nextStart = Math.min(prevStart, maxStart);
            return nextStart;
        });
    }, [weekKeys]);

    useEffect(() => {
        if (!activeWeekKey) {
            return;
        }
        const activeIndex = weekKeys.indexOf(activeWeekKey);
        if (activeIndex === -1) {
            return;
        }
        setWeekWindowStart(prevStart => {
            if (activeIndex < prevStart) {
                return activeIndex;
            }
            const windowEnd = prevStart + VISIBLE_WEEK_COUNT;
            if (activeIndex >= windowEnd) {
                return activeIndex - VISIBLE_WEEK_COUNT + 1;
            }
            return prevStart;
        });
    }, [activeWeekKey, weekKeys]);

    const visibleWeekKeys = weekKeys.slice(weekWindowStart, weekWindowStart + VISIBLE_WEEK_COUNT);
    const canGoPrevWeek = weekWindowStart > 0;
    const canGoNextWeek = weekWindowStart + VISIBLE_WEEK_COUNT < weekKeys.length;
    const showWeekNavigation = weekKeys.length > VISIBLE_WEEK_COUNT;

    const handlePrevWeeks = () => {
        if (!canGoPrevWeek) {
            return;
        }
        setWeekWindowStart(prevStart => Math.max(0, prevStart - VISIBLE_WEEK_COUNT));
    };

    const handleNextWeeks = () => {
        if (!canGoNextWeek) {
            return;
        }
        setWeekWindowStart(prevStart => Math.min(Math.max(0, weekKeys.length - VISIBLE_WEEK_COUNT), prevStart + VISIBLE_WEEK_COUNT));
    };

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
            legend: { display: false } // custom legend rendered in DOM for consistent sizing
        },
        layout: { padding: 0 },
        cutout: '65%'
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
                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
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
                                {showWeekNavigation && (
                                    <button
                                        type="button"
                                        className="tab-nav"
                                        onClick={handlePrevWeeks}
                                        disabled={!canGoPrevWeek}
                                        aria-label="Previous weeks"
                                    >
                                        &lt;
                                    </button>
                                )}
                                <div className="tab-list">
                                    {visibleWeekKeys.map(weekKey => (
                                        <div
                                            key={weekKey}
                                            className={`tab ${activeWeekKey === weekKey ? 'active' : ''}`}
                                            onClick={() => setActiveWeekKey(weekKey)}
                                        >
                                            Week of {weekKey.split(' ')[0]}
                                        </div>
                                    ))}
                                </div>
                                {showWeekNavigation && (
                                    <button
                                        type="button"
                                        className="tab-nav"
                                        onClick={handleNextWeeks}
                                        disabled={!canGoNextWeek}
                                        aria-label="Next weeks"
                                    >
                                        &gt;
                                    </button>
                                )}
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
                            {totalPages > 1 && !(debouncedSearchTerm || statusFilter === 'In Progress') && (
                                <div className="pagination">
                                    <button onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} disabled={currentPage === 1}>Previous</button>
                                    <span>Page {currentPage} of {totalPages}</span>
                                    <button onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))} disabled={currentPage === totalPages || totalPages === 0}>Next</button>
                                </div>
                            )}
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

                <div className="card chart-card donut-card">
                    <h3>Retest Reasons</h3>
                    {stats && stats.retest_reasons && stats.retest_reasons.length > 0 ? (
                        <div className="donut-stack">
                            <div className="chart-container">
                                <Doughnut data={doughnutChartData} options={doughnutChartOptions} />
                            </div>
                            <ul className="donut-legend">
                                {doughnutChartData.labels.map((label, idx) => (
                                    <li key={idx}>
                                        <span className="legend-swatch" style={{ backgroundColor: doughnutChartData.datasets[0].backgroundColor[idx] }} />
                                        <span className="legend-label">{label}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ) : (
                        <div className="no-data-wrapper">
                            <p className="no-data-msg">No retest data available.</p>
                        </div>
                    )}
                </div>

                <div className="card chart-card donut-card">
                    <h3>Failed Equipment</h3>
                    {stats && stats.failed_equipment_stats && stats.failed_equipment_stats.length > 0 ? (
                        <div className="donut-stack">
                            <div className="chart-container">
                                <Doughnut data={failedEquipmentChartData} options={doughnutChartOptions} />
                            </div>
                            <ul className="donut-legend">
                                {failedEquipmentChartData.labels.map((label, idx) => (
                                    <li key={idx}>
                                        <span className="legend-swatch" style={{ backgroundColor: failedEquipmentChartData.datasets[0].backgroundColor[idx] }} />
                                        <span className="legend-label">{label}</span>
                                    </li>
                                ))}
                            </ul>
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
            <footer className="app-footer">
                <small>© Copyright {new Date().getFullYear()} Nhu Toan Nguyen. All rights reserved.</small>
            </footer>
        </div>
    );
};

export default HomePage;
