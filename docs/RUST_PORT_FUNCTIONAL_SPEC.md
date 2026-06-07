# Gym Nexus 後端 Rust Port 功能規格書
版本：Dirty-room functional specification draft 1
日期：2026-06-07
目的：供 clean-room Rust 實作團隊重建後端服務行為使用

## 一、淨室邊界與文件規則

1. 本文件只描述可觀察功能、輸入、輸出、狀態轉移、錯誤情境與資料約束。
2. 本文件不得作為原系統程式碼、內部識別符、函式名稱或演算法的替代品。Rust 實作團隊應以本文件建立新的設計與實作。
3. API 路徑、HTTP 方法、公開 JSON 欄位、狀態字串、錯誤訊息、環境變數名稱、資料表概念屬於外部契約或部署契約，可被規格化。
4. 若本文件描述「計算規則」，只描述輸入與輸出之間必須滿足的可驗證行為，不描述原版實作流程。
5. 原始碼觀察顯示目前有兩個後端面向：主要健身房管理 API，以及獨立 HR 微服務。Rust port 可以合併為單一服務，也可以保留兩服務部署；但必須維持本文列出的外部行為。
6. 使用者特別提到的「建議 HR」在目前可觀察實作中沒有獨立 recommendation service。現有行為涵蓋 HR 考勤、請假、排班、薪資、績效、補打卡與前端 HR core 的建議型摘要需求。本文件將「HR 建議」定義為 Rust 版應輸出的 HR 決策摘要與提醒，不要求複製不存在的原始模組。

## 二、系統總覽

1. 系統是一套多租戶、多分店健身房管理後端。
2. 主要使用者類型包含系統管理者、租戶管理者、分店管理者、櫃檯/一般員工、教練、會員、人資角色。
3. 主要功能域包含：認證、租戶與分店、員工與職稱、會員、合約、合約異動、付款、課程、預約、入場/打卡、會員 App、教練 App、行銷、通知、報表、檔案、PDF、HR 薪資、HR 績效、HR 考勤、班表與獨立 HR 微服務。
4. 主要 API 預設埠為 8056。獨立 HR 微服務預設埠為 3001。
5. 預設時區要求：排程與營運日切以 Asia/Taipei 為準；HTTP 中傳輸的時間可使用 ISO 8601。
6. 系統應支援 CORS，允許前端網域以 cookie 或 token 呼叫 API，並允許 Content-Type、Authorization、X-Branch-Id、X-Tenant-Id、X-Member-Token、X-Coach-Token 等公開標頭。
7. 主要 API 根路徑回傳服務名稱、版本與執行狀態。
8. 未命中的路由應回傳 JSON，表示失敗與「路由不存在」，HTTP 404。
9. 未處理例外在非 production 可回傳錯誤文字；production 應回傳一般伺服器錯誤訊息，HTTP 500。

## 三、共同 HTTP 回應規格

1. 管理系統 API 成功回應通常包含 success=true，以及 data、message、pagination、stats 或其他與端點相關的物件。
2. 管理系統 API 失敗回應通常包含 success=false 與 error。
3. 會員與教練 App 的未授權錯誤應包含 success=false、error 與 code=UNAUTHORIZED，HTTP 401。
4. 獨立 HR 微服務成功回應通常包含 data，並可包含 meta。
5. 獨立 HR 微服務錯誤回應包含 error 與 code；驗證錯誤可包含 details 陣列。
6. 驗證失敗應回傳 HTTP 400。
7. 未授權應回傳 HTTP 401。
8. 權限不足應回傳 HTTP 403。
9. 找不到資源應回傳 HTTP 404。
10. 唯一性衝突或重複資源應回傳 HTTP 409 或在主要 API 中回傳 HTTP 400，依既有端點行為維持。
11. 速率限制超過時應回傳 HTTP 429，並提供重試資訊標頭。

## 四、認證與授權

### 4.1 員工/管理端認證

1. 員工登入端點：POST /api/auth/login。
2. 輸入：email、password。
3. email 必須是有效 email 格式；password 不得為空。
4. 登入時 email 比對不分大小寫，系統儲存與回傳時應正規化為小寫。
5. 若帳號不存在、停用或密碼錯誤，回傳 HTTP 401，錯誤不得透露是哪一項不正確。
6. 登入成功回傳 HTTP 200，success=true，data 中包含可供後續 Authorization Bearer 使用的 token、使用者資料，以及若已連結員工則包含員工、分店與職稱摘要。
7. 成功登入應建立伺服端 session，並可透過 cookie 或 Bearer token 驗證。
8. GET /api/auth/me 需要有效認證；成功回傳目前使用者與關聯員工摘要；沒有 token 或 token 無效回傳 HTTP 401。
9. POST /api/auth/logout 需要有效認證；成功後使目前 session/token 失效；後續使用同 token 呼叫 /api/auth/me 必須回傳 HTTP 401。
10. POST /api/auth/change-password 需要有效認證；輸入 currentPassword、newPassword；新密碼至少 8 字元；目前密碼錯誤時拒絕；成功後更新密碼。
11. 停用帳號不得通過 require-auth 保護的端點，應回傳 HTTP 403。
12. 登入端點應有較嚴格的速率限制；非測試環境中，同一來源 15 分鐘內超過設定次數應回傳 HTTP 429。

### 4.2 會員 App 認證

1. 會員 App 使用 X-Member-Token 標頭傳遞 access token。
2. 受保護會員端點未提供 token 或 token 無效時，回傳 HTTP 401、code=UNAUTHORIZED。
3. 會員 token 成功驗證後，服務可取得會員 ID、會員編號、分店與租戶資訊。
4. 會員 access token 有效期要求為 24 小時；refresh token 有效期要求為 7 天。
5. token 必須帶有可區分會員 access 與會員 refresh 的型態資訊；使用錯誤型態 token 呼叫 protected endpoint 應視為無效。

### 4.3 教練 App 認證

