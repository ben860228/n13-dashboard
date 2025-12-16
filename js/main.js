import { parsePercent, parseDate } from './utils.js';
import { renderGantt } from './components/ganttChart.js';
import { renderSCurve } from './components/sCurveChart.js';

// ★★★ 已填入您提供的連結 ★★★
const TASKS_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQiyY2STxHEAcJIa_wBeLHRYpGj82dozn-1tCo_ZhltPo-CABMaWOD88K7LLJnXTtW_3IV-k2qZq8HV/pub?gid=0&single=true&output=csv";
const PROJECT_INFO_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQiyY2STxHEAcJIa_wBeLHRYpGj82dozn-1tCo_ZhltPo-CABMaWOD88K7LLJnXTtW_3IV-k2qZq8HV/pub?gid=1735843667&single=true&output=csv";
// ★★★ New Bulletin CSV URL ★★★
const BULLETIN_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQiyY2STxHEAcJIa_wBeLHRYpGj82dozn-1tCo_ZhltPo-CABMaWOD88K7LLJnXTtW_3IV-k2qZq8HV/pub?gid=479280600&single=true&output=csv";
// Note: User provided this URL.

const today = new Date();
today.setHours(0, 0, 0, 0);

document.addEventListener('DOMContentLoaded', () => {
    const elDate = document.getElementById('currentDate');
    if (elDate) elDate.textContent = "今日: " + today.toLocaleDateString();

    const btnRefresh = document.querySelector('button[onclick*="loadFromGoogle"]');
    if (btnRefresh) { btnRefresh.onclick = null; btnRefresh.addEventListener('click', loadFromGoogle); }

    const btnManual = document.querySelector('button[onclick*="toggleManual"]');
    if (btnManual) { btnManual.onclick = null; btnManual.addEventListener('click', toggleManual); }

    if (TASKS_CSV_URL && TASKS_CSV_URL.includes("http")) {
        loadFromGoogle();
    } else {
        const msg = document.getElementById('statusMsg');
        if (msg) msg.textContent = "⚠️ 請先設定 CSV 連結";
    }

    initTooltipOverlay();
});

window.toggleManual = function () {
    const el = document.getElementById('manualSection');
    el.style.display = el.style.display === 'block' ? 'none' : 'block';
}
window.parseManual = function () { processData(document.getElementById('csvInput').value, null); }

function getLastFriday(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = (day - 5 + 7) % 7;
    d.setDate(d.getDate() - diff);
    return d;
}

window.loadFromGoogle = async function () {
    const msg = document.getElementById('statusMsg');
    if (msg) {
        msg.textContent = "⏳ 更新中...";
        msg.style.color = "#3498db";
    }
    const cacheBuster = "&t=" + new Date().getTime();

    try {
        let taskCsvText = null;
        try {
            const taskRes = await fetch(TASKS_CSV_URL + cacheBuster);
            if (!taskRes.ok) throw new Error("任務 CSV 下載失敗");
            taskCsvText = await taskRes.text();
        } catch (e) {
            throw new Error("無法讀取【任務清單 CSV】");
        }

        let infoCsvText = null;
        if (PROJECT_INFO_CSV_URL && PROJECT_INFO_CSV_URL.includes("http")) {
            try {
                const infoRes = await fetch(PROJECT_INFO_CSV_URL + cacheBuster);
                if (infoRes.ok) infoCsvText = await infoRes.text();
            } catch (e) {
                console.warn("專案資訊讀取失敗");
            }
        }

        if (msg) {
            msg.textContent = "✅ 更新成功";
            msg.style.color = "#2E7D32";
        }

        processData(taskCsvText, infoCsvText);

        // ★★★ 3. Bulletin Data ★★★
        if (BULLETIN_CSV_URL) {
            try {
                const bullRes = await fetch(BULLETIN_CSV_URL + cacheBuster);
                if (bullRes.ok) {
                    const bullCsv = await bullRes.text();
                    processBulletinData(bullCsv);
                }
            } catch (e) {
                console.warn("Bulletin read fail:", e);
                // Don't block main dashboard if bulletin fails
                document.getElementById('bulletin-list').innerHTML = "<div style='text-align:center; padding:10px; color:#e74c3c;'>讀取失敗</div>";
            }
        }

    } catch (err) {
        if (msg) {
            msg.textContent = "❌ " + err.message;
            msg.style.color = "red";
        }
        console.error(err);
    }
}

