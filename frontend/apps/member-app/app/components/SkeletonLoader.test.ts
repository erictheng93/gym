/**
 * Unit tests for SkeletonLoader component
 * Tests iOS-style skeleton loader with shimmer animation
 */

import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SkeletonLoader from './SkeletonLoader.vue'

describe('SkeletonLoader', () => {
  describe('rendering', () => {
    it('should render with default props', () => {
      const wrapper = mount(SkeletonLoader)

      expect(wrapper.exists()).toBe(true)
      expect(wrapper.classes()).toContain('skeleton')
      expect(wrapper.classes()).toContain('skeleton--rectangular')
    })

    it('should have aria-hidden attribute for accessibility', () => {
      const wrapper = mount(SkeletonLoader)

      expect(wrapper.attributes('aria-hidden')).toBe('true')
    })
  })

  describe('variants', () => {
    it('should apply text variant class', () => {
      const wrapper = mount(SkeletonLoader, {
        props: { variant: 'text' },
      })

      expect(wrapper.classes()).toContain('skeleton--text')
    })

    it('should apply circular variant class', () => {
      const wrapper = mount(SkeletonLoader, {
        props: { variant: 'circular' },
      })

      expect(wrapper.classes()).toContain('skeleton--circular')
    })

    it('should apply card variant class', () => {
      const wrapper = mount(SkeletonLoader, {
        props: { variant: 'card' },
      })

      expect(wrapper.classes()).toContain('skeleton--card')
    })

    it('should apply rectangular variant class by default', () => {
      const wrapper = mount(SkeletonLoader, {
        props: { variant: 'rectangular' },
      })

      expect(wrapper.classes()).toContain('skeleton--rectangular')
    })
  })

  describe('custom dimensions', () => {
    it('should apply custom width', () => {
      const wrapper = mount(SkeletonLoader, {
        props: { width: '200px' },
      })

      expect(wrapper.attributes('style')).toContain('width: 200px')
    })

    it('should apply custom height', () => {
      const wrapper = mount(SkeletonLoader, {
        props: { height: '50px' },
      })

      expect(wrapper.attributes('style')).toContain('height: 50px')
    })

    it('should apply custom border radius', () => {
      const wrapper = mount(SkeletonLoader, {
        props: { radius: '20px' },
      })

      expect(wrapper.attributes('style')).toContain('border-radius: 20px')
    })

    it('should apply default width of 100%', () => {
      const wrapper = mount(SkeletonLoader)

      expect(wrapper.attributes('style')).toContain('width: 100%')
    })
  })

  describe('text variant defaults', () => {
    it('should use 1em height for text variant', () => {
      const wrapper = mount(SkeletonLoader, {
        props: { variant: 'text' },
      })

      expect(wrapper.attributes('style')).toContain('height: 1em')
    })

    it('should use 4px border radius for text variant', () => {
      const wrapper = mount(SkeletonLoader, {
        props: { variant: 'text' },
      })

      expect(wrapper.attributes('style')).toContain('border-radius: 4px')
    })
  })

  describe('circular variant defaults', () => {
    it('should use 50% border radius for circular variant', () => {
      const wrapper = mount(SkeletonLoader, {
        props: { variant: 'circular' },
      })

      expect(wrapper.attributes('style')).toContain('border-radius: 50%')
    })
  })
})
