import React, { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';

const EnergyChart = ({ data, period, chartType }) => {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    if (chartRef.current) chartRef.current.destroy();
    chartRef.current = new Chart(canvasRef.current, {
      type: 'line',
      data: {
        labels: data?.labels || [],
        datasets: [
          {
            label: chartType === 'cost' ? 'Cost' : 'Energy (kWh)',
            data: data?.values || [],
            borderColor: '#00eaff',
            backgroundColor: 'rgba(0,234,255,0.08)',
            fill: true,
            tension: 0.4,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          title: { display: false },
        },
        scales: {
          x: { title: { display: true, text: 'Time' } },
          y: { title: { display: true, text: chartType === 'cost' ? 'Cost (USD)' : 'Energy (kWh)' } },
        },
      },
    });
    return () => { if (chartRef.current) chartRef.current.destroy(); };
  }, [data, chartType]);

  return (
    <div className="chart-container">
      <canvas ref={canvasRef} height={180} />
      <div className="chart-summary">
        <div className="summary-item">
          <span>Total Energy:</span>
          <span>{data?.totalEnergy || '--'} kWh</span>
        </div>
        <div className="summary-item">
          <span>Total Cost:</span>
          <span>{data?.totalCost || '--'} USD</span>
        </div>
      </div>
    </div>
  );
};

export default EnergyChart;
