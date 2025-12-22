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
    console.log("查詢 ID: [" + userId + "]");
    var app = SpreadsheetApp.openById(SPREADSHEET_ID);
    
    // 1. 讀取 Staff (容錯讀取)
    var staffSheet = app.getSheetByName('staff-table') || app.getSheetByName('Staff_List');
    if (!staffSheet) return { error: 'System Error', message: '找不到人員名單 (staff-table)' };

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
            var pName = projectData[i][1] || projectData[i][0];
            var pId = projectData[i][2]; 
            if (pId) { 
                projects.push({ name: pName, id: pId });
            }
        }
    }

    // 回傳結果
    return {
        success: true,
        isBound: userInfo.isBound,
        userName: userInfo.userName,
        isBoss: userInfo.isBoss,
        projects: projects,
        staffList: staffList, // 🆕 把名單傳給前端，以防需要手動登入
        savedId: userInfo.lineId || cleanUserId // 讓前端知道要存哪個 ID
    };
}

/**
 * [LIFF API] 提交公告
 */
function submitBulletin(data) {
    if (!data || !data.projectId || !data.lineUserId || !data.content) {
        throw new Error('Missing required fields');
    }

    // Double check identity
    var userInfo = getLiffConfig(data.lineUserId);
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
        // A: Timestamp, B: Date, C: Author, D: Type, E: Category, F: Item, G: Content, H: Images
        var rowData = [
            Utilities.formatDate(new Date(), "GMT+8", "yyyy/MM/dd HH:mm:ss"), // Timestamp
            data.date,       // Date
            userInfo.userName, // Author
            data.type,       // Type
            data.category || '', // Category
            data.item || '',   // Item (Work Item) - Column F
            data.content,     // Content - Column G
            ''               // Images placeholder - Column H
        ];

        targetSheet.appendRow(rowData);
        targetSheet.appendRow(rowData);
        
        // 🟢 觸發通知 (正式環境)
        try {
            broadcastToProject(data.projectId, rowData);
        } catch (err) {
            console.error("Broadcast Failed:", err);
            // 不阻擋發布成功
        }

        return '發佈成功';

    } catch (e) {
        console.error('Submit Error:', e);
        throw e;
    }
}

/**
 * [LIFF API] 取得專案任務列表
 */
/**
 * [LIFF API] 取得專案任務列表
 */
/**
 * [LIFF API] 取得專案任務列表 (Debug Mode)
 */
/**
 * [LIFF API] 取得專案任務列表 (Debug Mode)
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
                    { "type": "text", "text": "🖥️ 電腦版功能選單", "weight": "bold", "size": "xl", "align": "center", "color": "#1DB446" },
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
        replyFlex(replyToken, "電腦版功能選單", menuFlex);
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

    // 4. 帳號綁定教學 (改為觸發對話流程)
    if (userMessage === '帳號綁定' || userMessage === '綁定教學') {
        // 設定使用者狀態為 "BINDING_MODE"
        var userProps = PropertiesService.getUserProperties();
        userProps.setProperty(userId + '_state', 'BINDING_MODE');
        
        replyText(replyToken, "你的中文全名是？");
        return;
    }

    // 5. 檢查是否處於綁定模式
    var userProps = PropertiesService.getUserProperties();
    var userState = userProps.getProperty(userId + '_state');

    if (userState === 'BINDING_MODE') {
        // 清除狀態 (無論成功失敗，避免卡住)
        userProps.deleteProperty(userId + '_state');
        processNameBinding(replyToken, userId, userMessage);
        return;
    }

    // 6. 其他訊息 (檢查綁定並提示)
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

    // 檢查是否已被綁定 (Column Index 5: LINE_User_ID)
    var existingId = targetRow[5];
    if (existingId && String(existingId).trim() !== "") {
        if (String(existingId).trim() === String(userId).trim()) {
            replyText(replyToken, "您已經綁定過了，無需重複操作。");
        } else {
            replyText(replyToken, "綁定失敗請聯繫Ben (該姓名已被其他裝置綁定)");
        }
        return;
    }

    // 寫入 User ID
    sheet.getRange(foundRowIndex, 6).setValue(userId); // Column F is 6
    replyText(replyToken, "綁定成功！\n你好，" + cleanName + "。\n現在您可以點擊「專案回報」開始使用了。");
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
        replyText(replyToken, '您尚未綁定員工資料，請先進行帳號綁定來開通權限。');
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
        // 防呆：確保網址結尾是 /exec (避免跑到 /dev)
        if (scriptUrl.endsWith('/dev')) {
            scriptUrl = scriptUrl.replace('/dev', '/exec');
        }
    }
    
    // 組合專屬連結
    var longUrl = scriptUrl + "?uid=" + userId;
    
    // 轉成短網址
    var shortUrl = getShortUrl(longUrl);

    replyText(replyToken, "嗨 " + userName + "，這是您的專屬回報連結：\n" + shortUrl);
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
 * 執行綁定流程
 */
