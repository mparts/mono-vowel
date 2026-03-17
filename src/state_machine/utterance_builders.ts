//  == Data Imports and Loader ==========================================================================================

import fallback_raw from './../../data_utterances/utterances_fallback.txt?raw';
import noinput_raw from './../../data_utterances/utterances_noinput.txt?raw';
import getter_raw from './../../data_utterances/utterances_choose_target.txt?raw';
import getter_init_raw from './../../data_utterances/utterances_initialize.txt?raw';
import confirm_raw from './../../data_utterances/utterances_confirm.txt?raw';

function parseLines(text: string): string[] {
  return text.split('\n').map(l => l.trim()).filter(Boolean);
}

const fallback_utterances = parseLines(fallback_raw);
const noinput_utterances = parseLines(noinput_raw);
const getter_utterances = parseLines(getter_raw)
const getter_init_utterances = parseLines(getter_init_raw)
const confirm_utterances = parseLines(confirm_raw)

// == Utterance builders / randomizers ==================================================================================
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

export function Fallback(target: string,): string {
  const randomized = fallback_utterances[Math.floor(Math.random() * fallback_utterances.length)];
  if (target === "Init") {
    return randomized
  }
  return randomized + ` Try saying a ${target} instead.`;
}

export function NoInput(): string {
  return noinput_utterances[Math.floor(Math.random() * noinput_utterances.length)];
}

export function Getter(target: string): string {
  if (target === "Init") {
    return getter_init_utterances[Math.floor(Math.random() * getter_init_utterances.length)];
  }
  return getter_utterances[Math.floor(Math.random() * getter_utterances.length)] + ` ${target}`;
}