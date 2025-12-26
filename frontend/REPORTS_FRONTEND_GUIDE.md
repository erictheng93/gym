# 報表前端整合指南

## ✅ 已完成項目

### 1. 套件安裝 ✅
已安裝以下套件：
- **echarts** - 專業圖表庫
- **vue-echarts** - Vue 3 ECharts 組件
- **xlsx** - Excel 匯出
- **jspdf** - PDF 生成
- **jspdf-autotable** - PDF 表格支援

### 2. API Composable ✅
檔案：`frontend/apps/admin-web/app/composables/useReports.ts`

提供的功能：
```typescript
const {
  getRevenueReport,          // 營收報表
  getMemberGrowthReport,     // 會員成長報表
  getContractExpiryReport,   // 合約到期提醒
  getMemberActivityReport,   // 會員活躍度報表
  refreshReports             // 刷新報表資料
} = useReports()
```

### 3. 匯出工具函數 ✅
檔案：`frontend/apps/admin-web/app/utils/export.ts`

提供的功能：
- ✅ CSV 匯出
- ✅ Excel 匯出
- ✅ PDF 匯出
- ✅ 專用匯出函數（每種報表）

使用範例：
```typescript
import { exportRevenueReport, exportMemberGrowthReport } from '~/utils/export'

// 匯出營收報表為 Excel
exportRevenueReport(revenueData, 'excel')

// 匯出會員成長報表為 PDF
exportMemberGrowthReport(memberGrowthData, 'pdf')
```

---

## 📝 待實作項目

### 4. 創建 ECharts 圖表組件

#### 4.1 營收趨勢圖 (Line Chart)
檔案：`frontend/apps/admin-web/app/components/charts/RevenueChart.vue`

```vue
<script setup lang="ts">
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart } from 'echarts/charts'
import {
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent
} from 'echarts/components'
import VChart from 'vue-echarts'

use([
  CanvasRenderer,
  LineChart,
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent
])

interface Props {
  data: {
    payment_day: string
    total_income: string
    total_refund: string
    net_revenue: string
  }[]
}

const props = defineProps<Props>()

const option = computed(() => ({
  title: {
    text: '營收趨勢',
    left: 'center'
  },
  tooltip: {
    trigger: 'axis'
  },
  legend: {
    data: ['收入', '退款', '淨營收'],
    bottom: 0
  },
  grid: {
    left: '3%',
    right: '4%',
    bottom: '10%',
    containLabel: true
  },
  xAxis: {
    type: 'category',
    data: props.data.map(d => d.payment_day.split('T')[0])
  },
  yAxis: {
    type: 'value',
    axisLabel: {
      formatter: (value: number) => `NT$ ${value.toLocaleString()}`
    }
  },
  series: [
    {
      name: '收入',
      type: 'line',
      data: props.data.map(d => parseFloat(d.total_income)),
      smooth: true,
      itemStyle: { color: '#34c759' }
    },
    {
      name: '退款',
      type: 'line',
      data: props.data.map(d => parseFloat(d.total_refund)),
      smooth: true,
      itemStyle: { color: '#ff3b30' }
    },
    {
      name: '淨營收',
      type: 'line',
      data: props.data.map(d => parseFloat(d.net_revenue)),
      smooth: true,
      lineStyle: { width: 3 },
      itemStyle: { color: '#0071e3' }
    }
  ]
}))
</script>

<template>
  <div class="chart-container">
    <v-chart :option="option" autoresize />
  </div>
</template>

<style scoped>
.chart-container {
  height: 400px;
}
</style>
```

#### 4.2 會員成長圖 (Bar Chart)
檔案：`frontend/apps/admin-web/app/components/charts/MemberGrowthChart.vue`

