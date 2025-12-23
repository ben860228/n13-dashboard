/**
 * [LIFF API] 取得使用者設定與專案列表 (支援手動登入版)
 */
function getLiffConfig(userId) {
    try {
        console.log("查詢 ID: [" + userId + "]");
        var app = SpreadsheetApp.openById(SPREADSHEET_ID);
        
        // 1. 讀取 Staff (容錯讀取)
        var staffSheet = app.getSheetByName('staff-table') || app.getSheetByName('Staff_List');
        if (!staffSheet) return { success: false, error: 'System Error', message: '找不到人員名單 (staff-table)' };

        var staffData = staffSheet.getDataRange().getValues();
        var userInfo = { isBound: false, userName: '', isBoss: false };
        var cleanUserId = String(userId).trim();
        
        // 用來製作「手動登入選單」的清單
        var staffList = [];

        // 2. 遍歷人員名單
        for (var i = 1; i < staffData.length; i++) {
            var row = staffData[i];
            var dbKey = row[0];        // Primary Key (例如 ben.liu)
            var dbName = row[1];       // 中文名 (例如 劉邦宇)
            var dbLineId = String(row[5]).trim(); // LINE ID
            
            // 收集名單 (只傳回 Key 和 名字，不傳個資)
            staffList.push({ key: dbKey, name: dbName });

            // 比對：支援「LINE ID」或是「Primary Key (ben.liu)」登入
            if (dbLineId === cleanUserId || String(dbKey).toLowerCase() === cleanUserId.toLowerCase()) {
                userInfo.isBound = true;
                userInfo.userName = dbName;
                userInfo.lineId = dbLineId; // 記住真實 ID
                if (row[8] && String(row[8]).toLowerCase().trim() === 'boss') {
                    userInfo.isBoss = true;
                }
            }
        }

        // 3. 讀取專案列表
        var projectSheet = app.getSheetByName('project-table') || app.getSheetByName('Project_List');
        var projects = [];
        if (projectSheet) {
            var projectData = projectSheet.getDataRange().getValues();
            for (var i = 1; i < projectData.length; i++) {
                // CSV: Project_ID(0), Project_Name(1), Spreadsheet_ID(2)
                // REFACTOR: Use Project_ID (Col 0) as the system ID.
                var pId = String(projectData[i][0]).trim(); 
                var pName = projectData[i][1] || pId; 
                var spreadsheetId = projectData[i][2];

                // Only add if it has a Project ID (Spreadsheet ID isn't required for dropdown, but usually needed for tasks)
                if (pId) { 
                    // Note: Front-end now receives Project_ID (e.g. "JY_N13") as the "id" value.
                    projects.push({ name: pName, id: pId });
                }
            }
        }

        // 回傳結果 (JSON Stringify to avoid serialization errors)
        return JSON.stringify({
            success: true,
            isBound: userInfo.isBound,
            userName: userInfo.userName,
            isBoss: userInfo.isBoss,
            projects: projects,
            staffList: staffList, 
            savedId: userInfo.lineId || cleanUserId 
        });
    } catch(e) {
        return JSON.stringify({ success: false, message: e.toString() });
    }
}

/**
 * [LIFF API] 取得專案任務列表
 * (此功能維持原樣，不需要改動邏輯，保留給前端呼叫)
 */