1. 教練 App 使用 X-Coach-Token 標頭傳遞 access token。
2. 受保護教練端點未提供 token 或 token 無效時，回傳 HTTP 401、code=UNAUTHORIZED。
3. 教練 token 成功驗證後，服務可取得員工 ID、員工編號、分店、租戶與職稱資訊。
4. 教練 access token 有效期要求為 24 小時；refresh token 有效期要求為 7 天。
5. token 必須帶有可區分教練 access 與教練 refresh 的型態資訊；使用錯誤型態 token 呼叫 protected endpoint 應視為無效。

### 4.4 租戶與分店上下文

1. 員工登入後若使用者資料有租戶，受保護端點應可取得租戶上下文。
2. X-Branch-Id 標頭或 branch_id query 可指定分店上下文。
3. 需要租戶上下文的端點若無租戶，回傳 HTTP 400。
4. 一般租戶資料應依租戶隔離；分店資料應依使用者角色或輸入分店隔離。
5. 超級管理者可跨租戶存取管理端租戶列表；一般租戶使用者不可操作其他租戶資料。

## 五、核心資料實體行為

### 5.1 租戶

1. 租戶具有名稱、slug、聯絡 email、電話、方案、配額、狀態、試用結束日、計費週期、下一次計費日、月費與設定。
2. 租戶狀態至少支援 trial、active、suspended、cancelled。
3. 方案至少支援 starter、professional、enterprise、custom。
4. 租戶配額至少包含分店數、會員數、員工數與儲存容量。
5. GET /api/admin/tenants 回傳所有租戶、每租戶目前用量、用量百分比，以及總租戶數、活躍租戶數、試用租戶數、停權租戶數、接近配額風險租戶數、總會員數、總員工數、總分店數。
6. 租戶接近配額風險定義為任一主要配額使用率達 90% 或以上。
7. GET /api/admin/tenants/{id} 回傳單一租戶與會員、員工、分店用量；不存在回傳 HTTP 404。
8. GET /api/tenant 回傳目前租戶資料；無租戶上下文回傳 HTTP 400；找不到租戶回傳 HTTP 404。
9. GET /api/tenant/quota 回傳目前用量、限制與可用量。儲存容量目前若未接入實際統計，應回傳 0 已用。
10. GET /api/tenant/quota/check/{resource} 支援 members、employees、branches；不支援的 resource 回傳 HTTP 400；支援時回傳是否可建立、目前數量、限制與剩餘量。
11. PATCH /api/tenant/settings 可更新租戶設定。若輸入品牌設定，需驗證格式並與既有設定合併；成功回傳更新後設定。
12. GET /api/tenant/settings/branding 回傳目前品牌設定；若未設定，回傳預設值合併後結果。

### 5.2 分店

1. 分店具有名稱、代碼、類型、地址、電話、統編、設定、租戶與狀態。
2. 分店類型至少支援 HEADQUARTER 與 BRANCH。
3. 分店列表支援分頁、搜尋與租戶隔離。
4. 建立分店時名稱與代碼必填；代碼應唯一於適用範圍。
5. 更新分店可修改基本資料與設定。
6. 刪除分店前若存在相依的會員、員工、合約或其他關聯資料，應拒絕或採取明確的軟刪除策略；Rust 版需在實作規格中固定策略。

### 5.3 職稱與權限

1. 職稱具有名稱、代碼、描述、等級、排序、權限設定與租戶。
2. 權限設定是鍵值形式的布林集合，用於啟用或停用功能能力。
3. 職稱列表支援依租戶查詢與排序。
4. 建立職稱時名稱與代碼必填。
5. 員工個人權限可覆寫職稱預設權限。
6. 使用者角色與職稱權限都可能影響前端可操作能力；後端仍必須執行授權檢查。

### 5.4 員工

1. 員工具有員工編號、姓名、電話、email、分店、職稱、雇用狀態、雇用類型、到職日、離職日、底薪、個人權限覆寫、租戶與可選使用者帳號連結。
2. 雇用狀態至少支援 ACTIVE、RESIGNED、LEAVE。
3. 雇用類型至少支援 FULL_TIME、PART_TIME、FREELANCE。
4. 員工列表支援分頁、搜尋、分店、職稱、狀態與租戶過濾。
5. 建立員工時分店、職稱、員工編號、姓名、雇用類型、到職日為必要資料。
6. 建立或更新員工時，員工編號不得與既有員工重複。
7. 刪除員工若有關聯使用者、會員、課程、薪資、考勤等資料，應拒絕或軟刪除；Rust 版應選擇不破壞歷史資料的策略。

### 5.5 使用者帳號管理

1. /api/users 所有端點需要登入、租戶上下文與 admin 或 super_admin 角色。
2. GET /api/users 支援 page、limit、search、role、isActive 過濾；limit 最高 100；回傳使用者列表與分頁資訊；不得回傳密碼雜湊。
3. GET /api/users/{id} 回傳單一使用者、連結員工、分店與職稱；不存在或非同租戶回傳 HTTP 404；不得回傳密碼雜湊。
4. GET /api/users/available-employees 回傳同租戶、ACTIVE、尚未連結使用者帳號的員工。
5. POST /api/users 輸入 email、password、role、可選 employeeId。email 必須有效，password 至少 8 字元，role 限 admin、manager、coach、staff。
6. 建立使用者時 email 正規化為小寫；重複 email 回傳 HTTP 400；employeeId 不存在或非同租戶回傳 HTTP 400；員工已有帳號回傳 HTTP 400。
7. 建立成功回傳 HTTP 201、success=true、使用者資料且不含密碼雜湊；若指定員工，該員工需連結新使用者。
8. PATCH /api/users/{id} 可更新 email、role、啟用狀態、employeeId；不可停用自己的帳號；重複 email、員工不存在或員工已連結其他帳號時回傳 HTTP 400。
9. 停用使用者時應使該使用者所有 session 失效。
10. POST /api/users/{id}/reset-password 輸入 newPassword，至少 8 字元；成功後更新密碼並使該使用者所有 session 失效；不存在回傳 HTTP 404。
11. DELETE /api/users/{id} 不可刪除自己的帳號；成功時刪除該使用者 session，解除員工連結，刪除帳號；不存在回傳 HTTP 404。

## 六、會員 CRM

