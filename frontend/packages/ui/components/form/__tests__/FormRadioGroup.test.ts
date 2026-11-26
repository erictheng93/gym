import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mount } from '@vue/test-utils'
import { computed as vueComputed } from 'vue'
import FormRadioGroup from '../FormRadioGroup.vue'
import FormField from '../FormField.vue'

// Restore Vue's computed for component tests
const originalComputed = (globalThis as Record<string, unknown>).computed
beforeAll(() => {
  (globalThis as Record<string, unknown>).computed = vueComputed
})
afterAll(() => {
  (globalThis as Record<string, unknown>).computed = originalComputed
})

describe('FormRadioGroup', () => {
  const defaultOptions = [
    { value: 'M', label: '男' },
    { value: 'F', label: '女' },
    { value: 'O', label: '其他' }
  ]

  // Helper to mount with FormField component
  const mountFormRadioGroup = (props = {}, options = {}) => {
    return mount(FormRadioGroup, {
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

  const options = (wrapper: ReturnType<typeof mountFormRadioGroup>) =>
    wrapper.findAll<HTMLButtonElement>('button.radio-option')

  it('渲染標籤、必填標記與所有選項', () => {
    const wrapper = mountFormRadioGroup({ label: '性別', required: true })

    expect(wrapper.find('label').text()).toContain('性別')
    expect(wrapper.find('label').classes()).toContain('required')
    expect(options(wrapper).map(o => o.text())).toEqual(['男', '女', '其他'])
  })

  describe('選取', () => {
    it('只有符合 modelValue 的選項為 active', () => {
      const wrapper = mountFormRadioGroup({ modelValue: 'F' })
      expect(options(wrapper).map(o => o.classes('active'))).toEqual([false, true, false])
    })

    it('支援數字值', () => {
      const wrapper = mountFormRadioGroup({
        options: [
          { value: 1, label: '選項一' },
          { value: 2, label: '選項二' }
        ],
        modelValue: 2
      })
      expect(wrapper.find('.radio-option.active').text()).toBe('選項二')
    })

    it('點擊選項時發出該選項的值', async () => {
      const wrapper = mountFormRadioGroup({ modelValue: '' })
      await options(wrapper)[1]!.trigger('click')
      expect(wrapper.emitted('update:modelValue')![0]).toEqual(['F'])
    })

    it('數字選項發出 number 而非字串', async () => {
      const wrapper = mountFormRadioGroup({
        options: [{ value: 1, label: 'a' }, { value: 2, label: 'b' }],
        modelValue: ''
      })
      await options(wrapper)[1]!.trigger('click')
      expect(wrapper.emitted('update:modelValue')![0]).toEqual([2])
    })
  })

  describe('allowEmpty', () => {
    it('allowEmpty 時再次點擊已選項會清空', async () => {
      const wrapper = mountFormRadioGroup({ modelValue: 'M', allowEmpty: true })
      await options(wrapper)[0]!.trigger('click')
      expect(wrapper.emitted('update:modelValue')![0]).toEqual([''])
    })

    it('allowEmpty 時點擊另一選項仍是切換', async () => {
      const wrapper = mountFormRadioGroup({ modelValue: 'M', allowEmpty: true })
      await options(wrapper)[1]!.trigger('click')
      expect(wrapper.emitted('update:modelValue')![0]).toEqual(['F'])
    })

    it('預設再次點擊已選項不會清空', async () => {
      const wrapper = mountFormRadioGroup({ modelValue: 'M' })
      await options(wrapper)[0]!.trigger('click')
      expect(wrapper.emitted('update:modelValue')![0]).toEqual(['M'])
    })
  })

  it('顯示錯誤，且錯誤優先於提示', () => {
    const hintOnly = mountFormRadioGroup({ hint: '請選擇您的性別' })
    expect(hintOnly.find('.form-field-hint').text()).toBe('請選擇您的性別')

    const both = mountFormRadioGroup({ hint: '請選擇您的性別', error: '請選擇性別' })
    expect(both.find('.form-field-error').text()).toBe('請選擇性別')
    expect(both.find('.form-field-hint').exists()).toBe(false)
  })

  describe('禁用', () => {
    it('整組禁用時所有按鈕 disabled 且點擊不發出事件', async () => {
      const wrapper = mountFormRadioGroup({ disabled: true, modelValue: '' })

      for (const option of options(wrapper)) {
        expect(option.element.disabled).toBe(true)
        await option.trigger('click')
      }
      expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    })

    it('單一選項禁用時只有該選項不可點擊', async () => {
      const wrapper = mountFormRadioGroup({
        options: [
          { value: 'M', label: '男' },
          { value: 'F', label: '女', disabled: true }
        ]
      })

      expect(options(wrapper).map(o => o.element.disabled)).toEqual([false, true])

      await options(wrapper)[1]!.trigger('click')
      expect(wrapper.emitted('update:modelValue')).toBeUndefined()

      await options(wrapper)[0]!.trigger('click')
      expect(wrapper.emitted('update:modelValue')![0]).toEqual(['M'])
    })
  })
})
