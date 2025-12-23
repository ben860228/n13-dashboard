# ⚠️ Google Apps Script 部署指南

由於我們將原本的單一檔案 `line_bot_backend.gs` 拆分成多個模組，您在 Google Apps Script (GAS) 編輯器中需要進行以下操作：

1.  **刪除**原本的 `line_bot_backend.gs`。
2.  **新增**以下 7 個檔案 (點擊 "+" -> "Script" 或 "HTML")：
    *   `Config` (.gs)
    *   `App_Main` (.gs)
    *   `Service_Line` (.gs)
    *   `Service_SheetDB` (.gs)
    *   `Service_Bulletin` (.gs)
    *   `View_FlexMessages` (.gs)
    *   `line_type_form` (.html) (由 `GAS/line_type_form.html` 複製內容)
3.  **複製內容**：請將 GitHub 上 `GAS/` 資料夾內對應檔案的內容複製到這幾個新檔案中。
4.  **重新部署**：
    *   點擊右上角「部署 (Deploy)」 -> 「管理部署 (Manage deployments)」。
    *   點擊上方的「編輯 (Edit)」(鉛筆圖示)。
    *   **版本 (Version)** 選擇「新版本 (New version)」。
    *   點擊「部署 (Deploy)」。

**注意：** 您原本的 Web App URL **不會改變**，只要選擇「更新」並發布新版本即可。 GAS 會自動將這些檔案視為同一個專案執行。
