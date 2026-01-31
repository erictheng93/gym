import { describe, it, expect, vi } from 'vitest'
import { useDirectus } from './useDirectus'

describe('useDirectus (DEPRECATED)', () => {
  it('應該在呼叫時輸出警告', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    useDirectus()

    expect(warnSpy).toHaveBeenCalledWith(
      '[DEPRECATED] useDirectus is deprecated. Use useFetch or specific composables instead.'
    )

    warnSpy.mockRestore()
  })

  it('應該在存取任何屬性時輸出錯誤並拋出 Promise rejection', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const directus = useDirectus()

    // Access any property
    const result = (directus as any).request('test')

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[DEPRECATED] Attempted to access directus.request')
    )

    await expect(result).rejects.toThrow('useDirectus is deprecated. Use useFetch instead.')

    errorSpy.mockRestore()
    warnSpy.mockRestore()
  })
})
