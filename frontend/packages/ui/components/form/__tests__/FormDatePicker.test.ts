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

  const dateInput = (wrapper: ReturnType<typeof mountFormDatePicker>) =>
    wrapper.find<HTMLInputElement>('input[type="date"]')

  it('渲染標籤與必填標記', () => {
    const wrapper = mountFormDatePicker({ label: '生日', required: true })
    expect(wrapper.find('label').text()).toContain('生日')
    expect(wrapper.find('label').classes()).toContain('required')
  })

  describe('v-model', () => {
    it('顯示 modelValue', () => {
      const wrapper = mountFormDatePicker({ modelValue: '2024-01-15' })
      expect(dateInput(wrapper).element.value).toBe('2024-01-15')
    })

    it('選擇日期時發出 update:modelValue', async () => {
      const wrapper = mountFormDatePicker({ modelValue: '' })
      await dateInput(wrapper).setValue('2024-06-20')
      expect(wrapper.emitted('update:modelValue')![0]).toEqual(['2024-06-20'])
    })
  })

  it('將 min / max 傳給 input', () => {
    const input = dateInput(mountFormDatePicker({ min: '2024-01-01', max: '2024-12-31' }))
    expect(input.attributes('min')).toBe('2024-01-01')
    expect(input.attributes('max')).toBe('2024-12-31')
  })

  it('顯示錯誤，且錯誤優先於提示', () => {
    const hintOnly = mountFormDatePicker({ hint: '請選擇您的出生日期' })
    expect(hintOnly.find('.form-field-hint').text()).toBe('請選擇您的出生日期')

    const both = mountFormDatePicker({ hint: '請選擇您的出生日期', error: '日期為必填' })
    expect(both.find('.form-field-error').text()).toBe('日期為必填')
    expect(both.find('.form-field-hint').exists()).toBe(false)
  })

  it('disabled 時 input 被禁用', () => {
    expect(dateInput(mountFormDatePicker({ disabled: true })).element.disabled).toBe(true)
    expect(dateInput(mountFormDatePicker()).element.disabled).toBe(false)
  })
})
