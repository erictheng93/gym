import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mount } from '@vue/test-utils'
import { computed as vueComputed } from 'vue'
import FormTextarea from '../FormTextarea.vue'
import FormField from '../FormField.vue'

// Restore Vue's computed for component tests
const originalComputed = (globalThis as Record<string, unknown>).computed
beforeAll(() => {
  (globalThis as Record<string, unknown>).computed = vueComputed
})
afterAll(() => {
  (globalThis as Record<string, unknown>).computed = originalComputed
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

  const textarea = (wrapper: ReturnType<typeof mountFormTextarea>) => wrapper.find('textarea')

  it('渲染標籤與必填標記', () => {
    const wrapper = mountFormTextarea({ label: '備註', required: true })
    expect(wrapper.find('label').text()).toContain('備註')
    expect(wrapper.find('label').classes()).toContain('required')
  })

  it('rows 預設為 3，可自訂', () => {
    expect(textarea(mountFormTextarea()).attributes('rows')).toBe('3')
    expect(textarea(mountFormTextarea({ rows: 6 })).attributes('rows')).toBe('6')
  })

  it('resize 預設為 vertical，可自訂', () => {
    expect(textarea(mountFormTextarea()).element.style.resize).toBe('vertical')
    expect(textarea(mountFormTextarea({ resize: 'none' })).element.style.resize).toBe('none')
  })

  describe('v-model', () => {
    it('顯示 modelValue', () => {
      const wrapper = mountFormTextarea({ modelValue: '一些備註' })
      expect(textarea(wrapper).element.value).toBe('一些備註')
    })

    it('輸入時發出 update:modelValue', async () => {
      const wrapper = mountFormTextarea()
      await textarea(wrapper).setValue('新內容')
      expect(wrapper.emitted('update:modelValue')![0]).toEqual(['新內容'])
    })
  })

  describe('maxlength 與字數計數', () => {
    it('maxlength 傳給 textarea 並顯示字數', () => {
      const wrapper = mountFormTextarea({ maxlength: 100, modelValue: '12345' })
      expect(textarea(wrapper).attributes('maxlength')).toBe('100')
      expect(wrapper.find('.char-count').text()).toBe('5 / 100')
    })

    it('modelValue 更新時字數同步更新', async () => {
      const wrapper = mountFormTextarea({ maxlength: 100, modelValue: 'abc' })
      await wrapper.setProps({ modelValue: 'abcdefgh' })
      expect(wrapper.find('.char-count').text()).toBe('8 / 100')
    })

    it('未設 maxlength 時不顯示字數', () => {
      expect(mountFormTextarea().find('.char-count').exists()).toBe(false)
    })
  })

  it('顯示錯誤，且錯誤優先於提示', () => {
    const hintOnly = mountFormTextarea({ hint: '請詳細描述' })
    expect(hintOnly.find('.form-field-hint').text()).toBe('請詳細描述')

    const both = mountFormTextarea({ hint: '請詳細描述', error: '內容太短' })
    expect(both.find('.form-field-error').text()).toBe('內容太短')
    expect(both.find('.form-field-hint').exists()).toBe(false)
  })

  it('disabled 時 textarea 被禁用', () => {
    expect(textarea(mountFormTextarea({ disabled: true })).element.disabled).toBe(true)
    expect(textarea(mountFormTextarea()).element.disabled).toBe(false)
  })

  it('顯示 placeholder', () => {
    expect(textarea(mountFormTextarea({ placeholder: '請輸入...' })).attributes('placeholder')).toBe('請輸入...')
  })
})
