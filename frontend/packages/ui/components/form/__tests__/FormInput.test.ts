import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mount } from '@vue/test-utils'
import { computed as vueComputed } from 'vue'
import FormInput from '../FormInput.vue'
import FormField from '../FormField.vue'

// Restore Vue's computed for component tests
const originalComputed = (globalThis as Record<string, unknown>).computed
beforeAll(() => {
  (globalThis as Record<string, unknown>).computed = vueComputed
})
afterAll(() => {
  (globalThis as Record<string, unknown>).computed = originalComputed
})

describe('FormInput', () => {
  // Helper to mount with FormField component
  const mountFormInput = (props = {}, options = {}) => {
    return mount(FormInput, {
      props,
      global: {
        components: { FormField },
        ...options
      }
    })
  }

  it('渲染標籤、必填標記，預設 type 為 text', () => {
    const wrapper = mountFormInput({ label: '姓名', required: true })

    expect(wrapper.find('label').text()).toContain('姓名')
    expect(wrapper.find('label').classes()).toContain('required')
    expect(wrapper.find('input').attributes('type')).toBe('text')
  })

  it('type 傳遞到 input 元素', () => {
    expect(mountFormInput({ type: 'email' }).find('input').attributes('type')).toBe('email')
    expect(mountFormInput({ type: 'number' }).find('input').attributes('type')).toBe('number')
  })

  describe('v-model', () => {
    it('顯示 modelValue', () => {
      const wrapper = mountFormInput({ modelValue: 'test value' })
      expect(wrapper.find('input').element.value).toBe('test value')
    })

    it('輸入時發出字串', async () => {
      const wrapper = mountFormInput({ modelValue: '' })
      await wrapper.find('input').setValue('new value')
      expect(wrapper.emitted('update:modelValue')![0]).toEqual(['new value'])
    })

    it('number 類型發出 Number', async () => {
      const wrapper = mountFormInput({ type: 'number', modelValue: null })
      await wrapper.find('input').setValue('42')
      expect(wrapper.emitted('update:modelValue')![0]).toEqual([42])
    })

    it('number 類型清空時發出 null', async () => {
      const wrapper = mountFormInput({ type: 'number', modelValue: 42 })
      await wrapper.find('input').setValue('')
      expect(wrapper.emitted('update:modelValue')![0]).toEqual([null])
    })
  })

  describe('錯誤與提示', () => {
    it('顯示錯誤訊息', () => {
      const wrapper = mountFormInput({ error: '此欄位為必填' })
      expect(wrapper.find('.form-field-error').text()).toBe('此欄位為必填')
    })

    it('沒有錯誤時不顯示錯誤訊息', () => {
      expect(mountFormInput().find('.form-field-error').exists()).toBe(false)
    })

    it('顯示提示文字，有錯誤時以錯誤取代提示', () => {
      const hintOnly = mountFormInput({ hint: '請輸入您的姓名' })
      expect(hintOnly.find('.form-field-hint').text()).toBe('請輸入您的姓名')

      const both = mountFormInput({ hint: '請輸入您的姓名', error: '此欄位為必填' })
      expect(both.find('.form-field-hint').exists()).toBe(false)
      expect(both.find('.form-field-error').exists()).toBe(true)
    })
  })

  it('disabled 時 input 被禁用', () => {
    expect(mountFormInput({ disabled: true }).find('input').element.disabled).toBe(true)
    expect(mountFormInput().find('input').element.disabled).toBe(false)
  })

  it('將 placeholder/min/max/step/maxlength/autocomplete 傳給 input', () => {
    const input = mountFormInput({
      type: 'number',
      placeholder: '請輸入...',
      min: 0,
      max: 100,
      step: 0.01,
      maxlength: 50,
      autocomplete: 'email'
    }).find('input')

    expect(input.attributes('placeholder')).toBe('請輸入...')
    expect(input.attributes('min')).toBe('0')
    expect(input.attributes('max')).toBe('100')
    expect(input.attributes('step')).toBe('0.01')
    expect(input.attributes('maxlength')).toBe('50')
    expect(input.attributes('autocomplete')).toBe('email')
  })

  it('渲染前綴與後綴文字', () => {
    const wrapper = mountFormInput({ prefix: 'NT$', suffix: '元' })
    expect(wrapper.find('.input-prefix').text()).toBe('NT$')
    expect(wrapper.find('.input-suffix').text()).toBe('元')

    const none = mountFormInput()
    expect(none.find('.input-prefix').exists()).toBe(false)
    expect(none.find('.input-suffix').exists()).toBe(false)
  })
})
