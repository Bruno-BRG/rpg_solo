/**
 * Scene-break interludes (Mythic-style).
 *
 * Between scenes the player can take an interlude: roll a focus
 * and get a reflective question tied to the story — great for
 * solo play pacing, and in SWADE tradition the character earns a
 * Benny for the scene break.
 *
 * Pure: question generation only; benny awards are applied by the
 * caller (GM engine / UI).
 */
import { rollTrait } from "./dice";
import { randomEvent } from "../oracle/random-events";

export interface Interlude {
  /** Which part of the story the question touches. */
  focus: string;
  /** Rolled descriptors used to shape the question. */
  action: string;
  subject: string;
  /** The reflective question for the player. */
  question: string;
  /** Scene-break reward (SWADE table convention: +1 benny). */
  bennyAwarded: boolean;
}

/** Question templates keyed by event focus category. */
const QUESTION_TEMPLATES: Record<string, string[]> = {
  "NPC positive": [
    "Who among your allies would be glad to hear how {subject} turned out?",
    "What favour does {subject} remind you that you owe someone?",
  ],
  "NPC negative": [
    "What has {subject} cost you in your relationship with a rival?",
    "Who benefits most from your trouble with {subject}?",
  ],
  "PC positive": [
    "What past victory involving {subject} gives you confidence right now?",
    "Which part of who you are makes {subject} work in your favour?",
  ],
  "PC negative": [
    "What old mistake involving {subject} still keeps you up at night?",
    "How has {subject} changed you for the worse?",
  ],
  default: [
    "What does {action} of {subject} remind you of from your past?",
    "Who from your history is tied to {subject}?",
    "What are you hiding about {subject}?",
    "What do you want most when it comes to {subject}?",
    "How do you feel about {subject} at this very moment?",
  ],
};

/**
 * Run an interlude: roll a random event (focus/action/subject)
 * and convert it into a reflective question for the player.
 */
export function runInterlude(): Interlude {
  const event = randomEvent();
  const templates = QUESTION_TEMPLATES[event.focus] ?? QUESTION_TEMPLATES.default;
  const template = templates[Math.floor(Math.random() * templates.length)];
  const question = template
    .replace("{action}", event.action.toLowerCase())
    .replace("{subject}", event.subject.toLowerCase());

  return {
    focus: event.focus,
    action: event.action,
    subject: event.subject,
    question: question.charAt(0).toUpperCase() + question.slice(1),
    bennyAwarded: true,
  };
}

/**
 * Post-interlude outlook: a quick Spirit roll that nudges the
 * chaos rank (strong spirit = the story steadies; failure =
 * doubts invite complications). Returns the suggested delta
 * (−1, 0 or +1) — applying it is the caller's decision.
 */
export function interludeOutlook(spiritStep: number): {
  roll: ReturnType<typeof rollTrait>;
  chaosDelta: number;
} {
  const roll = rollTrait(spiritStep, 4);
  const chaosDelta = roll.criticalFailure ? 1 : roll.raises > 0 ? -1 : 0;
  return { roll, chaosDelta };
}
