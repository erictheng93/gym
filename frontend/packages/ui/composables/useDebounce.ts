import { ref, watch, type Ref } from 'vue'

/**
 * useDebounce - 防抖 composable
 *
 * @param delay 延遲時間（毫秒）
 * @returns 防抖搜尋的響應式值和方法
 *
 * @example
 * const { value, debouncedValue, clear } = useDebounce(300)
 * watch(debouncedValue, () => {
 *   fetchData(debouncedValue.value)
 * })
 */
export function useDebounce<T = string>(delay = 300, initialValue?: T) {
  const value = ref<T>(initialValue as T) as Ref<T>
  const debouncedValue = ref<T>(initialValue as T) as Ref<T>
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  const clear = () => {
    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
  }

  watch(value, (newValue) => {
    clear()
    timeoutId = setTimeout(() => {
      debouncedValue.value = newValue
    }, delay)
  })

  return {
    /** 原始值 */
    value,
    /** 防抖後的值 */
    debouncedValue,
    /** 清除當前的防抖計時器 */
    clear
  }
}