```vue
<script setup lang="ts">
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart } from 'echarts/charts'
import { TitleComponent, TooltipComponent, GridComponent } from 'echarts/components'
import VChart from 'vue-echarts'

use([CanvasRenderer, BarChart, TitleComponent, TooltipComponent, GridComponent])

interface Props {
  data: {
    join_day: string
    new_members: string
    male_count: string
    female_count: string
  }[]
}

const props = defineProps<Props>()

const option = computed(() => ({
  title: {
    text: '會員成長趨勢',
    left: 'center'
  },
  tooltip: {
    trigger: 'axis',
    axisPointer: { type: 'shadow' }
  },
  legend: {
    data: ['新增會員', '男性', '女性'],
    bottom: 0
  },
  grid: {
    left: '3%',
    right: '4%',
    bottom: '10%',
    containLabel: true
  },
  xAxis: {
    type: 'category',
    data: props.data.map(d => d.join_day.split('T')[0])
  },
  yAxis: {
    type: 'value'
  },
  series: [
    {
      name: '新增會員',
      type: 'bar',
      data: props.data.map(d => parseInt(d.new_members)),
      itemStyle: { color: '#0071e3' }
    },
    {
      name: '男性',
      type: 'bar',
      data: props.data.map(d => parseInt(d.male_count)),
      itemStyle: { color: '#5ac8fa' }
    },
    {
      name: '女性',
      type: 'bar',
      data: props.data.map(d => parseInt(d.female_count)),
      itemStyle: { color: '#ff9500' }
    }
  ]
}))
</script>

<template>
  <div class="chart-container">
    <v-chart :option="option" autoresize />
  </div>
</template>

<style scoped>
.chart-container {
  height: 400px;
}
</style>
```

#### 4.3 活躍度熱圖 (Heatmap)
檔案：`frontend/apps/admin-web/app/components/charts/ActivityHeatmap.vue`

```vue
<script setup lang="ts">
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { HeatmapChart } from 'echarts/charts'
import {
  TitleComponent,
  TooltipComponent,
  VisualMapComponent,
  GridComponent
} from 'echarts/components'
import VChart from 'vue-echarts'

use([
  CanvasRenderer,
  HeatmapChart,
  TitleComponent,
  TooltipComponent,
  VisualMapComponent,
  GridComponent
])

interface Props {
  data: {
    activity_day: string
    morning_count: string
    afternoon_count: string
    evening_count: string
  }[]
}

const props = defineProps<Props>()

const option = computed(() => {
  const hours = ['早上 (6-12)', '下午 (12-18)', '晚上 (18-24)']
  const days = props.data.map(d => d.activity_day.split('T')[0])

  const heatmapData: [number, number, number][] = []
  props.data.forEach((d, dayIndex) => {
    heatmapData.push([dayIndex, 0, parseInt(d.morning_count)])
    heatmapData.push([dayIndex, 1, parseInt(d.afternoon_count)])
    heatmapData.push([dayIndex, 2, parseInt(d.evening_count)])
  })

  return {
    title: {
      text: '會員活躍時段熱圖',
      left: 'center'
    },
    tooltip: {
      position: 'top'
    },
    grid: {
      height: '50%',
      top: '15%'
    },
    xAxis: {
      type: 'category',
      data: days,
      splitArea: { show: true }
    },
    yAxis: {
      type: 'category',
      data: hours,
      splitArea: { show: true }
    },
    visualMap: {
      min: 0,
      max: Math.max(...heatmapData.map(d => d[2])),
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: '10%',
      inRange: {
        color: ['#e0f3ff', '#0071e3']
      }
    },
    series: [{
      name: '入場人數',
      type: 'heatmap',
      data: heatmapData,
      label: {
        show: true
      },
      emphasis: {
        itemStyle: {
          shadowBlur: 10,
          shadowColor: 'rgba(0, 0, 0, 0.5)'
        }
      }
    }]
  }
})
</script>

<template>
  <div class="chart-container">
    <v-chart :option="option" autoresize />
  </div>
</template>

<style scoped>
.chart-container {
  height: 500px;
}
</style>
```

---

### 5. 更新報表頁面 (使用真實資料)

檔案：`frontend/apps/admin-web/app/pages/reports/index.vue`

關鍵修改：

