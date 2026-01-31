/**
 * Lighthouse CI Configuration
 * 用於前端效能測試與品質檢查
 */
module.exports = {
  ci: {
    collect: {
      // 使用開發伺服器 URL（透過命令列參數覆寫）
      // 若要使用靜態伺服器，請執行 pnpm build:admin 後使用 staticDistDir
      // staticDistDir: './apps/admin-web/.output/public',
      numberOfRuns: 3, // 每個 URL 執行 3 次取平均
      settings: {
        // Chrome 設定
        chromeFlags: '--no-sandbox --headless --disable-gpu',
        // 模擬行動裝置
        formFactor: 'desktop',
        screenEmulation: {
          mobile: false,
          width: 1350,
          height: 940,
          deviceScaleFactor: 1,
          disabled: false,
        },
        // 節流設定 (模擬一般網路)
        throttling: {
          rttMs: 40,
          throughputKbps: 10240,
          cpuSlowdownMultiplier: 1,
        },
      },
    },
    assert: {
      // 效能指標斷言
      assertions: {
        // Performance 分數 >= 80
        'categories:performance': ['warn', { minScore: 0.8 }],
        // Accessibility 分數 >= 90
        'categories:accessibility': ['error', { minScore: 0.9 }],
        // Best Practices 分數 >= 90
        'categories:best-practices': ['warn', { minScore: 0.9 }],
        // SEO 分數 >= 80
        'categories:seo': ['warn', { minScore: 0.8 }],

        // Core Web Vitals
        // LCP (Largest Contentful Paint) < 2.5s
        'largest-contentful-paint': ['warn', { maxNumericValue: 2500 }],
        // FID (First Input Delay) / TBT (Total Blocking Time) < 200ms
        'total-blocking-time': ['warn', { maxNumericValue: 200 }],
        // CLS (Cumulative Layout Shift) < 0.1
        'cumulative-layout-shift': ['warn', { maxNumericValue: 0.1 }],
        // FCP (First Contentful Paint) < 1.8s
        'first-contentful-paint': ['warn', { maxNumericValue: 1800 }],
        // TTI (Time to Interactive) < 3.8s
        'interactive': ['warn', { maxNumericValue: 3800 }],
        // Speed Index < 3.4s
        'speed-index': ['warn', { maxNumericValue: 3400 }],
      },
    },
    upload: {
      // 上傳設定 (本地開發暫時關閉)
      target: 'temporary-public-storage',
      // 或使用 LHCI Server
      // target: 'lhci',
      // serverBaseUrl: 'https://your-lhci-server.example.com',
      // token: process.env.LHCI_TOKEN,
    },
  },
}
