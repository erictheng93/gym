import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { onMounted, onUnmounted } from 'vue'
import SignaturePad from './SignaturePad.vue'

// vitest.setup.ts fakes onMounted (runs it during setup, before the canvas ref is bound);
// the pad needs the real hook so it can acquire its 2D context.
vi.stubGlobal('onMounted', onMounted)
vi.stubGlobal('onUnmounted', onUnmounted)

const SIGNATURE = 'data:image/png;base64,drawn'

const ctx = {
  scale: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  clearRect: vi.fn(),
  drawImage: vi.fn(),
  strokeStyle: '',
  lineWidth: 0,
  lineCap: '',
  lineJoin: ''
}

// Images "load" as soon as their src is set.
class FakeImage {
  onload: (() => void) | null = null
  set src(_value: string) {
    queueMicrotask(() => this.onload?.())
  }
}

const originalGetContext = HTMLCanvasElement.prototype.getContext

enableAutoUnmount(afterEach)

describe('SignaturePad', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('Image', FakeImage)
    vi.stubGlobal('devicePixelRatio', 1)
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ctx) as unknown as HTMLCanvasElement['getContext']
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(SIGNATURE)
    // Canvas sits at (10, 20) on the page, 400x200.
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(10, 20, 400, 200))
  })

  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = originalGetContext
    vi.restoreAllMocks()
  })

  it('starts empty: placeholder shown, clear disabled', () => {
    const wrapper = mount(SignaturePad)
    expect(wrapper.find('.placeholder').exists()).toBe(true)
    expect(wrapper.find('.clear-btn').attributes('disabled')).toBeDefined()
  })

  it('scales the canvas for the device pixel ratio', () => {
    vi.stubGlobal('devicePixelRatio', 2)
    const wrapper = mount(SignaturePad)
    const canvas = wrapper.find('canvas').element as HTMLCanvasElement

    expect(canvas.width).toBe(800)
    expect(canvas.height).toBe(400)
    expect(ctx.scale).toHaveBeenCalledWith(2, 2)
  })

  it('draws strokes in canvas-relative coordinates and emits the PNG on mouseup', async () => {
    const wrapper = mount(SignaturePad)
    const canvas = wrapper.find('canvas')

    await canvas.trigger('mousedown', { clientX: 110, clientY: 70 })
    await canvas.trigger('mousemove', { clientX: 160, clientY: 80 })

    expect(ctx.moveTo).toHaveBeenCalledWith(100, 50)
    expect(ctx.lineTo).toHaveBeenCalledWith(150, 60)
    expect(ctx.stroke).toHaveBeenCalled()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()

    await canvas.trigger('mouseup')
    expect(wrapper.emitted('update:modelValue')).toEqual([[SIGNATURE]])
    expect(wrapper.find('.placeholder').exists()).toBe(false)
    expect(wrapper.find('.clear-btn').attributes('disabled')).toBeUndefined()
  })

  it('supports touch input', async () => {
    const wrapper = mount(SignaturePad)
    const canvas = wrapper.find('canvas')

    await canvas.trigger('touchstart', { touches: [{ clientX: 30, clientY: 40 }] })
    await canvas.trigger('touchmove', { touches: [{ clientX: 50, clientY: 60 }] })
    await canvas.trigger('touchend')

    expect(ctx.moveTo).toHaveBeenCalledWith(20, 20)
    expect(ctx.lineTo).toHaveBeenCalledWith(40, 40)
    expect(wrapper.emitted('update:modelValue')).toEqual([[SIGNATURE]])
  })

  it('ignores movement when not drawing, and stops drawing when the pointer leaves', async () => {
    const wrapper = mount(SignaturePad)
    const canvas = wrapper.find('canvas')

    await canvas.trigger('mousemove', { clientX: 50, clientY: 50 })
    expect(ctx.stroke).not.toHaveBeenCalled()

    await canvas.trigger('mousedown', { clientX: 50, clientY: 50 })
    await canvas.trigger('mouseleave')
    await canvas.trigger('mousemove', { clientX: 80, clientY: 80 })
    expect(ctx.stroke).not.toHaveBeenCalled()
    expect(wrapper.emitted('update:modelValue')).toEqual([[SIGNATURE]])
  })

  it('clears the canvas and emits an empty value', async () => {
    const wrapper = mount(SignaturePad)
    const canvas = wrapper.find('canvas')
    await canvas.trigger('mousedown', { clientX: 50, clientY: 50 })
    await canvas.trigger('mouseup')

    await wrapper.find('.clear-btn').trigger('click')

    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 400, 200)
    expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual([''])
    expect(wrapper.find('.placeholder').exists()).toBe(true)
  })

  it('renders an existing signature passed via v-model', async () => {
    const wrapper = mount(SignaturePad, { props: { modelValue: 'data:image/png;base64,existing' } })
    await Promise.resolve()
    await wrapper.vm.$nextTick()

    expect(ctx.drawImage).toHaveBeenCalledWith(expect.any(FakeImage), 0, 0, 400, 200)
    expect(wrapper.find('.placeholder').exists()).toBe(false)
  })

  it('re-initialises on window resize and removes the listener on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const wrapper = mount(SignaturePad)
    const getContext = vi.mocked(HTMLCanvasElement.prototype.getContext)
    const before = getContext.mock.calls.length

    window.dispatchEvent(new Event('resize'))
    expect(getContext.mock.calls.length).toBe(before + 1)

    wrapper.unmount()
    expect(removeSpy).toHaveBeenCalledWith('resize', expect.any(Function))
  })
})
