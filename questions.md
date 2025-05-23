## 核心功能與介面
### 基本編輯能力
- 使用者可以自由編輯品項名稱、吃東西的地點、餐別（早/午/晚餐）、金額。
- 使用者可以自由編輯上傳的卡路里及時間。
- 卡路里在上傳及紀錄時都可以編輯。
- 時間在紀錄時也要可以編輯。
- 使用者可以刪除單一卡路里紀錄。
### 圖片處理
- 上傳照片時允許使用者裁切圖片。
- 裁切時預設整張圖。
- 裁切後的圖片壓縮，但要保持圖片比例與大小不變。
- 確認裁剪後可以跳出提示文字。
### AI 估算
- 自動帶入的食物名稱預設為繁體中文。
上傳圖片，但 AI 判斷不是食物時，跳出警告但不阻止使用者上傳。
### 記錄呈現與摘要
- 點擊記錄摘要列表中的圖片可以放大檢視。
- 記錄列表的備註提供 Tooltip 顯示完整內容。
### 飲水追蹤
- 新增飲水紀錄時，可以自訂時間與飲水量。
- 重設今日飲水紀錄時，跳出確認提示框。
- 每日飲水追蹤頁面，以進度條顯示當日飲水進度。
- 以圖表顯示近七日的飲水分析，並在各點下方顯示日期與飲水量。
### 成就系統
- 成就部分不只飲水，拍照的部分也要，並且使用日曆表示。
- 成就預設顯示昨日，但可透過日曆選擇特定日期查看成就。
- 獎章使用可愛的貓咪圖案。
### 設定
- 個人資料設定包含年齡、性別、身高、體重、活動量、健康目標（增肌/減脂/維持）。
- 可以設定是否啟用喝水提醒通知，並自訂提醒頻率與時間範圍。
### 外觀與樣式
- 整體介面採用繁體中文。
- 日曆的樣式調整移除被選取日期的橘色底框。
- 確保 App 樣式在各種螢幕尺寸下正常呈現。
### 個人資料設定
- 設定分為手動設定與串接 Apple 健康
- 使用 Google Auth2.0 做登入 且將資訊紀錄在資料庫
## 主要錯誤排除
- 解決因 LocalStorage 空間不足導致的錯誤。
- 解決 React Hook 呼叫順序不一致導致的錯誤（Hydration failed）。
- 修正卡路里記錄中的金額顯示錯誤。
- 修正與地理位置相關的錯誤。
- 修正缺少 Firebase API 金鑰導致的驗證錯誤。
- 修正缺少套件導致的解析錯誤。
### 其他改善
- 將主功能移到下方，並在中間增加「+」按鈕快速新增記錄。
- 將卡路里記錄摘要改為日曆顯示，點擊日期展開當日記錄。
- 於「卡路里記錄摘要」增加單日/整月檢視模式，並提供排序選項。
- 重新設計 Tab 分頁，將功能更合理地分類。
- 將可編輯的輸入欄位底色改為灰色。
