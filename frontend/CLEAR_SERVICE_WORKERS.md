# 清理 Service Workers 和缓存

## 问题描述
遇到 "KV put() limit exceeded for the day" 错误时，可能是因为浏览器中残留的 Service Worker 或缓存导致的。

## 解决方案

### 方法 1: 使用浏览器开发工具清理（推荐）

#### Chrome/Edge:
1. 打开开发者工具 (F12)
2. 进入 **Application** 标签
3. 在左侧菜单找到 **Service Workers**
4. 点击 **Unregister** 注销所有 Service Worker
5. 在左侧菜单找到 **Clear storage**
6. 勾选所有选项：
   - Local storage
   - Session storage
   - IndexedDB
   - Web SQL
   - Cookies
   - Cache storage
7. 点击 **Clear site data** 按钮
8. 关闭浏览器
9. 重新打开浏览器并访问应用

#### Firefox:
1. 打开开发者工具 (F12)
2. 进入 **Storage** 标签
3. 右键点击域名
4. 选择 **Delete All**
5. 进入 **Application** 标签
6. 找到 Service Workers
7. 点击 **Unregister**
8. 关闭浏览器
9. 重新打开浏览器并访问应用

### 方法 2: 使用隐私模式/无痕模式
1. 打开隐私模式/无痕窗口 (Ctrl+Shift+N 或 Ctrl+Shift+P)
2. 访问 http://localhost:3000
3. 这样不会受到之前缓存的影响

### 方法 3: 使用 JavaScript 清理（自动化）
访问 http://localhost:3000 并在控制台运行：

```javascript
// 1. 注销所有 Service Workers
navigator.serviceWorker.getRegistrations().then(function(registrations) {
  for(let registration of registrations) {
    registration.unregister()
    console.log('Service Worker unregistered:', registration.scope)
  }
})

// 2. 清理所有缓存
caches.keys().then(function(names) {
  for(let name of names) {
    caches.delete(name)
    console.log('Cache deleted:', name)
  }
})

// 3. 清理 localStorage
localStorage.clear()
console.log('localStorage cleared')

// 4. 清理 sessionStorage
sessionStorage.clear()
console.log('sessionStorage cleared')

// 5. 刷新页面
setTimeout(() => {
  location.reload()
}, 1000)
```

### 方法 4: 手动清理浏览器数据
1. Chrome: 设置 → 隐私和安全 → 清除浏览数据
2. 选择时间范围："全部"
3. 勾选：
   - Cookie 和其他网站数据
   - 缓存的图片和文件
4. 点击"清除数据"

## 预防措施

### 开发环境已禁用 PWA
在 `nuxt.config.ts` 中已添加：
```typescript
pwa: {
  disable: process.env.NODE_ENV === 'development'
}
```

这意味着在开发模式下，PWA 功能（包括 Service Worker）将被禁用，避免缓存问题。

### 重启开发服务器
清理完缓存后，建议重启开发服务器：
```bash
# 停止当前服务器 (Ctrl+C)

# 重新启动
cd frontend
npm run dev
```

## 验证清理是否成功

1. 打开开发者工具 (F12)
2. 进入 **Application** → **Service Workers**
3. 应该显示 "No service workers registered"
4. 进入 **Application** → **Storage**
5. 所有存储应该为空

## 测试登录

清理完成后：
1. 访问 http://localhost:3000/login
2. 使用测试账号登录
3. 应该不再看到 KV 错误

## 如果问题仍然存在

可能的原因：
1. **浏览器扩展冲突** - 尝试禁用所有扩展
2. **防火墙/代理设置** - 检查网络设置
3. **端口冲突** - 确保 3000 和 8500 端口没有被其他程序占用

### 替代测试方案

如果登录仍有问题，可以直接测试 API：

#### 方法 A: 使用 curl 测试（无需登录）
临时修改后端权限检查，然后运行：
```bash
cd backend
node test-tenant-management.js
```

#### 方法 B: 使用 Directus 管理后台
1. 访问 http://localhost:8500/admin
2. 登录 Directus
3. 直接在数据库中查看/修改租户数据

#### 方法 C: 创建测试页面
创建一个不需要登录的测试页面来验证 API 功能。

---

**更新日期:** 2026-01-07
**状态:** 已在开发环境禁用 PWA
