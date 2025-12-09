import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
const WEEK_IN_MS = 7 * 24 * 60 * 60 * 1000;

const safeDate = (value) => {
    if (!value) {
        return null;
    }
    const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const toISODate = (date) => (date ? date.toISOString().split('T')[0] : '');

const getSundayStart = (date) => {
    const base = safeDate(date);
    if (!base) {
        return null;
    }
    const sunday = new Date(base.getTime());
    const day = sunday.getUTCDay();
    sunday.setUTCHours(0, 0, 0, 0);
    sunday.setUTCDate(sunday.getUTCDate() - day);
    return sunday;
};

const computeWeeksNeeded = (quarterStart, anchorStart) => {
    if (!quarterStart || !anchorStart) {
        return 13;
    }
    const diff = Math.max(anchorStart.getTime() - quarterStart.getTime(), 0);
    const diffWeeks = Math.ceil(diff / WEEK_IN_MS);
    const weeksWindow = diffWeeks + 1;
    return Math.min(Math.max(weeksWindow, 4), 26);
};

const getQuarterDetails = (isoDate) => {
    const base = safeDate(isoDate || todayISO());
    if (!base) {
        return null;
    }
    const year = base.getUTCFullYear();
    const quarterIndex = Math.floor(base.getUTCMonth() / 3);
    const startDate = new Date(Date.UTC(year, quarterIndex * 3, 1));
    const endDate = new Date(Date.UTC(year, quarterIndex * 3 + 3, 0));
    startDate.setUTCHours(0, 0, 0, 0);
    endDate.setUTCHours(0, 0, 0, 0);
    const anchorStart = getSundayStart(endDate);
    return {
        index: quarterIndex + 1,
        label: `Q${quarterIndex + 1} ${year}`,
        startDate,
        endDate,
        startISO: toISODate(startDate),
        endISO: toISODate(endDate),
        anchorStart,
        anchorDateISO: toISODate(endDate),
        weeksToFetch: computeWeeksNeeded(startDate, anchorStart),
    };
};

const shiftQuarterISO = (isoDate, offset) => {
    const base = safeDate(isoDate || todayISO());
    if (!base || !Number.isFinite(offset)) {
        return todayISO();
    }
    const newDate = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + offset * 3, 1));
    return toISODate(newDate);
};