1. 會員具有會員編號、姓名、手機、email、性別、生日、身分證/識別資料、地址、緊急聯絡人、分店、負責業務/教練、狀態、加入日期、標籤、備註、頭像、身高與租戶。
2. 會員狀態至少支援 ACTIVE、EXPIRED、SUSPENDED、BANNED。
3. 會員列表支援分頁、搜尋、狀態、分店、標籤與租戶隔離。
4. 建立會員時會員編號、姓名、手機、分店、加入日期為核心必要資料。
5. 建立會員成功後可觸發歡迎通知；若通知渠道未設定，不得使建立會員失敗。
6. 更新會員可修改基本資料、狀態、標籤、備註、負責人與頭像。
7. 刪除會員若存在合約、付款、預約、入場紀錄等歷史資料，Rust 版應採軟刪除或拒絕刪除，避免破壞稽核紀錄。
8. 會員匯出支援 CSV 與 Excel 格式，欄位至少包含會員編號、姓名、電話、email、性別、狀態、加入日期、分店。

## 七、會籍方案與合約

### 7.1 會籍方案

1. 方案具有名稱、代碼、類型、描述、月數、堂數、價格、是否允許暫停、最大暫停天數、是否允許轉讓、啟用狀態、排序、租戶與可選分店。
2. 方案類型至少支援 TIME_BASED 與 COUNT_BASED。
3. TIME_BASED 方案以期間為主要權益；COUNT_BASED 方案以剩餘堂數為主要權益。
4. 建立方案時名稱、代碼、類型、價格為必要資料；TIME_BASED 需要期間，COUNT_BASED 需要堂數。
5. 停用方案不應影響既有合約，但不可再用於新合約選擇。

### 7.2 合約

1. 合約具有合約編號、會員、方案、分店、銷售人員、狀態、簽約日、開始日、原始結束日、目前結束日、剩餘堂數、總金額、折扣、付款狀態、備註與租戶。
2. 合約狀態至少支援 DRAFT、ACTIVE、PAUSED、EXPIRED、CANCELLED、TRANSFERRED。
3. 付款狀態至少支援 UNPAID、PARTIAL、PAID、REFUNDED。
4. 建立合約時會員、方案、分店、開始日、結束日或可推導權益期間、總金額為必要資料。
5. 新合約可從方案帶入價格、期間、堂數、暫停與轉讓能力，但 Rust 實作應明確定義前端可覆寫欄位。
6. 合約列表支援會員、分店、狀態、付款狀態、到期日區間、搜尋與分頁。
7. 合約詳情需包含會員、方案、分店、銷售人員、付款摘要與異動紀錄摘要。
8. 合約匯出支援 CSV 與 Excel，欄位至少包含合約編號、會員姓名、會員編號、方案名稱、狀態、開始日、結束日、總金額與付款狀態。

### 7.3 合約異動

1. 合約異動至少支援 PAUSE、RESUME、EXTEND、TRANSFER、CANCEL、CLASS_USED、RENEWAL。
2. 異動紀錄需保留合約、異動類型、日期範圍、天數、堂數、原因、操作者與建立時間。
3. 暫停合約時，若方案不允許暫停，應拒絕。
4. 暫停天數超過方案上限時，應拒絕或要求管理權限；Rust 版需固定策略。
5. 暫停核准後，合約狀態可變為 PAUSED，結束日需依暫停期間延後。
6. 恢復合約時，狀態回到 ACTIVE，並記錄恢復事件。
7. 延期合約時，結束日需增加指定天數並記錄原因。
8. 轉讓合約時，原合約狀態可變為 TRANSFERRED，目標會員取得相同或剩餘權益；必須保留轉讓關係與原因。
9. 取消合約時，狀態變為 CANCELLED；如涉及退款，應由付款模組記錄退款。
10. 使用課程堂數時，COUNT_BASED 合約剩餘堂數減少；剩餘堂數不足時應拒絕預約或扣堂。

## 八、付款與金流

1. 付款紀錄具有收據編號、合約、會員、分店、金額、付款方式、付款日、類型、狀態、交易參考、備註與租戶。
2. 付款方式至少支援 CASH、CREDIT_CARD、DEBIT_CARD、BANK_TRANSFER、LINE_PAY、OTHER。
3. 付款類型至少支援 INCOME 與 REFUND。
4. 新增付款時金額必須為正數，付款方式與付款日期必填。
5. 新增收入付款後，應更新合約付款狀態：總付款為 0 為 UNPAID；低於合約應付為 PARTIAL；達到或超過應付為 PAID。
6. 新增退款付款後，應更新付款摘要與合約狀態；若全部退款則狀態可為 REFUNDED。
7. 付款列表支援會員、合約、分店、日期區間、類型、付款方式與分頁。
8. 付款匯出支援 CSV 與 Excel，欄位至少包含收據編號、會員姓名、會員編號、金額、付款方式、付款日期與類型。
9. 手動付款只記錄交易，不需呼叫第三方金流。
10. 第三方金流 webhook 端點不得要求 CSRF；必須有自己的簽章或安全驗證策略。

## 九、課程、預約與入場

### 9.1 課程

1. 課程具有名稱、分類、難度、描述、教練、分店、容量、時長、啟用狀態與相關時段。
2. 課程分類至少支援 YOGA、CARDIO、STRENGTH、DANCE、SPINNING、PILATES、BOXING、SWIMMING、OTHER。
3. 難度至少支援 BEGINNER、INTERMEDIATE、ADVANCED。
4. 課程時段狀態至少支援 SCHEDULED、CANCELLED、COMPLETED。
5. 課程列表支援分類、難度、教練、分店、日期與啟用狀態過濾。

### 9.2 預約

1. 預約具有會員、課程場次、合約、狀態、預約時間、取消時間與出席狀態。
2. 預約狀態至少支援 CONFIRMED、WAITLIST、CANCELLED、ATTENDED、NO_SHOW。
3. 建立預約時需檢查會員存在、場次存在、場次未取消、容量限制、會員未重複預約同場次、合約有效且有可用權益。
4. 場次已滿時可拒絕或加入候補，依現有狀態 WAITLIST 支援候補。
5. 取消預約成功後，狀態變為 CANCELLED；若原預約占用容量，應釋放容量並可通知候補。
6. 標記出席成功後，狀態變為 ATTENDED，並可扣除合約堂數或記錄使用事件。
7. 預約成功可觸發 email 或通知；通知失敗不應使預約失敗。