```vue
<script setup lang="ts">
import { exportRevenueReport, exportMemberGrowthReport, exportContractExpiryReport } from '~/utils/export'
import type { RevenueReport, MemberGrowthReport, ContractExpiryReport } from '~/composables/useReports'

const { branches, fetchBranches } = useBranches()
const {
  getRevenueReport,
  getMemberGrowthReport,
  getContractExpiryReport,
  refreshReports
} = useReports()

const selectedBranch = ref('')
const selectedPeriod = ref('month')
const isLoading = ref(false)

// 報表資料
const revenueData = ref<RevenueReport | null>(null)
const memberGrowthData = ref<MemberGrowthReport | null>(null)
const contractExpiryData = ref<ContractExpiryReport | null>(null)

// 計算日期範圍
const dateRange = computed(() => {
  const end = new Date()
  const start = new Date()

  switch (selectedPeriod.value) {
    case 'week':
      start.setDate(end.getDate() - 7)
      break
    case 'month':
      start.setMonth(end.getMonth() - 1)
      break
    case 'year':
      start.setFullYear(end.getFullYear() - 1)
      break
  }

  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0]
  }
})

// 載入報表資料
const loadReports = async () => {
  isLoading.value = true
  try {
    const [revenue, growth, expiry] = await Promise.all([
      getRevenueReport(dateRange.value.start, dateRange.value.end, selectedBranch.value || undefined),
      getMemberGrowthReport(dateRange.value.start, dateRange.value.end, selectedBranch.value || undefined),
      getContractExpiryReport(30, selectedBranch.value || undefined)
    ])

    revenueData.value = revenue
    memberGrowthData.value = growth
    contractExpiryData.value = expiry
  } catch (error) {
    console.error('載入報表失敗:', error)
    alert('載入報表失敗，請稍後再試')
  } finally {
    isLoading.value = false
  }
}

// 匯出報表
const handleExport = (type: 'revenue' | 'growth' | 'expiry', format: 'csv' | 'excel' | 'pdf') => {
  switch (type) {
    case 'revenue':
      if (revenueData.value?.data) {
        exportRevenueReport(revenueData.value.data, format)
      }
      break
    case 'growth':
      if (memberGrowthData.value?.data) {
        exportMemberGrowthReport(memberGrowthData.value.data, format)
      }
      break
    case 'expiry':
      if (contractExpiryData.value?.data) {
        exportContractExpiryReport(contractExpiryData.value.data, format)
      }
      break
  }
}

// 刷新報表
const handleRefresh = async () => {
  const confirmed = confirm('確定要刷新報表資料嗎？這可能需要幾分鐘。')
  if (confirmed) {
    await refreshReports()
    await loadReports()
    alert('報表資料已刷新')
  }
}

onMounted(() => {
  fetchBranches()
  loadReports()
})

watch([selectedBranch, selectedPeriod], () => {
  loadReports()
})
</script>

<template>
  <div class="reports-page">
    <!-- 使用真實資料的圖表 -->
    <RevenueChart v-if="revenueData" :data="revenueData.data" />
    <MemberGrowthChart v-if="memberGrowthData" :data="memberGrowthData.data" />

    <!-- 匯出按鈕 -->
    <div class="export-actions">
      <select v-model="exportFormat">
        <option value="excel">Excel (推薦)</option>
        <option value="csv">CSV</option>
        <option value="pdf">PDF</option>
      </select>
      <button @click="handleExport('revenue', exportFormat)">匯出營收報表</button>
      <button @click="handleExport('growth', exportFormat)">匯出會員成長</button>
      <button @click="handleExport('expiry', exportFormat)">匯出合約到期</button>
    </div>
  </div>
</template>
```

---

## 🔗 Google Workspace 整合方案

### 階段一：Google Sheets API 整合

#### 1. 設定 Google Cloud Project

