// Global Variables - Please verify and fill these in
var CHANNEL_ACCESS_TOKEN = 'YOUR_CHANNEL_ACCESS_TOKEN'; // 請填入 LINE Messaging API 的 Channel Access Token
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
 * 處理文字訊息邏輯
 */
function handleMessage(event) {
    var replyToken = event.replyToken;
    var userId = event.source.userId;
    var userMessage = event.message.text.trim();

    // 檢查是否為綁定指令: "綁定 [Key]"
    if (userMessage.startsWith('綁定 ')) {
        var inputKey = userMessage.substring(3).trim();
        if (inputKey) {
            processBinding(replyToken, userId, inputKey);
        } else {
            replyText(replyToken, '請輸入正確的綁定格式，例如：「綁定 ben.liu」');
        }
        return;
    }

    // 非綁定指令，檢查是否已綁定
    checkAndReplyNormalMessage(replyToken, userId, userMessage);
}

/**
 * 執行綁定流程
 */
function processBinding(replyToken, userId, inputKey) {
    // 取得 Sheet
    var app = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = app.getSheets()[0]; // 假設資料在第一個 Sheet，若有指定名稱可改用 getSheetByName('Staff')
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
    var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheets()[0];
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