### 9.3 入場與 check-in

1. 管理 API 的入場紀錄支援會員、分店、時間、方式與狀態。
2. 入場方式至少支援 QR_CODE、MANUAL、CARD、BIOMETRIC。
3. 會員入場時需驗證會員存在、狀態允許入場、至少有一個有效合約或入場權益。
4. 入場成功回傳入場紀錄與會員摘要。
5. 入場歷史支援會員、分店、日期區間與分頁查詢。
6. 入場事件可觸發會員活躍度更新、通知或報表統計。

## 十、會員 App API

1. /api/member/otp 支援發送與驗證一次性登入碼。輸入可為手機或 email。驗證成功應產生會員 token。
2. OTP 應有過期時間、使用後失效、防重送與速率限制。
3. /api/member/auth 支援會員登入、token 更新與登出。成功回傳 access token、refresh token、有效秒數與會員摘要。
4. /api/member/oauth 支援 Google、LINE、Apple 等外部登入流程；成功需連結或建立會員憑證。
5. GET /api/member/me 回傳會員個人資料、目前會籍摘要與分店資訊。
6. PATCH /api/member/me 可更新會員可自助修改的個人資料，例如 email、地址、緊急聯絡人、頭像等；不可讓會員自行改會員編號、狀態、分店或合約權益。
7. /api/member/push 支援註冊、更新與取消推播訂閱。
8. /api/member/notifications 支援列出通知、標記已讀、取得未讀數。
9. /api/member/reviews 支援會員對已參與課程提交評價；需避免同一會員對同一課程重複評價。
10. /api/member/check-in 支援會員 App 入場、取得入場歷史與目前可入場狀態。
11. /api/member/workouts 支援訓練日誌 CRUD；資料應只屬於目前會員。
12. /api/member/goals 支援健身目標 CRUD；目標應包含狀態、目標值、目前值、期限與完成狀態。
13. /api/member/measurements 支援身體量測紀錄 CRUD；可記錄體重、體脂、肌肉量、圍度等量測值。
14. /api/member/issues 支援會員提交客服/問題回報、查詢自己的問題、追加訊息與狀態追蹤。

## 十一、教練 App API

1. /api/coach/auth 支援教練登入、token 更新與登出。登入成功回傳 access token、refresh token、有效秒數與教練摘要。
2. GET /api/coach/me 回傳目前教練個人資料、分店與職稱資訊。
3. PATCH /api/coach/me 可更新教練可自助修改的聯絡資料或簡介；不可自改職稱、薪資、分店或權限。
4. /api/coach/classes 支援查詢教練課程、場次、出席名單與執課狀態。
5. /api/coach/schedule 支援查詢教練週行程與指定日期範圍行程。
6. /api/coach/students 支援查詢教練負責學員、學員合約摘要、上課紀錄與教練備註。
7. 教練只能存取自己負責或自己授課場次相關的會員資料；管理者可另行透過管理 API 查詢。
8. /api/coach/lesson-plans 支援教案 CRUD；教案可關聯課程、學員或教練。
9. /api/coach/teaching-materials 支援教材/動作庫查詢與管理；可包含分類、難度、描述、媒體連結與啟用狀態。

## 十二、行銷、活動、優惠券與通知

1. Leads 具有來源、姓名、聯絡方式、狀態、分店、負責人、活動紀錄與轉換狀態。
2. Lead 可建立、更新、指派、記錄活動、轉換為會員。
3. Campaign 具有名稱、目標、期間、狀態、分眾條件、發送內容與結果統計。
4. Coupon 具有代碼、折扣規則、有效期間、使用上限、適用方案/分店與狀態。
5. Coupon 使用時需驗證代碼存在、有效期、使用次數、適用範圍與會員資格。
6. 通知支援站內通知、Email、Web Push、LINE 與 SMS。
7. 通知建立至少包含類型、標題、內容、參考類型、參考 ID、分店、會員或員工目標與讀取狀態。
8. 外部通知服務未設定時，系統應記錄並略過，不得使主要業務交易失敗，除非端點明確是測試發送。
9. Email 模板至少涵蓋歡迎會員、合約到期提醒、課程預約成功。
10. LINE、SMS 與 Push 發送需保存發送結果或錯誤摘要，供稽核與除錯。

## 十三、報表、Dashboard 與匯出

1. Dashboard 應回傳營收、會員數、有效合約、今日入場、即將到期合約、待處理項目與近期趨勢。
2. 報表支援營收、會員成長、合約到期、會員活躍度、分店績效、教練績效、薪資等類型。
3. 報表查詢必須支援分店、日期區間與租戶隔離。
4. 總部或超級管理角色可查全域報表；分店角色只能看授權分店。
5. 匯出支援 CSV 與 Excel。CSV 應以 UTF-8 且適合 Excel 開啟；Excel 應包含標題列與資料列。
6. 狀態與付款方式在匯出中應可轉換為中文顯示值。
7. 報表查詢的金額計算應排除退款或將退款以負值呈現，Rust 實作需在實作規格中固定呈現策略。

## 十四、檔案與 PDF

1. 檔案服務支援上傳、下載或取得簽名 URL、刪除與列出。
2. 檔案可儲存在 S3 相容服務或 Cloudflare R2。
3. 檔案應可關聯會員頭像、合約 PDF、簽名圖檔、教材媒體或證明文件。
4. 檔案上傳需檢查大小、類型與授權。
5. PDF 服務支援產生合約、收據或報表 PDF。
6. PDF 成功產生後可回傳檔案二進位或儲存後回傳檔案參考。

## 十五、管理 API 的 HR 功能

### 15.1 考勤 /api/attendances

