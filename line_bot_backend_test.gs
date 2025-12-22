// Global Variables - Please verify and fill these in
var CHANNEL_ACCESS_TOKEN = 'q+7WxZqQd2v00JebCBzwDklmkKH9PfDnrw8kRO7LmVDEIDxAfdpqeu8KTYK5DNUPB1yE5GIwYpI2t2uGVSkrrGI3qgdRnAfRniqJqI7uwsu8ifJ8LfP+Nlz90ICzXJTT+MoIplMnCLeq/oGn0VBBHgdB04t89/1O/w1cDnyilFU='; // 請填入 LINE Messaging API 的 Channel Access Token
var SPREADSHEET_ID = '1cLUBzhB-lcwlHSq3LzMAGQumJiNsIpkfbQrPKpTXw_I'; // 請填入 Google Sheet ID

// 🟢 請在此填入您的 Web App URL (以 /exec 結尾的那串)
// 這樣可以確保電腦版連結絕對正確，不會跳到錯誤頁面
var WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbw1h6gDAPdJDG5TktuhFv_SPP--svNamwy-TvKUcTSrwbVS5AGA3NnvxgQxCIsH3XcuOw/exec'; 

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
    // ★★★ TEST MODE: Open Test Form ★★★
    var template = HtmlService.createTemplateFromFile('line_type_form_test');
    
    // 關鍵修改：直接從後端接收參數，如果沒有就給空字串
    // 這樣可以避開前端抓不到網址參數的問題
    template.serverUid = (e && e.parameter && e.parameter.uid) ? e.parameter.uid : '';
    
    return template.evaluate()
        .setTitle('JingYi Pubish System (TEST)')
        .addMetaTag('viewport', 'width=device-width, initial-scale=1')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * [LIFF API] 取得使用者設定與專案列表 (支援手動登入版)
 */
function getLiffConfigTest(userId) {
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
                // Use Name for display, Spreadsheet_ID for value (to allow backend access)
                var pName = projectData[i][1] || projectData[i][0]; // Fallback to Code if Name empty
                var pId = projectData[i][2]; 
                if (pId) { // Only add if Spreadsheet ID exists
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
 * [LIFF API] 提交表單資料 (Test Version)
 */
function submitBulletinTest(data) {
    console.log("Submit Data (Test):", JSON.stringify(data));
    if (!data || !data.projectId || !data.lineUserId || !data.content) {
        throw new Error('Missing required fields');
    }

    // Double check identity
    var userInfoStr = getLiffConfigTest(data.lineUserId);
    var userInfo = JSON.parse(userInfoStr);

    if (!userInfo.success) {
        throw new Error('Authentication failed');
    }

    // Permission Check Logic for '主管訊息' handled in Frontend mostly, but could enforce here.
    if (data.type === '主管訊息' && !userInfo.isBoss) {
        throw new Error('Permission denied: You are not authorized to post boss messages.');
    }

    try {
        var targetSheet = SpreadsheetApp.openById(data.projectId).getSheetByName('bulletin');
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

        // 🟢 觸發通知 (測試環境)
        try {
            broadcastToProject(data.projectId, rowData);
        } catch (err) {
            console.error("Broadcast Failed:", err);
            // 不阻擋發布成功
        }

        return '發佈成功 (測試環境)';

    } catch (e) {
        console.error('Submit Error:', e);
        throw e;
    }
}

/**
 * [LIFF API] 取得使用者最近的回報紀錄 (用於編輯選單)
 */
function getMyRecentBulletinsTest(config) {
   // config: { projectId, lineUserId }
   var userInfoStr = getLiffConfigTest(config.lineUserId);
   var userInfo = JSON.parse(userInfoStr);
   
   if (!userInfo.success) return JSON.stringify({ success: false, message: 'Auth Failed' });

   try {
       var app = SpreadsheetApp.openById(config.projectId);
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
 * [LIFF API] 更新公告 (編輯功能)
 */
function updateBulletinTest(data) {
    // data: { projectId, lineUserId, uuid, date, type, category, item, content }
    var userInfoStr = getLiffConfigTest(data.lineUserId);
    var userInfo = JSON.parse(userInfoStr);
    
    if (!userInfo.success) throw new Error('Auth Failed');
    
    // 1. Find the Post
    var app = SpreadsheetApp.openById(data.projectId);
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

 */
function getProjectTasks(projectId) {
    var logs = [];
    logs.push("Start: " + projectId);

    // Default to empty array if projectId is missing
    if (!projectId) return JSON.stringify({ success: false, logs: ["No Project ID"], tasks: [] });

    try {
        var app;
        try {
            // Try openById (Requires Scope)
            app = SpreadsheetApp.openById(projectId);
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
                    { "type": "text", "text": "🖥️ [測試] 功能選單", "weight": "bold", "size": "xl", "align": "center", "color": "#E67E22" },
                    { "type": "separator", "margin": "md" },
                    { "type": "text", "text": "此專案為開發測試用：", "margin": "md", "color": "#aaaaaa", "size": "sm" },
                    {
                        "type": "box", "layout": "vertical", "margin": "md", "spacing": "sm",
                        "contents": [
                            {
                                "type": "button", "style": "primary", "height": "sm", "color": "#6c757d", "action": { "type": "message", "label": "📢 專案回報", "text": "專案回報" }
                            },
                            {
                                "type": "button", "style": "secondary", "height": "sm", "action": { "type": "message", "label": "🔗 帳號綁定", "text": "帳號綁定" }
                            }
                        ]
                    }
                ]
            }
        };
        replyFlex(replyToken, "測試版選單", menuFlex);
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
        replyText(replyToken, "【測試環境】\n這是測試用的機器人。");
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
    replyText(replyToken, "綁定成功！\n你好，" + cleanName + "。\n(測試環境)");
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
        replyText(replyToken, '您尚未綁定員工資料 (測試版)。');
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

    replyText(replyToken, "Hi " + userName + "，[測試用] 回報連結：\n" + shortUrl);
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
    // Same simply check
    // ...
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
                { "type": "text", "text": "測試用機器人", "weight": "bold", "size": "xl" },
                { "type": "text", "text": "請進行綁定測試", "margin": "md" }
            ]
        }
    };
    replyFlex(replyToken, "歡迎加入測試", welcomeFlexContent);
}

/**
 * 取得使用者 Profile
 */
function getUserProfile(userId) {
    // Same
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
        console.log("No members to notify for project: " + projectId);
        return;
    }

    // 2. 轉換為 Line User IDs
    var userIds = getLineIdsByKeys(memberKeys);
    if (!userIds || userIds.length === 0) {
        console.log("No valid Line IDs found for keys:", memberKeys);
        return;
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
    sendMulticast(userIds, msgContent, altText);
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
            if (String(data[i][1]).trim() === String(chtName).trim()) {
                var eng = data[i][2];
                return (eng && String(eng).trim() !== "") ? eng : chtName;
            }
        }
    } catch(e) { console.error(e); }
    return chtName;
}

