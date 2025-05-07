# 卡路里快照 (Calorie Snapshot)

「卡路里快照」是一款網頁應用程式，旨在幫助使用者透過拍攝食物照片來估計卡路里、記錄餐點、追蹤每日飲水情況並管理個人健康資料。

## 主要功能

### 1. 卡路里估算與記錄
- **影像上傳與拍攝：** 支援從裝置上傳照片或直接使用相機拍攝食物照片。
- **影像裁切：** 在上傳或拍攝後，使用者可以裁切影像以聚焦於食物主體。
- **AI 卡路里估算：**
    - 使用 Genkit AI 技術分析食物影像，估算卡路里含量。
    - 自動辨識食物品項名稱（以繁體中文顯示）。
    - 若 AI 判斷影像中可能不是食物，會跳出警告提示，但仍允許使用者記錄。
- **編輯與記錄：**
    - 在正式記錄前，使用者可以編輯 AI 辨識的食物名稱和估算的卡路里。
    - 記錄內容包含：食物品項、卡路里、影像、時間戳（可編輯）、餐別（早餐、午餐、晚餐、點心 - 繁體中文）、地點（自動抓取或手動輸入）、花費金額。
    - 可為每筆記錄新增備註。
- **營養師建議：** 根據記錄的餐點內容及使用者的健康目標，自動產生初步的營養師建議（以提示方式顯示）。

### 2. 記錄摘要與檢視
- **日曆檢視模式：**
    - 以日曆形式呈現每日與每月的卡路里記錄。
    - 日曆會特別標註有卡路里記錄或飲水記錄的日期。
- **篩選與排序：**
    - **單日檢視：** 顯示選定日期的所有卡路里記錄，依照時間倒序排列。
    - **整月檢視：** 顯示選定月份的所有卡路里記錄，並提供多種排序方式（時間升冪/降冪、卡路里升冪/降冪）。
- **影像放大：** 在記錄摘要列表中，點擊食物照片縮圖可放大檢視。
- **編輯與刪除：** 使用者可以編輯或刪除任何一筆已記錄的卡路里項目。

### 3. 飲水追蹤
- **記錄飲水：**
    - 可輸入自訂飲水量或使用快速按鈕（如：一杯 250ml、一瓶 500ml）記錄。
    - 每筆飲水記錄包含時間戳與飲水量。
- **每日進度：** 根據個人資料計算或預設的每日建議飲水量，顯示當日飲水進度條。
- **飲水列表：** 顯示選定日期的所有飲水記錄，包含時間與飲水量。
- **刪除與重設：**
    - 可刪除單筆飲水記錄。
    - 可重設選定日期的所有飲水記錄（會有確認提示框）。
- **七日分析：** 以圖表形式展示最近七日的飲水習慣與達成目標情況。

### 4. 個人資料管理 (透過 Firebase Google 登入)
- **使用者驗證：** 支援使用 Google 帳號登入。
- **個人資料設定：**
    - 使用者可以編輯個人基本資料：年齡、生理性別、身高（公分）、體重（公斤）。
    - 設定活動量等級（從久坐到非常活躍，提供繁體中文描述）。
    - 設定健康目標（增肌、減脂、維持，提供繁體中文描述）。
- **健康指標計算：**
    - 根據個人資料自動計算並顯示 BMI（身體質量指數）、BMR（基礎代謝率）。
    - 根據個人資料與健康目標，計算並顯示每日建議卡路里攝取量。
    - 根據個人資料計算並顯示每日建議飲水量。
- **Apple 健康 (概念性)：** 介面中包含「連接 Apple 健康」的預留按鈕，為未來功能擴充做準備。

### 5. 成就系統
- **每日成就檢視：**
    - 預設顯示昨日的飲水與拍照記錄成就。
    - 使用者可透過日曆選擇特定日期查看該日的成就達成情況。
