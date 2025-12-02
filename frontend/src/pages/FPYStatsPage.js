import React, { useEffect, useMemo, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend,
} from 'chart.js';
import { getWeeklyFPYStats, getOverallFPYStats } from '../services/apiService';
import './FPYStatsPage.css';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const todayISO = () => new Date().toISOString().split('T')[0];
const AVERAGE_TOTAL_KEY = '__TOTAL__';

const FPYStatsPage = () => {
    const [anchorDate, setAnchorDate] = useState(todayISO());
    const [weeksCount, setWeeksCount] = useState(6);
    const [rawWeeks, setRawWeeks] = useState([]);
    const [globalTotals, setGlobalTotals] = useState({ parts: {}, total: null });
    const [selectedWeekIndex, setSelectedWeekIndex] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const fetchStats = async () => {
        setLoading(true);
        setError('');
        try {
            const { data } = await getWeeklyFPYStats({ anchor_date: anchorDate, weeks: weeksCount });
            const weeks = data.weeks || [];
            setRawWeeks(weeks);
            setSelectedWeekIndex(0);
        } catch (err) {
            console.error(err);
            setError(err.response?.data?.error || 'Failed to load FPY stats.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStats();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [anchorDate, weeksCount]);

    useEffect(() => {
        const fetchGlobal = async () => {
            try {
                const { data } = await getOverallFPYStats();
                const partsMap = {};
                (data.parts || []).forEach((part) => {
                    if (part.part_number) {
                        partsMap[part.part_number] = part.first_pass_yield;
                    }
                });
                setGlobalTotals({
                    parts: partsMap,
                    total: data?.total_fpy ?? null
                });
            } catch (err) {
                console.error('Failed to load overall FPY stats', err);
            }
        };
        fetchGlobal();
    }, []);

    const selectedWeek = rawWeeks[selectedWeekIndex] || null;
    const maxWeekIndex = rawWeeks.length - 1;

    const getProductKey = (product, fallbackIndex = 0) =>
        product?.part_number || product?.model_type || `product-${fallbackIndex}`;

    const formatProductLabel = (product) => product?.part_number || product?.model_type || 'Unknown';

    const averages = useMemo(() => {
        return {
            averagesByPart: globalTotals.parts,
            totalAverage: globalTotals.total
        };
    }, [globalTotals]);

    const chartConfig = useMemo(() => {
        if (!selectedWeek || !(selectedWeek.products?.length || selectedWeek.totals?.total_units)) {
            return null;
        }

        const productEntries = (selectedWeek.products || []).map((product, idx) => {
            const key = getProductKey(product, idx);
            return {
                key,
                label: formatProductLabel(product),
                value: product.first_pass_yield ?? 0,
            };
        });

        const totalEntry = {
            key: AVERAGE_TOTAL_KEY,
            label: 'Total',
            value: selectedWeek.totals?.first_pass_yield ?? 0,
        };

        const dataPoints = [...productEntries, totalEntry];
        const currentValues = dataPoints.map((dp) => dp.value);
        const overallValues = dataPoints.map((dp) =>
            dp.key === AVERAGE_TOTAL_KEY ? averages.totalAverage : averages.averagesByPart[dp.key] ?? null
        );

        const barColors = dataPoints.map((dp) =>
            dp.key === AVERAGE_TOTAL_KEY ? '#ff8f00' : '#1976d2'
        );

        const valueLabelPlugin = {
            id: 'fpyValueLabels',
            afterDatasetsDraw(chart) {
                const { ctx } = chart;
                ctx.save();
                ctx.font = '12px Inter, sans-serif';
                ctx.textAlign = 'center';
                const lineMeta = chart.getDatasetMeta(0);
                const barMeta = chart.getDatasetMeta(1);
        const points = barMeta?.data || [];
        const originalFont = ctx.font;
        points.forEach((bar, index) => {
            const current = chart.data.datasets[1].data[index];
            const avg = chart.data.datasets[0].data[index];
            const delta = (typeof current === 'number' && typeof avg === 'number')
                ? current - avg
                : null;
                    const barTop = bar ? bar.y : 0;

                    if (bar && typeof current === 'number') {
                        ctx.fillStyle = '#0d47a1';
                        ctx.fillText(`${current.toFixed(1)}%`, bar.x, barTop - 6);
                    }

                    if (bar && typeof avg === 'number') {
                        ctx.font = '600 12px Inter, sans-serif';
                        ctx.fillStyle = '#e65100';
                        ctx.fillText(`${avg.toFixed(1)}% (overall)`, bar.x, barTop - 24);
                        ctx.font = originalFont;
                    }

                    if (bar && delta !== null && delta > 0) {
                        ctx.fillStyle = '#ffb300';
                        ctx.font = '18px Inter, sans-serif';
                        ctx.fillText('★', bar.x, barTop - 45);
                        ctx.font = '12px Inter, sans-serif';
                    }
                });
                ctx.restore();
            },
        };

        return {
            data: {
                labels: dataPoints.map((dp) => dp.label),
                datasets: [
                    {
                        label: 'Overall FPY',
                        data: overallValues,
                        type: 'line',
                        borderColor: '#e65100',
                        backgroundColor: '#e65100',
                        borderWidth: 2,
                        pointRadius: 4,
                        pointHoverRadius: 5,
                        fill: false,
                        tension: 0.2,
                        yAxisID: 'y',
                        order: 1,
                    },
                    {
                        label: 'Current Week FPY',
                        data: currentValues,
                        backgroundColor: barColors,
                        borderRadius: 8,
                        maxBarThickness: 60,
                        yAxisID: 'y',
                        order: 2,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    title: {
                        display: true,
                        text: `First Pass Yield for ${selectedWeek.start} → ${selectedWeek.end}`,
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const value =
                                    typeof context.parsed?.y === 'number'
                                        ? context.parsed.y
                                        : (typeof context.parsed === 'number' ? context.parsed : 0);
                                const labelSuffix = context.datasetIndex === 0 ? '' : ' (avg)';
                                return `${context.dataset.label}${labelSuffix}: ${value.toFixed(2)}%`;
                            },
                        },
                    },
                },
                scales: {
                    x: {
                        offset: true,
                        ticks: {
                            autoSkip: false,
                            font: {
                                weight: 'bold'
                            }
                        },
                    },
                    y: {
                        beginAtZero: true,
                        suggestedMax: 120,
                        ticks: { callback: (value) => `${value}%` },
                        title: { display: true, text: 'FPY (%)' },
                    },
                },
            },
            plugins: [valueLabelPlugin],
        };
    }, [selectedWeek, averages]);

    const goOlderWeek = () => setSelectedWeekIndex((idx) => Math.min(idx + 1, maxWeekIndex));
    const goNewerWeek = () => setSelectedWeekIndex((idx) => Math.max(idx - 1, 0));

    return (
        <div className="fpy-container">
            <div className="fpy-header">
                <div>
                    <h2>FPY Stats</h2>
                    <p className="fpy-subtitle">Weekly First Pass Yield by part number</p>
                </div>
                <div className="fpy-controls">
                    <label>
                        Anchor Date
                        <input
                            type="date"
                            value={anchorDate}
                            onChange={(e) => setAnchorDate(e.target.value)}
                        />
                    </label>
                    <label>
                        Weeks
                        <select value={weeksCount} onChange={(e) => setWeeksCount(parseInt(e.target.value, 10))}>
                            {[4, 6, 8, 12, 16, 26].map((opt) => (
                                <option key={opt} value={opt}>{opt}</option>
                            ))}
                        </select>
                    </label>
                </div>
            </div>

            {error && <div className="fpy-error">{error}</div>}
            {loading && <div>Loading FPY stats…</div>}

            {!loading && rawWeeks.length > 0 && (
                <div className="week-navigation">
                    <button onClick={goOlderWeek} disabled={selectedWeekIndex >= maxWeekIndex}>
                        Older Week
                    </button>
                    <div>
                        {selectedWeek
                            ? `Viewing week ${rawWeeks.length - selectedWeekIndex} of ${rawWeeks.length} (${selectedWeek.start} → ${selectedWeek.end})`
                            : 'No week selected'}
                    </div>
                    <button onClick={goNewerWeek} disabled={selectedWeekIndex <= 0}>
                        Newer Week
                    </button>
                </div>
            )}

            {!loading && !chartConfig && (
                <div className="fpy-empty-state">No FPY data found for the selected range.</div>
            )}

            {!loading && chartConfig && (
                <div className="combined-chart-card">
                    <div className="chart-wrapper">
                        <Bar data={chartConfig.data} options={chartConfig.options} plugins={chartConfig.plugins} />
                    </div>
                    <div className="chart-footnote" />
                </div>
            )}
        </div>
    );
};

export default FPYStatsPage;
