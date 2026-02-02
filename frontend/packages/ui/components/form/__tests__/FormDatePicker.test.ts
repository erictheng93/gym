import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mount } from '@vue/test-utils'
import { computed as vueComputed } from 'vue'
import FormDatePicker from '../FormDatePicker.vue'
import FormField from '../FormField.vue'

// Restore Vue's computed for component tests
const originalComputed = (globalThis as Record<string, unknown>).computed
beforeAll(() => {
  (globalThis as Record<string, unknown>).computed = vueComputed
})
afterAll(() => {
  (globalThis as Record<string, unknown>).computed = originalComputed
})

describe('FormDatePicker', () => {
  // Helper to mount with FormField component
  const mountFormDatePicker = (props = {}, options = {}) => {
    return mount(FormDatePicker, {
      props,
      global: {
        components: { FormField },
        ...options
      }
    })
  }

  describe('初始化', () => {
    it('應該正確渲染組件', () => {
      const wrapper = mountFormDatePicker()
      expect(wrapper.find('input[type="date"]').exists()).toBe(true)
    })

    it('應該渲染標籤和必填指示器', () => {
      const wrapper = mountFormDatePicker({
        label: '生日',
        required: true
      })

      expect(wrapper.find('label').text()).toContain('生日')
      expect(wrapper.find('label').classes()).toContain('required')
    })

    it('應該渲染日期圖標', () => {
      const wrapper = mountFormDatePicker()
      expect(wrapper.find('.date-icon').exists()).toBe(true)
      expect(wrapper.find('.date-icon svg').exists()).toBe(true)
    })
  })

  describe('v-model 綁定', () => {
    it('應該顯示 modelValue', () => {
      const wrapper = mountFormDatePicker({
        modelValue: '2024-01-15'
      })

      const input = wrapper.find('input[type="date"]').element as HTMLInputElement
      expect(input.value).toBe('2024-01-15')
    })

    it('應該在選擇日期時發出 update:modelValue 事件', async () => {
      const wrapper = mountFormDatePicker({ modelValue: '' })

      await wrapper.find('input[type="date"]').setValue('2024-06-20')

      expect(wrapper.emitted('update:modelValue')).toBeTruthy()
      expect(wrapper.emitted('update:modelValue')![0]).toEqual(['2024-06-20'])
    })

    it('應該處理空值', () => {
      const wrapper = mountFormDatePicker({
        modelValue: ''
      })

      const input = wrapper.find('input[type="date"]').element as HTMLInputElement
      expect(input.value).toBe('')
    })
  })

  describe('最大最小日期限制', () => {
    it('應該設置 min 屬性', () => {
      const wrapper = mountFormDatePicker({
        min: '2024-01-01'
      })

      expect(wrapper.find('input[type="date"]').attributes('min')).toBe('2024-01-01')
    })

    it('應該設置 max 屬性', () => {
      const wrapper = mountFormDatePicker({
        max: '2024-12-31'
      })

      expect(wrapper.find('input[type="date"]').attributes('max')).toBe('2024-12-31')
    })

    it('應該同時設置 min 和 max 屬性', () => {
      const wrapper = mountFormDatePicker({
        min: '2024-01-01',
        max: '2024-12-31'
      })

      const input = wrapper.find('input[type="date"]')
      expect(input.attributes('min')).toBe('2024-01-01')
      expect(input.attributes('max')).toBe('2024-12-31')
    })
  })

  describe('錯誤狀態', () => {
    it('應該顯示錯誤訊息', () => {
      const wrapper = mountFormDatePicker({
        error: '請選擇有效日期'
      })

      expect(wrapper.find('.form-field-error').exists()).toBe(true)
      expect(wrapper.find('.form-field-error').text()).toBe('請選擇有效日期')
    })

    it('應該在有錯誤時添加 is-error class', () => {
      const wrapper = mountFormDatePicker({
        error: '日期不能為未來'
      })

      expect(wrapper.find('.form-field').classes()).toContain('is-error')
    })
  })

  describe('提示文字', () => {
    it('應該顯示提示文字', () => {
      const wrapper = mountFormDatePicker({
        hint: '請選擇您的出生日期'
      })

      expect(wrapper.find('.form-field-hint').exists()).toBe(true)
      expect(wrapper.find('.form-field-hint').text()).toBe('請選擇您的出生日期')
    })

    it('應該在有錯誤時隱藏提示文字', () => {
      const wrapper = mountFormDatePicker({
        hint: '請選擇您的出生日期',
        error: '日期為必填'
      })

      expect(wrapper.find('.form-field-hint').exists()).toBe(false)
      expect(wrapper.find('.form-field-error').exists()).toBe(true)
    })
  })

  describe('禁用狀態', () => {
    it('應該在禁用時設置 disabled 屬性', () => {
      const wrapper = mountFormDatePicker({
        disabled: true
      })

      expect(wrapper.find('input[type="date"]').attributes('disabled')).toBeDefined()
    })

    it('應該在禁用時添加 is-disabled class', () => {
      const wrapper = mountFormDatePicker({
        disabled: true
      })

      expect(wrapper.find('.form-field').classes()).toContain('is-disabled')
    })
  })
})
