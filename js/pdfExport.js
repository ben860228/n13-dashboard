
/**
 * PDF Export Logic for Gantt Chart
 * Separated from main.js to maintain cleanliness and safety.
 */

window.exportGanttToPDF = async function () {
    try {
        // 1. Check Libraries
        if (!window.jspdf || !window.html2canvas) {
            alert("PDF 函式庫尚未載入，請稍後再試。");
            return;
        }
        if (!window.ganttDataCache) {
            alert("資料尚未載入完畢，請稍後再試。");
            return;
        }

        const { jsPDF } = window.jspdf;

        // 2. Fetch Project Info
        let pName = document.getElementById('ui-project-name') ? document.getElementById('ui-project-name').textContent : "Project";

        // Fetch Stats
        const pVal = document.getElementById('plannedVal') ? document.getElementById('plannedVal').innerText : "--%";
        const aVal = document.getElementById('actualVal') ? document.getElementById('actualVal').innerText : "--%";
        const vVal = document.getElementById('varianceVal') ? document.getElementById('varianceVal').innerText : "--%";
        const vText = document.getElementById('varianceText') ? document.getElementById('varianceText').innerText : "";

        // --- Date Logic Update ---
        // 1. Extract Report Date
        const actualDateStrRaw = document.getElementById('actualDateStr') ? document.getElementById('actualDateStr').innerText : "";
        const dateMatch = actualDateStrRaw.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);

        let reportDateObj = new Date();
        let reportDateStr = "";

        if (dateMatch) {
            const y = parseInt(dateMatch[1]);
            const m = parseInt(dateMatch[2]) - 1;
            const d = parseInt(dateMatch[3]);
            reportDateObj = new Date(y, m, d);
            const mmStr = String(m + 1).padStart(2, '0');
            const ddStr = String(d).padStart(2, '0');
            reportDateStr = `${y}/${mmStr}/${ddStr}`;
        } else {
            const now = new Date();
            const y = now.getFullYear();
            const m = now.getMonth();
            const d = now.getDate();
            const mmStr = String(m + 1).padStart(2, '0');
            const ddStr = String(d).padStart(2, '0');
            reportDateStr = `${y}/${mmStr}/${ddStr}`;
            reportDateObj = now;
        }

        // --- Data Clamping Logic (User Request #1) ---
        // Deep copy actual data to avoid mutating global cache
        // Clamp End Date to reportDateObj
        const { labels, planned, actual, colors, styles } = window.ganttDataCache;

        const reportTime = reportDateObj.valueOf();

        // Create Clamped Actual Data
        const clampedActual = actual.map(item => {
            if (!item) return null; // No data
            const start = item[0];
            const end = item[1];

            if (start >= reportTime) {
                // Started after report date -> Hide completely
                return null;
            }
            if (end > reportTime) {
                // Ends after report date -> Clamp end to report date
                return [start, reportTime];
            }
            // Fully before report date -> Keep as is
            return item;
        });

        // Timestamp
        const now = new Date();
        const fYYYY = now.getFullYear();
        const fMM = String(now.getMonth() + 1).padStart(2, '0');
        const fDD = String(now.getDate()).padStart(2, '0');
        const fHH = String(now.getHours()).padStart(2, '0');
        const fMin = String(now.getMinutes()).padStart(2, '0');

        const exportTimeStr = `${fYYYY}/${fMM}/${fDD} ${fHH}:${fMin}`;
        const filename = `${pName}-甘特圖報表-${fYYYY}${fMM}${fDD}_${fHH}${fMin}.pdf`;

        // 3. Render High-Res Chart
        // Target: A4 Landscape Aspect Ratio ~1.414 (297/210)
        // To ensure "Full Width" (no side bars), our Image Aspect Ratio must be >= 1.414.
        // If Image is "taller" (Ratio < 1.414), jsPDF fits by height -> Side Bars.
        // We calculate required width to force Ratio >= 1.42.

        // Estimate Height first
        const itemHeight = 52; // Compact height
        const itemCount = window.ganttDataCache.labels.length;
        let tempHeight = itemCount * itemHeight + 200; // Chart Height
        if (tempHeight < 2000) tempHeight = 2000;

        // Header/Footer allowance in Wrapper ~250px? 
        // Actually tempHeight is just the CANVAS height. 
        // The Wrapper adds Header (~200px) + Footer (~100px) + Padding (~40px).
        // Total Wrapper Height ~= tempHeight + 350.
        const totalWrapperHeightEst = tempHeight + 350;

        // Dynamic Width Calculation
        // We want (Width / TotalHeight) >= 1.415
        // Width >= TotalHeight * 1.415
        const minWidthForFullPage = Math.ceil(totalWrapperHeightEst * 1.42);
        const exportWidth = Math.max(3508, minWidthForFullPage); // At least 300DPI A4 Width

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = exportWidth;
        tempCanvas.height = tempHeight;
        tempCanvas.style.display = 'none';
        document.body.appendChild(tempCanvas);

        const ctx = tempCanvas.getContext('2d');
        // NOTE: We override 'today' with 'reportDateObj' for the line position

        const hiResChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: '預定進度',
                        data: planned,
                        backgroundColor: function (context) {
                            const index = context.dataIndex;
                            const pRaw = context.raw;
                            if (!pRaw) return '#f4f4f4';
                            const pStart = pRaw[0];
                            const reportTime = reportDateObj.valueOf();
                            const actRaw = clampedActual[index]; // Use Clamped for logic check availability

                            if (pStart > reportTime) return '#e8e8e8';
                            if (actRaw && actRaw[1] < reportTime) return '#f8f8f8';
                            return '#cccccc';
                        },
                        borderWidth: 0,
                        barPercentage: 1.3,
                        categoryPercentage: 0.7
                    },
                    {
                        label: '實際進度',
                        data: clampedActual, // Use Clamped Data
                        backgroundColor: colors,
                        barPercentage: 0.7,
                        categoryPercentage: 0.7
                    }
                ]
            },
            options: {
                indexAxis: 'y',
                responsive: false,
                animation: false,
                maintainAspectRatio: false,
                layout: {
                    padding: 0
                },
                scales: {
                    x: {
                        type: 'time',
                        time: { unit: 'month', displayFormats: { month: 'yy/MM' } },
                        min: '2025-10-01',
                        position: 'top',
                        grid: { color: '#f0f0f0' },
                        ticks: { font: { size: 38 } } // Scaled Font used 38
                    },
                    y: {
                        grid: { display: false },
                        ticks: {
                            color: function (context) {
                                const style = styles[context.index];
                                return style ? style.color : '#666';
                            },
                            font: function (context) {
                                const style = styles[context.index];
                                return { size: 42, weight: style ? style.weight : 'normal' }; // Scaled Font used 42
                            }
                        }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: { enabled: false },
                    annotation: {
                        annotations: {
                            todayLine: {
                                type: 'line',
                                scaleID: 'x',
                                value: reportDateObj.valueOf(), // Set line to Report Date
                                borderColor: '#e74c3c',
                                borderWidth: 6, // Thicker line for Hi-Res 
                                borderDash: [15, 15],
                                label: {
                                    content: '',
                                    display: false
                                }
                            }
                        }
                    }
                }
            }
        });

        await new Promise(r => setTimeout(r, 100));
        const highResImgData = tempCanvas.toDataURL('image/png', 1.0);

        hiResChart.destroy();
        document.body.removeChild(tempCanvas);

        // 4. Create Layout
        const exportDiv = document.createElement('div');
        exportDiv.id = 'pdf-export-wrapper';

        exportDiv.style.position = 'absolute';
        exportDiv.style.left = '-9999px';
        exportDiv.style.top = '0';
        exportDiv.style.width = exportWidth + 'px'; // Dynamic Width
        exportDiv.style.backgroundColor = '#ffffff';
        exportDiv.style.color = '#000000';
        exportDiv.style.padding = '30px';
        // Updated Font Family: Arial for English, JhengHei for Chinese
        exportDiv.style.fontFamily = '"Arial", "Microsoft JhengHei", sans-serif';
        exportDiv.style.display = 'flex';
        exportDiv.style.flexDirection = 'column';

        // Header Content based on exportWidth scale
        // If width is huge, these pixels might look small, but we stuck to roughly 3500px base scale fonts.
        // We bumped chart fonts. Let's bump Header fonts slightly too.

        let badgeColor = '#95a5a6';
        if (vText.includes('落後')) badgeColor = '#c0392b';
        else if (vText.includes('超前')) badgeColor = '#27ae60';

        const headerHtml = `
            <div style="border-bottom: 5px solid #333; padding-bottom: 15px; margin-bottom: 25px;">
                <div style="display:flex; justify-content:space-between; align-items:flex-end;">
                    <div style="flex: 1;">
                         <div style="font-size: 72px; font-weight: bold; margin-bottom: 20px;">
                            ${pName} 甘特圖進度報告 <span style="font-size: 54px; margin-left: 20px; color: #444;">${reportDateStr}</span>
                        </div>
                        
                        <!-- Stats Row -->
                        <div style="display:flex; gap: 60px; font-size: 40px; color: #444; align-items: center; margin-bottom: 5px;">
                            <div>預定: <span style="font-weight:bold">${pVal}</span></div>
                            <div>實際: <span style="font-weight:bold">${aVal}</span></div>
                            <div>差異: <span style="font-weight:bold; color: ${vText.includes('落後') ? 'red' : vText.includes('超前') ? 'green' : '#666'}">${vVal}</span> 
                                 <span style="font-size: 36px; color:white; background:${badgeColor}; padding: 5px 20px; border-radius: 10px; margin-left: 10px;">${vText}</span>
                            </div>
                        </div>
                    </div>

                    <div style="text-align:right;">
                        <img src="images/LOGO-WITHNAME-BLUE-HUNDE.png" style="height: 160px; display: block; margin-left: auto;">
                    </div>
                </div>
            </div>
            
            <!-- Export Time Right Below Line -->
            <div style="text-align:right; font-size: 32px; color: #666; margin-top: -10px; margin-bottom: 20px;">
                由經一綠能專案管理平台 ${exportTimeStr} 匯出
            </div>
        `;

        const legendHtml = `
            <div style="display:flex; gap: 30px; align-items:center; font-size: 28px;">
                <div style="display:flex; align-items:center; gap: 8px;">
                    <div style="width: 30px; height: 30px; background-color: #27ae60; border-radius: 4px;"></div>
                    <span>已完成</span>
                </div>
                <div style="display:flex; align-items:center; gap: 8px;">
                    <div style="width: 30px; height: 30px; background-color: #3498db; border-radius: 4px;"></div>
                    <span>進行中</span>
                </div>
                <div style="display:flex; align-items:center; gap: 8px;">
                    <div style="width: 30px; height: 30px; background-color: #f39c12; border-radius: 4px;"></div>
                    <span>進行中(落後)</span>
                </div>
                <div style="display:flex; align-items:center; gap: 8px;">
                    <div style="width: 30px; height: 30px; background-color: #e74c3c; border-radius: 4px;"></div>
                    <span>尚未啟動而落後</span>
                </div>
            </div>
        `;

        const footerHtml = `
            <div style="margin-top: auto; border-top: 3px solid #ccc; padding-top: 20px; display:flex; justify-content:flex-end; gap: 60px; align-items: center; color: #666; font-size: 32px;">
                <div>${legendHtml}</div>
                <div>備註：進度每週五更新</div>
            </div>
        `;

        exportDiv.innerHTML = headerHtml;

        const chartImg = document.createElement('img');
        chartImg.src = highResImgData;
        chartImg.style.width = '100%';
        chartImg.style.height = 'auto';
        chartImg.style.marginBottom = '20px';

        const bodyDiv = document.createElement('div');
        bodyDiv.style.flex = '1';
        bodyDiv.appendChild(chartImg);
        exportDiv.appendChild(bodyDiv);
        exportDiv.insertAdjacentHTML('beforeend', footerHtml);

        document.body.appendChild(exportDiv);

        // 5. Capture & Save
        const canvas = await window.html2canvas(exportDiv, {
            scale: 1, // Native 300 DPI size (3508px wide)
            useCORS: true,
            logging: false
        });

        const pdf = new jsPDF('l', 'mm', 'a4');
        const imgParams = pdf.getImageProperties(canvas.toDataURL('image/jpeg', 0.90));
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();

        const rRatio = imgParams.width / imgParams.height;
        const pdfRatio = pdfWidth / pdfHeight;

        let w, h;
        if (rRatio > pdfRatio) {
            w = pdfWidth;
            h = pdfWidth / rRatio;
        } else {
            h = pdfHeight;
            w = pdfHeight * rRatio;
        }

        const x = (pdfWidth - w) / 2;
        const y = (pdfHeight - h) / 2;

        pdf.addImage(imgParams.data, 'JPEG', x, y, w, h);
        pdf.save(filename);
        document.body.removeChild(exportDiv);

    } catch (err) {
        console.error("PDF Export Fail:", err);
        alert("匯出錯誤: " + err.message);
        const wrapper = document.getElementById('pdf-export-wrapper');
        if (wrapper) document.body.removeChild(wrapper);
    }
};
