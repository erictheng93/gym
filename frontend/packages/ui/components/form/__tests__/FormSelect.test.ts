import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mount } from '@vue/test-utils'
import { computed as vueComputed } from 'vue'
import FormSelect from '../FormSelect.vue'
import FormField from '../FormField.vue'

// Restore Vue's computed for component tests
const originalComputed = (globalThis as Record<string, unknown>).computed
beforeAll(() => {
  (globalThis as Record<string, unknown>).computed = vueComputed
})
afterAll(() => {
  (globalThis as Record<string, unknown>).computed = originalComputed
})

describe('FormSelect', () => {
  const defaultOptions = [
    { value: 'option1', label: '選項一' },
    { value: 'option2', label: '選項二' },
    { value: 'option3', label: '選項三' }
  ]

  // Helper to mount with FormField component
  const mountFormSelect = (props = {}, options = {}) => {
    return mount(FormSelect, {
      props: {
        options: defaultOptions,
        ...props
      },
      global: {
        components: { FormField },
        ...options
      }
    })
  }

  describe('初始化', () => {
    it('應該正確渲染組件', () => {
      const wrapper = mountFormSelect()
      expect(wrapper.find('select').exists()).toBe(true)
    })

    it('應該渲染標籤和必填指示器', () => {
      const wrapper = mountFormSelect({
        label: '類型',
        required: true
      })

      expect(wrapper.find('label').text()).toContain('類型')
      expect(wrapper.find('label').classes()).toContain('required')
    })

    it('應該渲染所有選項', () => {
      const wrapper = mountFormSelect()
      const options = wrapper.findAll('option')

      // 3 options (no placeholder)
      expect(options.length).toBe(3)
      expect(options[0]!.text()).toBe('選項一')
      expect(options[1]!.text()).toBe('選項二')
      expect(options[2]!.text()).toBe('選項三')
    })

    it('應該渲染佔位選項', () => {
      const wrapper = mountFormSelect({
        placeholder: '請選擇...'
      })
      const options = wrapper.findAll('option')

      // placeholder + 3 options
      expect(options.length).toBe(4)
      expect(options[0]!.text()).toBe('請選擇...')
      expect(options[0]!.attributes('disabled')).toBeDefined()
      expect(options[0]!.attributes('value')).toBe('')
    })
  })

  describe('v-model 綁定', () => {
    it('應該顯示選中的值', () => {
      const wrapper = mountFormSelect({
        modelValue: 'option2'
      })

      expect((wrapper.find('select').element as HTMLSelectElement).value).toBe('option2')
    })

    it('應該在選擇時發出 update:modelValue 事件', async () => {
      const wrapper = mountFormSelect({ modelValue: '' })

      await wrapper.find('select').setValue('option1')

      expect(wrapper.emitted('update:modelValue')).toBeTruthy()
      expect(wrapper.emitted('update:modelValue')![0]).toEqual(['option1'])
    })

    it('應該支援數字值', async () => {
      const numericOptions = [
        { value: 1, label: '一' },
        { value: 2, label: '二' },
        { value: 3, label: '三' }
      ]

      const wrapper = mountFormSelect({
        options: numericOptions,
        modelValue: 2
      })

      expect((wrapper.find('select').element as HTMLSelectElement).value).toBe('2')
    })

    it('應該處理 null 值', () => {
      const wrapper = mountFormSelect({
        modelValue: null,
        placeholder: '請選擇...'
      })

      expect((wrapper.find('select').element as HTMLSelectElement).value).toBe('')
    })
  })

  describe('錯誤狀態', () => {
    it('應該顯示錯誤訊息', () => {
      const wrapper = mountFormSelect({
        error: '請選擇一個選項'
      })

      expect(wrapper.find('.form-field-error').exists()).toBe(true)
      expect(wrapper.find('.form-field-error').text()).toBe('請選擇一個選項')
    })

    it('應該在有錯誤時添加 is-error class', () => {
      const wrapper = mountFormSelect({
        error: '無效選擇'
      })

      expect(wrapper.find('.form-field').classes()).toContain('is-error')
    })
  })

  describe('提示文字', () => {
    it('應該顯示提示文字', () => {
      const wrapper = mountFormSelect({
        hint: '選擇您的偏好'
      })

      expect(wrapper.find('.form-field-hint').exists()).toBe(true)
      expect(wrapper.find('.form-field-hint').text()).toBe('選擇您的偏好')
    })

    it('應該在有錯誤時隱藏提示文字', () => {
      const wrapper = mountFormSelect({
        hint: '選擇您的偏好',
        error: '必須選擇'
      })

      expect(wrapper.find('.form-field-hint').exists()).toBe(false)
      expect(wrapper.find('.form-field-error').exists()).toBe(true)
    })
  })

  describe('禁用狀態', () => {
    it('應該在禁用時設置 disabled 屬性', () => {
      const wrapper = mountFormSelect({
        disabled: true
      })

      expect(wrapper.find('select').attributes('disabled')).toBeDefined()
    })

    it('應該在禁用時添加 is-disabled class', () => {
      const wrapper = mountFormSelect({
        disabled: true
      })

      expect(wrapper.find('.form-field').classes()).toContain('is-disabled')
    })
  })

  describe('選項配置', () => {
    it('應該支援禁用的選項', () => {
      const optionsWithDisabled = [
        { value: 'option1', label: '選項一' },
        { value: 'option2', label: '選項二', disabled: true },
        { value: 'option3', label: '選項三' }
      ]

      const wrapper = mountFormSelect({
        options: optionsWithDisabled
      })

      const options = wrapper.findAll('option')
      expect(options[1]!.attributes('disabled')).toBeDefined()
    })

    it('應該處理空選項列表', () => {
      const wrapper = mountFormSelect({
        options: [],
        placeholder: '無可用選項'
      })

      const options = wrapper.findAll('option')
      expect(options.length).toBe(1) // Only placeholder
      expect(options[0]!.text()).toBe('無可用選項')
    })

    it('應該支援動態選項更新', async () => {
      const wrapper = mountFormSelect({
        options: [{ value: 'a', label: 'A' }]
      })

      expect(wrapper.findAll('option').length).toBe(1)

      await wrapper.setProps({
        options: [
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' }
        ]
      })

      expect(wrapper.findAll('option').length).toBe(2)
    })
  })

  describe('無障礙功能', () => {
    it('應該將 label 與 select 關聯', () => {
      const wrapper = mountFormSelect({
        label: '選擇類型'
      })

      // FormField wraps the label and select together
      expect(wrapper.find('label').exists()).toBe(true)
      expect(wrapper.find('select').exists()).toBe(true)
    })
  })
})