1. 所有 /api/attendances 端點需要員工登入。
2. GET /api/attendances 支援 employee_id、branch_id、attendance_date、attendance_date_gte、attendance_date_lte、limit、offset、sortBy、sortOrder。
3. attendance_date 等於某天時，應查該日 00:00:00 至 23:59:59.999 的打卡時間。
4. sortBy 支援 check_in、check_out、employee_id；不支援值應回退為 check_in。
5. sortOrder 支援 asc 與 desc；不支援值應回退為 desc。
6. 回傳資料需包含考勤 ID、員工摘要、分店摘要、上班打卡、下班打卡、出勤日期、打卡類型、出勤狀態、遲到分鐘、早退分鐘、工時、加班時數、分店、IP、GPS、備註與分頁。
7. 管理 API 中出勤狀態的基準行為：若上班時間晚於 09:00，狀態為 LATE；否則若下班時間早於 18:00，狀態為 EARLY_LEAVE；否則為 PRESENT。
8. 遲到分鐘數為上班時間超過 09:00 的分鐘數，最低 0。
9. 早退分鐘數為 18:00 超過下班時間的分鐘數，最低 0。
10. GET /api/attendances/{id} 回傳單筆考勤；不存在回傳 HTTP 404。
11. POST /api/attendances 輸入 employee_id、可選 branch_id、可選 check_in、可選 notes。若未提供 check_in，以伺服器目前時間建立。成功回傳新紀錄 ID、employee_id、check_in、branch_id。
12. PATCH /api/attendances/{id} 輸入可選 check_out、work_hours、notes。不存在回傳 HTTP 404。若提供 check_out 且既有紀錄有 check_in，應計算工時到小數兩位；若同時提供 work_hours，明確輸入值可覆寫計算值。
13. DELETE /api/attendances/{id} 刪除考勤；不存在回傳 HTTP 404；成功回傳刪除訊息。

### 15.2 班表 /api/shift_schedules 與 /api/employee_shifts

1. 班表具有分店、名稱、開始時間、結束時間、休息開始、休息結束、遲到寬限分鐘、早退寬限分鐘、加班起算時間、是否預設、適用星期、狀態與租戶。
2. 班表狀態至少支援 draft、published、archived。
3. 適用星期可表示週一至週日；Rust 實作需統一為 0-6 或英文枚舉，但 API 需維持前端可理解的格式。
4. 建立班表需分店、名稱、開始時間、結束時間。
5. 更新班表可修改時間、寬限、加班、預設與適用日。
6. 刪除班表應採軟刪除為 archived，避免破壞歷史考勤。
7. 員工班表指派具有員工、班表、生效日、結束日。
8. 指派班表時結束日若存在，不得早於生效日。
9. 查詢目前班表時，應回傳生效日已到且結束日為空或未過期的最新指派。
10. 移除班表指派時，建議將結束日設為前一日，而非刪除紀錄。

### 15.3 薪資 /api/payroll

1. 薪資紀錄具有員工、期間、底薪、加班時數、加班費、業績獎金、其他獎金、扣款、實發薪資、狀態、發放日期與租戶。
2. 薪資狀態至少支援 DRAFT、APPROVED、PAID、CANCELLED 或等價狀態集合。
3. 查詢薪資支援員工、分店、期間、狀態與分頁。
4. 產生薪資時應以員工底薪、期間考勤、加班與業績資料形成薪資紀錄；Rust 版需定義薪資公式並以測試鎖定。
5. 核准薪資後不可任意修改；若需修改，應留下調整紀錄。
6. 已發放薪資不可刪除；只能作廢或建立沖銷紀錄。
7. 薪資匯出欄位至少包含員工編號、員工姓名、職稱、分店、薪資期間、底薪、加班時數、加班費、業績獎金、獎金、扣款、實發薪資、狀態。

### 15.4 績效 /api/performance

1. 績效考核具有員工、考核人、考核期間、考核類型、分數、KPI 明細、評論、狀態、提交時間、審核時間、核准人與租戶。
2. 考核類型至少支援 MONTHLY、QUARTERLY、ANNUAL。
3. 考核狀態至少支援 DRAFT、SUBMITTED、REVIEWED、APPROVED、REJECTED 或等價集合。
4. KPI 模板具有名稱、描述、適用職稱、考核類型、KPI 陣列、是否預設、是否啟用、建立者與租戶。
5. KPI 模板的 KPI 項目需包含名稱、權重、目標與單位。
6. 建立考核可從職稱與考核類型套用預設模板。
7. 提交考核後狀態變更，並記錄提交時間。
8. 核准考核後記錄核准人與核准時間。
9. 查詢績效支援員工、考核人、期間、類型、狀態與分頁。

## 十六、獨立 HR 微服務

### 16.1 服務層級行為

1. 獨立 HR 微服務 API 前綴為 /api。
2. GET /api/health 回傳 status=ok、timestamp、service=hr-service、version。
3. 所有 /api/attendance 與 /api/leave 端點需要 Authorization: Bearer token。
4. JWT payload 至少包含 userId、employeeId，可選 branchId、isAdmin。
5. 缺少 Bearer token 或格式錯誤，回傳 HTTP 401，error=Unauthorized，message=Missing or invalid authorization header。
6. token 無效或過期，回傳 HTTP 401，error=Unauthorized，message=Invalid or expired token。
7. HR 微服務預設速率限制為每 IP 每分鐘 100 次；超過回傳 HTTP 429。
8. JSON body 大小限制為 10mb。
9. CORS 允許 Content-Type、Authorization、X-API-Key、X-Webhook-Signature、X-Webhook-Timestamp。
10. 找不到路由回傳 HTTP 404，error=Not Found，code=NOT_FOUND，message 包含方法與路徑。

### 16.2 HR 員工同步

1. POST /api/sync/employee 用於單一員工同步。
2. POST /api/sync/employees 用於批次員工同步。
3. GET /api/sync/status 回傳同步開關、間隔分鐘、員工總數與最後同步時間。
4. 同步端點使用 webhook 簽章，不使用一般 Bearer token。
5. 同步請求必須包含 X-Webhook-Signature 與 X-Webhook-Timestamp。
6. timestamp 與伺服器目前時間差超過 5 分鐘時，回傳 HTTP 401。
7. 簽章不符時，回傳 HTTP 401。
8. 單一員工同步輸入：主系統員工 ID、姓名、可選員工編號、可選分店、可選主管、雇用狀態、雇用類型。
9. 同步雇用狀態支援 ACTIVE、INACTIVE、TERMINATED。
10. 同步雇用類型支援 FULL_TIME、PART_TIME、CONTRACT。
11. 單一同步成功回傳 success=true，以及 HR 服務內部 ID、主系統 ID、同步時間。
12. 批次同步輸入 employees 陣列。成功回傳 total、synced、failed，以及每筆成功/失敗結果；單筆失敗不得中止其他筆同步。
13. 員工同步應以主系統員工 ID 作為唯一外部識別；重複同步同一員工時更新既有紀錄。

