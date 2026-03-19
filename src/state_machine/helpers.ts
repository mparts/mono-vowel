import type { DMContext, DMEvents } from "./types";
import { toWords } from "number-to-words";
import { parseLines } from "./utterance_builders";
import animals_raw from './../../data/words/animals_creatures.txt?raw';
import foods_raw from './../../data/words/foods_drinks.txt?raw';
import objects_raw from './../../data/words/objects_items.txt?raw';


// == NLU helpers ===================================================================================================================================
/** Returns the top NLU intent if its confidence meets the threshold, otherwise undefined. */
export function getTopIntent(context: DMContext, threshold = 0.7): string | undefined {
  const intents = context.interpretation?.intents;
  console.log("INTENTS:", JSON.stringify(intents, null, 2), "threshold:", threshold);
  if (!intents || intents.length === 0) return undefined;

  const top = intents[0];
  console.log("TOP INTENT USED:", top);
  return top.confidenceScore >= threshold ? top.category : undefined;
}
/** Returns the resolved value of a named entity — prefers the ListKey, falls back to raw text. */
export function getEntity(context: DMContext, category: string): string | undefined {
  const ent = context.interpretation?.entities.find(e => e.category === category);
  if (!ent) return undefined;
  const listKey = ent.extraInformation?.find(
    (info: any) => info.extraInformationKind === "ListKey"
  )?.key as string | undefined;
  return listKey ?? ent.text;
}
/** Like getEntity, but resolves boolean values (e.g. "true" → true). Used for yes/no entities. */
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

// == GAME helpers ==================================================================================================================================
/** Maps a user utterance to one of the word categories. Handles synonyms and "random"-style phrases. Returns "" if no match. */
export function extractCategory(result: string): string | null {
  const normalized = result.trim().toLowerCase();
  // Exact Categories match
  const categories = [
    "animals and creatures",
    "foods and drinks",
    "objects and items"
  ];
  const directMatch = categories.find(cat => normalized.includes(cat));
  if (directMatch) return directMatch;
  // Synonym categories match
  const synonymGroups: Record<string, string[]> = {
    "animals and creatures": ["animals", "creatures", "animal", "creature"],
    "foods and drinks": ["food", "drink", "foods", "drinks"],
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
/** Maps a user utterance to a vowel letter. Handles homophones and common mishearings (e.g. "eye" → "i", "oh" → "o"). */
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
/** Replaces all vowels in a text with the given vowel. Numbers are first expanded to words. */
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
/** Returns the utterance as a guess, only if it is exactly one word, otherwise null. */
export function extractGuess(result: string): string | null {
  const normalized = result.trim();
  const words = normalized.split(/\s+/);
  if (words.length === 1 && words[0].length > 0) {
    return words[0].toLowerCase();
  }
  return null;
}

// == General helpers ===============================================================================================================================
const GLOBAL_COMMANDS = ["exit", "restart", "reset", "default", "reset vowel", "reset mode", "reset category", ];
/** Guard that checks whether the recognised utterance is one of the global commands (exit, restart, reset, etc.). */
export const isGlobalCommand = ({ event }: { event: DMEvents }) =>
  GLOBAL_COMMANDS.includes(
    (event as any).value?.[0]?.utterance?.trim().toLowerCase()
  );
/** Returns a random word from the word list matching the given category. Defaults to objects if no category matches. */
export function wordRandomizer(category: string | null): string {
  if (category === "animals and creatures") {
    const animals_creatures = parseLines(animals_raw);
    return animals_creatures[Math.floor(Math.random() * animals_creatures.length)];
  }
  if (category === "foods and drinks") {
    const foods_drinks = parseLines(foods_raw);
    return foods_drinks[Math.floor(Math.random() * foods_drinks.length)];
  }
  const objects_items = parseLines(objects_raw);
  return objects_items[Math.floor(Math.random() * objects_items.length)];
}
/** Checks if a word appears as a whole word (case-insensitive) inside a text. */
export function containsWord(text: string, word: string): boolean {
  if (!text || !word) return false;
  const pattern = new RegExp(`\\b${word}\\b`, "i");
  return pattern.test(text);
}
