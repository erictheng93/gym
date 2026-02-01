import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mount } from '@vue/test-utils'
import { computed as vueComputed } from 'vue'
import FormRadioGroup from '../FormRadioGroup.vue'
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

  describe('初始化', () => {
    it('應該正確渲染組件', () => {
      const wrapper = mountFormRadioGroup()
      expect(wrapper.find('.radio-group').exists()).toBe(true)
    })

    it('應該渲染標籤和必填指示器', () => {
      const wrapper = mountFormRadioGroup({
        label: '性別',
        required: true
      })

      expect(wrapper.find('label').text()).toContain('性別')
      expect(wrapper.find('label').classes()).toContain('required')
    })

    it('應該渲染所有選項', () => {
      const wrapper = mountFormRadioGroup()
      const radioOptions = wrapper.findAll('.radio-option')

      expect(radioOptions.length).toBe(3)
      expect(radioOptions[0].text()).toBe('男')
      expect(radioOptions[1].text()).toBe('女')
      expect(radioOptions[2].text()).toBe('其他')
    })

    it('應該使用 pill 變體作為預設', () => {
      const wrapper = mountFormRadioGroup()
      expect(wrapper.find('.radio-group').classes()).toContain('variant-pill')
    })

    it('應該支援 button 變體', () => {
      const wrapper = mountFormRadioGroup({
        variant: 'button'
      })
      expect(wrapper.find('.radio-group').classes()).toContain('variant-button')
    })
  })

  describe('v-model 綁定', () => {
    it('應該顯示選中的值', () => {
      const wrapper = mountFormRadioGroup({
        modelValue: 'F'
      })

      const activeOption = wrapper.find('.radio-option.active')
      expect(activeOption.exists()).toBe(true)
      expect(activeOption.text()).toBe('女')
    })

    it('應該在選擇時發出 update:modelValue 事件', async () => {
      const wrapper = mountFormRadioGroup({ modelValue: '' })

      await wrapper.findAll('.radio-option')[1].trigger('click')

      expect(wrapper.emitted('update:modelValue')).toBeTruthy()
      expect(wrapper.emitted('update:modelValue')![0]).toEqual(['F'])
    })

    it('應該支援數字值', async () => {
      const numericOptions = [
        { value: 1, label: '選項一' },
        { value: 2, label: '選項二' },
        { value: 3, label: '選項三' }
      ]

      const wrapper = mountFormRadioGroup({
        options: numericOptions,
        modelValue: 2
      })

      const activeOption = wrapper.find('.radio-option.active')
      expect(activeOption.text()).toBe('選項二')
    })
  })

  describe('allowEmpty 功能', () => {
    it('應該允許取消選擇當 allowEmpty 為 true', async () => {
      const wrapper = mountFormRadioGroup({
        modelValue: 'M',
        allowEmpty: true
      })

      // Click the already selected option to deselect
      await wrapper.findAll('.radio-option')[0].trigger('click')

      expect(wrapper.emitted('update:modelValue')).toBeTruthy()
      expect(wrapper.emitted('update:modelValue')![0]).toEqual([''])
    })

    it('應該不允許取消選擇當 allowEmpty 為 false', async () => {
      const wrapper = mountFormRadioGroup({
        modelValue: 'M',
        allowEmpty: false
      })

      // Click the already selected option
      await wrapper.findAll('.radio-option')[0].trigger('click')

      // Should emit the same value again (not deselect)
      expect(wrapper.emitted('update:modelValue')).toBeTruthy()
      expect(wrapper.emitted('update:modelValue')![0]).toEqual(['M'])
    })
  })

  describe('錯誤狀態', () => {
    it('應該顯示錯誤訊息', () => {
      const wrapper = mountFormRadioGroup({
        error: '請選擇性別'
      })

      expect(wrapper.find('.form-field-error').exists()).toBe(true)
      expect(wrapper.find('.form-field-error').text()).toBe('請選擇性別')
    })

    it('應該在有錯誤時添加 is-error class', () => {
      const wrapper = mountFormRadioGroup({
        error: '無效選擇'
      })

      expect(wrapper.find('.form-field').classes()).toContain('is-error')
    })
  })

  describe('提示文字', () => {
    it('應該顯示提示文字', () => {
      const wrapper = mountFormRadioGroup({
        hint: '請選擇您的性別'
      })

      expect(wrapper.find('.form-field-hint').exists()).toBe(true)
      expect(wrapper.find('.form-field-hint').text()).toBe('請選擇您的性別')
    })

    it('應該在有錯誤時隱藏提示文字', () => {
      const wrapper = mountFormRadioGroup({
        hint: '請選擇您的性別',
        error: '必須選擇'
      })

      expect(wrapper.find('.form-field-hint').exists()).toBe(false)
      expect(wrapper.find('.form-field-error').exists()).toBe(true)
    })
  })

  describe('禁用狀態', () => {
    it('應該在禁用整組時不發出事件', async () => {
      const wrapper = mountFormRadioGroup({
        disabled: true,
        modelValue: ''
      })

      await wrapper.findAll('.radio-option')[0].trigger('click')

      expect(wrapper.emitted('update:modelValue')).toBeFalsy()
    })

    it('應該在禁用時添加 is-disabled class 到 FormField', () => {
      const wrapper = mountFormRadioGroup({
        disabled: true
      })

      expect(wrapper.find('.form-field').classes()).toContain('is-disabled')
    })

    it('應該在禁用時添加 disabled class 到選項', () => {
      const wrapper = mountFormRadioGroup({
        disabled: true
      })

      const options = wrapper.findAll('.radio-option')
      options.forEach(option => {
        expect(option.classes()).toContain('disabled')
      })
    })

    it('應該支援單個選項禁用', () => {
      const optionsWithDisabled = [
        { value: 'M', label: '男' },
        { value: 'F', label: '女', disabled: true },
        { value: 'O', label: '其他' }
      ]

      const wrapper = mountFormRadioGroup({
        options: optionsWithDisabled
      })

      const options = wrapper.findAll('.radio-option')
      expect(options[0].classes()).not.toContain('disabled')
      expect(options[1].classes()).toContain('disabled')
      expect(options[2].classes()).not.toContain('disabled')
    })
  })

  describe('Radio 輸入元素', () => {
    it('應該渲染隱藏的 radio input', () => {
      const wrapper = mountFormRadioGroup()
      const inputs = wrapper.findAll('input[type="radio"]')

      expect(inputs.length).toBe(3)
      inputs.forEach(input => {
        expect(input.classes()).toContain('radio-input')
      })
    })

    it('應該設置正確的 checked 狀態', () => {
      const wrapper = mountFormRadioGroup({
        modelValue: 'F'
      })

      const inputs = wrapper.findAll('input[type="radio"]')
      expect((inputs[0].element as HTMLInputElement).checked).toBe(false)
      expect((inputs[1].element as HTMLInputElement).checked).toBe(true)
      expect((inputs[2].element as HTMLInputElement).checked).toBe(false)
    })

    it('應該使用唯一的 name 屬性', () => {
      const wrapper = mountFormRadioGroup()
      const inputs = wrapper.findAll('input[type="radio"]')

      const name = inputs[0].attributes('name')
      expect(name).toBeTruthy()
      expect(name).toMatch(/^radio-group-/)

      // All inputs should have the same name
      inputs.forEach(input => {
        expect(input.attributes('name')).toBe(name)
      })
    })
  })
})
