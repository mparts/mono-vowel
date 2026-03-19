//  == Data Imports and Loader ======================================================================================================================

import fallback_raw from './../../data/utterances/fallback.txt?raw';
import noinput_raw from './../../data/utterances/noinput.txt?raw';
import getter_raw from './../../data/utterances/choose_target.txt?raw';
import getter_init_raw from './../../data/utterances/initialize.txt?raw';
import confirm_raw from './../../data/utterances/confirm.txt?raw';

/** Splits a raw text string into a trimmed, non-empty array of lines. Used to load word/utterance lists from .txt files. */
export function parseLines(text: string): string[] {
  return text.split('\n').map(l => l.trim()).filter(Boolean);
}
const fallback_utterances = parseLines(fallback_raw);
const noinput_utterances = parseLines(noinput_raw);
const getter_utterances = parseLines(getter_raw);
const getter_init_utterances = parseLines(getter_init_raw);
const confirm_utterances = parseLines(confirm_raw);


// == Utterance builders / randomizers ==============================================================================================================
/** Builds a confirmation prompt. For "Init" target, lists all chosen settings; otherwise names the single chosen value and its target. */
export function Confirmation(context: any): string {
  const randomized = confirm_utterances[Math.floor(Math.random() * confirm_utterances.length)];
  if (context.target === "Init") {
    const parts: string[] = [];
    if (context.targetGameMode) {
        parts.push(`${context.targetGameMode} as the game mode`);
    }
    if (context.targetCategory) {
        parts.push(`${context.targetCategory} as the category`);
    }
    if (context.targetVowel) {
        parts.push(`"${context.targetVowel}" as the vowel`);
    }
    return `${randomized} ${parts.join(", ")}?`;
}
return `${randomized} ${context.temp} as the ${context.target}?`;
}
/** Returns a random fallback utterance. Appends a type hint (e.g. "Try saying a vowel") unless the target is "Init". */
export function Fallback(target: string,): string {
  const randomized = fallback_utterances[Math.floor(Math.random() * fallback_utterances.length)];
  if (target === "Init") {
    return randomized
  }
  return randomized + ` Try saying a ${target} instead.`;
}
/** Returns a random "I didn't hear anything" utterance. */
export function NoInput(): string {
  return noinput_utterances[Math.floor(Math.random() * noinput_utterances.length)];
}
/** Returns a random prompt asking the user to provide a value. For "Init" uses the opening prompt pool, otherwise appends the target name. */
export function Getter(target: string): string {
  if (target === "Init") {
    return getter_init_utterances[Math.floor(Math.random() * getter_init_utterances.length)];
  }
  return getter_utterances[Math.floor(Math.random() * getter_utterances.length)] + ` ${target}`;
}
