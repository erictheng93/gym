import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mount } from '@vue/test-utils'
import { computed as vueComputed, ref as vueRef } from 'vue'
import FormTagInput from '../FormTagInput.vue'
import FormField from '../FormField.vue'

// Restore Vue's computed and ref for component tests
const originalComputed = (globalThis as Record<string, unknown>).computed
const originalRef = (globalThis as Record<string, unknown>).ref
beforeAll(() => {
  (globalThis as Record<string, unknown>).computed = vueComputed
  ;(globalThis as Record<string, unknown>).ref = vueRef
})
afterAll(() => {
  (globalThis as Record<string, unknown>).computed = originalComputed
  ;(globalThis as Record<string, unknown>).ref = originalRef
})

describe('FormTagInput', () => {
  // Helper to mount with FormField component
  const mountFormTagInput = (props = {}, options = {}) => {
    return mount(FormTagInput, {
      props,
      global: {
        components: { FormField },
        ...options
      }
    })
  }

  const input = (wrapper: ReturnType<typeof mountFormTagInput>) => wrapper.find<HTMLInputElement>('input[type="text"]')
  const addButton = (wrapper: ReturnType<typeof mountFormTagInput>) => wrapper.find<HTMLButtonElement>('.tag-input-row button')
  const lastEmit = (wrapper: ReturnType<typeof mountFormTagInput>) => wrapper.emitted('update:modelValue')!.at(-1)

  it('渲染標籤、必填標記、預設/自訂 placeholder 與按鈕文字', () => {
    const wrapper = mountFormTagInput({ label: '標籤', required: true })
    expect(wrapper.find('label').text()).toContain('標籤')
    expect(wrapper.find('label').classes()).toContain('required')
    expect(input(wrapper).attributes('placeholder')).toBe('輸入標籤...')
    expect(addButton(wrapper).text()).toBe('新增')

    const custom = mountFormTagInput({ placeholder: '輸入技能', addButtonText: '加入' })
    expect(input(custom).attributes('placeholder')).toBe('輸入技能')
    expect(addButton(custom).text()).toBe('加入')
  })

  it('顯示已有標籤，沒有標籤時不渲染列表', () => {
    const wrapper = mountFormTagInput({ modelValue: ['瑜珈', '重訓'] })
    expect(wrapper.findAll('.tag').map(t => t.text())).toEqual(['瑜珈', '重訓'])

    expect(mountFormTagInput().find('.tags-list').exists()).toBe(false)
  })

  describe('新增標籤', () => {
    it('點擊按鈕新增標籤並清空輸入框', async () => {
      const wrapper = mountFormTagInput({ modelValue: ['既有'] })
      await input(wrapper).setValue('新標籤')
      await addButton(wrapper).trigger('click')

      expect(lastEmit(wrapper)).toEqual([['既有', '新標籤']])
      expect(input(wrapper).element.value).toBe('')
    })

    it('按 Enter 新增標籤', async () => {
      const wrapper = mountFormTagInput()
      await input(wrapper).setValue('Enter 標籤')
      await input(wrapper).trigger('keydown', { key: 'Enter' })

      expect(lastEmit(wrapper)).toEqual([['Enter 標籤']])
    })

    it('新增前修剪前後空白', async () => {
      const wrapper = mountFormTagInput()
      await input(wrapper).setValue('  trimmed  ')
      await addButton(wrapper).trigger('click')

      expect(lastEmit(wrapper)).toEqual([['trimmed']])
    })

    it('忽略空白標籤，且按鈕為 disabled', async () => {
      const wrapper = mountFormTagInput()
      await input(wrapper).setValue('   ')
      expect(addButton(wrapper).element.disabled).toBe(true)

      await input(wrapper).trigger('keydown', { key: 'Enter' })
      expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    })

    it('忽略重複標籤', async () => {
      const wrapper = mountFormTagInput({ modelValue: ['重複'] })
      await input(wrapper).setValue('重複')
      await addButton(wrapper).trigger('click')

      expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    })
  })

  describe('移除標籤', () => {
    it('點擊移除按鈕只移除該標籤', async () => {
      const wrapper = mountFormTagInput({ modelValue: ['一', '二', '三'] })
      await wrapper.findAll('.tag-remove')[1]!.trigger('click')

      expect(lastEmit(wrapper)).toEqual([['一', '三']])
    })

    it('輸入為空時 Backspace 移除最後一個標籤', async () => {
      const wrapper = mountFormTagInput({ modelValue: ['一', '二'] })
      await input(wrapper).trigger('keydown', { key: 'Backspace' })

      expect(lastEmit(wrapper)).toEqual([['一']])
    })

    it('輸入有內容時 Backspace 不移除標籤', async () => {
      const wrapper = mountFormTagInput({ modelValue: ['一'] })
      await input(wrapper).setValue('abc')
      await input(wrapper).trigger('keydown', { key: 'Backspace' })

      expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    })
  })

  describe('maxTags', () => {
    it('顯示標籤計數', () => {
      const wrapper = mountFormTagInput({ modelValue: ['一', '二', '三'], maxTags: 5 })
      expect(wrapper.find('.tags-count').text()).toBe('3 / 5')
      expect(mountFormTagInput().find('.tags-count').exists()).toBe(false)
    })

    it('達上限時輸入框與按鈕被禁用，Enter 不新增', async () => {
      const wrapper = mountFormTagInput({ modelValue: ['一', '二', '三'], maxTags: 3 })
      expect(input(wrapper).element.disabled).toBe(true)
      expect(addButton(wrapper).element.disabled).toBe(true)

      await input(wrapper).trigger('keydown', { key: 'Enter' })
      expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    })

    it('未達上限時仍可新增', async () => {
      const wrapper = mountFormTagInput({ modelValue: ['一'], maxTags: 3 })
      expect(input(wrapper).element.disabled).toBe(false)

      await input(wrapper).setValue('二')
      await addButton(wrapper).trigger('click')
      expect(lastEmit(wrapper)).toEqual([['一', '二']])
    })
  })

  it('顯示錯誤，且錯誤優先於提示', () => {
    const hintOnly = mountFormTagInput({ hint: '最多五個' })
    expect(hintOnly.find('.form-field-hint').text()).toBe('最多五個')

    const both = mountFormTagInput({ hint: '最多五個', error: '至少一個標籤' })
    expect(both.find('.form-field-error').text()).toBe('至少一個標籤')
    expect(both.find('.form-field-hint').exists()).toBe(false)
  })

  describe('禁用', () => {
    it('輸入框與按鈕被禁用', () => {
      const wrapper = mountFormTagInput({ disabled: true, modelValue: ['一'] })
      expect(input(wrapper).element.disabled).toBe(true)
      expect(addButton(wrapper).element.disabled).toBe(true)
      expect(wrapper.find<HTMLButtonElement>('.tag-remove').element.disabled).toBe(true)
    })

    it('Enter 與 Backspace 都不會改動標籤', async () => {
      const wrapper = mountFormTagInput({ disabled: true, modelValue: ['一'] })
      await input(wrapper).trigger('keydown', { key: 'Enter' })
      await input(wrapper).trigger('keydown', { key: 'Backspace' })

      expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    })
  })
})
