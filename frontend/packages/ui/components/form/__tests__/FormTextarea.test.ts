import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mount } from '@vue/test-utils'
import { computed as vueComputed } from 'vue'
import FormTextarea from '../FormTextarea.vue'
import FormField from '../FormField.vue'

// Augment globalThis for Vue computed function
declare global {
  // eslint-disable-next-line no-var
  var computed: typeof vueComputed | undefined
}

// Restore Vue's computed for component tests
const originalComputed = globalThis.computed
beforeAll(() => {
  globalThis.computed = vueComputed
})
afterAll(() => {
  globalThis.computed = originalComputed
})

describe('FormTextarea', () => {
  // Helper to mount with FormField component
  const mountFormTextarea = (props = {}, options = {}) => {
    return mount(FormTextarea, {
      props,
      global: {
        components: { FormField },
        ...options
      }
    })
  }

  describe('初始化', () => {
    it('應該正確渲染組件', () => {
      const wrapper = mountFormTextarea()
      expect(wrapper.find('textarea').exists()).toBe(true)
    })

    it('應該渲染標籤和必填指示器', () => {
      const wrapper = mountFormTextarea({
        label: '備註',
        required: true
      })

      expect(wrapper.find('label').text()).toContain('備註')
      expect(wrapper.find('label').classes()).toContain('required')
    })

    it('應該使用預設的行數', () => {
      const wrapper = mountFormTextarea()
      expect(wrapper.find('textarea').attributes('rows')).toBe('3')
    })

    it('應該支援自訂行數', () => {
      const wrapper = mountFormTextarea({
        rows: 6
      })
      expect(wrapper.find('textarea').attributes('rows')).toBe('6')
    })

    it('應該使用預設的 resize 屬性', () => {
      const wrapper = mountFormTextarea()
      const textarea = wrapper.find('textarea')
      expect(textarea.element.style.resize).toBe('vertical')
    })
  })

  describe('v-model 綁定', () => {
    it('應該顯示 modelValue', () => {
      const wrapper = mountFormTextarea({
        modelValue: '這是測試內容'
      })

      const textarea = wrapper.find('textarea').element as HTMLTextAreaElement
      expect(textarea.value).toBe('這是測試內容')
    })

    it('應該在輸入時發出 update:modelValue 事件', async () => {
      const wrapper = mountFormTextarea({ modelValue: '' })

      await wrapper.find('textarea').setValue('新內容')

      expect(wrapper.emitted('update:modelValue')).toBeTruthy()
      expect(wrapper.emitted('update:modelValue')![0]).toEqual(['新內容'])
    })

    it('應該處理空值', () => {
      const wrapper = mountFormTextarea({
        modelValue: ''
      })

      const textarea = wrapper.find('textarea').element as HTMLTextAreaElement
      expect(textarea.value).toBe('')
    })
  })

  describe('maxlength 和字數計數', () => {
    it('應該設置 maxlength 屬性', () => {
      const wrapper = mountFormTextarea({
        maxlength: 500
      })

      expect(wrapper.find('textarea').attributes('maxlength')).toBe('500')
    })

    it('應該在設置 maxlength 時顯示字數計數', () => {
      const wrapper = mountFormTextarea({
        maxlength: 100,
        modelValue: '測試文字'
      })

      expect(wrapper.find('.char-count').exists()).toBe(true)
      expect(wrapper.find('.char-count').text()).toBe('4 / 100')
    })

    it('應該在未設置 maxlength 時不顯示字數計數', () => {
      const wrapper = mountFormTextarea({
        modelValue: '測試文字'
      })

      expect(wrapper.find('.char-count').exists()).toBe(false)
    })

    it('應該正確更新字數計數', async () => {
      const wrapper = mountFormTextarea({
        maxlength: 100,
        modelValue: ''
      })

      expect(wrapper.find('.char-count').text()).toBe('0 / 100')

      await wrapper.setProps({ modelValue: '12345' })

      expect(wrapper.find('.char-count').text()).toBe('5 / 100')
    })
  })

  describe('resize 屬性', () => {
    it('應該支援 none', () => {
      const wrapper = mountFormTextarea({
        resize: 'none'
      })

      const textarea = wrapper.find('textarea')
      expect(textarea.element.style.resize).toBe('none')
    })

    it('應該支援 vertical', () => {
      const wrapper = mountFormTextarea({
        resize: 'vertical'
      })

      const textarea = wrapper.find('textarea')
      expect(textarea.element.style.resize).toBe('vertical')
    })

    it('應該支援 horizontal', () => {
      const wrapper = mountFormTextarea({
        resize: 'horizontal'
      })

      const textarea = wrapper.find('textarea')
      expect(textarea.element.style.resize).toBe('horizontal')
    })

    it('應該支援 both', () => {
      const wrapper = mountFormTextarea({
        resize: 'both'
      })

      const textarea = wrapper.find('textarea')
      expect(textarea.element.style.resize).toBe('both')
    })
  })

  describe('錯誤狀態', () => {
    it('應該顯示錯誤訊息', () => {
      const wrapper = mountFormTextarea({
        error: '備註內容過長'
      })

      expect(wrapper.find('.form-field-error').exists()).toBe(true)
      expect(wrapper.find('.form-field-error').text()).toBe('備註內容過長')
    })

    it('應該在有錯誤時添加 is-error class', () => {
      const wrapper = mountFormTextarea({
        error: '無效輸入'
      })

      expect(wrapper.find('.form-field').classes()).toContain('is-error')
    })

    it('應該在沒有錯誤時不顯示錯誤訊息', () => {
      const wrapper = mountFormTextarea()
      expect(wrapper.find('.form-field-error').exists()).toBe(false)
    })
  })

  describe('提示文字', () => {
    it('應該顯示提示文字', () => {
      const wrapper = mountFormTextarea({
        hint: '請輸入詳細說明'
      })

      expect(wrapper.find('.form-field-hint').exists()).toBe(true)
      expect(wrapper.find('.form-field-hint').text()).toBe('請輸入詳細說明')
    })

    it('應該在有錯誤時隱藏提示文字', () => {
      const wrapper = mountFormTextarea({
        hint: '請輸入詳細說明',
        error: '此欄位為必填'
      })

      expect(wrapper.find('.form-field-hint').exists()).toBe(false)
      expect(wrapper.find('.form-field-error').exists()).toBe(true)
    })
  })

  describe('禁用狀態', () => {
    it('應該在禁用時設置 disabled 屬性', () => {
      const wrapper = mountFormTextarea({
        disabled: true
      })

      expect(wrapper.find('textarea').attributes('disabled')).toBeDefined()
    })

    it('應該在禁用時添加 is-disabled class', () => {
      const wrapper = mountFormTextarea({
        disabled: true
      })

      expect(wrapper.find('.form-field').classes()).toContain('is-disabled')
    })
  })

  describe('佔位文字', () => {
    it('應該顯示佔位文字', () => {
      const wrapper = mountFormTextarea({
        placeholder: '請輸入您的備註...'
      })

      expect(wrapper.find('textarea').attributes('placeholder')).toBe('請輸入您的備註...')
    })
  })
})
