# Jingyi PCM (專案管理戰情室)

這是一個專為營建工程設計的專案管理系統，整合了 Google Sheets 作為後端資料庫，並透過 LINE LIFF 提供行動端回報介面，最終在 Web 端呈現視覺化的戰情儀表板。

## 目錄結構說明

本專案主要分為「前端儀表板 (Web)」與「後端應用程式 (GAS)」兩大部分。

### 1. 前端頁面 (HTML)
*   **`index.html` (首頁/地圖索引)**
    *   系統的入口網頁。
    *   呈現台灣地圖與各專案的地理位置 (Pin)。
    *   點擊地標或透過網址參數 (`?project=...`) 可導向至各專案的儀表板。
*   **`JY_N13-dashboard.html`**
    *   「N13 專案」的專屬儀表板。
    *   預設載入 N13 的 CSV 資料源。
*   **`JY_Yuli-dashboard.html`**
    *   「花蓮玉里專案」的專屬儀表板。
    *   透過 `window.PROJECT_CONFIG` 設定該專案專屬的 CSV 資料源。

### 2. 核心邏輯 (JavaScript)
*   **`js/main.js` (儀表板核心)**
    *   負責讀取 CSV 資料 (使用 PapaParse)。
    *   繪製 S-Curve 曲線圖與甘特圖 (使用 Chart.js)。
    *   處理專案資訊卡片 (業主、設計監造等) 的渲染。
    *   處理「專案回報 (Bulletin)」的列表顯示。
*   **`js/script.js` (首頁地圖邏輯)**
    *   處理 `index.html` 的地圖互動效果。
    *   控制地標 (Pin) 的顯示與點擊事件。

### 3. 樣式設計 (CSS)
*   **`css/style.css` (全域樣式)**
    *   定義了儀表板的 Grid 佈局 (Grid Layout)。
    *   定義圖表容器、卡片風格、以及 RWD 響應式設計 (手機版適配)。
*   **`css/map-style.css` (地圖樣式)**
    *   專用於 `index.html` 的地圖視覺設計。
    *   包含地標 (Pin) 的 CSS 動畫 (呼吸燈效果) 與 Tooltip 樣式。

### 4. 後端應用 (Google Apps Script)
*   **`GAS/` 資料夾**
    *   存放所有與 LINE Bot、LIFF 表單以及 Google Sheet 互動的後端程式碼。
    *   詳細說明請參閱 [GAS/README.md](GAS/README.md)。

---

## 如何新增專案？
1.  複製一份現有的儀表板 (如 `JY_N13-dashboard.html`) 並重新命名。
2.  修改新檔案中的 `<title>` 與 `window.PROJECT_CONFIG` 內的 CSV 連結。
3.  **準備並發布以下 3 個 Google Sheets 工作表為 CSV**：
    *   **Tasks (進度表)**：包含任務名稱、開始/結束日期、權重、實際進度等欄位。
    *   **Info (專案資訊)**：包含專案名稱、業主、設計者、開始/結束日期等基本資料。
    *   **Bulletin (回報紀錄)**：用於儲存與讀取來自 LINE 的回報資料。
4.  在 `index.html` 中新增對應的地標按鈕 (Pin)。
5.  在 Google Sheet 後端 (project-table) 設定好對應的 `Project_ID`。

## 技術棧
*   **Frontend**: HTML5, CSS3, Vanilla JS
*   **Libraries**: Chart.js, PapaParse
*   **Backend**: Google Apps Script (GAS)
*   **Database**: Google Sheets (Published CSV)
*   **Integration**: LINE Messaging API, LIFF
