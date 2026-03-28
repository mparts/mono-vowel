# Mono-Vowel

A voice-driven word-guessing game built as a final project for the Dialogue Systems 1 course (LT2216). Players describe and guess words through speech, but with a twist: all vowels in every description get replaced by a single chosen vowel, making descriptions deliberately hard to understand.

## Characters

These three TTS voices were used:

- **Vowelina** => the narrator. Introduces the game, announces rounds, reads scores. (en-US-JennyNeural)
- **Mono** => repeats all descriptions with vowel-transformed speech. (en-US-GuyNeural)
- **Raptor** => handles system prompts, confirmations, round results, and tips. (en-US-DavisNeural)

## Game Modes

**Multiplayer (PvP)**
Two teams take turns. Each round, one team's leader whispers a description to Mono, who transforms it into mono-vowel and speaks it back. The rest of that team has 10 seconds to think of a guess. 5 retries per round. First team to 3 correct guesses wins.

**Singleplayer (PvE)**
You play against Vowelina. On odd rounds you describe and she guesses (via LLM). On even rounds she describes (via LLM) and you guess. 5 retries per round. First to 3 points wins.

## Global Commands

These work at any point during the game:

| Command            | Effect                           |
| ------------------ | -------------------------------- |
| `"exit"`           | Quit to start screen             |
| `"restart"`        | Restart from the intro           |
| `"reset"`          | Clear all settings               |
| `"default"`        | Apply default settings and start |
| `"reset vowel"`    | Re-pick the vowel                |
| `"reset category"` | Re-pick the word category        |
| `"reset mode"`     | Re-pick the game mode            |

## Tech Stack

- **TypeScript + Vite** — frontend
- **XState** — dialogue state machine
- **SpeechState** — wraps Azure Cognitive Services for ASR and TTS
- **Azure Language** — NLU intent and entity recognition
- **Groq (Llama 3.3 70B)** — LLM for Vowelina's descriptions/guesses in Singleplayer

## Running the project

```bash
npm install
npm run dev
```

You will need a `secrets.ts` file with your Azure and Groq API keys — see `azure_credentials.ts` and `groq.ts` for the expected shape.

## Challenges during development

- **NLU**:

  I had extreme difficulties with training the NLU to not return the pronoun "I" as a vowel. The bug was that every utterance like this: "I would like to choose the vowel a", would always return "i" as the vowel/top entity. I tried various fixes, creating extra intents, better training etc.. But I ended up just removing the vowel "i" from the NLU and just hardcoding it. It works surprisingly well.

- **ASR**:

  Because of my accent, but also because of the lack of context when I am asking for a guess (I prompt the user to only say ONE word as their guess), ASR fails to get certain words. Some problematic words were removed from the pool, but the problem persists, mostly because of certain accents, like mine.

- **Error 429 / Azure**:

  The day before the presentation, I got locked out / reached the limit in one of my speech resources, so I had to create a new one. I think this was because I am using three different voices, so I kinda inflicted this upon myself (I hope something like this doesn't happen during your grading.).

## Development Process

My development process can be seen in detail through the commits but basically it was something like this:

1. Before even initializing the repo, I made sure my idea about the vowel changing, would work and that it can be implemented.
2. Created extractors for vowels/categories. (basically initialized the nlu, worked with regex and general ways I can get the information that I need from the user)
3. Introduced global commands functionality
4. Made the whole system smarter. Some of the things I changed was:
   - Seperated the code into segments. (dm.ts on its own and then various other files, like helper.ts etc)
   - improved general user information extraction (e.g. the Getter state creation)
   - Introduced randomized sentences for generic ones like, no input or fallback.
5. Then finally my building blocks were ready that I could easily use to create my first game mode, Multiplayer.
6. Isn't shown in the commits but after multiplayer was done, I initiallized a new main.ts and style.css, using a general template that I could expand on later.
7. Introduced groq and used it to create singleplayer
8. After that it was mostly bug fixes and adding better narative, like the correct utterances, various voices etc...
9. At the end I used my previously created template to initialize my HUD. It started with one column, just a score and the guess word. Later, the speaker bubbles were introduced, alongside some feedback to the user and animation for timers, wrong/correct guesses etc..

## Future work

I believe that it can be quite a nice and funny game so for future work, I would get as much user feedback as I could, in order to turn it in an enjoyable experience by making it more user friendly. Maybe better utterancies, more/better sound cues, adding music, and introducing emotion/voices based on states, like e.g. losing/win/suspense etc...

## DISCLAIMER

**GENERATIVE AI USAGE**

Generative AI was used during the development of this project. The following files/sections were initially generated using AI tools and then adapted/molded by me:

1. EVERYTHING included inside the DATA directory. Training material for the NLU, utterances pool, and word pool. Everything in there was generated by AI and afterwards trimmed, and altered in various ways to achieve the desired results.
2. Logo located inside the logo folder. Not used yet, but might implement in the future. It was 100% AI generated, I did no modifications to it, other that creating an .svg counterpart from the generated .png.
3. Template for the HUD (main.ts and style.css initialization). Regarding css, I had no idea were to start and how to procceed. So, halfway through the project, I prompted AI to generate a general template for me, using various technics, and styles, introducing headers, footers, buttons, sliders, colours and some general example animations, like e.g. colour changing. Then after that everything was done MANUALLY. I used this "scafolding" to pass into my context and states from dm.ts and then kept/removed/improved/debugged what I needed and not needed from the initial generated template. After this step, it was really easy for me to introduce extra / more advanced funtionality on my own, by having a working example to consult.