function processData(taskCsv, infoCsv) {
    if (!taskCsv) return;
    const taskData = Papa.parse(taskCsv, { header: true, skipEmptyLines: true }).data;

    if (!taskData || taskData.length === 0) {
        alert("任務 CSV 內容為空");
        return;
    }

    let projectInfo = {
        code: "專案代號", name: "專案名稱", government: "--", location: "--",
        designer: "--", contractor: "--", boss: "--", sponsor: "--"
    };

    if (infoCsv) {
        const infoData = Papa.parse(infoCsv, { header: false, skipEmptyLines: true }).data;
        infoData.forEach(row => {
            if (row.length >= 2) {
                const key = row[0].trim();
                const val = row[1].trim();
                if (key === 'ProjectCode') projectInfo.code = val;
                if (key === 'ProjectName') projectInfo.name = val;
                if (key === 'Government') projectInfo.government = val;
                if (key === 'Location') projectInfo.location = val;
                if (key === 'Designer') projectInfo.designer = val;
                if (key === 'Contractor') projectInfo.contractor = val;
                if (key === 'ProjectBoss') projectInfo.boss = val;
                if (key === 'ProjectSponsor') projectInfo.sponsor = val;
            }
        });
    }

    const setTxt = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
    setTxt('ui-project-name', projectInfo.name);
    setTxt('ui-location', projectInfo.location);
    setTxt('ui-government', projectInfo.government);
    setTxt('ui-designer', projectInfo.designer);
    setTxt('ui-contractor', projectInfo.contractor);
    setTxt('ui-boss', projectInfo.boss);
    setTxt('ui-sponsor', projectInfo.sponsor);
    setTxt('sCurveHeader', `${projectInfo.code} S-Curve`);
    setTxt('ganttHeader', `${projectInfo.code} 專案整體進度甘特圖`);


    // --- 2. S-Curve 與日期計算 ---
    let minDateOverall = new Date("2099-12-31");
    const dateColumnRegex = /^(\d{4}[\/\-](0?[1-9]|1[0-2])[\/\-](0?[1-9]|[12][0-9]|3[01]))$/;
    const allKeys = Object.keys(taskData[0]);
    let historicalDateKeys = allKeys.filter(key => dateColumnRegex.test(key)).sort((a, b) => parseDate(a) - parseDate(b));

    // --- 修正：根據已知的最晚「結束日期」截斷 X 軸 ---
    let maxPlannedEnd = 0;
    taskData.forEach(r => {
        const pe = parseDate(r['結束日期']);
        if (pe && pe.valueOf() > maxPlannedEnd) maxPlannedEnd = pe.valueOf();
    });

    if (maxPlannedEnd > 0) {
        // 設定緩衝 30 天
        const cutoffTime = maxPlannedEnd + (30 * 86400000);
        historicalDateKeys = historicalDateKeys.filter(k => {
            const kd = parseDate(k);
            return kd && kd.valueOf() <= cutoffTime;
        });
    }

    // --- 日期判斷 ---
    const plannedDateObj = getLastFriday(today);
    const pStr = `${plannedDateObj.getFullYear()}/${(plannedDateObj.getMonth() + 1).toString().padStart(2, '0')}/${plannedDateObj.getDate().toString().padStart(2, '0')}`;
    setTxt('plannedDateStr', `${pStr} 已更新`);

    // 找出最後一個有資料的日期 (cutoff)
    let lastFilledDateStr = "--/--/--";
    historicalDateKeys.forEach(dateKey => {
        const hasData = taskData.some(row => {
            const val = row[dateKey];
            return val !== undefined && val !== null && val.trim() !== "";
        });
        if (hasData) {
            lastFilledDateStr = dateKey;
        }
    });
    setTxt('actualDateStr', `${lastFilledDateStr} 已回報`);

    const actualCutoffDate = parseDate(lastFilledDateStr);


    // --- S-Curve 計算 ---
    const sLabels = []; const sPlanned = []; const sActual = [];
    let taskProgressState = {};

    // ★★★ 建立資料對照表 (用於同步圖卡數值) ★★★
    // Key: 日期字串 (如 2025/12/12), Value: { p: 9.04, a: 6.04 }
    let sCurveDataMap = {};

    if (historicalDateKeys.length > 0) {
        const firstDate = parseDate(historicalDateKeys[0]);
        if (minDateOverall > firstDate) minDateOverall = firstDate;
        sLabels.push(minDateOverall.valueOf() - 86400000 * 7);
        sPlanned.push(0); sActual.push(0);

        historicalDateKeys.forEach(dateKey => {
            const currentDate = parseDate(dateKey);
            sLabels.push(currentDate.valueOf());

            // 1. 預定進度
            let cumulativePlanned = 0;
            taskData.forEach(row => {
                if (!row['任務名稱']) return;
                const weight = parsePercent(row['全案權重 (%)']);
                const planStart = parseDate(row['開始時間']);
                const planEnd = parseDate(row['結束日期']);
                if (planStart && planEnd) {
                    if (currentDate >= planEnd) cumulativePlanned += weight;
                    else if (currentDate > planStart) {
                        const totalDays = (planEnd - planStart) / 86400000;
                        const passedDays = (currentDate - planStart) / 86400000;
                        if (totalDays > 0) cumulativePlanned += weight * (passedDays / totalDays);
                    }
                }
            });
            sPlanned.push(cumulativePlanned.toFixed(2));

            // 2. 實際進度
            let dailyTotalActual = null;
            if (actualCutoffDate && currentDate <= actualCutoffDate) {
                dailyTotalActual = 0;
                taskData.forEach((row, index) => {
                    const weight = parsePercent(row['全案權重 (%)']);
                    const rawVal = row[dateKey];
                    if (rawVal !== undefined && rawVal !== null && rawVal.trim() !== "") {
                        taskProgressState[index] = parsePercent(rawVal);
                    }
                    const currentTaskProgress = taskProgressState[index] || 0;
                    dailyTotalActual += (currentTaskProgress / 100 * weight);
                });
                sActual.push(dailyTotalActual.toFixed(2));
            } else {
                sActual.push(null);
            }

            // ★★★ 記錄這一天算出來的數值 ★★★
            sCurveDataMap[dateKey] = {
                planned: cumulativePlanned.toFixed(2),
                actual: dailyTotalActual !== null ? dailyTotalActual.toFixed(2) : null
            };
        });
    }

    // --- 3. 數據與任務清單 ---
    // (這裡保留原有的 taskData 迴圈，用於產生甘特圖和列表，但不依賴其計算總分來顯示圖卡)
    // 為了安全起見，我們還是算一下，當作「沒有對應到日期」時的備案

    let totalPlannedToday = 0;
    let totalActualToday = 0;

    const ganttLabels = []; const ganttPlannedData = []; const ganttActualRaw = []; const ganttTaskStyles = [];
    const categories = ['行政', '設計', '施工'];
    const ongoingTasks = { '行政': [], '設計': [], '施工': [] };
    const allUpcomingTasks = [];
    const fmtDate = (d) => d ? d.toLocaleDateString('zh-TW') : '???';

    taskData.forEach((row, index) => {
        const taskName = row['任務名稱'];
        if (!taskName) return;

        let cat = row['分類'] ? row['分類'].trim() : '施工';
        if (!categories.includes(cat)) cat = '施工';

        const weight = parsePercent(row['全案權重 (%)']);
        const planStart = parseDate(row['開始時間']);
        const planEnd = parseDate(row['結束日期']);
        const actStart = parseDate(row['實際開始時間']);
        const actEnd = parseDate(row['實際完成時間']);

        // 預定進度備案計算
        if (planStart && planEnd) {
            if (today >= planEnd) totalPlannedToday += weight;
            else if (today > planStart) {
                const totalDays = (planEnd - planStart) / 86400000;
                const passedDays = (today - planStart) / 86400000;
                totalPlannedToday += weight * (passedDays / totalDays);
            }
        }

        // 實際進度備案計算
        const currentTaskProgress = taskProgressState[index] || 0;
        totalActualToday += (currentTaskProgress / 100 * weight);

        // 甘特圖資料準備
        ganttLabels.push(taskName);
        ganttPlannedData.push(planStart && planEnd ? [planStart.valueOf(), planEnd.valueOf()] : null);

        let barColor = '#3498db'; let labelStyle = { color: '#666', weight: 'normal' };
        let actDataPoint = null;
        let isDelayed = false;

        if (actStart) {
            let drawEnd = actEnd ? actEnd : today;
            actDataPoint = [actStart.valueOf(), drawEnd.valueOf()];
            if (actEnd) {
                barColor = (planEnd && actEnd > planEnd) ? '#c0392b' : '#27ae60';
                labelStyle.color = '#bdc3c7';
            } else {
                if (planEnd && today > planEnd) {
                    barColor = '#f39c12'; labelStyle = { color: '#e74c3c', weight: 'bold' }; isDelayed = true;
                } else {
                    barColor = '#3498db'; labelStyle = { color: '#2c3e50', weight: 'bold' };
                }
            }
        } else if (planStart && today > planStart) {
            actDataPoint = [planStart.valueOf(), today.valueOf()];
            barColor = '#ff0000'; labelStyle = { color: '#ff0000', weight: 'bold' }; isDelayed = true;
        }

        ganttActualRaw.push({ data: actDataPoint, color: barColor });
        ganttTaskStyles.push(labelStyle);

        const pStr = planStart && planEnd ? `${fmtDate(planStart)} ~ ${fmtDate(planEnd)}` : '未定';
        let aStr = "尚未啟動";
        if (actStart) {
            if (actEnd) aStr = `${fmtDate(actStart)} ~ ${fmtDate(actEnd)}`;
            else aStr = `${fmtDate(actStart)} ~ 進行中`;
        }

        const tipText = `【${taskName}】\n預定：${pStr}\n實際：${aStr}`;

        const tObj = { name: taskName, delayed: isDelayed, cat: cat, tip: tipText };

        if ((actStart && !actEnd) || (!actStart && planStart && today > planStart)) {
            ongoingTasks[cat].push(tObj);
        } else if (!actStart && planStart && planStart > today && (planStart - today) < (14 * 86400000)) {
            allUpcomingTasks.push(tObj);
        }
    });

    // ★★★ 最終數值決定 (強制同步邏輯) ★★★

    // 1. 預定進度
    let finalPlannedVal = totalPlannedToday.toFixed(2);
    // 檢查：如果「預定日期(pStr)」在 S-Curve 裡有資料，直接用 S-Curve 的值
    // pStr 格式是 yyyy/mm/dd (補零)，必須確保 key 格式一致。csv通常也是補零的。
    if (sCurveDataMap[pStr]) {
        finalPlannedVal = sCurveDataMap[pStr].planned;
    }
    setTxt('plannedVal', finalPlannedVal + '%');

    // 2. 實際進度
    let finalActualVal = totalActualToday.toFixed(2);
    // 檢查：如果「實際回報日(lastFilledDateStr)」在 S-Curve 裡有資料
    if (sCurveDataMap[lastFilledDateStr]) {
        // 且該值不是 null
        if (sCurveDataMap[lastFilledDateStr].actual !== null) {
            finalActualVal = sCurveDataMap[lastFilledDateStr].actual;
        }
    }
    setTxt('actualVal', finalActualVal + '%');


    // 3. 差異計算
    const variance = parseFloat(finalActualVal) - parseFloat(finalPlannedVal);
    const elVar = document.getElementById('varianceVal');
    const elBadge = document.getElementById('varianceText');
    if (elVar) elVar.textContent = (variance > 0 ? "+" : "") + variance.toFixed(2) + '%';

    if (elVar && elBadge) {
        if (variance < -5) {
            elVar.className = "s-value text-red"; elBadge.className = "badge bg-red"; elBadge.textContent = "落後";
        } else if (variance >= 0) {
            elVar.className = "s-value text-green"; elBadge.className = "badge bg-green"; elBadge.textContent = "超前";
        } else {
            elVar.className = "s-value"; elBadge.className = "badge"; elBadge.textContent = "可控";
        }
    }

    categories.forEach(cat => {
        renderTaskList(`ongoing-${cat}`, ongoingTasks[cat]);
    });
    renderTaskList('upcoming-all', allUpcomingTasks);

    const finalActualData = ganttActualRaw.map(d => d.data);
    const finalActualColors = ganttActualRaw.map(d => d.color);

    if (sLabels.length > 0) renderSCurve(sLabels, sPlanned, sActual, today);
    renderGantt(ganttLabels, ganttPlannedData, finalActualData, finalActualColors, today, ganttTaskStyles);

    attachTaskCardEvents();
}