function getProjectTasks(projectId) {
    var logs = [];
    logs.push("Start: " + projectId);

    // Default to empty array if projectId is missing
    if (!projectId) return JSON.stringify({ success: false, logs: ["No Project ID"], tasks: [] });

    // REFACTOR: Lookup Spreadsheet ID if input is a Project ID (e.g. "JY_N13")
    var targetSpreadsheetId = projectId;
    var isRawId = (projectId.length > 25 && !projectId.includes("_")); // Simple heuristic for Google ID
    
    if (!isRawId) {
        logs.push("Looking up Project ID: " + projectId);
        var pInfo = getProjectInfoById(projectId); // This function will be updated to match Project_ID
        if (pInfo && pInfo.spreadsheetId) {
            targetSpreadsheetId = pInfo.spreadsheetId;
            logs.push("Found Spreadsheet ID: " + targetSpreadsheetId.substring(0,5)+"...");
        } else {
            logs.push("Project ID Lookup Failed");
            // Try continuing as if it matches the script (fallback) or error out?
            // If lookup fails, we can't open the sheet.
             return JSON.stringify({ success: false, logs: logs, tasks: [] });
        }
    }

    try {
        var app;
        try {
            // Try openById (Requires Scope)
            app = SpreadsheetApp.openById(targetSpreadsheetId);
            logs.push("Opened Spreadsheet");
        } catch(e) {
            logs.push("Open Error: " + e.message);
            // Fallback: If projectId matches the bound script, try getActive
            // But usually this error means "Permission Denied" or "Invalid ID"
            return JSON.stringify({ success: false, logs: logs, tasks: [] });
        }

        var sheet = app.getSheets()[0]; 
        if (!sheet) {
            logs.push("No header sheet found");
            return JSON.stringify({ success: false, logs: logs, tasks: [] });
        }
        logs.push("Got Sheet: " + sheet.getName());

        var range = sheet.getDataRange();
        var data = range.getValues();
        logs.push("Data rows: " + data.length);
        
        if (data.length < 2) {
             logs.push("Data too short");
             return JSON.stringify({ success: true, logs: logs, tasks: [] });
        }

        var headers = data[0];
        var colMap = {};
        
        headers.forEach(function(h, i) {
            var label = String(h).trim();
            colMap[label] = i;
        });

        function getColIndex(possibleNames) {
            for (var i = 0; i < possibleNames.length; i++) {
                var name = possibleNames[i];
                if (colMap.hasOwnProperty(name)) return colMap[name];
            }
            return -1;
        }

        var idxName = getColIndex(['任務名稱', 'TaskName', 'Name']);
        var idxCat = getColIndex(['分類', 'Category']);
        var idxPlanStart = getColIndex(['開始時間', 'Start', 'StartDate']);
        var idxPlanEnd = getColIndex(['結束日期', 'End', 'EndDate']);
        var idxActStart = getColIndex(['實際開始時間', 'ActualStart']);
        var idxActEnd = getColIndex(['實際完成時間', 'ActualEnd']);
        var idxWeight = getColIndex(['全案權重 (%)', 'Weight']);

        if (idxName === -1) {
            logs.push("TaskName Col Not Found");
            return JSON.stringify({ success: false, logs: logs, tasks: [] });
        }

        var tasks = [];
        // Helper
        function safeStr(val) {
             if (!val) return "";
             if (val instanceof Date) {
                 return Utilities.formatDate(val, Session.getScriptTimeZone(), "yyyy/MM/dd");
             }
             return String(val).trim();
        }

        var maxRows = Math.min(data.length, 500); 
        for (var i = 1; i < maxRows; i++) {
            var row = data[i];
            var name = row[idxName];
            if (!name) continue;

            tasks.push({
                name: String(name),
                category: idxCat !== -1 ? String(row[idxCat]) : '',
                planStart: idxPlanStart !== -1 ? safeStr(row[idxPlanStart]) : '',
                planEnd: idxPlanEnd !== -1 ? safeStr(row[idxPlanEnd]) : '',
                actStart: idxActStart !== -1 ? safeStr(row[idxActStart]) : '',
                actEnd: idxActEnd !== -1 ? safeStr(row[idxActEnd]) : '',
                weight: idxWeight !== -1 ? (Number(String(row[idxWeight]).replace('%','')) || 0) : 0
            });
        }
        
        logs.push("Tasks extracted: " + tasks.length);
        return JSON.stringify({ success: true, logs: logs, tasks: tasks });

    } catch (e) {
        logs.push("Crash: " + e.toString());
        return JSON.stringify({ success: false, logs: logs, tasks: [] });
    }
}

function getProjectMemberKeys(projectId) {
    try {
        var app = SpreadsheetApp.openById(SPREADSHEET_ID);
        var sheet = app.getSheetByName('project-table') || app.getSheetByName('Project_List');
        var data = sheet.getDataRange().getValues();
        // CSV: 0:P_ID, 1:Name, 2:Share_ID, 3~N: Members
        
        for (var i = 1; i < data.length; i++) {
            // REFACTOR: Match by Project_ID (Col 0)
            if (String(data[i][0]).trim() === String(projectId).trim()) { 
                var members = [];
                // Iterate from col 3 to end
                for (var j = 3; j < data[i].length; j++) {
                    var k = String(data[i][j]).trim();
                    if (k) members.push(k);
                }
                return members;
            }
        }
        return [];
    } catch (e) {
        console.error("Get Project Member Error:", e);
        return [];
    }
}

function getLineIdsByKeys(keys) {
    try {
        var app = SpreadsheetApp.openById(SPREADSHEET_ID);
        var sheet = app.getSheetByName('staff-table') || app.getSheetByName('Staff_List');
        var data = sheet.getDataRange().getValues();
        // 0:Key, 5:LineID
        
        var idMap = {};
        for (var i = 1; i < data.length; i++) {
            var k = String(data[i][0]).toLowerCase().trim();
            var lid = String(data[i][5]).trim();
            if (lid) idMap[k] = lid;
        }
        
        var results = [];
        keys.forEach(function(key) {
            var k = String(key).toLowerCase().trim();
            if (idMap[k]) results.push(idMap[k]);
        });
        // Unique
        return results.filter(function(item, pos) {
            return results.indexOf(item) == pos;
        });

    } catch(e) {
        console.error("Get Line IDs Error:", e);
        return [];
    }
}

function getProjectInfoById(projectId) {
    try {
        var app = SpreadsheetApp.openById(SPREADSHEET_ID);
        var sheet = app.getSheetByName('project-table');
        var data = sheet.getDataRange().getValues();
        
        for (var i = 1; i < data.length; i++) {
            // REFACTOR: Match Project_ID (Col 0)
            if (String(data[i][0]).trim() === String(projectId).trim()) {
                return {
                    code: data[i][0],
                    name: data[i][1],
                    spreadsheetId: data[i][2] // Needed for getProjectTasks lookup
                };
            }
        }
    } catch(e) {}
    return null;
}

/**
 * [New] 透過中文姓名查詢英文姓名
 */
function getEnglishNameByChinese(chtName) {
    try {
        var app = SpreadsheetApp.openById(SPREADSHEET_ID);
        var sheet = app.getSheetByName('staff-table') || app.getSheetByName('Staff_List');
        var data = sheet.getDataRange().getValues();
        // CSV: primary key(0), name_cht(1), name_eng(2) ...
        for (var i = 1; i < data.length; i++) {
            if (data[i][1] === chtName) {
                return data[i][2]; // Name ENG
            }
        }
    } catch(e) {
        console.error("Name lookup fail", e);
    }
    return chtName; // Fallback
}
