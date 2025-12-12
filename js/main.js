// 1. 匯入工具和畫家 (就像在點名)
import { parsePercent, parseDate } from './utils.js';
import { renderGantt } from './components/ganttChart.js';
import { renderSCurve } from './components/sCurveChart.js';

// 2. 設定全域變數
const GOOGLE_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQiyY2STxHEAcJIa_wBeLHRYpGj82dozn-1tCo_ZhltPo-CABMaWOD88K7LLJnXTtW_3IV-k2qZq8HV/pub?output=csv";
const today = new Date();
today.setHours(0, 0, 0, 0);

// 3. 程式進入點：當網頁準備好後，開始工作
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('currentDate').textContent = "今日: " + today.toLocaleDateString();
    
    // 綁定按鈕事件 (這就是用來取代 onclick 的寫法)
    // 意思是：去抓那個按鈕，然後監聽它的 'click' 動作
    document.querySelector('button[onclick*="loadFromGoogle"]').onclick = null; // 清除舊的
    document.querySelector('button[onclick*="loadFromGoogle"]').addEventListener('click', loadFromGoogle);
    
    document.querySelector('button[onclick*="toggleManual"]').onclick = null;
    document.querySelector('button[onclick*="toggleManual"]').addEventListener('click', toggleManual);

    // 手動模式區塊裡的按鈕
    const manualBtn = document.querySelector('#manualSection button.primary');
    manualBtn.onclick = null;
    manualBtn.addEventListener('click', () => {
        const inputVal = document.getElementById('csvInput').value;
        processData(inputVal);
    });

    // 檢查網址並開始下載
    if(GOOGLE_CSV_URL && GOOGLE_CSV_URL.includes("http")) {
        loadFromGoogle();
    } else {
        const msg = document.getElementById('statusMsg');
        msg.textContent = "⚠️ 請先設定 Google CSV 連結";
        msg.style.color = "red";
    }
});

// ---------------- 以下是原本的邏輯函式 (有稍微整理) ----------------

function toggleManual() {
    const el = document.getElementById('manualSection');
    el.style.display = el.style.display === 'block' ? 'none' : 'block';
}

function loadFromGoogle() {
    const msg = document.getElementById('statusMsg');
    msg.textContent = "⏳ 正在從 Google Drive 下載資料...";
    msg.style.color = "#3498db";
    const cacheBuster = GOOGLE_CSV_URL + "&t=" + new Date().getTime();

    // 這裡我們依舊使用全域的 Papa (因為它是用 CDN 載入的)
    Papa.parse(cacheBuster, {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: function(results) {
            msg.textContent = "✅ 資料更新成功 (" + new Date().toLocaleTimeString() + ")";
            msg.style.color = "#27ae60";
            processData(results.data);
        },
        error: function(err) {
            msg.textContent = "❌ 連線失敗，請檢查權限或切換手動模式。";
            msg.style.color = "red";
            console.error("PapaParse 錯誤:", err);
            toggleManual();
        }
    });
}