function renderTaskList(elementId, tasks) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.innerHTML = "";
    if (tasks.length === 0) {
        if (elementId === 'upcoming-all') el.innerHTML = "<div style='color:#ccc; text-align:center; margin-top:10px;'>無近期任務</div>";
        return;
    }

    tasks.forEach(t => {
        const div = document.createElement('div');
        div.className = `task-item cat-${t.cat}`;
        if (t.delayed) div.classList.add('item-delayed');

        let html = "";
        if (t.cat === '施工') {
            if (t.name.includes('機') || t.name.includes('電')) html += `<span class="tag tag-mep">機</span>`;
            else html += `<span class="tag tag-civil">土</span>`;
        }
        html += t.name;

        div.setAttribute('data-tooltip', t.tip);
        div.innerHTML = html;
        el.appendChild(div);
    });
}

function initTooltipOverlay() {
    if (!document.getElementById('mobile-tooltip-overlay')) {
        const overlay = document.createElement('div');
        overlay.id = 'mobile-tooltip-overlay';
        document.body.appendChild(overlay);
    }
}

function attachTaskCardEvents() {
    const overlay = document.getElementById('mobile-tooltip-overlay');
    const items = document.querySelectorAll('.task-item');
    let timer = null;

    if (!overlay) return;

    items.forEach(item => {
        item.addEventListener('click', (e) => {
            if (window.innerWidth > 900) return;
            const text = item.getAttribute('data-tooltip');
            if (!text) return;
            overlay.textContent = text;
            overlay.classList.add('show');
            overlay.style.top = '';
            overlay.style.left = '';
            overlay.style.bottom = '20px';
            overlay.style.transform = 'translateX(-50%)';
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => { overlay.classList.remove('show'); }, 3000);
        });

        item.addEventListener('mouseenter', (e) => {
            if (window.innerWidth <= 900) return;
            const text = item.getAttribute('data-tooltip');
            if (!text) return;
            overlay.textContent = text;
            overlay.classList.add('show');
            updateOverlayPosition(e, overlay);
        });

        item.addEventListener('mousemove', (e) => {
            if (window.innerWidth <= 900) return;
            updateOverlayPosition(e, overlay);
        });

        item.addEventListener('mouseleave', () => {
            if (window.innerWidth <= 900) return;
            overlay.classList.remove('show');
        });
    });
}