### 16.3 HR 考勤

1. POST /api/attendance/check-in 輸入 employeeId、可選 branchId、可選 checkType、可選 notes。
2. checkType 支援 NORMAL、OVERTIME、MAKEUP、MANUAL。
3. 成功打卡回傳 HTTP 201，data 為考勤紀錄，meta 包含是否遲到與遲到分鐘數。
4. 同一員工同一日期同一打卡類型不得有重複考勤紀錄；重複時應回傳衝突錯誤。
5. POST /api/attendance/{id}/check-out 輸入可選 notes。成功回傳 data 為更新後考勤，meta 包含工作時數與加班時數。
6. GET /api/attendance/today 可選 branchId，回傳今日考勤陣列、總筆數與日期。
7. GET /api/attendance/employee/{employeeId}/today 回傳該員工今日考勤；不存在回傳 HTTP 404。
8. GET /api/attendance/employee/{employeeId} 必須提供 startDate 與 endDate；缺任一者回傳 HTTP 400；成功回傳日期範圍內考勤、總筆數與查詢區間。
9. GET /api/attendance/{id} 回傳單筆考勤；不存在回傳 HTTP 404。
10. HR 微服務考勤資料欄位包含員工、分店、出勤日期、上班時間、下班時間、打卡類型、出勤狀態、遲到分鐘、早退分鐘、工作時數、加班時數、備註、建立/更新時間。
11. HR 微服務出勤狀態至少支援 PRESENT、LATE、EARLY_LEAVE、ABSENT、ON_LEAVE。
12. HR 微服務應依員工當日有效班表計算遲到、早退與加班；若無有效班表，使用預設班表或回傳可理解錯誤，Rust 版需固定策略。

### 16.4 HR 請假

1. POST /api/leave/apply 輸入 employeeId、leaveType、startDate、endDate、可選 reason、可選 isHalfDay、可選 halfDayType。
2. leaveType 支援 ANNUAL、SICK、PERSONAL、MATERNITY、PATERNITY、BEREAVEMENT、MARRIAGE、COMPENSATORY、UNPAID、OTHER。
3. startDate 與 endDate 必須是 YYYY-MM-DD；endDate 不得早於 startDate。
4. halfDayType 支援 MORNING、AFTERNOON；只有半天假時才有意義。
5. 成功申請回傳 HTTP 201，data 為請假申請，meta 包含申請天數與警告列表。
6. 申請時應檢查假別餘額；餘額不足時應回傳驗證錯誤或衝突錯誤。
7. 新申請狀態為 PENDING，並建立提交審核紀錄。
8. POST /api/leave/{id}/review 需要 token 中的 employeeId 作為審核人；缺少時回傳 HTTP 403。
9. 審核輸入 action 與可選 notes。action 支援 APPROVE、REJECT。
10. 審核成功回傳 data 為更新後請假申請，meta 包含審核紀錄。
11. 核准請假時，待審核天數轉為已使用天數；拒絕時，待審核天數釋放。
12. POST /api/leave/{id}/cancel 需要 token 中的 employeeId；缺少時回傳 HTTP 403。成功後狀態變為 CANCELLED 並回傳更新後申請。
13. GET /api/leave/requests 必須提供 employeeId，可選 status。缺 employeeId 回傳 HTTP 404；成功回傳申請陣列與總數。
14. GET /api/leave/requests/{id} 回傳單一申請；不存在回傳 HTTP 404。
15. GET /api/leave/requests/{id}/history 回傳該申請審核歷程與總數。
16. GET /api/leave/pending 需要 token 中的 employeeId；回傳該審核人待審申請與總數。
17. GET /api/leave/balance/{employeeId} 可選 year，預設當年；回傳該員工該年度所有假別餘額與總數。
18. 假別餘額包含總天數、已使用、待審核、結轉、過期日。

### 16.5 HR 補打卡

1. 前端 HR core 定義補打卡能力，但獨立 HR 微服務目前沒有完整公開路由。
2. Rust 版若納入 HR 建議與完整 HR，應提供補打卡申請、查詢、審核、取消與歷程。
3. 補打卡申請輸入：員工、分店、目標日期、補打卡類型、申請上班時間、申請下班時間、原因、可選文件。
4. 補打卡類型支援 CHECK_IN、CHECK_OUT、BOTH。
5. 補打卡狀態支援 PENDING、APPROVED、REJECTED、CANCELLED。
6. 核准補打卡時，應建立或更新目標日期考勤紀錄，並保留審核歷程。

## 十七、HR 建議輸出規格

1. 由於現有實作沒有獨立 HR recommendation API，Rust 版建議新增一個純行為層，供前端 HR dashboard 或管理端使用。
2. HR 建議輸入應可包含分店、日期區間、員工、今日考勤、請假申請、假別餘額、班表與績效摘要。
3. HR 建議輸出應為決策摘要陣列，每筆至少包含類型、嚴重程度、目標員工或分店、標題、說明、建議動作、相關資料引用與產生時間。
4. 嚴重程度建議支援 info、warning、critical。
5. 當員工今日未打卡且已超過班表開始時間與寬限時間時，應輸出未打卡提醒。
6. 當員工遲到分鐘數大於 0 時，應輸出遲到提醒；遲到累計超過門檻時，嚴重程度提升。
7. 當員工早退分鐘數大於 0 時，應輸出早退提醒。
8. 當請假申請狀態為 PENDING 且審核人為目前使用者時，應輸出待審核提醒。
9. 當請假餘額不足但仍存在 pending 或新申請需求時，應輸出餘額不足提醒。
10. 當員工未被指派有效班表時，應輸出排班缺口提醒。
11. 當分店今日實際出勤人數低於排班人數時，應輸出人力缺口提醒。
12. 當薪資期間已結束但仍有未結算考勤、未核准請假或未處理補打卡時，應輸出薪資結算阻塞提醒。
13. 當績效考核到期但未提交或未核准時，應輸出績效流程提醒。
14. HR 建議不得修改資料；它只回傳可採取的動作。實際核准、排班、補打卡、薪資結算需呼叫各自寫入端點。
15. HR 建議應可重複產生且不造成副作用。
16. 同一輸入資料在同一時間基準下必須輸出相同建議集合。
17. Rust 實作應把門檻設定外部化，例如遲到累計門檻、未打卡提醒時間、人力缺口比例、薪資結算檢查期間。

