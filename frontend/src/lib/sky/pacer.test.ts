import { describe, expect, it } from 'vitest'

import { FramePacer, SLOWEST_FRAME_MS } from './pacer'

/** Feed `count` animation frames `interval` ms apart; returns how many were drawn. */
function run(pacer: FramePacer, interval: number, count: number, start = 1000) {
  let draws = 0
  let resized = 0
  for (let i = 0; i < count; i++) {
    const result = pacer.tick(start + i * interval)
    if (result.draw) draws++
    if (result.resized) resized++
  }
  return { draws, resized, end: start + count * interval }
}

describe('FramePacer', () => {
  it('draws on every refresh of a 120 Hz display', () => {
    const pacer = new FramePacer()
    const { draws, resized } = run(pacer, 1000 / 120, 240)
    expect(draws).toBe(240)
    expect(resized).toBe(0)
    expect(pacer.refreshMs).toBeCloseTo(1000 / 120, 1)
    expect(pacer.frameMs).toBe(0)
  })

  it('draws on every refresh of a 60 Hz display', () => {
    const pacer = new FramePacer()
    expect(run(pacer, 1000 / 60, 120).draws).toBe(120)
    expect(pacer.frameMs).toBe(0)
  })

  it('ignores an occasional dropped frame', () => {
    const pacer = new FramePacer()
    let now = 1000
    for (let i = 0; i < 600; i++) {
      // One long frame (a hitch) every 50 frames at 120 Hz.
      now += i % 50 === 0 ? 40 : 1000 / 120
      pacer.tick(now)
    }
    expect(pacer.frameMs).toBe(0)
    expect(pacer.quality).toBe(1)
  })

  it("isn't fooled by a stray short frame", () => {
    const pacer = new FramePacer()
    let now = 1000
    for (let i = 0; i < 600; i++) {
      // A timer catching up: now and then a frame arrives 2 ms after the last.
      now += i % 40 === 0 ? 2 : 1000 / 60
      pacer.tick(now)
    }
    expect(pacer.refreshMs).toBeCloseTo(1000 / 60, 0)
    expect(pacer.frameMs).toBe(0)
    expect(pacer.quality).toBe(1)
  })

  it('slows down and shrinks when every frame misses the refresh', () => {
    const pacer = new FramePacer()
    // Establish a 120 Hz display past the warm-up, then frames that take 50 ms to draw.
    const { end } = run(pacer, 1000 / 120, 300)
    const slow = run(pacer, 50, 20, end)
    expect(slow.resized).toBeGreaterThan(0)
    expect(pacer.frameMs).toBeGreaterThanOrEqual(150)
    expect(pacer.quality).toBeLessThan(1)
  })

  it('never goes slower than once a second', () => {
    const pacer = new FramePacer()
    run(pacer, 2000, 200)
    expect(pacer.frameMs).toBeLessThanOrEqual(SLOWEST_FRAME_MS)
    expect(pacer.quality).toBeGreaterThanOrEqual(0.5)
  })

  it('lands a slowed rate on whole display frames', () => {
    const pacer = new FramePacer()
    run(pacer, 1000 / 120, 300)
    pacer.frameMs = 1000 / 60
    // At 120 Hz with a 60 fps target, every second refresh draws.
    expect(run(pacer, 1000 / 120, 120, 10_000).draws).toBe(60)
  })

  it("doesn't judge the device on slow first frames while the page loads", () => {
    const pacer = new FramePacer()
    // A second of 60 ms frames (loading, compiling), then a steady 120 Hz.
    const { end } = run(pacer, 60, 16)
    run(pacer, 1000 / 120, 600, end)
    expect(pacer.frameMs).toBe(0)
    expect(pacer.quality).toBe(1)
  })

  it('steps back up once the device has been calm for a while', () => {
    const pacer = new FramePacer()
    const { end } = run(pacer, 1000 / 120, 300)
    const slow = run(pacer, 50, 20, end)
    expect(pacer.frameMs).toBeGreaterThan(0)
    // The hitch passes: the display delivers 120 Hz frames again and draws are cheap.
    run(pacer, 1000 / 120, 120 * 90, slow.end)
    expect(pacer.frameMs).toBe(0)
    expect(pacer.quality).toBeCloseTo(1)
  })

  describe('with GPU timings', () => {
    /** Frames at `hz`, each reporting `gpuMs` of GPU time. */
    function timed(pacer: FramePacer, hz: number, seconds: number, gpuMs: number, start = 1000) {
      const interval = 1000 / hz
      let resized = 0
      for (let i = 0; i < hz * seconds; i++) {
        pacer.recordGpuTime(gpuMs)
        if (pacer.tick(start + i * interval).resized) resized++
      }
      return { resized, end: start + hz * seconds * interval }
    }

    it('sharpens up to full device pixels while the GPU has room', () => {
      const pacer = new FramePacer()
      pacer.maxQuality = 3
      timed(pacer, 120, 20, 0.5)
      expect(pacer.quality).toBe(3)
      expect(pacer.frameMs).toBe(0)
    })

    it('softens when frames use most of the refresh', () => {
      const pacer = new FramePacer()
      pacer.maxQuality = 3
      // 7 ms of an 8.3 ms refresh at 120 Hz.
      timed(pacer, 120, 10, 7)
      expect(pacer.quality).toBeLessThan(1)
      expect(pacer.frameMs).toBe(0)
    })

    it('holds steady in between', () => {
      const pacer = new FramePacer()
      pacer.maxQuality = 3
      // 8 ms of a 16.7 ms refresh at 60 Hz: neither roomy nor tight.
      const { resized } = timed(pacer, 60, 20, 8)
      expect(resized).toBe(0)
      expect(pacer.quality).toBe(1)
    })

    it("doesn't bounce after sharpening", () => {
      const pacer = new FramePacer()
      pacer.maxQuality = 3
      // Cost grows with pixel count: 2 ms at quality 1 on a 120 Hz display.
      let now = 1000
      let changes = 0
      for (let i = 0; i < 120 * 30; i++) {
        pacer.recordGpuTime(2 * pacer.quality * pacer.quality)
        if (pacer.tick(now).resized) changes++
        now += 1000 / 120
      }
      // Up from 1 while under 30% (2.5 ms) of the refresh, then it stays put.
      expect(pacer.quality).toBeCloseTo(1.25)
      expect(changes).toBe(1)
    })

    it('leaves sharpness to the GPU timings when recovering the frame rate', () => {
      const pacer = new FramePacer()
      pacer.maxQuality = 3
      // Mid-range GPU load at 120 Hz, then a stretch of late frames, then calm again.
      const steady = timed(pacer, 120, 5, 4)
      const before = pacer.quality
      let now = steady.end
      for (let i = 0; i < 20; i++) {
        pacer.recordGpuTime(4)
        pacer.tick(now)
        now += 50
      }
      expect(pacer.frameMs).toBeGreaterThan(0)
      const lowered = pacer.quality
      timed(pacer, 120, 60, 4, now)
      expect(pacer.frameMs).toBe(0)
      // Sharpness came back only through the measured headroom, never above it.
      expect(lowered).toBeLessThan(before)
      expect(pacer.quality).toBeLessThanOrEqual(before)
    })
  })
})
