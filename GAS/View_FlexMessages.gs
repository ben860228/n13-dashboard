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