## 十八、排程任務

1. 若 ENABLE_CRON 不為 false 且不是測試環境，主要 API 啟動時應初始化排程。
2. 每日 03:00 Asia/Taipei 執行計費任務。
3. 每日 04:00 Asia/Taipei 執行營運分析快照。
4. 每週日 05:00 Asia/Taipei 執行 RFM 會員分群。
5. 每日 09:00 Asia/Taipei 執行合約到期提醒。
6. 每小時整點執行清理任務。

### 18.1 計費任務

1. 查詢狀態為 active 且目前週期結束日小於或等於今天的訂閱。
2. 月繳訂閱使用月費產生發票；年繳訂閱使用年費產生發票；價格為 null 時視為 0。
3. 找不到租戶時跳過該訂閱。
4. 單筆訂閱錯誤不得影響其他訂閱。
5. 發票金額幣別為 TWD，稅額目前為 0，狀態為 open，到期日為產生日起 7 天。
6. 發票產生後，訂閱目前週期起日更新為舊週期結束日，週期迄日依月繳或年繳往後推一個週期。
7. 計費任務也應為 active 租戶更新當日使用量紀錄。
8. 使用量至少包含分店數、有效會員數、有效員工數、有效合約數。
9. 租戶沒有分店時，會員、員工、合約數應為 0。
10. 使用量紀錄同租戶同日期應 upsert，不重複插入。
11. 單一租戶使用量更新失敗不得影響其他租戶。

### 18.2 分析快照

1. 每日分析快照針對 active 租戶產生前一日摘要。
2. 租戶沒有分店時跳過。
3. 摘要至少包含分店數、有效會員數、有效合約數與前一日收入。
4. 前一日收入只計算收入型付款，且付款日期為前一日。
5. 同租戶同日期快照應 upsert。
6. 單一租戶快照失敗不得影響其他租戶。

### 18.3 合約到期提醒

1. 每日檢查 7 天、3 天、1 天後到期的 ACTIVE 合約。
2. 每份合約每個提醒天數只應產生一次通知。
3. 通知標題需包含即將到期與剩餘天數，內容需包含會員姓名、合約編號與到期日。
4. 若會員有 email，應嘗試寄送合約到期 email。
5. Email 失敗不得阻止站內通知建立。
6. 單筆合約提醒失敗不得影響其他合約。

### 18.4 RFM 分群

1. 每週分析 ACTIVE 會員。
2. 每個會員計算最近一次入場距今天數、近 90 天入場次數、近一年收入型付款總額。
3. 從未入場的會員，最近一次入場距今天數以極大值表示。
4. 分群至少支援 CHAMPION、LOYAL、POTENTIAL、AT_RISK、HIBERNATING、LOST。
5. 分群結果應更新會員標籤，移除舊 RFM 標籤並加入新 RFM 標籤。
6. 單一會員分析失敗不得影響其他會員。
7. 任務完成可回傳總會員數與各分群數量。

### 18.5 清理任務

1. 每小時刪除過期 session。
2. 每小時刪除過期超過 24 小時的一次性登入碼。
3. 清理失敗應記錄錯誤，不應終止服務。

## 十九、資料儲存與索引行為

1. 所有主要實體應使用 UUID 作為公開識別。
2. 時間戳應保留時區資訊或以 UTC 儲存並在 API 清楚序列化。
3. 重要實體應有建立時間與更新時間。
4. 多租戶資料應有租戶欄位；分店範圍資料應有分店欄位。
5. 常用查詢欄位需要索引：租戶、分店、狀態、會員、員工、合約、日期、外部同步 ID。
6. 會造成歷史稽核斷裂的資料不應硬刪除；Rust 版應優先使用狀態欄位或軟刪除。
7. 金額應使用 decimal，不得用浮點數儲存。
8. 日期與時間應分清楚：營運日期使用 date，打卡瞬間使用 timestamp，班表時間使用 time。
9. JSON 設定欄位可用於品牌、權限、分店設定、KPI 明細與擴充屬性，但 Rust 版需為公開 API 建立明確 schema。

## 二十、Rust port 重構細節建議

1. 建議建立清楚分層：HTTP transport、application use cases、domain models、repository traits、database adapters、external service adapters、scheduler。
2. Clean-room Rust 實作不得參考原始碼結構重建內部函式或模組；只需維持外部契約與資料行為。
3. 建議以 OpenAPI 或等價契約文件固定所有端點輸入/輸出，再由 Rust 團隊生成或手寫 handler。
4. 建議先實作共同基礎：錯誤格式、認證、租戶上下文、分頁、日期處理、decimal 金額、稽核欄位。
5. 再依依賴順序實作：租戶與分店、職稱與員工、使用者、會員、方案、合約、付款、課程預約、HR、報表、通知、排程。
6. HR 微服務目前依賴一個在工作區未找到的 HR business logic 套件；Rust 版不可依賴該套件，需根據本文 HR 行為重新定義服務層。
7. 管理 API 與獨立 HR 微服務目前對考勤類型命名不完全一致。Rust 版需要決定是否保留兩套 API 外部值，或提供相容映射層。為避免破壞前端，建議保留既有外部值並在內部正規化。
8. 管理 API 的考勤狀態目前使用固定 09:00 與 18:00；HR 微服務目標上使用班表。Rust 版應保留管理 API 相容回應，但新增以班表為準的 HR 建議與 HR 微服務計算。
9. 現有產品文件有 Directus 舊架構描述；Rust port 應以目前 Hono/Drizzle 可觀察 API 為準，不以 Directus 文件作為實作依據。
10. 第三方服務應以 trait/adapter 隔離：Email、SMS、LINE、Push、S3/R2、金流、PDF。
11. 所有外部通知與第三方服務失敗應預設降級，不應回滾核心交易；但 webhook 驗證與付款一致性例外，必須嚴格處理。
12. 建議先建立資料庫 migration，對齊目前資料概念；再實作讀端；最後實作寫端與排程。
13. 金額、合約權益、薪資與假別餘額屬高風險邏輯，Rust 版必須以行為測試鎖定邊界案例。
14. 所有刪除操作需要產品決策：硬刪除、軟刪除、封存或拒絕。對歷史交易與 HR 資料，建議採封存或拒絕。
15. 建議建立 idempotency 機制給 webhook、付款回呼、同步與批次任務，避免重複寫入。
16. 建議所有寫入端點記錄操作者、來源 IP、租戶與分店，以便稽核。
17. 建議建立事件 outbox，將會員建立、合約到期、預約成功、付款成功、請假審核等事件轉成通知與外部發送，避免同步發送阻塞 API。
18. 建議將 HR 建議輸出設計成無副作用 query endpoint，並把門檻設定存於租戶或分店設定。

