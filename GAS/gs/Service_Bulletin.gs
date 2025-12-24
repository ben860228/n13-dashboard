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
 * [LIFF API] 刪除公告
 */
function deleteBulletin(data) {
    // data: { projectId, lineUserId, uuid }
    var userInfoStr = getLiffConfig(data.lineUserId);
    var userInfo = JSON.parse(userInfoStr);
    
    if (!userInfo.success) throw new Error('Auth Failed');
    
    // 1. Find the Post
    var targetSpreadsheetId = data.projectId;
    if (data.projectId.indexOf('_') > 0 || data.projectId.length < 20) {
        var pInfo = getProjectInfoById(data.projectId);
        if (pInfo && pInfo.spreadsheetId) targetSpreadsheetId = pInfo.spreadsheetId;
        else throw new Error('Project ID Not Found');
    }

    var app = SpreadsheetApp.openById(targetSpreadsheetId);
    var sheet = app.getSheetByName('bulletin');
    
    // Check History Sheet
    var histSheet = app.getSheetByName('bulletin_history');
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

    if (targetRowIndex === -1) throw new Error('Post not found (UUID mismatch)');
    
    // Verify Author
    if (String(targetRowData[2]) !== userInfo.userName) {
        throw new Error('Permission denied: You can only delete your own posts.');
    }

    // 2. Archive to History (Mark as DELETED in Content or Type?)
    // Decision: Keep original data, maybe append [DELETED] to type or content in history?
    // Let's store pure snapshot. 
    // We can add a special marker if needed, but the fact it is in history and not in main means it was either edited or deleted.
    // To distinguish, maybe we can rely on "ArchivedAt" timestamp.
    // But to be explicit, let's just archive the exact state before delete.

    var archivedAt = Utilities.formatDate(new Date(), "GMT+8", "yyyy/MM/dd HH:mm:ss");
    var historyRow = [
        data.uuid,         // Ref_UUID
        archivedAt,        // ArchivedAt
        targetRowData[0],  // Original Timestamp
        targetRowData[1],  // Date
        targetRowData[2],  // Author
        targetRowData[3],  // Type (We could append "(Deleted)" here if we want explicit flag)
        targetRowData[4],  // Category
        targetRowData[5],  // Item
        targetRowData[6],  // Content
        targetRowData[7],  // Images
        targetRowData[9]   // Old EditedAt
    ];
    // Mark as Deleted in History for clarity
    historyRow[5] += " (SYSTEM: DELETED)"; // Append to Type or Item? 
    // Let's modify the 'Type' column (Index 5 in historyRow array corresponds to Type? Wait.)
    // historyRow indices: 
    // 0:uuid, 1:archivedAt, 2:orig_ts, 3:date(orig_row[1]), 4:author(orig_row[2]), 5:type(orig_row[3])
    // So historyRow[5] is Type.
    historyRow[5] = historyRow[5] + " (已刪除)";

    histSheet.appendRow(historyRow);

    // 3. Delete Row
    sheet.deleteRow(targetRowIndex);

    return JSON.stringify({ success: true, message: '刪除成功' });
}

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
