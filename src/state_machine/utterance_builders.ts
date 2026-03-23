//  == Data Imports and Loader ======================================================================================================================
import fallback_raw from './../../data/utterances/fallback.txt?raw';
import noinput_raw from './../../data/utterances/noinput.txt?raw';
import getter_raw from './../../data/utterances/choose_target.txt?raw';
import getter_init_raw from './../../data/utterances/initialize.txt?raw';
import confirm_raw from './../../data/utterances/confirm.txt?raw';
import wronguess_raw from './../../data/utterances/wrong_guess.txt?raw';
import madesound_raw from './../../data/utterances/made_sound.txt?raw';
import outofguess_raw from './../../data/utterances/outof_guess.txt?raw';
import spoketarget_raw from './../../data/utterances/spoke_target.txt?raw';

/** Splits a raw text string into a trimmed, non-empty array of lines. Used to load word/utterance lists from .txt files. */
export function parseLines(text: string): string[] {
  return text.split('\n').map(l => l.trim()).filter(Boolean);
}
const fallback_utterances = parseLines(fallback_raw);
const noinput_utterances = parseLines(noinput_raw);
const getter_utterances = parseLines(getter_raw);
const getter_init_utterances = parseLines(getter_init_raw);
const confirm_utterances = parseLines(confirm_raw);
const wrong_guess = parseLines(wronguess_raw);
const made_sound = parseLines(madesound_raw)
const outof_guess = parseLines(outofguess_raw)
const spoke_target = parseLines(spoketarget_raw)

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
/** Returns an utterance, depending on what the reason of loosing a guess was. */
export function Retry(reason: string): string {
  if (reason === "wrongGuess") {
    return wrong_guess[Math.floor(Math.random() * wrong_guess.length)];
  }
return "Try describing again!!"
}
/** Returns an utterance, depending on what the reason of loosing a guess was. */
export function GameOver(reason: string): string {
  if (reason === "maxGuess") {
    return outof_guess[Math.floor(Math.random() * outof_guess.length)];
  }
  if (reason === "saidGuess") {
    return spoke_target[Math.floor(Math.random() * spoke_target.length)];
  }
  if (reason === "brokeSilence") {
    return made_sound[Math.floor(Math.random() * made_sound.length)];
  }
return "GameOver!!"
}

// == Greeting Builder ==============================================================================================================================
export const vowelina_intro = "Oh, Hello there!! I dozed off a little bit, and I didn't hear you approach.. Well, I am Vowelina!! And the fella next to me is my younger brother, Mono. Since birth, Mono has had some slight trouble with speaking, and sadly most people cannot really understand him, so we've always been travelling together!!";
export const mono1 = "Hello there!! I am Mono!! ";
export const mono2 = "I can do all vowels!! And I understand speech, just as well as the next person!! ";
export const mono3 = "But I can only do one vowel at a time.. ";
export const vowelina_mono = "Well.. that's Mono!! As he said, all vowels, but only one at a time.. Most people would consider this a disability.. but we've turned this quirk of his into the best game ever!! What do you say we...";
export const vowelina_raptor ="Ahh yes... Raptor!! He always jokes arround, telling people that he is a god and can alter time and space!! What a jester!! What he is actually really usefull for, is helping us play our games!!";
export const raptor_intro = `I am. Inter.Raptor!! Poor Vowelina and Mono. They think they are real human beings like you.. they don't realize they are nothing more than ssml sequences.. They, also think. that I am joking.. But I can indeed. Alter time!! I am a god afterall.. Whenever, you feel like it. Say one, of the Global Commands. And I, will, take, over!! Also, I will be giving you tips, through the HUD.`
export const vowelina_outro = "Mono have came up with two game modes, multiplayer pvp and singleplayer pve. If you are at least 4 people, you could play multiplayer against each other!! Otherwise, we can always just play together!! But first, go ahead and conversate with Mono, see what all of this is about!!";

// == Game modes Intos ==============================================================================================================================
export const multiplayer = `Multiplayer!! Begin by forming two teams. Each round, Raptor picks a random word. The leader of the team, whispers a description of the word to Mono. Then, the rest of the team has 10 seconds to decypher what Mono said, and then provide a guess. Each team, has 5 retries. If the leader includes the word in their description, or verbally communicates with their team, results in GAME OVER. Signs and gestures are allowed. First team to correctly guess three times is the winner.`
export const singleplayer = "Singleplayer!! At the beginning of each round, Raptor is going to pick a random word for us. We take turns into describing and guessing. There are 5 retries available each round. You get a point when you or I guess correctly. I get a point when you or I am out of retries. First one to reach 3 points wins. You must not use the target word in your description."