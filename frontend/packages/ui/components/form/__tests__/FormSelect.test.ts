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

  const select = (wrapper: ReturnType<typeof mountFormSelect>) => wrapper.find('select')

  it('渲染標籤、必填標記與所有選項', () => {
    const wrapper = mountFormSelect({ label: '類型', required: true })

    expect(wrapper.find('label').text()).toContain('類型')
    expect(wrapper.find('label').classes()).toContain('required')
    expect(wrapper.findAll('option').map(o => o.text())).toEqual(['選項一', '選項二', '選項三'])
  })

  describe('placeholder', () => {
    it('渲染為第一個 disabled 且 value 為空的選項', () => {
      const options = mountFormSelect({ placeholder: '請選擇...' }).findAll('option')

      expect(options).toHaveLength(4)
      expect(options[0]!.text()).toBe('請選擇...')
      expect(options[0]!.element.disabled).toBe(true)
      expect(options[0]!.element.value).toBe('')
    })

    it('沒有選項時只剩 placeholder', () => {
      const options = mountFormSelect({ options: [], placeholder: '無可用選項' }).findAll('option')
      expect(options.map(o => o.text())).toEqual(['無可用選項'])
    })

    it('modelValue 為 null 時選取 placeholder', () => {
      const wrapper = mountFormSelect({ modelValue: null, placeholder: '請選擇...' })
      expect(select(wrapper).element.value).toBe('')
    })
  })

  describe('v-model', () => {
    it('顯示選中的值', () => {
      const wrapper = mountFormSelect({ modelValue: 'option2' })
      expect(select(wrapper).element.value).toBe('option2')
    })

    it('選擇時發出該選項的值', async () => {
      const wrapper = mountFormSelect({ modelValue: '' })
      await select(wrapper).setValue('option1')
      expect(wrapper.emitted('update:modelValue')![0]).toEqual(['option1'])
    })

    it('數字選項顯示並發出 number', async () => {
      const wrapper = mountFormSelect({
        options: [{ value: 1, label: '一' }, { value: 2, label: '二' }],
        modelValue: 2
      })
      expect(select(wrapper).element.value).toBe('2')

      await select(wrapper).setValue('1')
      expect(wrapper.emitted('update:modelValue')![0]).toEqual([1])
    })
  })

  it('options 變動時更新選項', async () => {
    const wrapper = mountFormSelect({ options: [{ value: 'a', label: 'A' }] })
    expect(wrapper.findAll('option')).toHaveLength(1)

    await wrapper.setProps({
      options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]
    })
    expect(wrapper.findAll('option')).toHaveLength(2)
  })

  it('單一選項可被禁用', () => {
    const wrapper = mountFormSelect({
      options: [
        { value: 'option1', label: '選項一' },
        { value: 'option2', label: '選項二', disabled: true }
      ]
    })
    expect(wrapper.findAll('option').map(o => o.element.disabled)).toEqual([false, true])
  })

  it('顯示錯誤，且錯誤優先於提示', () => {
    const hintOnly = mountFormSelect({ hint: '選擇您的偏好' })
    expect(hintOnly.find('.form-field-hint').text()).toBe('選擇您的偏好')

    const both = mountFormSelect({ hint: '選擇您的偏好', error: '請選擇一個選項' })
    expect(both.find('.form-field-error').text()).toBe('請選擇一個選項')
    expect(both.find('.form-field-hint').exists()).toBe(false)
  })

  it('disabled 時 select 被禁用', () => {
    expect(select(mountFormSelect({ disabled: true })).element.disabled).toBe(true)
    expect(select(mountFormSelect()).element.disabled).toBe(false)
  })
})
