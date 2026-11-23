/**
 * Adaptive specialist routing.
 *
 * The base router in {@link capabilities} (`matchScore` / `rankSpecialists`)
 * is purely heuristic: it matches task keywords against specialist features.
 * Adaptive routing layers on top by tracking each specialist's historical
 * performance (success rate, duration, quality) and biasing the score toward
 * specialists with a proven track record for the given task type.
 *
 * The router is intentionally lightweight: it is a plain class with no
 * Electron or SDK dependencies, so it can be unit-tested in isolation and
 * plugged into the host's task-assignment path wherever the host sees fit.
 */

import { buildCapabilities, matchScore } from './capabilities'
import {
  type AgentCapabilities,
  type AgentFeature,
  type Specialist,
  type SpecialistPerformance,
  type Task,
  type TaskOutcome
} from './types'

/** How much weight to give performance vs. the base keyword match score. */
const PERFORMANCE_WEIGHT = 0.4
/** Base keyword-match weight. */
const KEYWORD_WEIGHT = 0.6
/** Tasks with no history use this neutral performance score. */
const DEFAULT_PERFORMANCE_SCORE = 0.5
/** Minimum score below which a specialist is excluded from routing. */
const MIN_ROUTING_SCORE = 0

/**
 * Exponential moving average alpha for updating running averages.
 * Higher = react faster to recent results; lower = smoother over time.
 */
const EMA_ALPHA = 0.3

export interface AdaptiveRouterOptions {
  /** Optional override for the performance weight (0-1). Default 0.4. */
  performanceWeight?: number
  /** Optional override for the keyword-match weight (0-1). Default 0.6. */
  keywordWeight?: number
  /** Optional override for the EMA alpha (0-1). Default 0.3. */
  emaAlpha?: number
}

/**
 * Adaptive router that wraps capability-based routing with performance-based
 * bias.
 *
 * Usage:
 *   const router = new AdaptiveRouter()
 *   // Before assigning a task:
 *   const score = router.score(task, specialist, capabilities)
 *   // After the task completes:
 *   router.recordOutcome({ specialistId, taskId, outcome: 'completed', durationMs, timestamp })
 */
export class AdaptiveRouter {
  private readonly performanceWeight: number
  private readonly keywordWeight: number
  private readonly emaAlpha: number

  private performances = new Map<string, SpecialistPerformance>()

  constructor(options: AdaptiveRouterOptions = {}) {
    this.performanceWeight = options.performanceWeight ?? PERFORMANCE_WEIGHT
    this.keywordWeight = options.keywordWeight ?? KEYWORD_WEIGHT
    this.emaAlpha = options.emaAlpha ?? EMA_ALPHA
  }

  /**
   * Compute an adjusted routing score (0-1) for a specialist on a task.
   * Combines the keyword match score with the specialist's historical
   * performance. Returns 0 when the specialist cannot perform the task
   * at all (regardless of performance history).
   */
  score(task: Task, specialist: Specialist, capabilities: AgentCapabilities): number {
    const baseScore = matchScore(task, specialist, capabilities)
    if (baseScore <= 0) return 0

    const perf = this.performances.get(specialist.id)
    const perfScore = perf ? this.performanceScore(perf) : DEFAULT_PERFORMANCE_SCORE

    return this.keywordWeight * baseScore + this.performanceWeight * perfScore
  }

  /** Rank specialists for a task, highest score first. Excludes specialists
   *  with a score of 0 (cannot perform the task). */
  rank(task: Task, specialists: Specialist[], capabilityCache: Map<string, AgentCapabilities>): Specialist[] {
    const scored = specialists
      .filter((s) => s.enabled)
      .map((s) => {
        const caps = capabilityCache.get(s.id) ?? buildCapabilities(s)
        capabilityCache.set(s.id, caps)
        return { specialist: s, score: this.score(task, s, caps) }
      })
      .filter((entry) => entry.score > MIN_ROUTING_SCORE)
      .sort((a, b) => b.score - a.score)
    return scored.map((entry) => entry.specialist)
  }

  /** Pick the best specialist for a task. Returns null when no specialist
   *  can perform the task (all scores are 0). */
  pick(task: Task, specialists: Specialist[], capabilityCache: Map<string, AgentCapabilities>): Specialist | null {
    const ranked = this.rank(task, specialists, capabilityCache)
    return ranked[0] ?? null
  }

  /**
   * Record the outcome of a specialist task execution. Used to update the
   * specialist's performance history, which biases future routing.
   */
  recordOutcome(outcome: TaskOutcome): void {
    const perf = this.performances.get(outcome.specialistId) || this.emptyPerformance(outcome.specialistId)

    perf.totalRuns += 1
    if (outcome.outcome === 'completed') {
      perf.completedRuns += 1
    } else {
      perf.failedRuns += 1
    }

    // EMA update for average duration. First run just takes the value directly.
    if (outcome.outcome === 'completed') {
      perf.avgDurationMs =
        perf.avgDurationMs === 0
          ? outcome.durationMs
          : this.emaAlpha * outcome.durationMs + (1 - this.emaAlpha) * perf.avgDurationMs
    }

    // EMA update for quality score
    if (outcome.qualityScore != null) {
      perf.avgQualityScore =
        perf.avgQualityScore == null
          ? outcome.qualityScore
          : this.emaAlpha * outcome.qualityScore + (1 - this.emaAlpha) * perf.avgQualityScore
    }

    perf.lastRunAt = outcome.timestamp

    this.performances.set(outcome.specialistId, perf)
  }

  /** Get the current performance record for a specialist, if any. */
  getPerformance(specialistId: string): SpecialistPerformance | undefined {
    return this.performances.get(specialistId)
  }

  /** Clear all performance history (useful for testing or reset). */
  clear(): void {
    this.performances.clear()
  }

  /** Number of specialists with performance history. */
  get size(): number {
    return this.performances.size
  }

  // ------------------------------------------------------------------
  // Private helpers
  // ------------------------------------------------------------------

  private performanceScore(perf: SpecialistPerformance): number {
    if (perf.totalRuns === 0) return DEFAULT_PERFORMANCE_SCORE

    const successRate = perf.completedRuns / perf.totalRuns

    // Blend success rate with quality score when available
    let score = successRate
    if (perf.avgQualityScore != null) {
      score = 0.7 * successRate + 0.3 * perf.avgQualityScore
    }

    return Math.max(0, Math.min(1, score))
  }

  private emptyPerformance(specialistId: string): SpecialistPerformance {
    return {
      specialistId,
      totalRuns: 0,
      completedRuns: 0,
      failedRuns: 0,
      avgDurationMs: 0,
      avgQualityScore: null,
      lastRunAt: null,
      featurePerformance: {}
    }
  }
}

/**
 * Convenience: adapt an existing capabilities map by recording outcomes
 * from completed tasks. The host can call this after each task settles
 * to keep the router's performance history in sync.
 */
export function recordTaskOutcome(
  router: AdaptiveRouter,
  specialistId: string,
  task: Pick<Task, 'id'>,
  outcome: 'completed' | 'failed',
  durationMs: number,
  qualityScore?: number
): void {
  router.recordOutcome({
    specialistId,
    taskId: task.id,
    outcome,
    durationMs,
    qualityScore,
    timestamp: Date.now()
  })
}

/**
 * Feature-specific performance lookup. Returns the success rate for a
 * given feature on a specialist, or null if no data.
 */
export function featureSuccessRate(perf: SpecialistPerformance | undefined, feature: AgentFeature): number | null {
  const entry = perf?.featurePerformance[feature]
  if (!entry || entry.runs === 0) return null
  return entry.successes / entry.runs
}
