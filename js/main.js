import { parsePercent, parseDate } from './utils.js';
import { renderGantt } from './components/ganttChart.js';
import { renderSCurve } from './components/sCurveChart.js';

// ★★★ 已填入您提供的連結 ★★★
const TASKS_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQiyY2STxHEAcJIa_wBeLHRYpGj82dozn-1tCo_ZhltPo-CABMaWOD88K7LLJnXTtW_3IV-k2qZq8HV/pub?gid=0&single=true&output=csv";
const PROJECT_INFO_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQiyY2STxHEAcJIa_wBeLHRYpGj82dozn-1tCo_ZhltPo-CABMaWOD88K7LLJnXTtW_3IV-k2qZq8HV/pub?gid=1735843667&single=true&output=csv";


// 設定今日為使用者系統時間
const today = new Date();
today.setHours(0, 0, 0, 0);

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('currentDate').textContent = "今日: " + today.toLocaleDateString();
    
    const btnRefresh = document.querySelector('button[onclick*="loadFromGoogle"]');
    if(btnRefresh) { btnRefresh.onclick = null; btnRefresh.addEventListener('click', loadFromGoogle); }
    
    const btnManual = document.querySelector('button[onclick*="toggleManual"]');
    if(btnManual) { btnManual.onclick = null; btnManual.addEventListener('click', toggleManual); }

    if(TASKS_CSV_URL && TASKS_CSV_URL.includes("http")) {
        loadFromGoogle();
    } else {
        document.getElementById('statusMsg').textContent = "⚠️ 請先設定 CSV 連結";
    }

    // 初始化提示框元素 (如果 index.html 沒寫，這裡補救)
    initTooltipOverlay();
});

window.toggleManual = function() {
    const el = document.getElementById('manualSection');
    el.style.display = el.style.display === 'block' ? 'none' : 'block';
}
window.parseManual = function() { processData(document.getElementById('csvInput').value, null); }

