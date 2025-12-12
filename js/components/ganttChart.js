let ganttChartInstance = null; // 這是這個檔案私有的變數，外面的人看不到

// 我們把這個「畫圖功能」匯出給工頭用
// 我們增加了 today 這個參數，讓工頭告訴畫家今天是幾號
export function renderGantt(labels, plannedData, actualData, actualColors, today) {
    const ctx = document.getElementById('ganttChart').getContext('2d');
    if (ganttChartInstance) {
        ganttChartInstance.destroy();
    }

    ganttChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '預定進度',
                    data: plannedData,
                    backgroundColor: 'rgba(0, 0, 0, 0.15)',
                    barPercentage: 1.3,
                    categoryPercentage: 0.7
                },
                {
                    label: '實際進度',
                    data: actualData,
                    backgroundColor: actualColors,
                    barPercentage: 0.7,
                    categoryPercentage: 0.7
                }
            ]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: 'time',
                    time: { unit: 'month' },
                    min: '2025-10-27',
                    position: 'top',
                    stacked: false
                },
                y: { stacked: false }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const raw = context.raw;
                            if (!raw || (Array.isArray(raw) && raw.length === 0)) return "無資料";
                            const s = new Date(raw[0]).toLocaleDateString();
                            const e = new Date(raw[1]).toLocaleDateString();
                            return `${context.dataset.label}: ${s} ~ ${e}`;
                        }
                    }
                },
                annotation: {
                    annotations: {
                        todayLine: {
                            type: 'line',
                            scaleID: 'x',
                            value: today.valueOf(), // 這裡使用傳進來的 today
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