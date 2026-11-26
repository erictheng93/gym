<script setup lang="ts">
/**
 * ROI 報表頁面
 *
 * The backend has no campaign ROI report endpoint (no /campaigns/roi-report, no per-campaign
 * revenue or cost tracking), so there is nothing real to show yet.
 */
definePageMeta({
  middleware: 'auth'
})
</script>

<template>
  <PageContainer>
    <PageHeader
      title="ROI 報表"
      description="行銷活動投資報酬率分析"
      back-to="/marketing/campaigns"
    />

    <EmptyState
      title="ROI 報表尚未開放"
      description="目前系統尚未記錄各活動的實際成本與營收，待後端提供資料後才能計算投資報酬率。"
      icon="chart"
      action-label="返回活動列表"
      action-to="/marketing/campaigns"
    />
  </PageContainer>
</template>