## 二十一、相容性驗收清單

1. 員工登入成功可取得 token，並以 Bearer token 呼叫 /api/auth/me。
2. 員工登出後，同 token 呼叫 /api/auth/me 回傳 401。
3. 使用者建立、更新、停用、刪除、重設密碼符合第 5.5 節所有錯誤案例。
4. 租戶配額端點能正確回傳用量、限制、剩餘量與是否可建立。
5. 會員、方案、合約、付款的 CRUD 與匯出可被前端既有欄位消費。
6. 合約暫停、恢復、延期、轉讓、取消與扣堂都會保留異動紀錄。
7. 預約建立會檢查容量、重複預約、會員狀態與合約權益。
8. 管理 API 考勤列表可依日期、員工、分店篩選，並回傳遲到與早退分鐘數。
9. 獨立 HR 微服務健康檢查、認證錯誤、考勤、請假與同步端點符合第 16 節。
10. HR 建議端點在相同輸入下穩定回傳相同提醒，且不修改資料。
11. 排程任務可單獨觸發測試，且單筆錯誤不影響其他筆處理。
12. 所有 API 錯誤以 JSON 回傳，不回傳 HTML 錯誤頁。
13. 所有受保護端點在無效或缺少認證時回傳正確 HTTP 狀態。
14. 多租戶資料不可跨租戶外洩；分店角色不可讀寫未授權分店資料。
15. Rust 版不得依賴 Node 專用 session、ORM 或前端 composable；只需維持本文定義的外部行為。

## 二十二、功能範圍驗證結果

### 22.1 驗證來源

1. 已核對主要後端入口掛載範圍：主要 API 包含 public branding、auth、members、contracts、contract logs、branches、employees、job titles、membership plans、classes、bookings、check-ins、payments、payment webhooks、leads、campaigns、coupons、notifications、dashboard、reports、files、pdf、health、users、admin tenants、payroll、performance、attendances、shift schedules、employee shifts、tenant、member app routes、coach app routes。
2. 已核對主要資料模型範圍：租戶、使用者/session、分店、職稱、員工、會員、方案、合約、付款、課程/預約/check-in、會員 app、教練 app、HR、行銷、通知、訂閱/發票/使用量、稽核與品牌設定等。
3. 已核對獨立 HR service 範圍：health、attendance、leave、sync、JWT auth、webhook signature、rate limit、PostgreSQL HR schema。
4. 已核對前端 HR core/composables 暴露範圍：attendance、leave、makeup、shift、employee、policy provider 與相關計算/adapter 介面。
5. 已核對測試案例中明確驗證的行為：auth、users、billing cron、bookings、branches、classes、coach、contracts、employees、job titles、member app、payments、reports 等主要範圍。

### 22.2 符合實際功能範圍的項目

1. 文件列出的主要 API domain 與後端入口掛載範圍一致。
2. 文件列出的三種認證面向與實作一致：員工 session/Bearer、會員 X-Member-Token、教練 X-Coach-Token。
3. 文件列出的多租戶與分店上下文行為與實作入口一致。
4. 文件列出的 HR 管理 API 範圍與主要後端目前掛載一致：attendances、shift schedules、employee shifts、payroll、performance。
5. 文件列出的獨立 HR service 範圍與目前服務一致：attendance、leave、sync、health。
6. 文件列出的排程範圍與目前後端一致：billing、analytics、RFM、contract expiry、hourly cleanup。
7. 文件已明確標示「HR 建議」不是目前存在的獨立 recommendation service，而是 Rust port 可新增的無副作用建議輸出層；這避免把不存在的模組誤寫成既有功能。
8. 文件已明確標示舊產品文件中的 Directus 架構不是目前 Rust port 的實作依據，避免和目前 Hono/Drizzle 實作混淆。

### 22.3 需要 clean-room Rust 團隊二次確認的範圍

1. 薪資與績效路由存在，但詳細商業規則未完全由可觀察測試鎖定。文件目前只規格化功能邊界與必要狀態，薪資公式與績效流程需在 Rust 實作前補完整驗收案例。
2. 補打卡在前端 HR core 與資料庫 schema 中存在，但獨立 HR service 目前未暴露完整補打卡 API。文件已將補打卡列為 Rust 版若納入完整 HR 時的建議補齊範圍。
3. HR service 宣告依賴的 HR business logic 套件在目前工作區未找到。文件已要求 Rust 版重新定義 HR 行為，不可依賴該缺失套件。
4. 管理 API 與 HR service 對打卡類型命名不同。文件已要求保留外部相容值並在 Rust 內部正規化。
5. 刪除策略在多數實體上未由測試完全固定。文件已以「應拒絕或軟刪除，Rust 版需固定策略」標示，避免假裝已有確定行為。

### 22.4 結論

本規格文件符合目前專案可觀察的後端功能範圍，並將尚未明確實作或尚未被測試鎖定的範圍標示為 Rust port 設計決策或需二次確認項目。文件可作為 clean-room Rust 重寫的第一版 functional specification，但在實作前仍應針對薪資、績效、補打卡、刪除策略與 HR 建議門檻補充產品驗收案例。
