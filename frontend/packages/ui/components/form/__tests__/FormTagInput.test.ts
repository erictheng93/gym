import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mount } from '@vue/test-utils'
import { computed as vueComputed, ref as vueRef } from 'vue'
import FormTagInput from '../FormTagInput.vue'
import FormField from '../FormField.vue'

// Restore Vue's computed and ref for component tests
const originalComputed = globalThis.computed
const originalRef = globalThis.ref
beforeAll(() => {
  globalThis.computed = vueComputed
  globalThis.ref = vueRef
})
afterAll(() => {
  globalThis.computed = originalComputed
  globalThis.ref = originalRef
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

  describe('初始化', () => {
    it('應該正確渲染組件', () => {
      const wrapper = mountFormTagInput()
      expect(wrapper.find('.tag-input-container').exists()).toBe(true)
    })

    it('應該渲染標籤和必填指示器', () => {
      const wrapper = mountFormTagInput({
        label: '標籤',
        required: true
      })

      expect(wrapper.find('label').text()).toContain('標籤')
      expect(wrapper.find('label').classes()).toContain('required')
    })

    it('應該渲染輸入框和新增按鈕', () => {
      const wrapper = mountFormTagInput()

      expect(wrapper.find('input[type="text"]').exists()).toBe(true)
      expect(wrapper.find('.btn-secondary').exists()).toBe(true)
    })

    it('應該顯示自訂的按鈕文字', () => {
      const wrapper = mountFormTagInput({
        addButtonText: '添加標籤'
      })

      expect(wrapper.find('.btn-secondary').text()).toBe('添加標籤')
    })

    it('應該顯示預設的佔位文字', () => {
      const wrapper = mountFormTagInput()

      expect(wrapper.find('input[type="text"]').attributes('placeholder')).toBe('輸入標籤...')
    })

    it('應該顯示自訂的佔位文字', () => {
      const wrapper = mountFormTagInput({
        placeholder: '請輸入標籤名稱'
      })

      expect(wrapper.find('input[type="text"]').attributes('placeholder')).toBe('請輸入標籤名稱')
    })
  })

  describe('標籤顯示', () => {
    it('應該顯示已有的標籤', () => {
      const wrapper = mountFormTagInput({
        modelValue: ['VIP', '優先', '新會員']
      })

      const tags = wrapper.findAll('.tag')
      expect(tags.length).toBe(3)
      expect(tags[0].text()).toContain('VIP')
      expect(tags[1].text()).toContain('優先')
      expect(tags[2].text()).toContain('新會員')
    })

    it('應該在沒有標籤時不顯示標籤列表', () => {
      const wrapper = mountFormTagInput({
        modelValue: []
      })

      expect(wrapper.find('.tags-list').exists()).toBe(false)
    })

    it('應該渲染移除按鈕', () => {
      const wrapper = mountFormTagInput({
        modelValue: ['測試']
      })

      expect(wrapper.find('.tag-remove').exists()).toBe(true)
    })
  })

  describe('新增標籤', () => {
    it('應該在點擊按鈕時新增標籤', async () => {
      const wrapper = mountFormTagInput({
        modelValue: []
      })

      await wrapper.find('input[type="text"]').setValue('新標籤')
      await wrapper.find('.btn-secondary').trigger('click')

      expect(wrapper.emitted('update:modelValue')).toBeTruthy()
      expect(wrapper.emitted('update:modelValue')![0]).toEqual([['新標籤']])
    })

    it('應該在按 Enter 時新增標籤', async () => {
      const wrapper = mountFormTagInput({
        modelValue: []
      })

      const input = wrapper.find('input[type="text"]')
      await input.setValue('Enter標籤')
      await input.trigger('keydown', { key: 'Enter' })

      expect(wrapper.emitted('update:modelValue')).toBeTruthy()
      expect(wrapper.emitted('update:modelValue')![0]).toEqual([['Enter標籤']])
    })

    it('應該忽略空白標籤', async () => {
      const wrapper = mountFormTagInput({
        modelValue: []
      })

      await wrapper.find('input[type="text"]').setValue('   ')
      await wrapper.find('.btn-secondary').trigger('click')

      expect(wrapper.emitted('update:modelValue')).toBeFalsy()
    })

    it('應該忽略重複標籤', async () => {
      const wrapper = mountFormTagInput({
        modelValue: ['已存在']
      })

      await wrapper.find('input[type="text"]').setValue('已存在')
      await wrapper.find('.btn-secondary').trigger('click')

      expect(wrapper.emitted('update:modelValue')).toBeFalsy()
    })

    it('應該修剪標籤前後空白', async () => {
      const wrapper = mountFormTagInput({
        modelValue: []
      })

      await wrapper.find('input[type="text"]').setValue('  有空白  ')
      await wrapper.find('.btn-secondary').trigger('click')

      expect(wrapper.emitted('update:modelValue')![0]).toEqual([['有空白']])
    })
  })

  describe('移除標籤', () => {
    it('應該在點擊移除按鈕時移除標籤', async () => {
      const wrapper = mountFormTagInput({
        modelValue: ['標籤一', '標籤二', '標籤三']
      })

      const removeButtons = wrapper.findAll('.tag-remove')
      expect(removeButtons.length).toBeGreaterThan(1)
      await removeButtons[1]!.trigger('click')

      expect(wrapper.emitted('update:modelValue')).toBeTruthy()
      expect(wrapper.emitted('update:modelValue')![0]).toEqual([['標籤一', '標籤三']])
    })

    it('應該在輸入為空時按 Backspace 移除最後一個標籤', async () => {
      const wrapper = mountFormTagInput({
        modelValue: ['標籤一', '標籤二']
      })

      const input = wrapper.find('input[type="text"]')
      await input.trigger('keydown', { key: 'Backspace' })

      expect(wrapper.emitted('update:modelValue')).toBeTruthy()
      expect(wrapper.emitted('update:modelValue')![0]).toEqual([['標籤一']])
    })

    it('應該在輸入有值時按 Backspace 不移除標籤', async () => {
      const wrapper = mountFormTagInput({
        modelValue: ['標籤一']
      })

      const input = wrapper.find('input[type="text"]')
      await input.setValue('測試')
      await input.trigger('keydown', { key: 'Backspace' })

      expect(wrapper.emitted('update:modelValue')).toBeFalsy()
    })
  })

  describe('maxTags 限制', () => {
    it('應該顯示標籤計數', () => {
      const wrapper = mountFormTagInput({
        modelValue: ['一', '二', '三'],
        maxTags: 5
      })

      expect(wrapper.find('.tags-count').exists()).toBe(true)
      expect(wrapper.find('.tags-count').text()).toBe('3 / 5')
    })

    it('應該在達到最大數量時禁用輸入', () => {
      const wrapper = mountFormTagInput({
        modelValue: ['一', '二', '三'],
        maxTags: 3
      })

      expect(wrapper.find('input[type="text"]').attributes('disabled')).toBeDefined()
    })

    it('應該在達到最大數量時禁用按鈕', () => {
      const wrapper = mountFormTagInput({
        modelValue: ['一', '二', '三'],
        maxTags: 3
      })

      expect(wrapper.find('.btn-secondary').attributes('disabled')).toBeDefined()
    })

    it('應該在未達到最大數量時允許輸入', () => {
      const wrapper = mountFormTagInput({
        modelValue: ['一', '二'],
        maxTags: 5
      })

      expect(wrapper.find('input[type="text"]').attributes('disabled')).toBeUndefined()
    })
  })

  describe('標籤樣式變體', () => {
    it('應該使用 primary 變體作為預設', () => {
      const wrapper = mountFormTagInput({
        modelValue: ['測試']
      })

      expect(wrapper.find('.tag').classes()).toContain('tag-primary')
    })

    it('應該支援不同的變體', () => {
      const variants = ['default', 'primary', 'success', 'warning', 'error'] as const

      variants.forEach(variant => {
        const wrapper = mountFormTagInput({
          modelValue: ['測試'],
          variant
        })

        expect(wrapper.find('.tag').classes()).toContain(`tag-${variant}`)
      })
    })
  })

  describe('錯誤狀態', () => {
    it('應該顯示錯誤訊息', () => {
      const wrapper = mountFormTagInput({
        error: '標籤數量不足'
      })

      expect(wrapper.find('.form-field-error').exists()).toBe(true)
      expect(wrapper.find('.form-field-error').text()).toBe('標籤數量不足')
    })

    it('應該在有錯誤時添加 is-error class', () => {
      const wrapper = mountFormTagInput({
        error: '無效標籤'
      })

      expect(wrapper.find('.form-field').classes()).toContain('is-error')
    })
  })

  describe('提示文字', () => {
    it('應該顯示提示文字', () => {
      const wrapper = mountFormTagInput({
        hint: '最多可添加 10 個標籤'
      })

      expect(wrapper.find('.form-field-hint').exists()).toBe(true)
      expect(wrapper.find('.form-field-hint').text()).toBe('最多可添加 10 個標籤')
    })

    it('應該在有錯誤時隱藏提示文字', () => {
      const wrapper = mountFormTagInput({
        hint: '最多可添加 10 個標籤',
        error: '標籤格式錯誤'
      })

      expect(wrapper.find('.form-field-hint').exists()).toBe(false)
      expect(wrapper.find('.form-field-error').exists()).toBe(true)
    })
  })

  describe('禁用狀態', () => {
    it('應該在禁用時添加 is-disabled class', () => {
      const wrapper = mountFormTagInput({
        disabled: true
      })

      expect(wrapper.find('.tag-input-container').classes()).toContain('is-disabled')
    })

    it('應該在禁用時禁用輸入框', () => {
      const wrapper = mountFormTagInput({
        disabled: true
      })

      expect(wrapper.find('input[type="text"]').attributes('disabled')).toBeDefined()
    })

    it('應該在禁用時不允許新增標籤', async () => {
      const wrapper = mountFormTagInput({
        disabled: true,
        modelValue: []
      })

      await wrapper.find('input[type="text"]').setValue('新標籤')
      await wrapper.find('.btn-secondary').trigger('click')

      expect(wrapper.emitted('update:modelValue')).toBeFalsy()
    })

    it('應該在禁用時不允許移除標籤', async () => {
      const wrapper = mountFormTagInput({
        disabled: true,
        modelValue: ['測試']
      })

      await wrapper.find('.tag-remove').trigger('click')

      expect(wrapper.emitted('update:modelValue')).toBeFalsy()
    })
  })
})
