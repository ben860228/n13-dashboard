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
