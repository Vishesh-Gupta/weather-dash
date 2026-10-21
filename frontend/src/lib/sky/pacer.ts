// When and how sharply to draw the sky, matched to the machine. It draws on every
// display refresh (60, 120, 144 Hz: whatever the screen runs at). Where the GPU
// reports how long each frame takes, resolution follows the headroom: sharper
// while frames use little of the refresh, softer before they get tight. Without
// GPU timings, frames that keep missing the refresh slow the sky down and shrink
// it; once things are calm again it tries stepping back up.

/** Slowest refresh when the device can't keep up; clouds drift slowly enough for it. */
export const SLOWEST_FRAME_MS = 1000
/** Missed refreshes in a row (net of good frames) before stepping down. */
const LATE_FRAMES = 8
/** Short frames in a row before believing the display refreshes faster. */
const FASTER_FRAMES = 10
/** 240 Hz, the fastest common display. */
const MIN_REFRESH_MS = 1000 / 240
/** Loading and compiling make the first frames slow; don't judge the device on them. */
const WARM_UP_MS = 2000
/** Calm time at a reduced level before trying the next level up, doubling on failure. */
const FIRST_PROBE_MS = 10_000
const LONGEST_PROBE_MS = 160_000
/**
 * GPU time per frame, as a share of the refresh: sharpen below the lower bound,
 * soften above the upper. One step changes the pixel count by about 1.56×, so a
 * step up from just under 0.3 lands near 0.47 and can't bounce straight back.
 */
const GPU_HEADROOM = 0.3
const GPU_TIGHT = 0.7
const GPU_SAMPLES = 20
const RESOLUTION_STEP = 1.25
/** Time between resolution changes, so each level is measured before the next. */
const RESOLUTION_SETTLE_MS = 1500
const MIN_QUALITY = 0.5

export class FramePacer {
  /** Minimum time between draws; 0 means every display refresh. */
  frameMs = 0
  /** The display's refresh interval, measured from animation frames. */
  refreshMs = 1000 / 60
  /** Resolution multiplier: 1 is the default size, up to maxQuality (full device pixels). */
  quality = 1
  maxQuality = 1
  private lastTick = 0
  private lastDraw = 0
  private warmUntil = 0
  private late = 0
  private lateTotal = 0
  private fasterRun = 0
  private fasterTotal = 0
  private calmSince = 0
  private probeMs = FIRST_PROBE_MS
  private probedAt = -Infinity
  private gpuMs = 0
  /** Once the GPU has reported a timing, resolution follows timings alone. */
  private gpuTimed = false
  private gpuSamples = 0
  private resolutionChangedAt = 0

  /** Start measuring afresh, e.g. after the page was hidden. */
  reset() {
    this.lastTick = 0
    this.lastDraw = 0
    this.warmUntil = 0
    this.late = 0
    this.lateTotal = 0
  }

  /**
   * Call on every animation frame. Returns whether to draw now, and whether the
   * quality level changed (so the caller should resize).
   */
  tick(now: number): { draw: boolean; resized: boolean } {
    if (!this.warmUntil) this.warmUntil = now + WARM_UP_MS
    if (this.lastTick) this.measureRefresh(now - this.lastTick)
    this.lastTick = now
    const since = now - this.lastDraw
    // Half a refresh of slack so a slowed-down rate lands on whole display frames.
    if (this.lastDraw && since < this.frameMs - this.refreshMs / 2) {
      return { draw: false, resized: false }
    }
    const judge = this.lastDraw && now >= this.warmUntil
    const resized = judge ? this.adapt(since, now) || this.tuneResolution(now) : false
    this.lastDraw = now
    return { draw: true, resized }
  }

  /** How long the GPU took to draw a frame, when the browser can say. */
  recordGpuTime(ms: number) {
    this.gpuMs = this.gpuSamples ? this.gpuMs * 0.9 + ms * 0.1 : ms
    this.gpuTimed = true
    this.gpuSamples += 1
  }

  /** Follow the GPU's measured headroom: sharper when there's room, softer when tight. */
  private tuneResolution(now: number): boolean {
    if (this.gpuSamples < GPU_SAMPLES || now - this.resolutionChangedAt < RESOLUTION_SETTLE_MS) {
      return false
    }
    // Judged against every refresh, the goal, even while the rate is reduced; and no
    // sharpening until the full rate is back.
    const share = this.gpuMs / this.refreshMs
    let next = this.quality
    if (share > GPU_TIGHT) next = Math.max(MIN_QUALITY, this.quality / RESOLUTION_STEP)
    else if (share < GPU_HEADROOM && this.frameMs === 0) {
      next = Math.min(this.maxQuality, this.quality * RESOLUTION_STEP)
    }
    if (next === this.quality) return false
    this.quality = next
    this.resolutionChangedAt = now
    this.gpuSamples = 0
    return true
  }

  /**
   * The display's refresh interval: the shortest normal gap between animation frames,
   * drifting slowly upwards so a move to a slower display is picked up. A faster rate
   * (a 120 Hz screen) is only accepted after a sustained run of short frames, so a
   * stray short gap, as after a hitch, can't make every later frame look late.
   */
  private measureRefresh(delta: number) {
    if (delta <= 0) return
    if (delta < this.refreshMs * 0.8) {
      this.fasterRun += 1
      this.fasterTotal += delta
      if (this.fasterRun >= FASTER_FRAMES) {
        this.refreshMs = Math.max(MIN_REFRESH_MS, this.fasterTotal / this.fasterRun)
        this.fasterRun = 0
        this.fasterTotal = 0
      }
      return
    }
    this.fasterRun = 0
    this.fasterTotal = 0
    this.refreshMs = Math.min(this.refreshMs * 1.002, delta)
  }

  private adapt(interval: number, now: number): boolean {
    const expected = Math.max(this.frameMs, this.refreshMs)
    if (interval <= expected * 1.5) {
      this.late = Math.max(0, this.late - 1)
      if (!this.calmSince) this.calmSince = now
      return this.degraded && now - this.calmSince >= this.probeMs ? this.stepUp(now) : false
    }
    this.calmSince = 0
    this.late += 1
    this.lateTotal += interval
    if (this.late < LATE_FRAMES || this.frameMs >= SLOWEST_FRAME_MS) return false
    return this.stepDown(now, this.lateTotal / this.late, expected)
  }

  private get degraded() {
    return this.frameMs > 0 || this.quality < 1
  }

  /**
   * A late frame shows roughly what one draw costs; refreshing at three times that
   * keeps the sky to about a third of the device's time.
   */
  private stepDown(now: number, cost: number, expected: number) {
    // Failing soon after trying a level up: wait longer before the next try.
    this.probeMs =
      now - this.probedAt < this.probeMs
        ? Math.min(LONGEST_PROBE_MS, this.probeMs * 2)
        : this.probeMs
    this.late = 0
    this.lateTotal = 0
    this.calmSince = 0
    this.frameMs = Math.min(SLOWEST_FRAME_MS, Math.max(expected * 2, cost * 3))
    this.quality = Math.max(MIN_QUALITY, this.quality * 0.8)
    this.gpuSamples = 0
    return true
  }

  private stepUp(now: number) {
    this.probedAt = now
    this.calmSince = now
    const faster = this.frameMs / 2
    this.frameMs = faster < this.refreshMs * 1.5 ? 0 : faster
    // With GPU timings, tuneResolution decides sharpness; recovery only restores the rate.
    if (!this.gpuTimed) this.quality = Math.min(this.maxQuality, this.quality / 0.8)
    this.gpuSamples = 0
    return true
  }
}
