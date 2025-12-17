<script setup lang="ts">
import { PAGES } from '~/constants'

definePageMeta({
  middleware: 'auth'
})

const hrModules = [
  {
    title: PAGES.HR.ATTENDANCE.TITLE,
    description: PAGES.HR.ATTENDANCE.DESCRIPTION,
    to: '/hr/attendance',
    icon: 'clock',
    gradient: 'from-blue-500 to-cyan-400'
  },
  {
    title: PAGES.HR.LEAVES.TITLE,
    description: PAGES.HR.LEAVES.DESCRIPTION,
    to: '/hr/leaves',
    icon: 'calendar',
    gradient: 'from-emerald-500 to-teal-400'
  }
]
</script>

<template>
  <div class="hr-page">
    <!-- Header -->
    <header class="page-header">
      <div class="header-content">
        <h1 class="text-headline">{{ PAGES.HR.TITLE }}</h1>
        <p class="text-body text-secondary">{{ PAGES.HR.DESCRIPTION }}</p>
      </div>
    </header>

    <!-- Module Cards -->
    <div class="modules-grid">
      <NuxtLink
        v-for="(module, index) in hrModules"
        :key="module.to"
        :to="module.to"
        class="module-card"
        :style="{ animationDelay: `${index * 0.1}s` }"
      >
        <div class="module-icon" :class="module.gradient">
          <svg v-if="module.icon === 'clock'" xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          <svg v-else-if="module.icon === 'calendar'" xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <rect width="18" height="18" x="3" y="4" rx="2" ry="2"/>
            <line x1="16" x2="16" y1="2" y2="6"/>
            <line x1="8" x2="8" y1="2" y2="6"/>
            <line x1="3" x2="21" y1="10" y2="10"/>
            <path d="m9 16 2 2 4-4"/>
          </svg>
        </div>
        <div class="module-content">
          <h3 class="module-title">{{ module.title }}</h3>
          <p class="module-desc">{{ module.description }}</p>
        </div>
        <div class="module-arrow">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m9 18 6-6-6-6"/>
          </svg>
        </div>
      </NuxtLink>
    </div>
  </div>
</template>

<style scoped>
.hr-page {
  max-width: 1200px;
  margin: 0 auto;
}

/* Header */
.page-header {
  margin-bottom: var(--space-2xl);
  animation: fadeInUp 0.6s var(--ease-out) backwards;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
}

.header-content h1 {
  margin-bottom: var(--space-xs);
}

/* Modules Grid */
.modules-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: var(--space-xl);
}

.module-card {
  display: flex;
  align-items: center;
  gap: var(--space-xl);
  padding: var(--space-xl);
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  text-decoration: none;
  transition: all var(--duration-normal) var(--ease-out);
  animation: cardAppear 0.6s var(--ease-out) backwards;
}

@keyframes cardAppear {
  from {
    opacity: 0;
    transform: translateY(30px);
  }
}

.module-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 20px 40px -12px rgba(0, 0, 0, 0.15);
  border-color: var(--color-accent);
}

.module-icon {
  width: 72px;
  height: 72px;
  border-radius: var(--radius-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  flex-shrink: 0;
  background: linear-gradient(135deg, var(--tw-gradient-from), var(--tw-gradient-to));
}

.module-icon.from-blue-500 {
  --tw-gradient-from: #3b82f6;
  --tw-gradient-to: #22d3ee;
}

.module-icon.from-emerald-500 {
  --tw-gradient-from: #10b981;
  --tw-gradient-to: #2dd4bf;
}

.module-content {
  flex: 1;
  min-width: 0;
}

.module-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: var(--space-xs);
}

.module-desc {
  font-size: 14px;
  color: var(--color-text-secondary);
  line-height: 1.5;
}

.module-arrow {
  color: var(--color-text-tertiary);
  transition: all var(--duration-fast) var(--ease-out);
}

.module-card:hover .module-arrow {
  color: var(--color-accent);
  transform: translateX(4px);
}

/* Responsive */
@media (max-width: 640px) {
  .modules-grid {
    grid-template-columns: 1fr;
  }

  .module-card {
    padding: var(--space-lg);
    gap: var(--space-lg);
  }

  .module-icon {
    width: 56px;
    height: 56px;
  }

  .module-icon svg {
    width: 24px;
    height: 24px;
  }
}
</style>
