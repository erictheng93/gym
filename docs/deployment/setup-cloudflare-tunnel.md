# Cloudflare Tunnel 手動設定完整指南

本指南將一步一步教你如何為 Gym Nexus 專案配置 Cloudflare Tunnel，將你的本地 Docker Compose 服務透過域名暴露到網際網路。

---

## 前置條件

1. ✅ 擁有一個 Cloudflare 帳號
2. ✅ 在 Cloudflare 上已經添加並管理你的域名
3. ✅ Docker Compose 正在運行 (Directus + PostgreSQL)

---

## 步驟 1: 安裝 cloudflared

### Windows

**方式 A: 使用 Chocolatey (推薦)**
```powershell
choco install cloudflared
```

**方式 B: 手動下載安裝**
1. 前往 https://github.com/cloudflare/cloudflared/releases/latest
2. 下載 `cloudflared-windows-amd64.exe`
3. 將檔案重命名為 `cloudflared.exe`
4. 將檔案移動到一個在 PATH 的目錄 (例如 `C:\Windows\System32\`)

### 驗證安裝

```powershell
cloudflared --version
```

應該顯示類似: `cloudflared version 2024.x.x`

---

## 步驟 2: 登入 Cloudflare 帳號 (只需執行一次)

**⚠️ 注意：** 如果你已經為其他專案登入過，可以跳過此步驟。`cert.pem` 可以用於所有專案。

執行以下命令會開啟瀏覽器進行授權：

```powershell
cloudflared tunnel login
```

**會發生什麼：**
1. 瀏覽器會開啟 Cloudflare 授權頁面
2. 選擇你想要使用的域名 (例如: `yourdomain.com`)
3. 點擊「Authorize」授權

**結果：**
- 授權成功後，會在本機生成憑證文件：
  - Windows: `C:\Users\<你的用戶名>\.cloudflared\cert.pem`
- 終端會顯示類似：
  ```
  You have successfully logged in.
  If you wish to copy your credentials to a server, they have been saved to:
  C:\Users\<username>\.cloudflared\cert.pem
  ```

**💡 多專案提示：** 這個 `cert.pem` 可以用於創建多個 tunnel，不需要為每個專案重新登入。

---

## 步驟 3: 創建專案專屬的 Tunnel

**⚠️ 重要：每個專案需要創建自己的 tunnel！**

執行以下命令創建一個名為 `gym-nexus` 的 tunnel：

```powershell
cloudflared tunnel create gym-nexus
```

**💡 多專案命名建議：**
- `project1-api` - 專案 1 的 API
- `project2-web` - 專案 2 的網站
- `gym-nexus` - Gym Nexus 專案
- `my-blog` - 個人部落格

每個專案使用不同的名稱，方便管理。

**輸出範例：**
```
Tunnel credentials written to C:\Users\<username>\.cloudflared\abc12345-def6-7890-ghij-klmn12345678.json
Created tunnel gym-nexus with id abc12345-def6-7890-ghij-klmn12345678
```

**重要：**
1. 記下你的 **Tunnel ID** (例如: `abc12345-def6-7890-ghij-klmn12345678`)
2. 系統會生成憑證 JSON 文件在：
   - `C:\Users\<username>\.cloudflared\<TUNNEL_ID>.json`

---

## 步驟 4: 設置 DNS 路由

將你的域名指向剛創建的 tunnel：

```powershell
# 將 API 域名指向 tunnel
cloudflared tunnel route dns gym-nexus api.yourdomain.com

# (可選) 如果需要暴露前端應用
cloudflared tunnel route dns gym-nexus app.yourdomain.com
```

**說明：**
- 將 `yourdomain.com` 替換為你的實際域名
- 這個命令會自動在 Cloudflare DNS 中創建 CNAME 記錄
- 你可以在 Cloudflare Dashboard → DNS 中查看這些記錄

**驗證：**
前往 Cloudflare Dashboard → DNS，應該會看到類似的記錄：
```
Type    Name                  Content
CNAME   api.yourdomain.com    abc12345-def6-7890-ghij-klmn12345678.cfargotunnel.com
```

---

## 步驟 5: 創建 Tunnel 配置文件

在 `backend` 目錄創建 `cloudflared-config.yml` 文件：

```powershell
cd C:\Users\minim\OneDrive\文档\Code\gym\backend
```

創建文件 `cloudflared-config.yml` 並填入以下內容：

```yaml
# 替換為你在步驟 3 獲得的 Tunnel ID
tunnel: abc12345-def6-7890-ghij-klmn12345678
credentials-file: /etc/cloudflared/credentials.json

ingress:
  # Directus API Backend
  - hostname: api.yourdomain.com
    service: http://directus:8055
    originRequest:
      noTLSVerify: true

  # (可選) 前端應用 - 如果你的前端在本機 3000 port 運行
  # - hostname: app.yourdomain.com
  #   service: http://host.docker.internal:3000

  # 捕獲所有其他流量 - 此規則必須放在最後
  - service: http_status:404
```

**重要替換：**
1. 將 `abc12345-def6-7890-ghij-klmn12345678` 替換為你的實際 Tunnel ID
2. 將 `api.yourdomain.com` 替換為你的實際域名

---

## 步驟 6: 複製憑證文件

將 Cloudflare Tunnel 憑證複製到專案目錄：

```powershell
# 替換 <TUNNEL_ID> 為你的實際 Tunnel ID
copy "C:\Users\<你的用戶名>\.cloudflared\<TUNNEL_ID>.json" "C:\Users\minim\OneDrive\文档\Code\gym\backend\cloudflared-credentials.json"
```

**範例：**
```powershell
copy "C:\Users\minim\.cloudflared\abc12345-def6-7890-ghij-klmn12345678.json" "C:\Users\minim\OneDrive\文档\Code\gym\backend\cloudflared-credentials.json"
```

---

## 步驟 7: 更新 Docker Compose

編輯 `backend/docker-compose.yml`，在 `directus` 服務後面添加 `cloudflared` 服務：

```yaml
services:
  database:
    # ... 現有配置 ...

  directus:
    # ... 現有配置 ...

  # === 添加以下內容 ===
  cloudflared:
    image: cloudflare/cloudflared:latest
    restart: unless-stopped
    command: tunnel --no-autoupdate run
    volumes:
      - ./cloudflared-config.yml:/etc/cloudflared/config.yml:ro
      - ./cloudflared-credentials.json:/etc/cloudflared/credentials.json:ro
    depends_on:
      - directus
```

---

## 步驟 8: 更新 CORS 設定 (重要！)

編輯 `backend/docker-compose.yml`，更新 Directus 的 `CORS_ORIGIN` 環境變數：

```yaml
directus:
  environment:
    # ... 其他環境變數 ...
    CORS_ORIGIN: "http://localhost:3000,https://api.yourdomain.com,https://app.yourdomain.com"
```

將 `yourdomain.com` 替換為你的實際域名。

---

## 步驟 9: 啟動服務

重新啟動 Docker Compose：

```powershell
cd backend
docker-compose down
docker-compose up -d
```

---

## 步驟 10: 驗證連接

### 檢查 Tunnel 狀態

```powershell
docker-compose logs cloudflared
```

**成功的日誌應該顯示：**
```
Connection registered connIndex=0
Registered tunnel connection
```

### 測試網頁訪問

在瀏覽器中訪問：
- https://api.yourdomain.com

你應該會看到 Directus 的登入頁面或 API 首頁。

---

## 安全建議

### 1. 將憑證加入 .gitignore

創建或編輯 `backend/.gitignore`：

```
# Cloudflare Tunnel 憑證 (敏感資料)
cloudflared-credentials.json
cloudflared-config.yml

# Directus 資料
data/
uploads/

# 環境變數
.env
```

### 2. 更改預設密碼

編輯 `backend/docker-compose.yml`，修改：
```yaml
ADMIN_PASSWORD: "使用強密碼"
SECRET: "使用長隨機字串"
POSTGRES_PASSWORD: "使用強密碼"
```

### 3. 限制 Cloudflare Access (可選)

可以在 Cloudflare Dashboard 中設置 Access 政策，限制誰能訪問你的應用。

---

## 常見問題排查

### Q1: Tunnel 無法連接？

**檢查步驟：**
```powershell
# 1. 檢查 cloudflared 容器日誌
docker-compose logs cloudflared

# 2. 檢查 Tunnel 是否存在
cloudflared tunnel list

# 3. 檢查配置文件語法
docker-compose config
```

### Q2: 訪問域名顯示 502 Bad Gateway

**可能原因：**
- Directus 服務尚未完全啟動
- `service` 地址配置錯誤

**解決方法：**
```powershell
# 檢查所有服務狀態
docker-compose ps

# 確保 directus 服務是 healthy
docker-compose logs directus
```

### Q3: DNS 記錄未生效

DNS 變更可能需要幾分鐘才能生效。你可以：

```powershell
# 檢查 DNS 是否已解析
nslookup api.yourdomain.com
```

### Q4: CORS 錯誤

確保 Directus 的 `CORS_ORIGIN` 包含你的域名：
```yaml
CORS_ORIGIN: "https://api.yourdomain.com,https://app.yourdomain.com"
```

---

## 管理 Tunnel

### 查看所有 Tunnels

```powershell
cloudflared tunnel list
```

### 刪除 Tunnel

```powershell
# 先停止服務
docker-compose down

# 刪除 tunnel
cloudflared tunnel delete gym-nexus
```

### 查看 Tunnel 路由

```powershell
cloudflared tunnel route dns gym-nexus
```

---

## 完成！

現在你的 Gym Nexus 專案已經透過 Cloudflare Tunnel 暴露到網際網路了！

🎉 **訪問你的應用：**
- API: https://api.yourdomain.com
- Directus Admin: https://api.yourdomain.com/admin

**下一步建議：**
1. 配置 Nuxt 前端連接到你的 API 域名
2. 設置 Cloudflare Access 進行身份驗證
3. 啟用 Cloudflare WAF 保護你的應用

---

## 多專案管理

如果你有多個專案都需要使用 Cloudflare Tunnel，以下是管理建議：

### 專案結構範例

```
project1/
├── docker-compose.yml
├── cloudflared-config.yml          # Tunnel 配置
└── cloudflared-credentials.json    # Tunnel 憑證 (project1 專屬)

project2/
├── docker-compose.yml
├── cloudflared-config.yml          # Tunnel 配置
└── cloudflared-credentials.json    # Tunnel 憑證 (project2 專屬)

gym-nexus/
├── backend/
│   ├── docker-compose.yml
│   ├── cloudflared-config.yml      # Tunnel 配置
│   └── cloudflared-credentials.json  # Tunnel 憑證 (gym-nexus 專屬)
```

### 為新專案添加 Tunnel 的快速步驟

**1. 創建新的 Tunnel (不需要重新登入)**
```powershell
cloudflared tunnel create project-name
```

**2. 設置 DNS 路由**
```powershell
cloudflared tunnel route dns project-name api.project.com
```

**3. 複製憑證到專案目錄**
```powershell
copy "C:\Users\<username>\.cloudflared\<TUNNEL_ID>.json" "C:\path\to\project\cloudflared-credentials.json"
```

**4. 創建 `cloudflared-config.yml`**
```yaml
tunnel: <NEW_TUNNEL_ID>
credentials-file: /etc/cloudflared/credentials.json

ingress:
  - hostname: api.project.com
    service: http://service-name:port
  - service: http_status:404
```

**5. 添加到 `docker-compose.yml`**
```yaml
  cloudflared:
    image: cloudflare/cloudflared:latest
    restart: unless-stopped
    command: tunnel --no-autoupdate run
    volumes:
      - ./cloudflared-config.yml:/etc/cloudflared/config.yml:ro
      - ./cloudflared-credentials.json:/etc/cloudflared/credentials.json:ro
    depends_on:
      - your-service
```

### 查看所有 Tunnels

```powershell
cloudflared tunnel list
```

輸出範例：
```
ID                                   NAME        CREATED
abc12345-def6-7890-ghij-klmn12345678 gym-nexus   2024-01-01T10:00:00Z
def67890-abc1-2345-ijkl-mnop67890123 project2    2024-01-02T10:00:00Z
ghi12345-mno6-7890-pqrs-tuvw12345678 my-blog     2024-01-03T10:00:00Z
```

### 管理多個同時運行的 Tunnels

**所有專案可以同時運行：**
```powershell
# 在各自的專案目錄中
cd C:\path\to\gym-nexus\backend
docker-compose up -d

cd C:\path\to\project2
docker-compose up -d

cd C:\path\to\my-blog
docker-compose up -d
```

每個專案的 Cloudflare Tunnel 會獨立運行，互不干擾。

### 域名組織建議

**方式 1: 使用子域名**
```
gym-nexus      → api.yourdomain.com
project2       → api2.yourdomain.com
my-blog        → blog.yourdomain.com
```

**方式 2: 使用不同域名**
```
gym-nexus      → api.gym-nexus.com
project2       → api.project2.com
my-blog        → myblog.com
```

**方式 3: 混合使用**
```
gym-nexus      → api.yourdomain.com
gym-nexus      → app.yourdomain.com
project2       → project2.com
project2       → api.project2.com
```

### 停止特定專案的 Tunnel

```powershell
# 方式 1: 停止 Docker 容器
cd C:\path\to\project
docker-compose stop cloudflared

# 方式 2: 完全移除服務
docker-compose down
```

### 刪除不再使用的 Tunnel

```powershell
# 1. 先停止 Docker 服務
cd C:\path\to\project
docker-compose down

# 2. 刪除 Tunnel (會同時刪除 DNS 記錄)
cloudflared tunnel delete tunnel-name

# 3. 刪除本地憑證文件
del cloudflared-credentials.json
```

---

## 最佳實踐

### 1. 命名規範
- 使用有意義的 Tunnel 名稱：`project-env-service` (例如: `gym-prod-api`, `blog-dev-web`)
- 域名使用清晰的子域名：`service.project.domain.com`

### 2. 安全管理
- 每個專案的 `.gitignore` 都要包含 `cloudflared-credentials.json`
- 定期檢查 `cloudflared tunnel list` 清理不使用的 tunnel
- 為生產環境和開發環境使用不同的 tunnel

### 3. 監控
```powershell
# 監控所有專案的 Tunnel 狀態
docker ps --filter "ancestor=cloudflare/cloudflared:latest"

# 查看特定專案的日誌
cd C:\path\to\project
docker-compose logs -f cloudflared
```

---

## 快速參考指令

```powershell
# === Tunnel 管理 ===
cloudflared tunnel login              # 登入 (只需一次)
cloudflared tunnel create <name>      # 創建新 tunnel
cloudflared tunnel list               # 列出所有 tunnels
cloudflared tunnel delete <name>      # 刪除 tunnel

# === DNS 管理 ===
cloudflared tunnel route dns <tunnel> <hostname>  # 添加 DNS 路由
cloudflared tunnel route ip list                  # 列出所有路由

# === Docker 操作 ===
docker-compose up -d                  # 啟動服務
docker-compose down                   # 停止服務
docker-compose logs cloudflared       # 查看日誌
docker-compose restart cloudflared    # 重啟 tunnel
```