function updateOverlayPosition(e, overlay) {
    overlay.style.bottom = 'auto';
    overlay.style.left = (e.clientX + 15) + 'px';
    overlay.style.top = (e.clientY + 15) + 'px';
    overlay.style.transform = 'none';
}


// --- Bulletin Logic ---

function parseGoogleFormsTimestamp(ts) {
    if (!ts) return new Date(0);
    // Format: 2025/12/16 上午 8:00:00
    // Try native parse first
    let d = new Date(ts);
    if (!isNaN(d.valueOf())) return d;

    // Custom parse for Chinese AM/PM
    // Remove "上午" or "下午" and track it
    let isPM = ts.includes("下午");
    let isAM = ts.includes("上午");
    let cleanTs = ts.replace("上午", "").replace("下午", "").trim();
    // cleanTs likely: 2025/12/16 8:00:00

    d = new Date(cleanTs);
    if (!isNaN(d.valueOf())) {
        if (isPM && d.getHours() < 12) d.setHours(d.getHours() + 12);
        if (isAM && d.getHours() === 12) d.setHours(0); // 12:00 AM is 0:00
        return d;
    }
    return new Date(0);
}

function processBulletinData(csvText) {
    if (!csvText) return;
    const results = Papa.parse(csvText, { header: true, skipEmptyLines: true }).data;

    const validItems = results.filter(r => r['Content'] || r['內容']);

    // Sort descending by Timestamp
    // Sort Logic: 
    // 1. Date (Descending) - Prioritize the "Event Date"
    // 2. Timestamp (Descending) - Then by "Submission Time"
    validItems.sort((a, b) => {
        // 1. Primary: Date
        const dateAStr = a['Date'] || a['日期'] || '';
        const dateBStr = b['Date'] || b['日期'] || '';
        const dValA = new Date(dateAStr).getTime() || 0;
        const dValB = new Date(dateBStr).getTime() || 0;

        if (dValB !== dValA) {
            return dValB - dValA; // Newer date first
        }

        // 2. Secondary: Timestamp
        const tA = a['Timestamp'] || a['時間戳記'] || '';
        const tB = b['Timestamp'] || b['時間戳記'] || '';
        const tsA = parseGoogleFormsTimestamp(tA).getTime();
        const tsB = parseGoogleFormsTimestamp(tB).getTime();

        return tsB - tsA; // Newer submission first
    });

    renderBulletinList(validItems);
}

