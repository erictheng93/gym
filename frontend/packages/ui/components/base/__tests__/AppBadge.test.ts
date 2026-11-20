import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AppBadge from '../AppBadge.vue'

describe('AppBadge', () => {
  it('應該正確渲染預設狀態標籤', () => {
    const wrapper = mount(AppBadge, {
      props: { label: 'Active' }
    })
    expect(wrapper.text()).toContain('Active')
    expect(wrapper.classes()).toContain('badge-default')
    expect(wrapper.classes()).toContain('badge-md')
  })

  it('應該支援不同變體', () => {
    const wrapper = mount(AppBadge, {
      props: { label: 'Success', variant: 'success' }
    })
    expect(wrapper.classes()).toContain('badge-success')
  })

  it('應該支援呼吸燈指示點', () => {
    const wrapper = mount(AppBadge, {
      props: { label: 'Live', dot: true }
    })
    expect(wrapper.find('.badge-dot').exists()).toBe(true)
  })

  it('應該支援光暈樣式', () => {
    const wrapper = mount(AppBadge, {
      props: { label: 'Glowing', glow: true }
    })
    expect(wrapper.classes()).toContain('badge-glow')
  })

  it('應該支援尺寸變更', () => {
    const wrapper = mount(AppBadge, {
      props: { label: 'Small', size: 'sm' }
    })
    expect(wrapper.classes()).toContain('badge-sm')
  })

  it('應該支援 slot 內容自訂', () => {
    const wrapper = mount(AppBadge, {
      props: { label: 'Fallback' },
      slots: { default: 'Custom Content' }
    })
    expect(wrapper.text()).toContain('Custom Content')
  })
})
