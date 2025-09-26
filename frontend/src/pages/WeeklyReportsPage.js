import React, { useEffect, useMemo, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, PointElement, LineElement } from 'chart.js';
import { getWeeklyShipments } from '../services/apiService';
import './WeeklyReportsPage.css';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, PointElement, LineElement);

const formatISODate = (d) => d.toISOString().split('T')[0];

const getWeekRange = (date) => {
  const dt = new Date(date);
  // Start on Sunday
  const day = dt.getDay();
  const start = new Date(dt);
  start.setDate(dt.getDate() - day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

const colors = [
  '#36A2EB', '#FF6384', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40', '#8BC34A', '#00BCD4', '#9C27B0', '#795548'
];

const WeeklyReportsPage = () => {
  const [selectedDate, setSelectedDate] = useState(formatISODate(new Date()));
  const [numWeeks, setNumWeeks] = useState(4);
  const [chartStyle, setChartStyle] = useState('stacked'); // 'stacked' | 'grouped' | 'horizontal' | 'stackedLine'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [weeksData, setWeeksData] = useState([]); // [{ label, start, end, shipments, totalUnits, typeCounts }]

  const fetchWeeks = async (anchorDateStr, weeksCount = numWeeks) => {
    setLoading(true);
    setError('');
    try {
      const base = new Date(anchorDateStr);
      // last N weeks including week of selected date
      const dateParams = Array.from({ length: weeksCount }, (_, i) => i * 7).map((offset) => {
        const d = new Date(base);
        d.setDate(d.getDate() - offset);
        return formatISODate(d);
      });

      const responses = await Promise.all(dateParams.map((d) => getWeeklyShipments(d)));

      const prepared = responses.map((res) => {
        const { date_range, shipments } = res.data || {};
        const totalUnits = (shipments || []).reduce((sum, s) => sum + (s.total_units || 0), 0);
        // Aggregate type counts
        const typeCounts = {};
        (shipments || []).forEach((s) => {
          (s.shipped_units_summary || []).forEach((t) => {
            typeCounts[t.model_type] = (typeCounts[t.model_type] || 0) + (t.count || 0);
          });
        });
        // Display only the first day (start) of the week
        const label = date_range ? `${date_range.start}` : '';
        return { label, start: date_range?.start, end: date_range?.end, shipments: shipments || [], totalUnits, typeCounts };
      });

      setWeeksData(prepared);
    } catch (e) {
      console.error(e);
      setError('Failed to load weekly data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWeeks(selectedDate, numWeeks);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, numWeeks]);

  const stackedByTypeChart = useMemo(() => {
    const labels = weeksData.map((w) => w.label);
    // Collect a set of all model types across weeks
    const allTypesSet = new Set();
    weeksData.forEach((w) => Object.keys(w.typeCounts).forEach((t) => allTypesSet.add(t)));
    const allTypes = Array.from(allTypesSet);

    const datasets = allTypes.map((type, idx) => ({
      label: type,
      data: weeksData.map((w) => w.typeCounts[type] || 0),
      backgroundColor: colors[idx % colors.length],
      borderColor: '#ffffff',
      borderWidth: 1,
      borderRadius: 6,
      borderSkipped: false,
    }));

    // Optional total line overlay
    if (chartStyle === 'stackedLine') {
      const totals = weeksData.map((w) => w.totalUnits);
      datasets.push({
        type: 'line',
        label: 'Total',
        data: totals,
        borderColor: '#263238',
        backgroundColor: '#263238',
        borderWidth: 2,
        tension: 0.3,
        pointRadius: 3,
        yAxisID: 'y',
      });
    }

    return {
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { usePointStyle: true, pointStyle: 'rectRounded', boxWidth: 16 } },
          title: { display: true, text: 'Weekly Units by Type', font: { size: 16, weight: '600' } },
          tooltip: {
            mode: 'index',
            intersect: false,
            callbacks: {
              footer: (items) => {
                const total = items.reduce((sum, itm) => sum + (itm.parsed.y || 0), 0);
                return `Total: ${total}`;
              }
            },
            footerFont: { weight: '600' }
          }
        },
        scales: {
          x: { stacked: chartStyle === 'stacked' || chartStyle === 'stackedLine', grid: { display: false } },
          y: { stacked: chartStyle === 'stacked' || chartStyle === 'stackedLine', beginAtZero: true, ticks: { precision: 0 }, grid: { color: '#eee' } },
        },
        indexAxis: chartStyle === 'horizontal' ? 'y' : 'x',
        categoryPercentage: 0.7,
        barPercentage: 0.9,
      },
    };
  }, [weeksData, chartStyle]);

  return (
    <div className="weekly-reports-container">
      <div className="weekly-reports-header">
        <h2>Weekly Reports</h2>
        <div className="weekly-reports-controls">
          <label htmlFor="week-anchor">Anchor Date:</label>
          <input
            id="week-anchor"
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
          <label htmlFor="weeks-count" style={{ marginLeft: 8 }}>Weeks:</label>
          <select id="weeks-count" value={numWeeks} onChange={(e) => setNumWeeks(parseInt(e.target.value, 10))}>
            <option value={4}>4</option>
            <option value={6}>6</option>
            <option value={8}>8</option>
            <option value={12}>12</option>
          </select>
        </div>
      </div>

      {error && <div style={{ color: 'red', marginBottom: 8 }}>{error}</div>}
      {loading && <div>Loading weekly data…</div>}

      {!loading && weeksData.length > 0 && (
        <>
          <div className="weekly-summary-grid">
            {weeksData.map((w) => (
              <div key={w.label} className="weekly-summary-card">
                <div style={{ fontWeight: 600 }}>{w.label}</div>
                <div>Total units: {w.totalUnits}</div>
                <div style={{ marginTop: 8, fontSize: 12, color: '#555' }}>
                  Types: {Object.keys(w.typeCounts).length > 0 ? Object.entries(w.typeCounts).map(([k, v]) => `${k} (${v})`).join(', ') : '—'}
                </div>
              </div>
            ))}
          </div>

          <div className="chart-section half-width">
            <div className="chart-card">
              <div className="chart-card-header">
                <div></div>
                <div className="chart-toolbar">
                  <label htmlFor="chart-style">Chart Style:</label>
                  <select id="chart-style" value={chartStyle} onChange={(e) => setChartStyle(e.target.value)}>
                    <option value="stacked">Stacked Bars</option>
                    <option value="grouped">Grouped Bars</option>
                    <option value="horizontal">Horizontal Stacked</option>
                    <option value="stackedLine">Stacked + Total Line</option>
                  </select>
                </div>
              </div>
              <div style={{ height: '70vh', width: '100%' }}>
                <Bar data={stackedByTypeChart.data} options={stackedByTypeChart.options} />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default WeeklyReportsPage;