/**
 * [New] 透過 Spreadsheet ID 查詢專案資訊
 * 回傳 { name: "N13", code: "n13" }
 */
function getProjectInfoById(spreadsheetId) {
    try {
        var app = SpreadsheetApp.openById(SPREADSHEET_ID);
        var sheet = app.getSheetByName('project-table') || app.getSheetByName('Project_List');
        var data = sheet.getDataRange().getValues();
        // CSV: Project_ID(0), Project_Name(1), Spreadsheet_ID(2)
        for (var i = 1; i < data.length; i++) {
            // 比對 2 (Spreadsheet ID)
            if (String(data[i][2]).trim() === String(spreadsheetId).trim()) {
                var pName = data[i][1]; // e.g. "N13"
                var pId = data[i][0];   // e.g. "JY_N13"
                
                // 嘗試從 Project_Name 取得連結代碼 (e.g. N13 -> n13)
                // 若 Project_Name 是中文 (e.g. 玉里)，則嘗試用 Project_ID (e.g. JY_Yuli -> jy_yuli)或 fallback
                var code = String(pName).toLowerCase();
 
                 // 簡單判斷：如果 Name 包含中文，改用 ID
                if (/[\u4e00-\u9fa5]/.test(code)) {
                     code = String(pId).toLowerCase().replace('jy_', ''); 
                }
                
                return { name: pName, code: code };
            }
        }
    } catch (e) { console.error(e); }
    return { name: "未知", code: "index" };
}

/**
 * 從 project-table 取得成員 Keys
 */
function getProjectMemberKeys(projectId) {
    // 🟢 [測試模式] 強制指定接收者，以免打擾其他人
    // 請在此處修改您希望收到測試訊息的人員 Key
    return ['ben.liu', 'drew.lin'];

    /* ==========================================================
       以下為正式版邏輯 (暫時註解掉，您可以隨時取消註解來測試真實讀取)
       ========================================================== 
    var app = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = app.getSheetByName('project-table') || app.getSheetByName('Project_List');
    var data = sheet.getDataRange().getValues();
    
    var members = [];
    
    for (var i = 1; i < data.length; i++) {
        // 修正: 這裡收到的 projectId 是 Spreadsheet ID，所以要比對 Col C (index 2)
        if (String(data[i][2]).trim() === String(projectId).trim()) {
            var row = data[i];
            // 從第 3 欄開始往後抓 (Col D onwards, index 3)
            for (var c = 3; c < row.length; c++) {
                var val = String(row[c]).trim();
                if (val) members.push(val);
            }
            break;
        }
    }
    return members;
    */
}

