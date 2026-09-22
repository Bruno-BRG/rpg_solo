/**
 * Savage Worlds Dramatic Tasks.
 *
 * A group of skill rolls against the clock: every success earns a
 * token, every raise earns an extra one, and the task completes
 * when the required tokens are banked — or fails when time runs
 * out. Critical failures (both dice showing 1) cost a token.
 *
 * Pure state machine; persistence lives in the `DramaticTask`
 * Prisma model / GM engine side-effects.
 */
import type { TraitRollResult } from "./dice";

export type DramaticTaskStatus = "running" | "completed" | "failed";

export interface TaskAttempt {
  round: number;
  skill: string;
  roll: TraitRollResult;
  /** Tokens earned by this attempt (0 on failure/crit failure). */
  tokens: number;
}

export interface DramaticTask {
  name: string;
  /** Skills that may be used to advance the task. */
  skills: string[];
  /** Target number (4 unless the task says otherwise). */
  targetNumber: number;
  /** Tokens needed to complete. */
  requiredSuccesses: number;
  /** Tokens banked so far. */
  successes: number;
  /** Rounds (or card draws) allowed. */
  timeLimit: number;
  /** Rounds elapsed. */
  timeUsed: number;
  status: DramaticTaskStatus;
  attempts: TaskAttempt[];
}

export interface CreateDramaticTaskInput {
  name: string;
  skills: string[];
  requiredSuccesses?: number;
  timeLimit?: number;
  targetNumber?: number;
}

/** SWADE defaults: 10 tokens within 4 rounds. */
export const DEFAULT_TASK_SUCCESSES = 10;
export const DEFAULT_TASK_TIME_LIMIT = 4;

/** Create a fresh task in the "running" state. */
export function createDramaticTask(input: CreateDramaticTaskInput): DramaticTask {
  if (input.skills.length === 0) {
    throw new Error("A dramatic task needs at least one skill");
  }
  return {
    name: input.name,
    skills: input.skills,
    targetNumber: input.targetNumber ?? 4,
    requiredSuccesses: input.requiredSuccesses ?? DEFAULT_TASK_SUCCESSES,
    successes: 0,
    timeLimit: input.timeLimit ?? DEFAULT_TASK_TIME_LIMIT,
    timeUsed: 0,
    status: "running",
    attempts: [],
  };
}

/**
 * Tokens earned by a roll: success = 1, +1 per raise (no cap);
 * critical failure = −1 token (SWADE option).
 */
export function tokensForRoll(roll: TraitRollResult): number {
  if (roll.criticalFailure) return -1;
  if (!roll.success) return 0;
  return 1 + roll.raises;
}

/**
 * Record one attempt on the task. Returns a new task object
 * (the input is not mutated). Rolls outside the task's skill
 * list are rejected.
 */
export function applyTaskRoll(
  task: DramaticTask,
  skill: string,
  roll: TraitRollResult,
): DramaticTask {
  if (task.status !== "running") return task;
  if (!task.skills.some((s) => s.toLowerCase() === skill.toLowerCase())) {
    throw new Error(`Skill "${skill}" is not part of "${task.name}"`);
  }

  const tokens = tokensForRoll(roll);
  const attempts = [...task.attempts, { round: task.timeUsed + 1, skill, roll, tokens }];
  const successes = Math.max(0, task.successes + tokens);
  const status: DramaticTaskStatus =
    successes >= task.requiredSuccesses ? "completed" : task.status;

  return { ...task, successes, attempts, status };
}

/** Advance the clock by one round; fails the task on overtime. */
export function advanceTaskRound(task: DramaticTask): DramaticTask {
  if (task.status !== "running") return task;
  const timeUsed = task.timeUsed + 1;
  const status: DramaticTaskStatus =
    timeUsed >= task.timeLimit && task.successes < task.requiredSuccesses
      ? "failed"
      : task.status;
  return { ...task, timeUsed, status };
}

/** Progress snapshot for UIs and tool results. */
export function taskProgress(task: DramaticTask): {
  percent: number;
  remainingTokens: number;
  remainingRounds: number;
  status: DramaticTaskStatus;
} {
  const percent = Math.min(
    100,
    Math.round((task.successes / task.requiredSuccesses) * 100),
  );
  return {
    percent,
    remainingTokens: Math.max(0, task.requiredSuccesses - task.successes),
    remainingRounds: Math.max(0, task.timeLimit - task.timeUsed),
    status: task.status,
  };
}
