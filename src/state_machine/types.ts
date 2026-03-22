import type { Hypothesis, SpeechStateExternalEvent } from "speechstate";
import type { ActorRef } from "xstate";

// == NLU types =========================================================================================================
interface Entity {
  category: string;
  text: string;
  confidenceScore: number;
  offset: number;
  length: number;
  extraInformation: Record<string, any>;
  resolutions: any[];
}
interface Intent {
  category: string;
  confidenceScore: number;
}
interface NLUObject {
  entities: Entity[];
  intents: Intent[];
  projectKind: string;
  topIntent: string;
}

// == Machine context and events exports ================================================================================
export interface DMContext {
  spstRef: ActorRef<any, any>;
  jennyRef: ActorRef<any, any>;
  silencerRef: ActorRef<any, any>;
  lastResult: Hypothesis[] | null;
  interpretation: NLUObject | null;
  confirm: boolean;
  currentListener: string;
  roundCount: number;
  targetGuess: string;
  targetWord: string;
  guessCount: number;
  team1score: number;
  team2score: number;
  groqDescription: string,
  retryReason: string,
  previousDescriptions: string[],
  previousGuesses: string[],
  temp: string;
  target: string;
  targetVowel: string;
  targetCategory: string | null;
  targetGameMode: string | null;
  lastCommand: string | null;
}
export type DMEvents = SpeechStateExternalEvent | { type: "CLICK" } | { type: "DONE" };

