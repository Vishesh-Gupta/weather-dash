// When to draw the sky. By default it draws on every display refresh, so a 120 Hz
// screen gets 120 frames a second. If frames keep missing the refresh, the pacer
// slows the sky down and asks for a smaller canvas; once things are calm again it
// tries stepping back up.

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

export class FramePacer {
  /** Minimum time between draws; 0 means every display refresh. */
  frameMs = 0
  /** The display's refresh interval, measured from animation frames. */
  refreshMs = 1000 / 60
  /** Resolution multiplier, lowered along with the frame rate. */
  quality = 1
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
    const resized = judge ? this.adapt(since, now) : false
    this.lastDraw = now
    return { draw: true, resized }
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
    this.quality = Math.max(0.5, this.quality * 0.8)
    return true
  }

  private stepUp(now: number) {
    this.probedAt = now
    this.calmSince = now
    const faster = this.frameMs / 2
    this.frameMs = faster < this.refreshMs * 1.5 ? 0 : faster
    this.quality = Math.min(1, this.quality / 0.8)
    return true
  }
}
