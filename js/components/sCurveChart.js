let sCurveInstance = null;

export function renderSCurve(labels, plannedData, actualData, today) {
    const ctx = document.getElementById('sCurveChart').getContext('2d');
    if (sCurveInstance) {
        sCurveInstance.destroy();
    }
    sCurveInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                { 
                    label: '預定進度', 
                    data: plannedData, 
                    borderColor: '#95a5a6', 
                    borderWidth: 2, 
                    pointRadius: 0, 
                    fill: false, 
                    tension: 0.4 
                },
                { 
                    label: '實際進度', 
                    data: actualData, 
                    borderColor: '#3498db', 
                    borderWidth: 3, 
                    pointRadius: 2, 
                    fill: 'start', 
                    backgroundColor: 'rgba(52, 152, 219, 0.1)', 
                    spanGaps: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { 
                x: { type: 'time', time: { unit: 'month' } }, 
                y: { min: 0, max: 100, title: { display: true, text: '累積進度 (%)' } }
            },
            plugins: {
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        title: function(context) {
                            return new Date(context[0].parsed.x).toLocaleDateString();
                        },
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) { label += ': '; }
                            if (context.parsed.y !== null) { label += context.parsed.y + '%'; }
                            return label;
                        }
                    }
                },
                legend: { position: 'bottom' },
                annotation: {
                    annotations: {
                        todayLine: {
                            type: 'line',
                            scaleID: 'x',
                            value: today.valueOf(),
                            borderColor: 'red',
                            borderWidth: 1,
                            label: {
                                content: ['今日', today.toLocaleDateString()],
                                enabled: true,
                                position: 'start',
                                backgroundColor: 'rgba(255, 0, 0, 0.8)',
                                font: { size: 10 }
                            }
                        }
                    }
                }
            }
        }
    });
}