# Mono-Vowel

A voice-driven word-guessing game built as a final project for the Dialogue Systems I course (LT2216). Players describe and guess words through speech, but with a twist: all vowels in every description get replaced by a single chosen vowel, making descriptions deliberately hard to understand.

## Characters

These three TTS voices were used:

- **Vowelina** => the narrator. Introduces the game, announces rounds, reads scores.
- **Mono** => repeats all descriptions with vowel-transformed speech. 
- **Raptor** => handles system prompts, confirmations, round results, and tips.

## Game Modes

**Multiplayer (PvP)**
Two teams take turns. Each round, one team's leader whispers a description to Mono, who transforms it into mono-vowel and speaks it back. The rest of that team has 10 seconds to think of a guess. 5 retries per round. First team to 3 correct guesses wins.

**Singleplayer (PvE)**
You play against Vowelina. On odd rounds you describe and she guesses (via LLM). On even rounds she describes (via LLM) and you guess. 5 retries per round. First to 3 points wins.

## Global Commands

These work at any point during the game:

| Command | Effect |
|---|---|
| `"exit"` | Quit to start screen |
| `"restart"` | Restart from the intro |
| `"reset"` | Clear all settings |
| `"default"` | Apply default settings and start |
| `"reset vowel"` | Re-pick the vowel |
| `"reset category"` | Re-pick the word category |
| `"reset mode"` | Re-pick the game mode |

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
