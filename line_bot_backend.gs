// Global Variables - Please verify and fill these in
var CHANNEL_ACCESS_TOKEN = 'VoAz9cbhWZf8Ip0ROd25Z2LJmiBe6e4i2W51fgZzvYQckcp8+6QfQIqU92XZuVcH6i+dChBnRyGvGG9oW5jH/16W+/7JTr9vCYpEbuHulInhJdetaHOEP37LoUqrLwxuxk46HdwilwDzLgQauM4LwwdB04t89/1O/w1cDnyilFU='; // 請填入 LINE Messaging API 的 Channel Access Token
var SPREADSHEET_ID = '1cLUBzhB-lcwlHSq3LzMAGQumJiNsIpkfbQrPKpTXw_I'; // 請填入 Google Sheet ID

// 🟢 請在此填入您的 Web App URL (以 /exec 結尾的那串)
// 這樣可以確保電腦版連結絕對正確，不會跳到錯誤頁面
var WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbzNloNwSmUp20rD72sEnY9_DgbIu8Lhr7O46lHooXXvxgiqfibAiEPBP9NAl8tj4H5H/exec'; 

/**
 * 接收 LINE Webhook 事件
 */
function doPost(e) {
    try {
        // 簡單的防呆，若無內容則回傳 OK
        if (!e || !e.postData || !e.postData.contents) {
            return HtmlService.createHtmlOutput('OK');
        }

        // 解析 JSON 資料
        var request = JSON.parse(e.postData.contents);
        var events = request.events;

        for (var i = 0; i < events.length; i++) {
            var event = events[i];
            if (event.type === 'message' && event.message.type === 'text') {
                handleMessage(event);
            } else if (event.type === 'follow') {
                handleFollow(event);
            }
        }

        // 修正: 改用 HtmlService 回傳 200 OK，避免 302 Found 重導向
        return HtmlService.createHtmlOutput('OK');
    } catch (error) {
        console.error('Error in doPost:', error);
        // 即使發生錯誤，通常也建議回傳 200 OK 避免 LINE 平台瘋狂重試，但可記錄錯誤
        return HtmlService.createHtmlOutput('OK');
    }
}

/**
 * 處理 LIFF 頁面請求 (doGet)
 * 修改版：接收 uid 參數並注入到模板中
 */
