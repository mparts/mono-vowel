import type { DMContext, DMEvents } from "./types";
import { toWords } from "number-to-words";

// == NLU helpers =======================================================================================================
export function getTopIntent(context: DMContext, threshold = 0.7): string | undefined {
  const intents = context.interpretation?.intents;
  console.log("INTENTS:", JSON.stringify(intents, null, 2), "threshold:", threshold);
  if (!intents || intents.length === 0) return undefined;

  const top = intents[0];
  console.log("TOP INTENT USED:", top);
  return top.confidenceScore >= threshold ? top.category : undefined;
}

export function getEntity(context: DMContext, category: string): string | undefined {
  const ent = context.interpretation?.entities.find(e => e.category === category);
  if (!ent) return undefined;
  const listKey = ent.extraInformation?.find(
    (info: any) => info.extraInformationKind === "ListKey"
  )?.key as string | undefined;
  return listKey ?? ent.text;
}

export function getEntityResolution(context: DMContext, category: string): any | undefined {
  const ent = context.interpretation?.entities.find(e => e.category === category);
  if (!ent) return undefined;
  // 1. BooleanResolution
  const resolution = ent.resolutions?.[0]?.value;
  if (resolution !== undefined) {
    return resolution;
  }
  // ListKey
  const listKey = ent.extraInformation?.find(
    (info: any) => info.extraInformationKind === "ListKey"
  )?.key as string | undefined;
  // Map string 'true' to actual boolean true
  if (listKey !== undefined) {
    const map: Record<string, boolean> = {
      "true": true,
      "false": false
    };
    if (listKey in map) {
      return map[listKey];
    }
    return undefined;
  }
  return undefined;
}


// == GAME helpers ======================================================================================================
export function extractCategory(result: string): string | null {
  const normalized = result.trim().toLowerCase();
  // Exact Categories match
  const categories = [
    "animals and creatures",
    "food and drink",
    "geography and countries",
    "nature and science",
    "objects and items"
  ];
  const directMatch = categories.find(cat => normalized.includes(cat));
  if (directMatch) return directMatch;
  // Synonym categories match      
  const synonymGroups: Record<string, string[]> = {
    "animals and creatures": ["animals", "creatures", "animal", "creature"],
    "food and drink": ["food", "drink", "foods", "drinks"],
    "geography and countries": ["geography", "countries", "country"],
    "nature and science": ["nature", "science"],
    "objects and items": ["objects", "items", "object", "item"]
  };
  for (const [category, synonyms] of Object.entries(synonymGroups)) {
    if (synonyms.some(s => normalized.includes(s))) {
      return category;
    }
  }
  // Random category
  const randomKeywords = ["random", "any", "whatever", "surprise me", "anything"];
  if (randomKeywords.some(k => normalized.includes(k))) {
    const index = Math.floor(Math.random() * categories.length);
    return categories[index];
  }
  return "";
}

export function extractVowel(result: string): string | null {
  const normalized = result.trim().toLowerCase();
  // 1. Direct single-letter vowel
  if (/^[aeiou]$/.test(normalized)) return normalized;
  // 2. Exact match map
  const exactMap: Record<string, string> = {
    "8": "a",
    "ey": "a",
    "hey": "a",
    "he": "e",
    "ee": "e",
    "eye": "i",
    "hi": "i",
    "oh": "o",
    "you": "u",
    "u": "u",
  };
  if (exactMap[normalized]) {
    return exactMap[normalized];
  }
  // Vowel "i" specific, "replacement" of NLU
  const synonymGroups: Record<string, string[]> = {
    "i": ["vowel i", "is i", "choose i", "vowel eye", "is eye", "choose eye"],
  };
  for (const [vowel, synonyms] of Object.entries(synonymGroups)) {
    if (synonyms.some(s => normalized.includes(s))) {
      return vowel;
    }
  }
  return null;
}

export function changeVowels(text: string, vowel: string = "i"): string {
  const expanded = text.replace(/\d+(\.\d+)?/g, (match) => {
    if (match.includes(".")) {
      const [integer, decimal] = match.split(".");
      return `${toWords(parseInt(integer))} point ${[...decimal].map(d => toWords(parseInt(d))).join(" ")}`;
    }
    return toWords(parseInt(match));
  });
  return expanded.replace(/[aeiou]|(?<!\b)y/gi, (m) =>
    m === m.toUpperCase() ? vowel.toUpperCase() : vowel
  );
}

// == General helpers ===================================================================================================
const GLOBAL_COMMANDS = ["exit", "restart", "reset", "default", "change vowel", "change mode", "change category", ];
export const isGlobalCommand = ({ event }: { event: DMEvents }) =>
  GLOBAL_COMMANDS.includes(
    (event as any).value?.[0]?.utterance?.trim().toLowerCase()
  );

export function buildConfirmationUtterance(context: any): string {
  const parts: string[] = [];

  if (context.targetGameMode) {
    parts.push(`${context.targetGameMode} game mode`);
  }
  if (context.targetCategory) {
    parts.push(`category ${context.targetCategory}`);
  }
  if (context.targetVowel) {
    parts.push(`vowel ${context.targetVowel}`);
  }
  if (parts.length === 0) {
    return "Please confirm your choices.";
  }
  return `Confirm ${parts.join(", ")}?`;
}