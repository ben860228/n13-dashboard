# Google Apps Script (GAS) 後端模組說明

本目錄存放了從原始 `line_bot_backend.gs` 拆分出來的各個職責模組。
請依照以下說明將檔案內容複製到 Google Apps Script 編輯器中。

## 檔案列表與功能

### 1. `line_type_form.html` (前端表單)
*   **功能**：LIFF 網頁的前端介面 (HTML/CSS/JS)。
*   **用途**：透過 `App_Main.gs` 的 `doGet` 函式載入，提供使用者填寫回報單。

### 2. `App_Main.gs` (主程式入口)
*   **功能**：處理所有來自外部的請求 (Webhook & LIFF)。
*   **主要函式**：
    *   `doPost(e)`：接收 LINE 傳來的訊息事件。
    *   `doGet(e)`：雖然主要用於回傳 HTML，但也處理部分初始化邏輯。

### 3. `Config.gs` (設定檔)
*   **功能**：存放全域變數與常數。
*   **包含內容**：
    *   `CHANNEL_ACCESS_TOKEN` (LINE 存取權杖)
    *   `SPREADSHEET_ID` (Google Sheet ID)
    *   `WEB_APP_URL` (網頁應用程式網址)

### 4. `View_FlexMessages.gs` (視圖模板)
*   **功能**：產生漂亮 Flex Message 的 HTML/JSON 產生器。
*   **主要函式**：
    *   `createBulletinFlex`：產生「進度回報」的專案卡片樣式。

### 5. `Service_Line.gs` (LINE 服務)
*   **功能**：封裝所有與 LINE Messaging API 互動的邏輯。
*   **主要函式**：
    *   `handleMessage`：文字指令判斷 (選單、綁定、回報)。
    *   `replyText`, `replyFlex`：傳送回覆訊息。
    *   `sendMulticast`：推播訊息給多人。
    *   `processNameBinding`：中文姓名綁定邏輯。

### 6. `Service_SheetDB.gs` (資料庫服務)
*   **功能**：專門負責讀取 Google Sheet (Project Table, Staff Table)。
*   **主要函式**：
    *   `getLiffConfig`：LIFF 初始化時取得使用者與專案資料。
    *   `getProjectTasks`：讀取專案任務清單 (最複雜的試算表讀取函式)。
    *   `getProjectInfoById`：透過 ID 查找專案資訊。

### 7. `Service_Bulletin.gs` (發布與公告服務)
*   **功能**：處理「專案回報」相關的寫入與歷史紀錄。
*   **主要函式**：
    *   `submitBulletin`：新增一筆回報。
    *   `updateBulletin`：編輯/更新回報 (包含歷史歸檔)。
    *   `broadcastToProject`：當回報成功時，通知專案成員。

---

## 結構異動紀錄
*   **原始檔案**：`line_bot_backend.gs` (已移除)
*   **拆分日期**：2025-12-23
*   **目的**：提升可維護性，方便未來擴充「照片上傳」與「進階權限」功能。
