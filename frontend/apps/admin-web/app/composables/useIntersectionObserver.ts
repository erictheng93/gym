/**
 * Intersection Observer Composable
 * 用於視圖可見性檢測，實現延遲加載
 */

export interface UseIntersectionObserverOptions {
  root?: HTMLElement | null
  rootMargin?: string
  threshold?: number | number[]
  once?: boolean
}

export const useIntersectionObserver = (
  callback: (isVisible: boolean, entry?: IntersectionObserverEntry) => void,
  options: UseIntersectionObserverOptions = {}
) => {
  const elementRef = ref<HTMLElement | null>(null)
  const isVisible = ref(false)
  let observer: IntersectionObserver | null = null

  const {
    root = null,
    rootMargin = '100px',
    threshold = 0.1,
    once = false
  } = options

  const observe = () => {
    if (!elementRef.value || typeof IntersectionObserver === 'undefined') {
      // Fallback for environments without IntersectionObserver
      isVisible.value = true
      callback(true)
      return
    }

    observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (entry) {
          isVisible.value = entry.isIntersecting

          if (entry.isIntersecting) {
            callback(true, entry)

            if (once && observer) {
              observer.disconnect()
              observer = null
            }
          } else {
            callback(false, entry)
          }
        }
      },
      {
        root,
        rootMargin,
        threshold
      }
    )

    observer.observe(elementRef.value)
  }

  const unobserve = () => {
    if (observer) {
      observer.disconnect()
      observer = null
    }
  }

  // Watch for element changes
  watch(elementRef, (newEl, oldEl) => {
    if (oldEl) {
      unobserve()
    }
    if (newEl) {
      observe()
    }
  })

  onMounted(() => {
    if (elementRef.value) {
      observe()
    }
  })

  onUnmounted(() => {
    unobserve()
  })

  return {
    elementRef,
    isVisible
  }
}

/**
 * 簡化版本：只在可見時觸發一次
 */
export const useLazyLoad = () => {
  const containerRef = ref<HTMLElement | null>(null)
  const hasLoaded = ref(false)

  const { isVisible } = useIntersectionObserver(
    (visible) => {
      if (visible && !hasLoaded.value) {
        hasLoaded.value = true
      }
    },
    { once: true, rootMargin: '200px' }
  )

  // Link the refs
  watch(containerRef, (el) => {
    if (el) {
      // Manually trigger observation by setting elementRef
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries[0]?.isIntersecting) {
            hasLoaded.value = true
            observer.disconnect()
          }
        },
        { rootMargin: '200px', threshold: 0.1 }
      )
      observer.observe(el)
    }
  })

  return {
    containerRef,
    hasLoaded
  }
}

export default useIntersectionObserver