function renderBulletinList(items) {
    const container = document.getElementById('bulletin-list');
    if (!container) return;
    container.innerHTML = "";

    if (items.length === 0) {
        container.innerHTML = "<div style='text-align:center; padding:20px; color:#ccc;'>尚無訊息</div>";
        return;
    }

    items.forEach(item => {
        // Safe get value
        const dateStr = item['Date'] || item['日期'] || '--/--';
        const author = item['Author'] || item['作者'] || 'Unknown';
        const type = item['Type'] || item['類型'] || '一般';
        const itemVal = item['Item'] || item['工項'] || item['Item (Work Item)'] || '';
        // Fix: Get Category correctly
        const category = item['Category'] || item['分類'] || '';

        // ...

        let content = item['Content'] || item['內容'] || '';

        // Skip if empty content
        if (!content.trim()) return;

        // Content plain (Revert prepend)
        content = content.replace(/\n/g, '<br>');

        const div = document.createElement('div');
        div.className = 'bulletin-item';

        const isBoss = (type === '主管訊息' || type === 'Boss');
        const typeClass = isBoss ? 'b-type boss' : 'b-type';

        // Work Item Tag HTML with Colors
        let itemTagHtml = '';
        if (itemVal && itemVal.trim()) {
            let colorClass = 'tag-gray'; // Default
            if (category.includes('行政')) colorClass = 'tag-admin';
            else if (category.includes('設計')) colorClass = 'tag-design';
            else if (category.includes('施工')) colorClass = 'tag-const';

            itemTagHtml = `<span class="b-type b-item-tag ${colorClass}">${itemVal}</span>`;
        }

        div.innerHTML = `
            <div class="b-header">
                <span class="b-date">${dateStr}</span>
                <div class="b-tag-group">
                    <span class="${typeClass}">${type}</span>
                    ${itemTagHtml}
                    <span class="b-author">${author}</span>
                </div>
            </div>
            <div class="b-content">${content}</div>
        `;
        container.appendChild(div);
    });
}

