import { ref, computed, type Ref, type ComputedRef } from 'vue'

interface UsePaginationOptions {
  /** 每頁筆數 */
  pageSize?: number
  /** 初始頁碼 */
  initialPage?: number
}

interface UsePaginationReturn {
  /** 當前頁碼 */
  currentPage: Ref<number>
  /** 每頁筆數 */
  pageSize: number
  /** 總頁數 */
  totalPages: ComputedRef<number>
  /** 是否可以上一頁 */
  canGoPrev: ComputedRef<boolean>
  /** 是否可以下一頁 */
  canGoNext: ComputedRef<boolean>
  /** 當前頁的起始索引 */
  startIndex: ComputedRef<number>
  /** 當前頁的結束索引 */
  endIndex: ComputedRef<number>
  /** 跳到指定頁 */
  goToPage: (page: number) => void
  /** 上一頁 */
  goPrev: () => void
  /** 下一頁 */
  goNext: () => void
  /** 重置到第一頁 */
  reset: () => void
}

/**
 * usePagination - 分頁 composable
 *
 * @param totalCount 總筆數的響應式引用
 * @param options 選項配置
 * @returns 分頁相關的響應式值和方法
 *
 * @example
 * const { currentPage, totalPages, pageSize, reset } = usePagination(totalCount, { pageSize: 20 })
 *
 * watch(currentPage, () => {
 *   fetchData({ page: currentPage.value, limit: pageSize })
 * })
 */
export function usePagination(
  totalCount: Ref<number>,
  options: UsePaginationOptions = {}
): UsePaginationReturn {
  const { pageSize = 20, initialPage = 1 } = options

  const currentPage = ref(initialPage)

  const totalPages = computed(() => Math.max(1, Math.ceil(totalCount.value / pageSize)))

  const canGoPrev = computed(() => currentPage.value > 1)
  const canGoNext = computed(() => currentPage.value < totalPages.value)

  const startIndex = computed(() => (currentPage.value - 1) * pageSize)
  const endIndex = computed(() => Math.min(startIndex.value + pageSize, totalCount.value))

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages.value) {
      currentPage.value = page
    }
  }

  const goPrev = () => {
    if (canGoPrev.value) {
      currentPage.value--
    }
  }

  const goNext = () => {
    if (canGoNext.value) {
      currentPage.value++
    }
  }

  const reset = () => {
    currentPage.value = 1
  }

  return {
    currentPage,
    pageSize,
    totalPages,
    canGoPrev,
    canGoNext,
    startIndex,
    endIndex,
    goToPage,
    goPrev,
    goNext,
    reset
  }
}