1. 前往 [Google Cloud Console](https://console.cloud.google.com/)
2. 建立新專案「Gym Nexus Reports」
3. 啟用 Google Sheets API 和 Google Drive API
4. 建立 OAuth 2.0 憑證
   - 應用程式類型：Web 應用程式
   - 授權重新導向 URI：`http://localhost:3001/auth/google/callback`
5. 下載憑證 JSON 檔案

#### 2. 安裝 Google API 套件

```bash
cd frontend && pnpm add @googleapis/sheets @googleapis/drive --filter admin-web
```

#### 3. 創建 Google Sheets 整合工具

檔案：`frontend/apps/admin-web/app/utils/googleSheets.ts`

```typescript
import { google } from 'googleapis'

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file'
]

export class GoogleSheetsExporter {
  private auth: any

  async authenticate() {
    // 實作 OAuth 2.0 流程
    // 提示用戶授權
  }

  async exportToNewSheet(data: any[], title: string) {
    const sheets = google.sheets({ version: 'v4', auth: this.auth })

    // 1. 創建新試算表
    const spreadsheet = await sheets.spreadsheets.create({
      requestBody: {
        properties: { title }
      }
    })

    // 2. 寫入資料
    const range = 'Sheet1!A1'
    const values = [
      Object.keys(data[0]), // 標題行
      ...data.map(row => Object.values(row))
    ]

    await sheets.spreadsheets.values.update({
      spreadsheetId: spreadsheet.data.spreadsheetId!,
      range,
      valueInputOption: 'RAW',
      requestBody: { values }
    })

    // 3. 返回試算表 URL
    return `https://docs.google.com/spreadsheets/d/${spreadsheet.data.spreadsheetId}`
  }

  async exportToExistingSheet(spreadsheetId: string, data: any[], sheetName: string) {
    const sheets = google.sheets({ version: 'v4', auth: this.auth })

    // 新增工作表並寫入資料
    const range = `${sheetName}!A1`
    const values = [
      Object.keys(data[0]),
      ...data.map(row => Object.values(row))
    ]

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'RAW',
      requestBody: { values }
    })
  }

  async uploadToDrive(file: Blob, filename: string, folderId?: string) {
    const drive = google.drive({ version: 'v3', auth: this.auth })

    const fileMetadata = {
      name: filename,
      ...(folderId && { parents: [folderId] })
    }

    const media = {
      mimeType: file.type,
      body: file
    }

    const response = await drive.files.create({
      requestBody: fileMetadata,
      media,
      fields: 'id, webViewLink'
    })

    return response.data.webViewLink
  }
}
```

#### 4. 在報表頁面添加 Google Sheets 匯出按鈕

```vue
<script setup lang="ts">
import { GoogleSheetsExporter } from '~/utils/googleSheets'

const googleExporter = new GoogleSheetsExporter()
const isGoogleAuthed = ref(false)

const exportToGoogleSheets = async (type: 'revenue' | 'growth') => {
  if (!isGoogleAuthed.value) {
    await googleExporter.authenticate()
    isGoogleAuthed.value = true
  }

  let data: any[] = []
  let title = ''

  switch (type) {
    case 'revenue':
      data = revenueData.value?.data || []
      title = `營收報表_${new Date().toISOString().split('T')[0]}`
      break
    case 'growth':
      data = memberGrowthData.value?.data || []
      title = `會員成長報表_${new Date().toISOString().split('T')[0]}`
      break
  }

  const url = await googleExporter.exportToNewSheet(data, title)
  alert(`已匯出至 Google Sheets: ${url}`)
  window.open(url, '_blank')
}
</script>

<template>
  <div class="google-export">
    <button @click="exportToGoogleSheets('revenue')" class="google-btn">
      <svg><!-- Google icon --></svg>
      匯出至 Google Sheets
    </button>
  </div>
</template>
```

### 階段二：Looker Studio 整合（進階）

1. 建立 BigQuery 資料集（將報表資料同步到 BigQuery）
2. 在 Looker Studio 建立資料來源
3. 建立互動式報表儀表板
4. 設定自動更新排程

---

## 📊 完整實作清單

- [x] 安裝必要套件
- [x] 創建 API Composable
- [x] 實作匯出工具函數（CSV/Excel/PDF）
- [ ] 創建 ECharts 圖表組件
  - [ ] 營收趨勢圖
  - [ ] 會員成長圖
  - [ ] 活躍度熱圖
- [ ] 更新報表頁面使用真實資料
- [ ] 實作 Google Sheets 整合
  - [ ] OAuth 2.0 認證
  - [ ] 匯出到新試算表
  - [ ] 上傳到 Google Drive
- [ ] 實作 Looker Studio 整合（選用）
- [ ] E2E 測試

---

## 🚀 下一步執行指令

```bash
# 1. 啟動 backend
cd backend && docker-compose up -d

# 2. 啟動 admin-web
cd frontend && pnpm run dev:admin

# 3. 訪問報表頁面
http://localhost:3001/reports
```

---

## 📚 相關文件

- [ECharts 文檔](https://echarts.apache.org/zh/index.html)
- [Vue ECharts](https://github.com/ecomfe/vue-echarts)
- [Google Sheets API](https://developers.google.com/sheets/api)
- [jsPDF 文檔](https://github.com/parallax/jsPDF)
- [SheetJS 文檔](https://docs.sheetjs.com/)

---

## ⚠️ 注意事項

1. **PDF 中文支援**：jsPDF 預設不支援中文，需要額外配置中文字體
2. **Google API 配額**：每日 25,000 次請求限制
3. **OAuth 安全**：不要將憑證檔案提交到 Git
4. **效能優化**：大量資料建議使用分頁或虛擬滾動