window.loadFromGoogle = async function() {
    const msg = document.getElementById('statusMsg');
    msg.textContent = "⏳ 更新中...";
    msg.style.color = "#3498db";
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
        if(PROJECT_INFO_CSV_URL && PROJECT_INFO_CSV_URL.includes("http")) {
            try {
                const infoRes = await fetch(PROJECT_INFO_CSV_URL + cacheBuster);
                if (infoRes.ok) infoCsvText = await infoRes.text();
            } catch(e) {
                console.warn("專案資訊讀取失敗");
            }
        }

        msg.textContent = "✅ 更新成功";
        msg.style.color = "#2E7D32"; // 改為品牌綠
        
        processData(taskCsvText, infoCsvText);

    } catch (err) {
        msg.textContent = "❌ " + err.message;
        msg.style.color = "red";
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

    // --- 1. 解析專案資訊 ---
    let projectInfo = {
        code: "專案代號", name: "專案名稱", government: "--", location: "--", 
        designer: "--", contractor: "--", boss: "--", sponsor: "--"  
    };

    if (infoCsv) {
        const infoData = Papa.parse(infoCsv, { header: false, skipEmptyLines: true }).data;
        infoData.forEach(row => {
            if(row.length >= 2) {
                const key = row[0].trim();
                const val = row[1].trim();
                if(key === 'ProjectCode') projectInfo.code = val;
                if(key === 'ProjectName') projectInfo.name = val;
                if(key === 'Government') projectInfo.government = val;
                if(key === 'Location') projectInfo.location = val;
                if(key === 'Designer') projectInfo.designer = val;
                if(key === 'Contractor') projectInfo.contractor = val;
                if(key === 'ProjectBoss') projectInfo.boss = val;
                if(key === 'ProjectSponsor') projectInfo.sponsor = val;
            }
        });
    }

    document.getElementById('ui-project-name').textContent = projectInfo.name;
    document.getElementById('ui-location').textContent = projectInfo.location;
    document.getElementById('ui-government').textContent = projectInfo.government;
    document.getElementById('ui-designer').textContent = projectInfo.designer;
    document.getElementById('ui-contractor').textContent = projectInfo.contractor;
    document.getElementById('ui-boss').textContent = projectInfo.boss;
    document.getElementById('ui-sponsor').textContent = projectInfo.sponsor;
    
    document.getElementById('sCurveHeader').textContent = `${projectInfo.code} S-Curve`;
    document.getElementById('ganttHeader').textContent = `${projectInfo.code} 專案整體進度甘特圖`;


    // --- 2. S-Curve ---
    let minDateOverall = new Date("2099-12-31");
    const dateColumnRegex = /^(\d{4}[\/\-](0?[1-9]|1[0-2])[\/\-](0?[1-9]|[12][0-9]|3[01]))$/;
    const allKeys = Object.keys(taskData[0]);
    const historicalDateKeys = allKeys.filter(key => dateColumnRegex.test(key)).sort((a, b) => parseDate(a) - parseDate(b));

    const sLabels = []; const sPlanned = []; const sActual = [];
    if (historicalDateKeys.length > 0) {
        const firstDate = parseDate(historicalDateKeys[0]);
        if (minDateOverall > firstDate) minDateOverall = firstDate;
        sLabels.push(minDateOverall.valueOf() - 86400000 * 7);
        sPlanned.push(0); sActual.push(0);

        historicalDateKeys.forEach(dateKey => {
            const currentDate = parseDate(dateKey);
            sLabels.push(currentDate.valueOf());
            let cumulativePlanned = 0; let dailyActualTotal = 0;
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
                        if(totalDays>0) cumulativePlanned += weight * (passedDays / totalDays);
                    }
                }
                dailyActualTotal += parsePercent(row[dateKey]);
            });
            sPlanned.push(cumulativePlanned.toFixed(2));
            if (dailyActualTotal > 0 || currentDate <= today) {
                const cumulativeActual = taskData.reduce((sum, row) => sum + (parsePercent(row[dateKey]) / 100 * parsePercent(row['全案權重 (%)'])), 0);
                sActual.push(cumulativeActual.toFixed(2));
            } else { sActual.push(null); }
        });
    }

    // --- 3. 數據與任務清單 ---
    let totalPlannedToday = 0;
    let totalActualToday = 0;
    
    const ganttLabels = []; const ganttPlannedData = []; const ganttActualRaw = []; const ganttTaskStyles = [];
    const categories = ['行政', '設計', '施工'];
    const ongoingTasks = { '行政': [], '設計': [], '施工': [] };
    const allUpcomingTasks = [];
    const fmtDate = (d) => d ? d.toLocaleDateString('zh-TW') : '???';

    taskData.forEach(row => {
        const taskName = row['任務名稱'];
        if (!taskName) return; 

        let cat = row['分類'] ? row['分類'].trim() : '施工';
        if (!categories.includes(cat)) cat = '施工';

        const weight = parsePercent(row['全案權重 (%)']);
        const planStart = parseDate(row['開始時間']);
        const planEnd = parseDate(row['結束日期']);
        const actStart = parseDate(row['實際開始時間']);
        const actEnd = parseDate(row['實際完成時間']);

        if (planStart && planEnd) {
            if (today >= planEnd) totalPlannedToday += weight;
            else if (today > planStart) {
                const totalDays = (planEnd - planStart) / 86400000;
                const passedDays = (today - planStart) / 86400000;
                totalPlannedToday += weight * (passedDays / totalDays);
            }
        }
        totalActualToday += parsePercent(row['貢獻度 (%)']);

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
        
        // ★★★ 準備 Tooltip 文字 (無 Emoji) ★★★
        const tipText = `【${taskName}】\n預定：${pStr}\n實際：${aStr}`;

        const tObj = { name: taskName, delayed: isDelayed, cat: cat, tip: tipText };
        
        if ((actStart && !actEnd) || (!actStart && planStart && today > planStart)) {
            ongoingTasks[cat].push(tObj);
        } else if (!actStart && planStart && planStart > today && (planStart - today) < (14 * 86400000)) {
            allUpcomingTasks.push(tObj);
        }
    });

    document.getElementById('plannedVal').textContent = totalPlannedToday.toFixed(2) + '%';
    document.getElementById('actualVal').textContent = totalActualToday.toFixed(2) + '%';
    const variance = totalActualToday - totalPlannedToday;
    const elVar = document.getElementById('varianceVal');
    const elBadge = document.getElementById('varianceText');
    elVar.textContent = (variance > 0 ? "+" : "") + variance.toFixed(2) + '%';
    
    if (variance < -5) { 
        elVar.className = "s-value text-red"; elBadge.className = "badge bg-red"; elBadge.textContent = "落後"; 
    } else if (variance >= 0) { 
        elVar.className = "s-value text-green"; elBadge.className = "badge bg-green"; elBadge.textContent = "超前"; 
    } else { 
        elVar.className = "s-value"; elBadge.className = "badge"; elBadge.textContent = "可控"; 
    }

    categories.forEach(cat => {
        renderTaskList(`ongoing-${cat}`, ongoingTasks[cat]);
    });
    renderTaskList('upcoming-all', allUpcomingTasks);

    const finalActualData = ganttActualRaw.map(d => d.data);
    const finalActualColors = ganttActualRaw.map(d => d.color);

    if(sLabels.length > 0) renderSCurve(sLabels, sPlanned, sActual, today);
    renderGantt(ganttLabels, ganttPlannedData, finalActualData, finalActualColors, today, ganttTaskStyles);
    
    // ★★★ 綁定任務卡片事件 ★★★
    attachTaskCardEvents();
}

