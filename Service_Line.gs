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
