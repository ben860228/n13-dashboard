// Global Variables - Please verify and fill these in
var CHANNEL_ACCESS_TOKEN = 'VoAz9cbhWZf8Ip0ROd25Z2LJmiBe6e4i2W51fgZzvYQckcp8+6QfQIqU92XZuVcH6i+dChBnRyGvGG9oW5jH/16W+/7JTr9vCYpEbuHulInhJdetaHOEP37LoUqrLwxuxk46HdwilwDzLgQauM4LwwdB04t89/1O/w1cDnyilFU='; // 請填入 LINE Messaging API 的 Channel Access Token
var SPREADSHEET_ID = '1cLUBzhB-lcwlHSq3LzMAGQumJiNsIpkfbQrPKpTXw_I'; // 請填入 Google Sheet ID

/**
 * 接收 LINE Webhook 事件
 */
function doPost(e) {
    try {
        // 簡單的防呆，若無內容則回傳 OK
        if (!e || !e.postData || !e.postData.contents) {
            return HtmlService.createHtmlOutput('OK');
        }

        var json = JSON.parse(e.postData.contents);
        var events = json.events;

        for (var i = 0; i < events.length; i++) {
            var event = events[i];
            if (event.type === 'message' && event.message.type === 'text') {
                handleMessage(event);
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
 * [LIFF API] 取得使用者設定與專案列表
 */
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
            if (projectData[i][0]) projects.push({ name: projectData[i][0], id: projectData[i][1] });
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

        // Columns: Timestamp, Date, Author, Type, Category, Content, Images (optional)
        var rowData = [
            new Date(),      // Timestamp
            data.date,       // Date (from form)
            userInfo.userName, // Author (from verified binding)
            data.type,       // Type
            data.category || '', // Category (optional)
            data.content,     // Content,
            ''               // Images placeholder
        ];

        targetSheet.appendRow(rowData);
        return '發佈成功';

    } catch (e) {
        console.error('Submit Error:', e);
        throw e;
    }
}

/**
 * 處理文字訊息邏輯 (Webhook)
 */
/**
 * 處理文字訊息邏輯
 */
function handleMessage(event) {
    var replyToken = event.replyToken;
    var userId = event.source.userId;
    var userMessage = event.message.text.trim();

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

    // 3. 其他訊息 (檢查綁定並提示)
    checkAndReplyNormalMessage(replyToken, userId, userMessage);
}

/**
 * 產生專屬登入連結
 */
function generateMagicLink(replyToken, userId) {
    // 先檢查這個人有沒有綁定過，沒有綁定就不給連結
    var app = SpreadsheetApp.openById(SPREADSHEET_ID);
    var staffSheet = app.getSheetByName('staff-table') || app.getSheetByName('Staff_List');
    var data = staffSheet.getDataRange().getValues();
    var isBound = false;
    var userName = "";

    // 簡單檢查綁定
    for (var i = 1; i < data.length; i++) {
        // 去除空白比較保險
        if (String(data[i][5]).trim() === String(userId).trim()) {
            isBound = true;
            userName = data[i][1];
            break;
        }
    }

    if (!isBound) {
        replyText(replyToken, '您尚未綁定員工資料，請先輸入「綁定 [帳號]」來開通權限。');
        return;
    }

    // 取得目前的 Web App 網址
    var scriptUrl = ScriptApp.getService().getUrl();
    
    // 如果 ScriptApp 抓不到 (有時候會這樣)，請手動填入你剛剛複製的那串 /exec 網址
    // var scriptUrl = "https://script.google.com/.../exec"; 
    
    // 組合專屬連結 (把 ID 藏在參數裡)
    var magicUrl = scriptUrl + "?uid=" + userId;

    replyText(replyToken, "嗨 " + userName + "，這是您的專屬回報連結 (請勿轉傳)：\n" + magicUrl);
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