function renderTaskList(elementId, tasks) {
    const el = document.getElementById(elementId);
    if(!el) return;
    el.innerHTML = "";
    if(tasks.length === 0) {
        if(elementId === 'upcoming-all') el.innerHTML = "<div style='color:#ccc; text-align:center; margin-top:10px;'>無近期任務</div>";
        return;
    }

    tasks.forEach(t => {
        const div = document.createElement('div');
        div.className = `task-item cat-${t.cat}`;
        if(t.delayed) div.classList.add('item-delayed');

        let html = "";
        if (t.cat === '施工') {
            if (t.name.includes('機') || t.name.includes('電')) html += `<span class="tag tag-mep">機</span>`;
            else html += `<span class="tag tag-civil">土</span>`;
        }
        html += t.name;
        
        // ★★★ 將提示文字存入 data-tooltip (移除 title 屬性) ★★★
        div.setAttribute('data-tooltip', t.tip);
        // div.title = t.tip; // 移除這行，避免瀏覽器原生提示
        
        div.innerHTML = html;
        el.appendChild(div);
    });
}

// 建立黑色提示框 (如果沒有的話)
function initTooltipOverlay() {
    if (!document.getElementById('mobile-tooltip-overlay')) {
        const overlay = document.createElement('div');
        overlay.id = 'mobile-tooltip-overlay';
        document.body.appendChild(overlay);
    }
}

// ★★★ 綁定任務卡片事件 (電腦 Hover / 手機 Click) ★★★
function attachTaskCardEvents() {
    const overlay = document.getElementById('mobile-tooltip-overlay');
    const items = document.querySelectorAll('.task-item');
    let timer = null;

    if (!overlay) return;

    items.forEach(item => {
        // --- 1. 手機版：點擊顯示 ---
        item.addEventListener('click', (e) => {
            // 判斷是否為手機 (寬度 < 900)
            if(window.innerWidth > 900) return; 

            const text = item.getAttribute('data-tooltip');
            if(!text) return;

            overlay.textContent = text;
            overlay.classList.add('show');
            
            // 重置樣式為置底 Snackbar
            overlay.style.top = ''; 
            overlay.style.left = ''; 
            overlay.style.bottom = '20px'; 
            overlay.style.transform = 'translateX(-50%)'; 

            if(timer) clearTimeout(timer);
            timer = setTimeout(() => {
                overlay.classList.remove('show');
            }, 3000);
        });

        // --- 2. 電腦版：滑鼠移入顯示 ---
        item.addEventListener('mouseenter', (e) => {
            if(window.innerWidth <= 900) return; // 手機不觸發

            const text = item.getAttribute('data-tooltip');
            if(!text) return;

            overlay.textContent = text;
            overlay.classList.add('show');
            updateOverlayPosition(e, overlay);
        });

        // --- 3. 電腦版：滑鼠移動跟隨 ---
        item.addEventListener('mousemove', (e) => {
            if(window.innerWidth <= 900) return;
            updateOverlayPosition(e, overlay);
        });

        // --- 4. 電腦版：滑鼠移出隱藏 ---
        item.addEventListener('mouseleave', () => {
            if(window.innerWidth <= 900) return;
            overlay.classList.remove('show');
        });
    });
}

// 輔助：更新提示框位置 (電腦版)
function updateOverlayPosition(e, overlay) {
    overlay.style.bottom = 'auto';
    overlay.style.left = (e.clientX + 15) + 'px';
    overlay.style.top = (e.clientY + 15) + 'px';
    overlay.style.transform = 'none';
}
