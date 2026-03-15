import type { Hypothesis, SpeechStateExternalEvent } from "speechstate";
import type { ActorRef } from "xstate";

// ── NLU types ─────────────────────────────────────────────────────────────────

export interface Entity {
  category: string;
  text: string;
  confidenceScore: number;
  offset: number;
  length: number;
  extraInformation: Record<string, any>;
}

export interface Intent {
  category: string;
  confidenceScore: number;
}

export interface NLUObject {
  entities: Entity[];
  intents: Intent[];
  projectKind: string;
  topIntent: string;
}

// ── Machine context ───────────────────────────────────────────────────────────

export interface DMContext {
  spstRef: ActorRef<any, any>;
  lastResult: Hypothesis[] | null;
  interpretation: NLUObject | null;
  confirm: boolean;
  targetVowel: string;
  targetCategory: string;
  targetGameMode: string | null;
  lastCommand: string | null;
}

// ── Machine events ────────────────────────────────────────────────────────────

export type DMEvents = SpeechStateExternalEvent | { type: "CLICK" } | { type: "DONE" };