/**
 * 從 staff-table 轉換 Keys 為 Line IDs
 */
function getLineIdsByKeys(keys) {
    var app = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = app.getSheetByName('staff-table') || app.getSheetByName('Staff_List');
    var data = sheet.getDataRange().getValues();
    
    // 建立 Key -> ID 的 Map
    // Key: Col 0, LineID: Col 5
    var map = {};
    for (var i = 1; i < data.length; i++) {
        var k = String(data[i][0]).toLowerCase().trim();
        var id = String(data[i][5]).trim();
        if (k && id) map[k] = id;
    }
    
    var resultIds = [];
    // 使用 Set 去除重複 (如果有的話)
    var seen = {};
    
    keys.forEach(function(key) {
        var loopKey = String(key).toLowerCase().trim();
        if (map[loopKey] && !seen[map[loopKey]]) {
            resultIds.push(map[loopKey]);
            seen[map[loopKey]] = true;
        }
    });

    return resultIds;
}

/**
 * 發送 Multicast 訊息
 */
function sendMulticast(userIds, flexContents, altText) {
    // Default alt text if missing
    var finalAlt = altText || '📢 新的專案回報';

    var url = 'https://api.line.me/v2/bot/message/multicast';
    var payload = {
        'to': userIds,
        'messages': [{
            'type': 'flex',
            'altText': finalAlt,
            'contents': flexContents
        }]
    };
    
    try {
        UrlFetchApp.fetch(url, {
            'headers': {
                'Content-Type': 'application/json; charset=UTF-8',
                'Authorization': 'Bearer ' + CHANNEL_ACCESS_TOKEN
            },
            'method': 'post',
            'payload': JSON.stringify(payload)
        });
        console.log("Multicast Sent to " + userIds.length + " users.");
    } catch (e) {
        console.error("Multicast Error:", e.toString());
    }
}

/**
 * 建立通知卡片
 */
function createBulletinFlex(pName, row, projectInfo) {
    // row: [Timestamp, Date, Author, Type, Category, Item, Content, ...]
    var date = row[1];
    var author = row[2];
    var type = row[3];
    var category = row[4];
    var item = row[5];
    var content = row[6];
    
    // Dynamic Dashboard URL
    // 使用 Project Code 組合網址: {code}-dashboard.html
    // e.g. n13-dashboard.html
    var baseUrl = "https://ben860228.github.io/Jingyi-PCM/";
    var dashboardUrl = baseUrl;
    
    if (projectInfo && projectInfo.code && projectInfo.code !== "index") {
        dashboardUrl = baseUrl + projectInfo.code + "-dashboard.html";
    }
    
    // 簡單的顏色邏輯
    var barColor = "#333333";
    if (type === '主管訊息') barColor = "#E74C3C";
    else if (category.includes('行政')) barColor = "#95A5A6";
    else if (category.includes('設計')) barColor = "#3498DB";
    else if (category.includes('施工')) barColor = "#F1C40F";

    return {
        "type": "bubble",
        "size": "giga",
        "header": {
            "type": "box",
            "layout": "vertical",
            "backgroundColor": barColor,
            "paddingAll": "15px",
            "contents": [
                {
                    "type": "text",
                    "text": "📢 " + type,
                    "color": "#FFFFFF",
                    "weight": "bold",
                    "size": "lg"
                },
                {
                    "type": "text",
                    "text": "專案：" + pName + " | " + date,
                    "color": "#EEEEEE",
                    "size": "xs",
                    "margin": "sm"
                }
            ]
        },
        "body": {
            "type": "box",
            "layout": "vertical",
            "contents": [
                {
                    "type": "text",
                    "text": (category ? "【" + category + "】" : "") + (item || ""),
                    "weight": "bold",
                    "color": "#1DB446",
                    "size": "sm"
                },
                {
                    "type": "text",
                    "text": content,
                    "wrap": true,
                    "margin": "md",
                    "color": "#555555"
                },
                {
                    "type": "separator",
                    "margin": "lg"
                },
                {
                    "type": "box",
                    "layout": "horizontal",
                    "margin": "md",
                    "contents": [
                        {
                            "type": "text",
                            "text": "回報者： " + author,
                            "size": "xs",
                            "color": "#aaaaaa",
                            "flex": 1
                        }
                    ]
                }
            ]
        },
        "footer": {
            "type": "box",
            "layout": "vertical",
            "contents": [
                {
                    "type": "button",
                    "style": "link",
                    "height": "sm",
                    "action": {
                        "type": "uri",
                        "label": "查看儀表板",
                        "uri": dashboardUrl
                    }
                }
            ]
        }
    };
}