function doGet(e) {
    // ★★★ Production Form ★★★
    var template = HtmlService.createTemplateFromFile('line_type_form');
    
    // 關鍵修改：直接從後端接收參數，如果沒有就給空字串
    // 這樣可以避開前端抓不到網址參數的問題
    template.serverUid = (e && e.parameter && e.parameter.uid) ? e.parameter.uid : '';
    
    return template.evaluate()
        .setTitle('JingYi Pubish System')
        .addMetaTag('viewport', 'width=device-width, initial-scale=1')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

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
 * [LIFF API] 提交表單資料
 */
function submitBulletin(data) {
    console.log("Submit Data:", JSON.stringify(data));
    if (!data || !data.projectId || !data.lineUserId || !data.content) {
        throw new Error('Missing required fields');
    }

    // Double check identity
    var userInfoStr = getLiffConfig(data.lineUserId);
    var userInfo = JSON.parse(userInfoStr);

    if (!userInfo.success) {
        throw new Error('Authentication failed');
    }

    // Permission Check Logic for '主管訊息' handled in Frontend mostly, but could enforce here.
    if (data.type === '主管訊息' && !userInfo.isBoss) {
        throw new Error('Permission denied: You are not authorized to post boss messages.');
    }

    // 🟢 Fix: Resolve Spreadsheet ID from Project ID
    var targetSpreadsheetId = data.projectId;
    // Check if it looks like a Project ID (e.g. JY_N13)
    if (data.projectId.indexOf('_') > 0 || data.projectId.length < 20) {
        var pInfo = getProjectInfoById(data.projectId);
        if (pInfo && pInfo.spreadsheetId) {
            targetSpreadsheetId = pInfo.spreadsheetId;
        } else {
            throw new Error('Project ID not found in system: ' + data.projectId);
        }
    }

    try {
        var targetSheet = SpreadsheetApp.openById(targetSpreadsheetId).getSheetByName('bulletin');
        if (!targetSheet) throw new Error('Bulletin sheet not found in target project');

        // Columns Based on User Screenshot:
        // A: Timestamp, B: Date, C: Author, D: Type, E: Category, F: Item, G: Content, H: Images, I: UUID, J: EditedAt
        var newUuid = Utilities.getUuid();
        var rowData = [
            Utilities.formatDate(new Date(), "GMT+8", "yyyy/MM/dd HH:mm:ss"), // Timestamp
            data.date,       // Date
            userInfo.userName, // Author
            data.type,       // Type
            data.category || '', // Category
            data.item || '',   // Item (Work Item) - Column F
            data.content,     // Content - Column G
            '',               // Images placeholder - Column H
            newUuid,          // UUID - Column I
            ''                // EditedAt - Column J (Empty for new)
        ];

        targetSheet.appendRow(rowData);

        var successMsg = '發佈成功';

        var successMsg = '發佈成功';

        // 🟢 觸發通知
        try {
            broadcastToProject(data.projectId, rowData);
        } catch (err) {
            console.error("Broadcast Failed:", err);
            // Append warning to success message
            successMsg += "\n(但通知發送失敗: " + err.message + ")";
        }

        return successMsg;

    } catch (e) {
        console.error('Submit Error:', e);
        throw e;
    }
}

/**
 * [LIFF API] 取得使用者最近的回報紀錄 (用於編輯選單)
 */
function getMyRecentBulletins(config) {
   // config: { projectId, lineUserId }
   var userInfoStr = getLiffConfig(config.lineUserId);
   var userInfo = JSON.parse(userInfoStr);
   
   if (!userInfo.success) return JSON.stringify({ success: false, message: 'Auth Failed' });

   try {
       // 🟢 Fix: Resolve Spreadsheet ID
       var targetSpreadsheetId = config.projectId;
       if (config.projectId.indexOf('_') > 0 || config.projectId.length < 20) {
           var pInfo = getProjectInfoById(config.projectId);
           if (pInfo && pInfo.spreadsheetId) targetSpreadsheetId = pInfo.spreadsheetId;
           else return JSON.stringify({ success: false, message: 'Project ID Not Found' });
       }

       var app = SpreadsheetApp.openById(targetSpreadsheetId);
       var sheet = app.getSheetByName('bulletin');
       if (!sheet) return { success: false, message: 'No bulletin sheet' };
       
       var data = sheet.getDataRange().getValues();
       // Headers are in row 0
       // Columns: 0:Timestamp, 1:Date, 2:Author, 3:Type, 4:Category, 5:Item, 6:Content, 8:UUID
       
       var myPosts = [];
       // Loop from end to beginning to get most recent
       var count = 0;
       for (var i = data.length - 1; i >= 1; i--) {
           var row = data[i];
           // Author Verification: Must match userName
           if (String(row[2]) === userInfo.userName) {
               myPosts.push({
                   rowIndex: i + 1, // 1-based index (useful for update)
                   timestamp: row[0],
                   date: formatDateSafe(row[1]),
                   type: row[3],
                   category: row[4],
                   item: row[5],
                   content: row[6],
                   uuid: row[8] || '' // UUID
                });
                count++;
                if (count >= 20) break; // Limit to last 20 posts
            }
        }
        return JSON.stringify({ success: true, posts: myPosts });
    } catch (e) {
        return JSON.stringify({ success: false, message: e.toString() });
    }
}

function formatDateSafe(val) {
    try {
        if (!val) return "";
        return Utilities.formatDate(new Date(val), "GMT+8", "yyyy-MM-dd");
    } catch (e) {
        return String(val);
    }
}

/**
 * [LIFF API] 取得單一公告的歷史紀錄
 */
function getBulletinHistory(data) {
    // data: { projectId, uuid }
    if (!data || !data.projectId || !data.uuid) return JSON.stringify({ success: false, message: 'Invalid Params' });

    try {
         // 🟢 Fix: Resolve Spreadsheet ID
        var targetSpreadsheetId = data.projectId;
        if (data.projectId.indexOf('_') > 0 || data.projectId.length < 20) {
            var pInfo = getProjectInfoById(data.projectId);
            if (pInfo && pInfo.spreadsheetId) targetSpreadsheetId = pInfo.spreadsheetId;
            else return JSON.stringify({ success: false, message: 'Project ID Not Found' });
        }

        var app = SpreadsheetApp.openById(targetSpreadsheetId);
        var sheet = app.getSheetByName('bulletin_history');
        if (!sheet) return JSON.stringify({ success: true, history: [] }); // No history yet

        var rows = sheet.getDataRange().getValues();
        var history = [];
        // Cols: 0:Ref_UUID, 1:ArchivedAt, 2:Orig_Timestamp ...
        
        for (var i = 1; i < rows.length; i++) {
            if (String(rows[i][0]) === String(data.uuid)) {
                history.push({
                    archivedAt: formatDateSafe(rows[i][1]),
                    content: rows[i][8], // Content is col I -> index 8 (in history sheet logic?) 
                    // Let's check updateBulletin logic:
                    // historyRow = [uuid, archivedAt, orig_ts, date, author, type, cat, item, content...]
                    // Content is index 8. Correct.
                    author: rows[i][4],
                    date: formatDateSafe(rows[i][3])
                });
            }
        }
        
        return JSON.stringify({ success: true, history: history.reverse() }); // Newest first
    } catch (e) {
        return JSON.stringify({ success: false, message: e.toString() });
    }
}

/**
 * [LIFF API] 更新公告 (編輯功能)
 */
function updateBulletin(data) {
    // data: { projectId, lineUserId, uuid, date, type, category, item, content }
    var userInfoStr = getLiffConfig(data.lineUserId);
    var userInfo = JSON.parse(userInfoStr);
    
    if (!userInfo.success) throw new Error('Auth Failed');
    
    // 1. Find the Post
    // 🟢 Fix: Resolve Spreadsheet ID
    var targetSpreadsheetId = data.projectId;
    if (data.projectId.indexOf('_') > 0 || data.projectId.length < 20) {
        var pInfo = getProjectInfoById(data.projectId);
        if (pInfo && pInfo.spreadsheetId) targetSpreadsheetId = pInfo.spreadsheetId;
        else throw new Error('Project ID Not Found in Backend');
    }

    var app = SpreadsheetApp.openById(targetSpreadsheetId);
    var sheet = app.getSheetByName('bulletin');
    var histSheet = app.getSheetByName('bulletin_history');
    
    // Check History Sheet, create if not exists
    if (!histSheet) {
        histSheet = app.insertSheet('bulletin_history');
        histSheet.appendRow(['Ref_UUID', 'ArchivedAt', 'Original_Timestamp', 'Date', 'Author', 'Type', 'Category', 'Item', 'Content', 'Images', 'Old_EditedAt']);
    }

    var rows = sheet.getDataRange().getValues();
    var targetRowIndex = -1;
    var targetRowData = null;

    // Search by UUID (Col I -> Index 8)
    for (var i = 1; i < rows.length; i++) {
        if (String(rows[i][8]) === String(data.uuid)) {
            targetRowIndex = i + 1;
            targetRowData = rows[i];
            break;
        }
    }

    if (targetRowIndex === -1) throw new Error('Post not found or UUID mismatch');
    
    // Verify Author (Double check ownership)
    if (String(targetRowData[2]) !== userInfo.userName) {
        throw new Error('Permission denied: You can only edit your own posts.');
    }

    // 2. Archive to History
    // History Cols: Ref_UUID, ArchivedAt, + Original Row Cols
    var archivedAt = Utilities.formatDate(new Date(), "GMT+8", "yyyy/MM/dd HH:mm:ss");
    var historyRow = [
        data.uuid,      // Ref_UUID
        archivedAt,     // ArchivedAt
        targetRowData[0], // Original Timestamp
        targetRowData[1], // Date
        targetRowData[2], // Author
        targetRowData[3], // Type
        targetRowData[4], // Category
        targetRowData[5], // Item
        targetRowData[6], // Content
        targetRowData[7], // Images
        targetRowData[9]  // Old EditedAt
    ];
    histSheet.appendRow(historyRow);

    // 3. Update Current Row
    // We only update: Date, Type, Category, Item, Content, EditedAt.
    // Keep: Timestamp, Author, UUID
    // Col Index Map: Date=1, Type=3, Cat=4, Item=5, Content=6, EditedAt=9
    
    sheet.getRange(targetRowIndex, 2).setValue(data.date);       // Date
    sheet.getRange(targetRowIndex, 4).setValue(data.type);       // Type
    sheet.getRange(targetRowIndex, 5).setValue(data.category);   // Category
    sheet.getRange(targetRowIndex, 6).setValue(data.item);       // Item
    sheet.getRange(targetRowIndex, 7).setValue(data.content);    // Content
    sheet.getRange(targetRowIndex, 10).setValue(archivedAt);     // EditedAt (Col J)

    return JSON.stringify({ success: true, message: '更新成功' });
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

/**
 * 處理文字訊息邏輯
 */
function handleMessage(event) {
    var replyToken = event.replyToken;
    var userId = event.source.userId;
    var userMessage = event.message.text.trim();

    // 0. 電腦版選單指令
    if (userMessage === '選單' || userMessage === 'menu' || userMessage === '功能') {
        var menuFlex = {
            "type": "bubble",
            "size": "giga",
            "body": {
                "type": "box",
                "layout": "vertical",
                "contents": [
                    { "type": "text", "text": "🖥️ 功能選單", "weight": "bold", "size": "xl", "align": "center", "color": "#1DB446" },
                    { "type": "separator", "margin": "md" },
                    { "type": "text", "text": "請選擇您要執行的動作：", "margin": "md", "color": "#aaaaaa", "size": "sm" },
                    {
                        "type": "box", "layout": "vertical", "margin": "md", "spacing": "sm",
                        "contents": [
                            {
                                "type": "button", "style": "primary", "height": "sm", "color": "#6c757d", "action": { "type": "message", "label": "📢 專案回報", "text": "專案回報" }
                            },
                            {
                                "type": "button", "style": "secondary", "height": "sm", "action": { "type": "message", "label": "🔗 帳號綁定", "text": "帳號綁定" }
                            },
                            {
                                "type": "button", "style": "secondary", "height": "sm", "action": { "type": "message", "label": "📖 使用教學", "text": "使用教學" }
                            },
                            {
                                "type": "button", "style": "primary", "height": "sm", "color": "#0d6efd", "action": { "type": "uri", "label": "📊 開啟儀表板", "uri": "https://ben860228.github.io/Jingyi-PCM/" }
                            }
                        ]
                    }
                ]
            }
        };
        replyFlex(replyToken, "功能選單", menuFlex);
        return;
    }

    // 1. 綁定指令
    if (userMessage.startsWith('綁定 ')) {
        var inputKey = userMessage.substring(3).trim();
        if (inputKey) processBinding(replyToken, userId, inputKey);
        else replyText(replyToken, '請輸入正確的綁定格式，例如：「綁定 ben.liu」');
        return;
    }

    // 2. 回報指令 (產生專屬連結)
    if (userMessage === '回報' || userMessage === '專案回報' || userMessage === '表單') {
        generateMagicLink(replyToken, userId);
        return;
    }

    // 3. 使用教學
    if (userMessage === '使用教學' || userMessage === '使用說明') {
        replyText(replyToken, "【使用說明】\n🔹 如果尚未綁定：請先點擊「帳號綁定」驗證身分 (已綁定過則無需重複操作)。\n🔹 點擊「專案回報」：填寫施工進度或會議記錄 (主管可填寫指令)。\n🔹 點擊「開啟儀表板」：查看完整的專案儀表板。\n🔹 電腦版用戶可隨時輸入「選單」來召喚選單。");
        return;
    }

    // 4. 帳號綁定教學
    if (userMessage === '帳號綁定' || userMessage === '綁定教學') {
        var userProps = PropertiesService.getUserProperties();
        userProps.setProperty(userId + '_state', 'BINDING_MODE');
        
        replyText(replyToken, "你的中文全名是？");
        return;
    }

    // 5. 檢查是否處於綁定模式
    var userProps = PropertiesService.getUserProperties();
    var userState = userProps.getProperty(userId + '_state');

    if (userState === 'BINDING_MODE') {
        userProps.deleteProperty(userId + '_state');
        processNameBinding(replyToken, userId, userMessage);
        return;
    }

    // 6. 其他訊息
    checkAndReplyNormalMessage(replyToken, userId, userMessage);
}

/**
 * [新版] 透過中文姓名綁定
 */
function processNameBinding(replyToken, userId, inputName) {
    var app = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = app.getSheetByName('staff-table') || app.getSheets()[0];
    var data = sheet.getDataRange().getValues();
    var cleanName = inputName.trim();

    // 遍歷尋找姓名 (Column Index 1: Name CHT)
    var foundRowIndex = -1;
    var targetRow = null;

    for (var i = 1; i < data.length; i++) {
        // 寬鬆比對：去除空白後相等
        if (String(data[i][1]).trim() === cleanName) {
            foundRowIndex = i + 1; // 1-based row index
            targetRow = data[i];
            break;
        }
    }

    if (foundRowIndex === -1) {
        replyText(replyToken, "綁定失敗請聯繫Ben (找不到此姓名)");
        return;
    }

    // 檢查是否已被綁定
    var existingId = targetRow[5];
    if (existingId && String(existingId).trim() !== "") {
        if (String(existingId).trim() === String(userId).trim()) {
            replyText(replyToken, "您已經綁定過了，無需重複操作。");
        } else {
            replyText(replyToken, "綁定失敗 (該姓名已被其他裝置綁定)");
        }
        return;
    }

    // 寫入 User ID
    sheet.getRange(foundRowIndex, 6).setValue(userId); // Column F is 6
    replyText(replyToken, "綁定成功！\n你好，" + cleanName + "。");
}

/**
 * 產生專屬登入連結 (短網址版)
 */
function generateMagicLink(replyToken, userId) {
    var app = SpreadsheetApp.openById(SPREADSHEET_ID);
    var staffSheet = app.getSheetByName('staff-table') || app.getSheetByName('Staff_List');
    var data = staffSheet.getDataRange().getValues();
    var isBound = false;
    var userName = "";

    // 簡單檢查綁定
    for (var i = 1; i < data.length; i++) {
        if (String(data[i][5]).trim() === String(userId).trim()) {
            isBound = true;
            userName = data[i][1];
            break;
        }
    }

    if (!isBound) {
        replyText(replyToken, '您尚未綁定員工資料。');
        return;
    }

    // 取得目前的 Web App 網址
    var scriptUrl = "";
    
    if (typeof WEB_APP_URL !== 'undefined' && WEB_APP_URL && WEB_APP_URL.trim() !== "") {
        // 優先使用使用者手動填寫的正確網址
        scriptUrl = WEB_APP_URL;
    } else {
        // Fallback: 自動抓取
        scriptUrl = ScriptApp.getService().getUrl();
        if (scriptUrl.endsWith('/dev')) {
            scriptUrl = scriptUrl.replace('/dev', '/exec');
        }
    }
    
    // 組合專屬連結
    var longUrl = scriptUrl + "?uid=" + userId;
    
    // 轉成短網址
    var shortUrl = getShortUrl(longUrl);

    replyText(replyToken, "Hi " + userName + "，回報連結：\n" + shortUrl);
}

/**
 * [Helper] 縮短網址 (使用 is.gd, 避免 TinyURL 的中轉頁面)
 */
function getShortUrl(longUrl) {
    try {
        var api = 'https://is.gd/create.php?format=simple&url=' + encodeURIComponent(longUrl);
        var response = UrlFetchApp.fetch(api);
        if (response.getResponseCode() == 200) {
            return response.getContentText();
        }
    } catch (e) {
        console.error('ShortURL Failed:', e);
    }
    return longUrl; // 失敗則回傳原網址
}

/**
 * 執行綁定流程 (保留相容性)
 */
function processBinding(replyToken, userId, inputKey) {
   // Same as main, simplified for brevity here unless requested
   // ... (Logic is same as main.js, reusing processNameBinding is better for new flow)
   replyText(replyToken, "請使用中文姓名綁定功能。");
}

/**
 * 一般對話處理
 */
function checkAndReplyNormalMessage(replyToken, userId, userMessage) {
    // 簡單檢查是否綁定
    var app = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = app.getSheetByName('staff-table') || app.getSheets()[0];
    var data = sheet.getDataRange().getValues();
    var isBound = false;
    for (var i=1; i<data.length; i++) {
        if (String(data[i][5]) === userId) {
            isBound = true;
            break;
        }
    }

    if (!isBound) {
        replyText(replyToken, "請先輸入「綁定 [你的帳號]」來驗證身份。");
    }
}

/**
 * 處理追蹤 (加入好友) 事件
 */
function handleFollow(event) {
    var replyToken = event.replyToken;
    var userId = event.source.userId;
    
    var welcomeFlexContent = {
        "type": "bubble",
        "body": {
            "type": "box",
            "layout": "vertical",
            "contents": [
                { "type": "text", "text": "歡迎使用 PCM 系統", "weight": "bold", "size": "xl" },
                { "type": "text", "text": "請進行綁定身份", "margin": "md" }
            ]
        }
    };
    replyFlex(replyToken, "歡迎加入", welcomeFlexContent);
}

/**
 * 取得使用者 Profile
 */
function getUserProfile(userId) {
    try {
        var url = 'https://api.line.me/v2/bot/profile/' + userId;
        var response = UrlFetchApp.fetch(url, {
            'headers': {
                'Authorization': 'Bearer ' + CHANNEL_ACCESS_TOKEN
            }
        });
        return JSON.parse(response.getContentText());
    } catch (e) {
        return null;
    }
}

/**
 * 發送 Flex Message
 */
function replyFlex(replyToken, altText, contents) {
    var url = 'https://api.line.me/v2/bot/message/reply';
    var payload = {
        'replyToken': replyToken,
        'messages': [{
            'type': 'flex',
            'altText': altText,
            'contents': contents
        }]
    };
    
    UrlFetchApp.fetch(url, {
        'headers': {
            'Content-Type': 'application/json; charset=UTF-8',
            'Authorization': 'Bearer ' + CHANNEL_ACCESS_TOKEN
        },
        'method': 'post',
        'payload': JSON.stringify(payload)
    });
}

/**
 * 回覆 LINE 訊息
 */
function replyText(replyToken, text) {
    var url = 'https://api.line.me/v2/bot/message/reply';
    var payload = {
        replyToken: replyToken,
        messages: [{
            type: 'text',
            text: text
        }]
    };

    var options = {
        method: 'post',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + CHANNEL_ACCESS_TOKEN
        },
        payload: JSON.stringify(payload)
    };

    UrlFetchApp.fetch(url, options);
}

/**
 * ==========================================
 * Feature: Project Based Notification System
 * ==========================================
 */

/**
 * 廣播給專案成員
 */
function broadcastToProject(projectId, postData) {
    // 1. 取得該專案要通知的 Member Keys
    var memberKeys = getProjectMemberKeys(projectId);
    if (!memberKeys || memberKeys.length === 0) {
        throw new Error("此專案未設定任何通知成員 (Project Table Check)");
    }

    // 2. 轉換為 Line User IDs
    var userIds = getLineIdsByKeys(memberKeys);
    if (!userIds || userIds.length === 0) {
        throw new Error("找不到有效的 LINE ID (請確認成員已綁定)");
    }

    // 3. 取得專案資訊 (名稱與代碼)
    var projectInfo = getProjectInfoById(projectId);
    var pName = projectInfo ? projectInfo.name : "未知專案";
    
    // 4. 製作通知訊息
    var msgContent = createBulletinFlex(pName, postData, projectInfo);

    // 5. 準備推播文字 (Alt Text)
    // row: [Timestamp, Date, Author, Type, Category, Item, Content, ...]
    var authorCht = postData[2];
    var authorEng = getEnglishNameByChinese(authorCht) || authorCht; // Fallback to Chinese if not found
    var altText = "新的專案回報 (" + pName + "案/" + authorEng + ")";

    // 6. 發送 Multicast
    var sentCount = sendMulticast(userIds, msgContent, altText);
    
    // Debug info for frontend
    return {
        count: sentCount,
        keys: memberKeys.join(", "),
        validIdCount: userIds.length
    };
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

function sendMulticast(userIds, flexContent, altText) {
    var url = 'https://api.line.me/v2/bot/message/multicast';
    // Debug: Add a text message to verify delivery channel
    var payload = {
        to: userIds,
        messages: [{
            type: "flex",
            altText: altText,
            contents: flexContent
        }]
    };
    
    // Enhanced Error Handling
    var response = UrlFetchApp.fetch(url, {
        method: 'post',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + CHANNEL_ACCESS_TOKEN
        },
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
    });

    if (response.getResponseCode() !== 200) {
        throw new Error("LINE API Error (" + response.getResponseCode() + "): " + response.getContentText());
    }
    
    console.log("Multicast Sent to " + userIds.length + " users. OK.");
    return userIds.length;
}

function createBulletinFlex(projectName, postData, projectInfo) {
    // postData: [Timestamp, Date, Author, Type, Category, Item, Content, ...]
    var date = postData[1];
    var author = postData[2];
    var type = postData[3];
    var category = postData[4] || '';
    var item = postData[5];
    var content = postData[6];

    // Color Logic
    var barColor = "#aa0000"; // Fallback
    
    // Logic for header color based on Type/Category
    if (type === '主管訊息') barColor = "#D32F2F"; // Red (BOSS)
    else if (category.includes('行政')) barColor = "#FF9800"; // Orange
    else if (category.includes('設計')) barColor = "#8E44AD"; // Purple
    else if (category.includes('施工')) barColor = "#2980B9"; // Blue
    else barColor = "#2c3e50"; // Default

    var titleLine = "【" + type + "】 " + (category ? "[" + category + "]" : "") + (item || "");

    // Dynamic Dashboard Link
    var dashboardUrl = "https://ben860228.github.io/Jingyi-PCM/";
    if (projectInfo && projectInfo.code) {
        dashboardUrl += "?project=" + encodeURIComponent(projectInfo.code);
    }
    
    // Truncate Content nicely
    var safeContent = String(content);
    if (safeContent.length > 200) safeContent = safeContent.substring(0, 200) + "...";

    return {
        "type": "bubble",
        "size": "giga",
        "header": {
            "type": "box",
            "layout": "vertical",
            "contents": [
                {
                    "type": "box",
                    "layout": "horizontal",
                    "contents": [
                        { "type": "text", "text": "📢", "flex": 0, "margin": "none" },
                        { "type": "text", "text": "進度回報", "weight": "bold", "color": "#ffffff", "size": "lg", "margin": "sm" }
                    ],
                    "alignItems": "center"
                },
                {
                    "type": "text",
                    "text": "專案 : " + projectName + " | " + date.replace(/-/g, '/'),
                    "color": "#ffffffcc", 
                    "size": "sm",
                    "margin": "md"
                }
            ],
            "backgroundColor": barColor,
            "paddingAll": "20px"
        },
        "body": {
            "type": "box",
            "layout": "vertical",
            "contents": [
                // Title Line
                {
                    "type": "text",
                    "text": titleLine,
                    "weight": "bold",
                    "size": "md",
                    "color": barColor, // Dynamic Color matching Header
                    "wrap": true
                },
                // Content
                {
                    "type": "text",
                    "text": safeContent,
                    "wrap": true,
                    "color": "#444444",
                    "size": "md",
                    "margin": "lg",
                    "lineSpacing": "6px"
                },
                // Divider
                { "type": "separator", "margin": "lg", "color": "#f0f0f0" },
                // Footer Info
                {
                    "type": "box",
                    "layout": "baseline",
                    "margin": "lg",
                    "contents": [
                        { "type": "text", "text": "回報者 :", "color": "#aaaaaa", "size": "xs", "flex": 0 },
                        { "type": "text", "text": author, "color": "#666666", "size": "xs", "margin": "sm" }
                    ]
                },
                // Link Button (Centered at bottom)
                {
                     "type": "button",
                     "action": { "type": "uri", "label": "查看儀表板", "uri": dashboardUrl },
                     "style": "link",
                     "height": "sm",
                     "color": "#aaaaaa",
                     "margin": "sm"
                }
            ],
            "paddingAll": "20px"
        }
    };
}
