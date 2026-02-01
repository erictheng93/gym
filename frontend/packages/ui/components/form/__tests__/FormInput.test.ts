import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { mount, shallowMount } from '@vue/test-utils'
import { computed as vueComputed } from 'vue'
import FormInput from '../FormInput.vue'
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

  describe('初始化', () => {
    it('應該正確渲染組件', () => {
      const wrapper = mountFormInput()
      expect(wrapper.find('input').exists()).toBe(true)
    })

    it('應該渲染標籤和必填指示器', () => {
      const wrapper = mountFormInput({
        label: '姓名',
        required: true
      })

      expect(wrapper.find('label').text()).toContain('姓名')
      expect(wrapper.find('label').classes()).toContain('required')
    })

    it('應該應用預設 type 為 text', () => {
      const wrapper = mountFormInput()
      expect(wrapper.find('input').attributes('type')).toBe('text')
    })

    it('應該支援不同的輸入類型', () => {
      const types = ['text', 'email', 'tel', 'number', 'password'] as const

      types.forEach(type => {
        const wrapper = mountFormInput({ type })
        expect(wrapper.find('input').attributes('type')).toBe(type)
      })
    })
  })

  describe('v-model 綁定', () => {
    it('應該顯示 modelValue', () => {
      const wrapper = mountFormInput({
        modelValue: 'test value'
      })

      expect(wrapper.find('input').element.value).toBe('test value')
    })

    it('應該在輸入時發出 update:modelValue 事件', async () => {
      const wrapper = mountFormInput({ modelValue: '' })

      await wrapper.find('input').setValue('new value')

      expect(wrapper.emitted('update:modelValue')).toBeTruthy()
      expect(wrapper.emitted('update:modelValue')![0]).toEqual(['new value'])
    })

    it('應該在 number 類型時轉換為數字', async () => {
      const wrapper = mountFormInput({
        type: 'number',
        modelValue: null
      })

      await wrapper.find('input').setValue('42')

      expect(wrapper.emitted('update:modelValue')).toBeTruthy()
      expect(wrapper.emitted('update:modelValue')![0]).toEqual([42])
    })

    it('應該在 number 類型空值時發出 null', async () => {
      const wrapper = mountFormInput({
        type: 'number',
        modelValue: 42
      })

      await wrapper.find('input').setValue('')

      expect(wrapper.emitted('update:modelValue')).toBeTruthy()
      expect(wrapper.emitted('update:modelValue')![0]).toEqual([null])
    })
  })

  describe('錯誤狀態', () => {
    it('應該顯示錯誤訊息', () => {
      const wrapper = mountFormInput({
        error: '此欄位為必填'
      })

      expect(wrapper.find('.form-field-error').exists()).toBe(true)
      expect(wrapper.find('.form-field-error').text()).toBe('此欄位為必填')
    })

    it('應該在有錯誤時添加 is-error class', () => {
      const wrapper = mountFormInput({
        error: '無效輸入'
      })

      expect(wrapper.find('.form-field').classes()).toContain('is-error')
    })

    it('應該在沒有錯誤時不顯示錯誤訊息', () => {
      const wrapper = mountFormInput()
      expect(wrapper.find('.form-field-error').exists()).toBe(false)
    })
  })

  describe('提示文字', () => {
    it('應該顯示提示文字', () => {
      const wrapper = mountFormInput({
        hint: '請輸入您的姓名'
      })

      expect(wrapper.find('.form-field-hint').exists()).toBe(true)
      expect(wrapper.find('.form-field-hint').text()).toBe('請輸入您的姓名')
    })

    it('應該在有錯誤時隱藏提示文字', () => {
      const wrapper = mountFormInput({
        hint: '請輸入您的姓名',
        error: '此欄位為必填'
      })

      expect(wrapper.find('.form-field-hint').exists()).toBe(false)
      expect(wrapper.find('.form-field-error').exists()).toBe(true)
    })
  })

  describe('禁用狀態', () => {
    it('應該在禁用時設置 disabled 屬性', () => {
      const wrapper = mountFormInput({
        disabled: true
      })

      expect(wrapper.find('input').attributes('disabled')).toBeDefined()
    })

    it('應該在禁用時添加 is-disabled class', () => {
      const wrapper = mountFormInput({
        disabled: true
      })

      expect(wrapper.find('.form-field').classes()).toContain('is-disabled')
    })
  })

  describe('佔位文字', () => {
    it('應該顯示佔位文字', () => {
      const wrapper = mountFormInput({
        placeholder: '請輸入...'
      })

      expect(wrapper.find('input').attributes('placeholder')).toBe('請輸入...')
    })
  })

  describe('數字輸入屬性', () => {
    it('應該設置 min 屬性', () => {
      const wrapper = mountFormInput({
        type: 'number',
        min: 0
      })

      expect(wrapper.find('input').attributes('min')).toBe('0')
    })

    it('應該設置 max 屬性', () => {
      const wrapper = mountFormInput({
        type: 'number',
        max: 100
      })

      expect(wrapper.find('input').attributes('max')).toBe('100')
    })

    it('應該設置 step 屬性', () => {
      const wrapper = mountFormInput({
        type: 'number',
        step: 0.01
      })

      expect(wrapper.find('input').attributes('step')).toBe('0.01')
    })
  })

  describe('前綴和後綴', () => {
    it('應該顯示前綴', () => {
      const wrapper = mountFormInput({
        prefix: 'NT$'
      })

      expect(wrapper.find('.input-prefix').exists()).toBe(true)
      expect(wrapper.find('.input-prefix').text()).toBe('NT$')
      expect(wrapper.find('.input-wrapper').classes()).toContain('has-prefix')
    })

    it('應該顯示後綴', () => {
      const wrapper = mountFormInput({
        suffix: '元'
      })

      expect(wrapper.find('.input-suffix').exists()).toBe(true)
      expect(wrapper.find('.input-suffix').text()).toBe('元')
      expect(wrapper.find('.input-wrapper').classes()).toContain('has-suffix')
    })

    it('應該同時顯示前綴和後綴', () => {
      const wrapper = mountFormInput({
        prefix: 'NT$',
        suffix: '元'
      })

      expect(wrapper.find('.input-prefix').exists()).toBe(true)
      expect(wrapper.find('.input-suffix').exists()).toBe(true)
    })
  })

  describe('其他屬性', () => {
    it('應該設置 maxlength 屬性', () => {
      const wrapper = mountFormInput({
        maxlength: 50
      })

      expect(wrapper.find('input').attributes('maxlength')).toBe('50')
    })

    it('應該設置 autocomplete 屬性', () => {
      const wrapper = mountFormInput({
        autocomplete: 'email'
      })

      expect(wrapper.find('input').attributes('autocomplete')).toBe('email')
    })
  })
})