const formatWeekEndLabel = (endISO) => {
    const endDate = safeDate(endISO);
    if (!endDate) {
        return endISO || '';
    }
    return endDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const FPYStatsPage = () => {
    const [anchorDate, setAnchorDate] = useState(todayISO());
    const [weeksCount, setWeeksCount] = useState(6);
    const [rawWeeks, setRawWeeks] = useState([]);
    const [globalTotals, setGlobalTotals] = useState({ parts: {}, total: null });
    const [selectedWeekIndex, setSelectedWeekIndex] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [quarterDate, setQuarterDate] = useState(todayISO());
    const [quarterWeeks, setQuarterWeeks] = useState([]);
    const [quarterLoading, setQuarterLoading] = useState(false);
    const [quarterError, setQuarterError] = useState('');

    const goPrevQuarter = () => setQuarterDate((prev) => shiftQuarterISO(prev, -1));
    const goNextQuarter = () => setQuarterDate((prev) => shiftQuarterISO(prev, 1));

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

    const quarterMeta = useMemo(() => getQuarterDetails(quarterDate), [quarterDate]);

    const sortedQuarterWeeks = useMemo(() => {
        if (!quarterWeeks || quarterWeeks.length === 0) {
            return [];
        }
        return [...quarterWeeks].sort((a, b) => {
            const startA = safeDate(a?.start)?.getTime() ?? 0;
            const startB = safeDate(b?.start)?.getTime() ?? 0;
            return startA - startB;
        });
    }, [quarterWeeks]);

    const weeklySectionRef = React.useRef(null);

    const scrollToWeekly = useCallback(() => {
        window.scrollTo({
            top: document.documentElement.scrollHeight,
            behavior: 'smooth'
        });
    }, []);

    const focusWeekFromQuarter = useCallback((week) => {
        if (!week) {
            return;
        }
        const targetStart = week.start;
        if (targetStart) {
            const existingIndex = rawWeeks.findIndex((w) => w.start === targetStart);
            if (existingIndex >= 0) {
                setSelectedWeekIndex(existingIndex);
                scrollToWeekly();
                return;
            }
        }
        const anchorISO = week.end || week.start;
        if (anchorISO) {
            setAnchorDate(anchorISO);
        }
    }, [rawWeeks, setAnchorDate, setSelectedWeekIndex, scrollToWeekly]);

    useEffect(() => {
        if (!quarterMeta) {
            setQuarterWeeks([]);
            return;
        }

        const fetchQuarterStats = async () => {
            setQuarterLoading(true);
            setQuarterError('');
            try {
                const { data } = await getWeeklyFPYStats({
                    anchor_date: quarterMeta.anchorDateISO,
                    weeks: quarterMeta.weeksToFetch,
                });
                const weeks = data.weeks || [];
                const filteredWeeks = weeks.filter((week) => {
                    const weekStart = safeDate(week?.start);
                    const weekEnd = safeDate(week?.end);
                    const hasUnits = (week?.totals?.total_units ?? 0) > 0;
                    return (
                        weekStart &&
                        weekEnd &&
                        weekStart >= quarterMeta.startDate &&
                        weekEnd <= quarterMeta.endDate &&
                        hasUnits
                    );
                });
                setQuarterWeeks(filteredWeeks);
            } catch (err) {
                console.error(err);
                setQuarterWeeks([]);
                setQuarterError(err.response?.data?.error || 'Failed to load quarterly FPY stats.');
            } finally {
                setQuarterLoading(false);
            }
        };

        fetchQuarterStats();
    }, [quarterMeta, scrollToWeekly]);

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
                passedUnits: product.first_pass_units ?? 0,
                totalUnits: product.total_units ?? 0,
            };
        });

        const totalEntry = {
            key: AVERAGE_TOTAL_KEY,
            label: 'Total',
            value: selectedWeek.totals?.first_pass_yield ?? 0,
            passedUnits: selectedWeek.totals?.first_pass_units ?? 0,
            totalUnits: selectedWeek.totals?.total_units ?? 0,
        };

        const dataPoints = [...productEntries, totalEntry];
        const unitBreakdown = dataPoints.map((dp) => ({
            passed: dp.passedUnits ?? 0,
            total: dp.totalUnits ?? 0,
        }));
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
                const barMeta = chart.getDatasetMeta(1);
                const points = barMeta?.data || [];
                const originalFont = ctx.font;
                const units = chart.data.datasets[1]?.unitBreakdown || [];
                const xAxis = chart.scales?.x;
                const breakdownY = (xAxis?.bottom ?? chart.chartArea.bottom) + 20;

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

                    const breakdown = units[index];
                    if (bar && breakdown && (breakdown.passed || breakdown.total)) {
                        ctx.fillStyle = '#c62828';
                        ctx.font = '600 12px Inter, sans-serif';
                        ctx.fillText(`${breakdown.passed}/${breakdown.total}`, bar.x, breakdownY);
                        ctx.font = originalFont;
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
                        unitBreakdown,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: {
                    padding: {
                        bottom: 40,
                    },
                },
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

    const quarterChartConfig = useMemo(() => {
        if (!quarterMeta || sortedQuarterWeeks.length === 0) {
            return null;
        }

        const labels = sortedQuarterWeeks.map((week) => formatWeekEndLabel(week.end));
        const values = sortedQuarterWeeks.map((week) => week?.totals?.first_pass_yield ?? 0);
        const barColors = sortedQuarterWeeks.map((week) => {
            const isSelected = selectedWeek?.start && week.start === selectedWeek.start;
            return isSelected ? '#ff8f00' : '#26a69a';
        });
        const unitBreakdown = sortedQuarterWeeks.map((week) => ({
            passed: week?.totals?.first_pass_units ?? 0,
            total: week?.totals?.total_units ?? 0,
        }));

        const quarterValueLabelPlugin = {
            id: 'quarterLabels',
            afterDatasetsDraw(chart) {
                const { ctx } = chart;
                ctx.save();
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                const dataset = chart.data.datasets[0];
                const data = dataset?.data || [];
                const units = dataset?.unitBreakdown || [];
                const bars = chart.getDatasetMeta(0)?.data || [];
                const xAxis = chart.scales?.x;

                bars.forEach((bar, index) => {
                    if (!bar) {
                        return;
                    }
                    const value = data[index];
                    if (typeof value === 'number') {
                        ctx.fillStyle = '#0d47a1';
                        ctx.font = '12px Inter, sans-serif';
                        ctx.fillText(`${value.toFixed(1)}%`, bar.x, bar.y - 14);
                    }
                    const breakdown = units[index];
                    if (breakdown && (breakdown.passed || breakdown.total)) {
                        ctx.fillStyle = '#ff0000';
                        ctx.font = '600 12px Inter, sans-serif';
                        const bottomLimit = chart.height - 12;
                        const rawY = (xAxis?.bottom ?? chart.chartArea.bottom) + 8;
                        const breakdownY = Math.min(bottomLimit, rawY);
                        ctx.fillText(`${breakdown.passed}/${breakdown.total}`, bar.x, breakdownY);
                    }
                });

                ctx.restore();
            },
        };

        return {
            data: {
                labels,
                datasets: [
                    {
                        label: 'Weekly Total FPY',
                        data: values,
                        backgroundColor: barColors,
                        hoverBackgroundColor: barColors,
                        borderRadius: 8,
                        maxBarThickness: 40,
                        unitBreakdown,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: {
                    padding: {
                        bottom: 36,
                    },
                },
                plugins: {
                    legend: { display: false },
                    title: {
                        display: true,
                        text: `Quarterly FPY - ${quarterMeta.label}`,
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const value =
                                    typeof context.parsed?.y === 'number'
                                        ? context.parsed.y
                                        : (typeof context.parsed === 'number' ? context.parsed : 0);
                                return `${context.dataset.label}: ${value.toFixed(2)}%`;
                            },
                        },
                    },
                },
                onClick: (_, elements) => {
                    if (!elements || elements.length === 0) {
                        return;
                    }
                    const element = elements[0];
                    if (element.datasetIndex !== 0) {
                        return;
                    }
                    const week = sortedQuarterWeeks[element.index];
                    focusWeekFromQuarter(week);
                    scrollToWeekly();
                },
                onHover: (event, elements, chart) => {
                    if (!chart) {
                        return;
                    }
                    const isClickable =
                        elements &&
                        elements.length > 0 &&
                        elements[0].datasetIndex === 0;
                    chart.canvas.style.cursor = isClickable ? 'pointer' : 'default';
                },
                scales: {
                    x: {
                        ticks: {
                            autoSkip: false,
                            maxRotation: 45,
                            minRotation: 45,
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
            plugins: [quarterValueLabelPlugin],
        };
    }, [quarterMeta, sortedQuarterWeeks, focusWeekFromQuarter, scrollToWeekly, selectedWeek]);

    const goOlderWeek = () => setSelectedWeekIndex((idx) => Math.min(idx + 1, maxWeekIndex));
    const goNewerWeek = () => setSelectedWeekIndex((idx) => Math.max(idx - 1, 0));

    return (
        <div className="fpy-container">
            <div className="fpy-header" ref={weeklySectionRef}>
                <div>
                    <h2>Quarterly FPY</h2>
                    <p className="fpy-subtitle">
                        Weekly total FPY for {quarterMeta?.label || 'selected quarter'}
                    </p>
                </div>
                <div className="fpy-controls">
                    <button type="button" className="fpy-nav-button" onClick={goPrevQuarter} aria-label="Previous quarter">
                        {'<'}
                    </button>
                    <label>
                        Quarter Date
                        <input
                            type="date"
                            value={quarterDate}
                            onChange={(e) => setQuarterDate(e.target.value || todayISO())}
                        />
                    </label>
                    <button type="button" className="fpy-nav-button" onClick={goNextQuarter} aria-label="Next quarter">
                        {'>'}
                    </button>
                </div>
            </div>

            {quarterError && <div className="fpy-error">{quarterError}</div>}
            {quarterLoading && <div>Loading quarterly FPY...</div>}

            {!quarterLoading && quarterChartConfig && (
                <div className="combined-chart-card">
                    <div className="chart-wrapper">
                        <Bar
                            data={quarterChartConfig.data}
                            options={quarterChartConfig.options}
                            plugins={quarterChartConfig.plugins}
                        />
                    </div>
                    <div className="chart-footnote">
                        {quarterMeta
                            ? `Showing ${quarterWeeks.length} week${quarterWeeks.length === 1 ? '' : 's'} between ${quarterMeta.startISO} and ${quarterMeta.endISO}.`
                            : ''}
                    </div>
                </div>
            )}

            {!quarterLoading && !quarterChartConfig && (
                <div className="fpy-empty-state">
                    {quarterMeta
                        ? `No FPY data found for ${quarterMeta.label}.`
                        : 'Select a quarter to load FPY data.'}
                </div>
            )}

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
