import type { DMContext, DMEvents } from "./types";

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

  const resolution = ent.resolutions?.[0];
  return resolution?.value;
}


// == GAME helpers ======================================================================================================
export function extractCategory(result: string): string | null {
  const normalized = result.trim().toLowerCase();
  // Categories
  const categories = [
    "animals and creatures",
    "food and drink",
    "geography and countries",
    "nature and science",
    "objects and items"
  ];
  const directMatch = categories.find(cat =>
    normalized.includes(cat)
  );
  if (directMatch) return directMatch;
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
  if (/^[aeiou]$/.test(normalized)) return normalized;
  const map: Record<string, string> = {
    "8": "a",
    "hey": "a",
    "he": "e",
    "ee": "e",
    "eye": "i",
    "hi": "i",
    "oh": "o",
    "you": "u",
    "u": "u",
  };
  return map[normalized] ?? null;
}

export function changeVowels(text: string, vowel: string = "i"): string {
  return text.replace(/[aeiou]|(?<!\b)y/gi, (m) =>
    m === m.toUpperCase() ? vowel.toUpperCase() : vowel
  );
}


// == General helpers ===================================================================================================
const GLOBAL_COMMANDS = ["exit", "restart", "reset settings", "default settings", "change vowel", "change mode", "change category", ];
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