- **獎章激勵：** 以可愛的貓咪圖案作為獎章，根據目標達成情況給予不同的視覺回饋。

### 6. 設定
- **帳號管理：** 登入或登出應用程式。
- **飲水通知：**
    - 設定是否啟用喝水提醒通知。
    - 自訂提醒頻率（分鐘）、每日提醒的開始與結束時間。
    - 通知功能基於瀏覽器內建通知。

### 7. 使用者介面
- **語言：** 整體介面採用繁體中文。
- **響應式設計：** 採用 Tab 分頁導覽（記錄、飲水追蹤、成就、設定），適應不同螢幕尺寸。
- **快速操作：** 底部導覽列中央設有「+」按鈕，方便使用者快速新增記錄。
- **技術棧：** 使用 ShadCN UI 元件庫及 Tailwind CSS 進行樣式設計。

## 技術棧

- **前端框架：** Next.js (App Router)
- **核心庫：** React, TypeScript
- **樣式：** Tailwind CSS, ShadCN UI
- **圖示：** Lucide React
- **後端服務：**
    - **驗證：** Firebase Authentication (Google Sign-In)
    - **資料庫：** Firebase Firestore
- **AI服務：** Genkit (用於卡路里估算)
- **日期處理：** `date-fns`
- **影像處理：** `react-image-crop`
- **圖表：** `recharts`

## 開始使用

### 環境準備
1.  複製本專案庫。
2.  安裝專案依賴：
    ```bash
    npm install
    ```
3.  **設定 Firebase:**
    *   前往 [Firebase Console](https://console.firebase.google.com/) 建立一個新的 Firebase 專案 (或使用現有專案)。
    *   在專案中啟用 **Authentication**服務，並開啟 **Google** 登入方式。
    *   在專案中啟用 **Firestore Database**服務。
    *   在 Firebase 專案設定中，找到您的 Web 應用程式設定資訊（包含 API 金鑰、驗證網域等）。
    *   在專案根目錄下建立一個 `.env` 檔案，並填入您的 Firebase 設定變數，例如：
        ```env
        NEXT_PUBLIC_FIREBASE_API_KEY=YOUR_API_KEY
        NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=YOUR_AUTH_DOMAIN
        NEXT_PUBLIC_FIREBASE_PROJECT_ID=YOUR_PROJECT_ID
        NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=YOUR_STORAGE_BUCKET
        NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=YOUR_MESSAGING_SENDER_ID
        NEXT_PUBLIC_FIREBASE_APP_ID=YOUR_APP_ID
        # NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=YOUR_MEASUREMENT_ID (選填)
        ```
4.  **設定 Genkit (Google AI):**
    *   確保您已擁有 Google AI 的 API 金鑰。
    *   在 `.env` 檔案中設定 `GOOGLE_GENAI_API_KEY` 環境變數，用於卡路里估算功能：
        ```env
        GOOGLE_GENAI_API_KEY=YOUR_GOOGLE_GENAI_API_KEY
        ```
5.  **啟動開發伺服器:**
    *   啟動 Next.js 開發伺服器：
        ```bash
        npm run dev
        ```
    *   在另一個終端機視窗中，啟動 Genkit 開發伺服器 (用於 AI 功能)：
        ```bash
        npm run genkit:dev
        ```
        或使用監看模式：
        ```bash
        npm run genkit:watch
        ```

## 可用腳本

-   `npm run dev`: 啟動 Next.js 開發模式伺服器。
-   `npm run genkit:dev`: 啟動 Genkit 開發模式伺服器。
-   `npm run genkit:watch`: 啟動 Genkit 開發模式伺服器並進入監看模式。
-   `npm run build`: 建置應用程式以供生產環境使用。
-   `npm run start`: 啟動生產模式伺服器。
-   `npm run lint`: 執行程式碼風格檢查。
-   `npm run typecheck`: 執行 TypeScript 型別檢查。

---
> [!NOTE]
> use firebase studio