function processData(data) {
    if (typeof data === 'string') {
        const parseResult = Papa.parse(data, { header: true, skipEmptyLines: true });
        data = parseResult.data;
    }

    if (!data || data.length === 0) {
        console.error("無法處理資料：資料為空或格式錯誤。");
        return;
    }

    // 計算比較日期 (本週一)
    const comparisonDate = new Date(today);
    const dayOfWeek = today.getDay(); 
    const daysToSubtract = (dayOfWeek + 2) % 7; 
    comparisonDate.setDate(today.getDate() - daysToSubtract);
    document.getElementById('plannedSubText').textContent = "截至 " + comparisonDate.toLocaleDateString() + " 應完成";

    // 處理歷史日期
    let minDateOverall = new Date("2099-12-31");
    const dateColumnRegex = /^(\d{4}[\/\-](0?[1-9]|1[0-2])[\/\-](0?[1-9]|[12][0-9]|3[01]))$/;
    const allKeys = data.length > 0 ? Object.keys(data[0]) : [];
    const historicalDateKeys = allKeys
        .filter(key => dateColumnRegex.test(key))
        .sort((a, b) => parseDate(a) - parseDate(b));

    // 找出最新的實際回報日期
    let latestActualDataDateKey = null;
    for (let i = historicalDateKeys.length - 1; i >= 0; i--) {
        const dateKey = historicalDateKeys[i];
        let dailyTotal = 0;
        data.forEach(row => { dailyTotal += parsePercent(row[dateKey]); });
        if (dailyTotal > 0) {
            if(!latestActualDataDateKey) latestActualDataDateKey = dateKey;
        }
    }

    if (latestActualDataDateKey) {
        const latestDate = parseDate(latestActualDataDateKey);
        if (latestDate) {
             document.getElementById('actualSubText').textContent = "截至 " + latestDate.toLocaleDateString() + " 回報";
        }
    } else {
        document.getElementById('actualSubText').textContent = "尚無實際進度回報";
    }
    
    // 準備甘特圖資料
    const ganttLabels = data.map(row => row['任務名稱']).filter(name => name);
    const ganttPlannedData = [];
    const ganttActualData = [];
    let totalPlannedToday = 0;
    
    data.forEach(row => {
        const taskName = row['任務名稱'];
        if (!taskName) return;

        const weight = parsePercent(row['全案權重 (%)']);
        const planStart = parseDate(row['開始時間']);
        const planEnd = parseDate(row['結束日期']);
        
        let plannedContribToday = 0;

        if (planStart && planEnd) {
            if (planStart < minDateOverall) minDateOverall = planStart;

            if (comparisonDate >= planEnd) {
                plannedContribToday = weight;
            } else if (comparisonDate > planStart) {
                const totalDays = (planEnd - planStart) / 86400000;
                const passedDays = (comparisonDate - planStart) / 86400000;
                if (totalDays > 0) plannedContribToday = weight * Math.max(0, passedDays / totalDays);
            }
            ganttPlannedData.push([planStart.valueOf(), planEnd.valueOf()]);
        } else {
            ganttPlannedData.push(null);
        }
        totalPlannedToday += plannedContribToday;

        const actStart = parseDate(row['實際開始時間']);
        const actEnd = parseDate(row['實際完成時間']);
        
        let barColor;
        let actDataPoint = null;

        if (actStart) {
            let drawEnd = actEnd ? actEnd : today;
            actDataPoint = [actStart.valueOf(), drawEnd.valueOf()];
            if (actEnd) {
                barColor = (planEnd && actEnd > planEnd) ? '#c0392b' : '#27ae60';
            } else {
                barColor = (planEnd && today > planEnd) ? '#f39c12' : '#3498db';
            }
        }
        ganttActualData.push({ data: actDataPoint, color: barColor });
    });
    
    const totalActualToday = data.reduce((sum, row) => sum + parsePercent(row['貢獻度 (%)']), 0);
    const finalActualData = ganttActualData.map(d => d.data);
    const finalActualColors = ganttActualData.map(d => d.color || 'transparent');

    // 準備 S-Curve 資料
    const sLabels = [];
    const sPlanned = [];
    const sActual = [];

    if (historicalDateKeys.length > 0) {
        const firstDate = parseDate(historicalDateKeys[0]);
        if (minDateOverall > firstDate) minDateOverall = firstDate;
        // 起始點
        sLabels.push(minDateOverall.valueOf() - 86400000 * 7);
        sPlanned.push(0);
        sActual.push(0);

        historicalDateKeys.forEach(dateKey => {
            const currentDate = parseDate(dateKey);
            if (!currentDate) return;
            sLabels.push(currentDate.valueOf());

            let cumulativePlanned = 0;
            let dailyActualTotal = 0;

            data.forEach(row => {
                if (!row['任務名稱']) return;
                const weight = parsePercent(row['全案權重 (%)']);
                const planStart = parseDate(row['開始時間']);
                const planEnd = parseDate(row['結束日期']);
                if (!planStart || !planEnd) return;
                
                let plannedContrib = 0;
                if (currentDate >= planEnd) {
                    plannedContrib = weight;
                } else if (currentDate > planStart) {
                    const totalDays = (planEnd - planStart) / 86400000;
                    const passedDays = (currentDate - planStart) / 86400000;
                    if (totalDays > 0) plannedContrib = weight * Math.max(0, passedDays / totalDays);
                }
                cumulativePlanned += plannedContrib;
                dailyActualTotal += parsePercent(row[dateKey]);
            });
            
            sPlanned.push(cumulativePlanned.toFixed(2));
            
            if (dailyActualTotal > 0) {
                const cumulativeActual = data.reduce((sum, row) => {
                    return sum + (parsePercent(row[dateKey]) / 100 * parsePercent(row['全案權重 (%)']));
                }, 0);
                sActual.push(cumulativeActual.toFixed(2));
            } else {
                sActual.push(null);
            }
        });
    }
    
    // 更新上方卡片數字
    document.getElementById('plannedVal').textContent = totalPlannedToday.toFixed(2) + '%';
    document.getElementById('actualVal').textContent = totalActualToday.toFixed(2) + '%';
    const variance = totalActualToday - totalPlannedToday;
    const varEl = document.getElementById('varianceVal');
    varEl.textContent = (variance >= 0 ? "+" : "") + variance.toFixed(2) + '%';
    const textEl = document.getElementById('varianceText');
    varEl.className = "value";
    if (variance < -5) { varEl.classList.add("status-red"); textEl.textContent = "⚠ 進度嚴重落後"; } 
    else if (variance >= 0) { varEl.classList.add("status-green"); textEl.textContent = "✨ 進度超前"; }
    else { textEl.textContent = "在可控範圍內"; }

    // ★★★ 呼叫繪圖專員 (記得傳入 today) ★★★
    renderGantt(ganttLabels, ganttPlannedData, finalActualData, finalActualColors, today);
    if(sLabels.length > 0) {
        renderSCurve(sLabels, sPlanned, sActual, today);
    } else {
         console.warn("沒有偵測到任何歷史進度日期欄位，無法繪製 S-Curve。");
    }
}