function processBinding(replyToken, userId, inputKey) {
    var app = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = app.getSheetByName('staff-table') || app.getSheets()[0];
    var data = sheet.getDataRange().getValues();

    // 欄位索引 (根據 CSV 結構)
    // primary key = 0
    // name_cht = 1
    // LINE_user_ID = 5

    var foundRowIndex = -1;
    var isAlreadyBound = false;
    var userName = '';

    // 從第 2 行開始遍歷 (跳過 Header)
    for (var i = 1; i < data.length; i++) {
        var row = data[i];

        // 比對 Primary Key
        if (String(row[0]).toLowerCase() === inputKey.toLowerCase()) {
            foundRowIndex = i + 1; // 實際行號 (1-based)
            userName = row[1]; // 中文姓名

            var existingLineId = row[5];
            // 檢查是否已綁定 (該 Key 已經有 ID)
            if (existingLineId && String(existingLineId).trim() !== '') {
                isAlreadyBound = true;
            }
            break;
        }
    }

    // 邏輯: 如果該 Key 已經有人用 (isAlreadyBound=true)，就會報錯。
    // 檢查這個 User ID 是否已經綁定過別的 Key
    if (!isAlreadyBound) {
        for (var i = 1; i < data.length; i++) {
            if (String(data[i][5]) === userId) {
                isAlreadyBound = true;
                break;
            }
        }
    }

    if (isAlreadyBound) {
        replyText(replyToken, '此帳號或是該 ID 已經綁定過了。');
        return;
    }

    if (foundRowIndex !== -1) {
        // 找到 Key 且未綁定 -> 執行寫入
        sheet.getRange(foundRowIndex, 6).setValue(userId); // 第 6 欄是 LINE_user_ID
        replyText(replyToken, '綁定成功！你好，' + userName + '。');
    } else {
        // 找不到 Key
        replyText(replyToken, '找不到此員工編號。');
    }
}

/**
 * 一般對話處理 (檢查身份)
 */
function checkAndReplyNormalMessage(replyToken, userId, userMessage) {
    var app = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = app.getSheetByName('staff-table') || app.getSheets()[0];
    var data = sheet.getDataRange().getValues();

    var isBound = false;

    for (var i = 1; i < data.length; i++) {
        if (String(data[i][5]) === userId) {
            isBound = true;
            break;
        }
    }

    if (!isBound) {
        replyText(replyToken, '請先輸入『綁定 [你的帳號]』來驗證身份。');
    } else {
        // 已綁定，暫無回應需求，或可回覆 Echo
        // replyText(replyToken, 'You said: ' + userMessage);
    }
}

/**
 * 處理追蹤 (加入好友) 事件 - 發送歡迎訊息
 */
function handleFollow(event) {
    var replyToken = event.replyToken;
    var userId = event.source.userId;
    
    // 取得使用者名稱 (非必要，但有更親切)
    var userProfile = getUserProfile(userId);
    var displayName = userProfile ? userProfile.displayName : "新夥伴";

    var welcomeFlexContent = {
        "type": "bubble",
        "hero": {
            "type": "image",
            "url": "https://img.freepik.com/free-vector/welcome-word-flat-cartoon-people-characters_81522-4207.jpg", 
            "size": "full",
            "aspectRatio": "20:13",
            "aspectMode": "cover",
            "action": {
                "type": "uri",
                "uri": "http://linecorp.com/"
            }
        },
        "body": {
            "type": "box",
            "layout": "vertical",
            "contents": [
                {
                    "type": "text",
                    "text": "歡迎加入經一 PCM 系統",
                    "weight": "bold",
                    "size": "xl"
                },
                {
                    "type": "text",
                    "text": "嗨 " + displayName + "，我是您的專案小幫手！\n請使用下方選單開始操作：",
                    "wrap": true,
                    "color": "#666666",
                    "margin": "md"
                }
            ]
        },
        "footer": {
            "type": "box",
            "layout": "vertical",
            "spacing": "sm",
            "contents": [
                {
                    "type": "button",
                    "style": "primary",
                    "height": "sm",
                    "color": "#6c757d",
                    "action": {
                        "type": "message",
                        "label": "專案回報",
                        "text": "專案回報"
                    }
                },
                {
                    "type": "button",
                    "style": "secondary",
                    "height": "sm",
                    "action": {
                        "type": "message",
                        "label": "帳號綁定",
                        "text": "帳號綁定"
                    }
                },
                {
                    "type": "button",
                    "style": "secondary",
                    "height": "sm",
                    "action": {
                        "type": "message",
                        "label": "使用教學",
                        "text": "使用教學"
                    }
                },
                {
                    "type": "button",
                    "style": "primary",
                    "height": "sm",
                    "color": "#0d6efd",
                    "action": {
                        "type": "uri",
                        "label": "開啟儀表板",
                        "uri": "https://ben860228.github.io/Jingyi-PCM/"
                    }
                },
                {
                    "type": "text",
                    "text": "(電腦版用戶可隨時輸入「選單」來召喚選單)",
                    "size": "xs",
                    "color": "#999999",
                    "align": "center",
                    "margin": "md"
                }
            ],
            "flex": 0
        }
    };

    replyFlex(replyToken, "歡迎加入！請查看功能選單", welcomeFlexContent);
}

/**
 * 取得使用者 Profile (取得暱稱用)
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

    try {
        UrlFetchApp.fetch(url, options);
    } catch (e) {
        console.error('Error sending reply:', e);
    }
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
