import { assign, createActor, setup, fromPromise} from "xstate";
import { speechstate } from "speechstate";
import type { DMContext, DMEvents } from "./types";
import { settings, settingsSilencer } from "../azure/azure_credentials";
import { getTopIntent, getEntity, getEntityResolution, containsWord } from "./helpers"; // NLU helpers
import { extractCategory, extractVowel, changeVowels, extractGuess} from "./helpers"; // Game helpers
import { isGlobalCommand, wordRandomizer} from "./helpers"; // General helpers
import * as utteranceBuilder from "./utterance_builders"; // Utterance builders
import buzzerSound from "../sounds/buzzer.mp3";

// == State Machine =================================================================================================================================
const dmMachine = setup({
  types: {
    context: {} as DMContext,
    events: {} as DMEvents,
  },
  actions: {
    // Standard speak and listen.
    "spst.speak": ({ context }, params: { utterance: string }) => {console.log("SPEAKING:", params.utterance); 
      context.spstRef.send({ type: "SPEAK",value: { utterance: params.utterance }});},
    "spst.listen": ({ context }) => context.spstRef.send({ type: "LISTEN", value: { nlu: true }}),
    // Silencer listen and cancel.
    "silencer.listen": ({ context }) => context.silencerRef.send({ type: "LISTEN", value: { nlu: true }}),
    "silencer.cancel": ({context}) => context.silencerRef.send({ type: "CANCEL" }),
    // Helper actions, mostly context-altering.
    "storeCommand": assign(({ event }) => ({ lastCommand: (event as any).value?.[0]?.utterance?.trim().toLowerCase(), lastResult: null, interpretation: null,})),
    "clearCache": assign({ lastResult: null, interpretation: null }),
    "clearContext": assign({
    targetGameMode: "", targetVowel: "", targetCategory: "", targetWord: "",
    temp: "", target: "", 
    roundCount: 0, targetGuess: "", guessCount: 0, team1score: 0, team2score: 0,
    confirm: false,
    lastResult: null, interpretation: null,
    }),
    "defaultContext": assign({
      targetGameMode: "Multiplayer", targetVowel: "o", targetCategory: extractCategory("objects"), targetWord: () => wordRandomizer(extractCategory("objects")),
      temp: "", target: "",
      roundCount: 0, targetGuess: "", guessCount: 0, team1score: 0, team2score: 0,
      confirm: false, lastResult: null, interpretation: null,  
    }),

  },
  actors: {
    // added sound cues
    playBuzzer: fromPromise(() => {
      return new Promise<void>((resolve) => {
        const audio = new Audio(buzzerSound);
        audio.onended = () => resolve();
        audio.onerror = () => resolve();
        audio.play().catch(() => resolve());
      });
    }),
  }

}).createMachine({
  context: ({ spawn }) => ({
    targetGameMode: "", targetVowel: "", targetCategory: "", targetWord: "",
    temp: "", target: "", 
    roundCount: 0, targetGuess: "", guessCount: 0, team1score: 0, team2score: 0,
    confirm: false, currentListener: "",
    lastCommand: null as string | null, lastResult: null, interpretation: null,
    spstRef: spawn(speechstate, { input: settings }),
    silencerRef: spawn(speechstate, { input: settingsSilencer }),
  }),
  id: "DM",
  initial: "Core",
  states: {
    // == Components ================================================================================================================================
    Core: {
      id: "Core",
      initial: "Boot",
      states: {
        // == Boot ==================================================================================================================================
        Boot: {
          id: "Boot",
          initial: "Prepare",
          states: {
            Prepare: { 
              entry: [
                ({ context }) => context.spstRef.send({ type: "PREPARE" }),
                ({ context }) => context.silencerRef.send({ type: "PREPARE" })
              ],
              on: { ASRTTS_READY: "WaitForClick" },
            },
            WaitForClick: {
              on: { CLICK: "#EndlessListener" },
            },
            Greeting: {
              entry: {type: "spst.speak", params: { utterance: "Hey!" },},
              on: { SPEAK_COMPLETE: "#Game" },
            },
          },
        },
        // == Exit ==================================================================================================================================
        Done: {
          entry: [ {type: "clearContext"}, { type: "spst.speak", params: { utterance: "Thanks for playing!!!" } }],
          on: { SPEAK_COMPLETE: "#Boot.WaitForClick" },
        },
        // == Redirects global commands =============================================================================================================
        HandleCommand: {
          initial: "WaitReady",
          states: {
            WaitReady:{
              on: { ASRTTS_READY: "Commands", SPEAK_COMPLETE: "Commands" },
            },
            Commands:{
              always: [
                { target: "#Core.Done", guard: ({ context }) => context.lastCommand === "exit" },
                { target: "#Boot.Greeting", guard: ({ context }) => context.lastCommand === "restart" },
                { target: "ResetSettings", guard: ({ context }) => context.lastCommand === "reset"},
                { target: "DefaultSettings", guard: ({ context }) => context.lastCommand === "default"},
                { target: "#MainMenu.GetVowel", guard: ({ context }) => context.lastCommand === "reset vowel",
                  actions: assign({ targetVowel: "" }) },
                { target: "#MainMenu.GetWordCategory", guard: ({ context }) => context.lastCommand === "reset category",
                  actions: assign({ targetCategory: "" }) },
                { target: "#MainMenu.GetGameMode", guard: ({ context }) => context.lastCommand === "reset mode",
                  actions: assign({ targetGameMode: "" }) },
              ],
            },
            DefaultSettings: {
              entry: [{type: "defaultContext"}, { type: "spst.speak", params: { utterance: "Default settings applied." } }],
              on: { SPEAK_COMPLETE: "#Game"}
            },
            ResetSettings: {
              entry: [{type: "clearContext"}, { type: "spst.speak", params: { utterance: "Settings reset." } }],
              on: { SPEAK_COMPLETE: "#Game" }
            },
          },
        },
        // == Listener ==============================================================================================================================
        Listener: {
          id: "Listener",
          initial: "Listen",
          states: {
            WaitReadyNoInput: { // Check if safe to redirect
              on: { ASRTTS_READY: "NoInput", SPEAK_COMPLETE: "NoInput" },
            },
            NoInput: { // If nothing was recognised, return some feedback and retry
              entry: {type: "spst.speak", params: () => ({ utterance: utteranceBuilder.NoInput()})},
              on: { SPEAK_COMPLETE: "Listen" },
            },
            Listen: {
              entry: { type: "spst.listen" },
              on: {
                RECOGNISED: [ // Check if user utterance was a global command, store it and redirect
                  { target: "#Core.HandleCommand", guard: isGlobalCommand, actions: { type: "storeCommand" },},
                  { actions: assign(({ event }) => ({ lastResult: event.value, interpretation: event.nluValue})),},
                ],
                ASR_NOINPUT: {
                  actions: { type: "clearCache" }, target: "WaitReadyNoInput",
                },
                LISTEN_COMPLETE: [ // If listen succesful redirect accordingly
                  { target: "#Game.hist", guard: ({ context }) => context.currentListener === "Game" && !!context.lastResult},
                  { target: "#Getter.hist", guard: ({ context }) => context.currentListener=== "Getter" && !!context.lastResult},
                ],
              },
            },
          },
        },
        // == EndlessListener ==============================================================================================================================
        EndlessListener: {
          id: "EndlessListener",
          initial: "Listen",
          states: {
            Listen: {
              entry: { type: "spst.listen" },
              on: {
                RECOGNISED: [ // Check if user utterance was a global command, store it and redirect
                  { target: "#Core.HandleCommand", guard: isGlobalCommand, actions: { type: "storeCommand" },},
                  { actions: assign(({ event }) => ({ lastResult: event.value, interpretation: event.nluValue})),},
                ],
                ASR_NOINPUT: {
                  actions: { type: "clearCache" }, target: "WaitReadyNoInput",
                },
                LISTEN_COMPLETE: [ // If listen succesful redirect accordingly
                  {target: "WaitReady"}
                ],
              },
            },
            WaitReadyNoInput: { // Check if safe to redirect
              on: { ASRTTS_READY: "Listen" },
            },
            WaitReady: { // Check if safe to redirect
              on: { 
                ASRTTS_READY: [
                  { target: "#Boot.Greeting", actions: { type: "clearCache" },
                  guard: ({ context }) => context.lastResult![0].utterance === "Wake up" && context.currentListener !== "Game"},
                  { target: "#Multiplayer.Planner", actions: { type: "clearCache" },
                  guard: ({ context }) => context.lastResult![0].utterance === "Ready" && context.currentListener === "Game"},
                  { target: "#EndlessListener", actions: { type: "clearCache" }},
              ]},
            }
          },
        },
        // == Helps with getting stuff from user utterancies ========================================================================================
        Getter: {
          entry: assign({ currentListener: "Getter" }),
          id: "Getter",
          initial: "CheckExistence",
          states: {
            hist: { type: 'history', history: 'deep'},
            CheckExistence: { // If temp exists, get user confirmation
              always: [
                { target: "ConfirmPrompt", guard: ({ context }) => !!context.temp, actions: assign({ confirm: true })},
                { target: "Prompt" },
              ],
            },
            Prompt: { // Ask for the target needed, e.g a vowel
              entry: { type: "spst.speak", params: ({ context }) => ({ utterance: utteranceBuilder.Getter(context.target) })},
              on: { SPEAK_COMPLETE: "Planner" },
            },
            Planner: { // listen until we have a user utterance, then redirect
              always: [
                { target: "#Listener", guard: ({ context }) => !context.lastResult },
                { target: "CheckCompatibility", guard: ({ context }) => !!context.lastResult },
              ],
            },
            CheckCompatibility: { // Check the compatibility of user's utterance, with what we are trying to get
              always: [
                { target: "#Initialize.ExtractEverything", guard: ({ context }) => context.target === "Init",},
                { target: "#GetGameMode.CheckCompatibility", guard: ({ context }) => context.target === "game mode"},
                { target: "#GetVowel.CheckCompatibility", guard: ({ context }) => context.target === "vowel"},
                { target: "#GetWordCategory.CheckCompatibility", guard: ({ context }) => context.target === "word category",},
                { target: "#GetGuess.CheckCompatibility", guard: ({ context }) => context.target === "guess",},
              ]
            },
            Retry: { // If confirmation was negative, restart the Getter
              entry: assign({ temp: "" }),
              always: [
                {target: "CheckExistence", actions: {type: "clearContext"}, guard: ({ context }) => context.target === "Init",},        
                {target: "CheckExistence", actions: assign({ targetGameMode: "" }), guard: ({ context }) => context.target === "game mode",},                
                {target: "CheckExistence", actions: assign({ targetVowel: "" }), guard: ({ context }) => context.target === "vowel",},
                {target: "CheckExistence", actions: assign({ targetCategory: "" }), guard: ({ context }) => context.target === "word category",},
                {target: "CheckExistence", actions: assign({ targetGuess: "" }), guard: ({ context }) => context.target === "guess",},
              ]
            },
            ConfirmPrompt: { // Ask user if what the ASR recognised is what they wanted to do
              entry: { type: "spst.speak", params: ({ context }) => ({utterance: utteranceBuilder.Confirmation(context)})},
              on: { SPEAK_COMPLETE: "ConfirmPlanner"},
            },
            ConfirmPlanner: { // Grab user Yes/No and redirect accordingly
              always: [
                { target: "#Listener", guard: ({ context }) => context.confirm === true, actions: assign({confirm: false})},
                { target: "#Game.hist", guard: ({ context }) => getEntityResolution(context, "YesNo") === true, 
                actions: [assign({ temp: "" , target: ""}), {type: "clearCache"}] },
                { target: "Retry", guard: ({ context }) => getEntityResolution(context, "YesNo") === false,
                actions: {type: "clearCache"} },
                { target: "ConfirmPrompt", guard: ({ context }) => !getEntityResolution(context, "YesNo"),
                  actions: [{type: "spst.speak", params: { utterance: "Please answer yes or no." } }, assign({confirm: true}) ]},
              ],
            },
            FallbackError: { // If user utterance doesn't satisfy what we are trying to get, ask again.
              entry: { type: "spst.speak", params: ({ context }) => ({utterance: utteranceBuilder.Fallback(context.target)})},
              on: { SPEAK_COMPLETE: {target: "Planner", actions: {type: "clearCache"}}},
            },
          },
        },
      },
    },
    // == Main Menu =================================================================================================================================
    MainMenu: {
      id: "MainMenu",
      initial: "Initialize",
      states: {
        hist: { type: 'history', history: 'deep'},
        // == Get Everything ========================================================================================================================
        Initialize: {
          id: "Initialize",
          entry: assign({ target: "Init" }),
          initial: "Planner",
          states: {
            Planner: { // If no game mode get one
              always: [
                {target: "#Getter", guard: ({ context }) => !context.targetGameMode, actions: assign({temp: ""})},
                {target: "#Getter.CheckExistence", actions: assign({temp: ({ context }) => context.temp + context.targetGameMode})}
              ]
            },
            ExtractEverything: { // Extract everything there is to be extracted from the user utterance
              entry: assign(({ context }) => {
                // get game mode
                const mode = getTopIntent(context);
                const modeMap: Record<string, string> = {
                  ChooseRepeatGame: "Echo",
                  ChooseMultiplayer: "Multiplayer",
                  ChooseSinglePlayer: "Singleplayer"};
                // get vowel
                const vowelfromEntity = getEntity(context, "VowelChoice");
                const vowelfromUtterance = extractVowel(context.lastResult?.[0]?.utterance ?? "");
                const vowel = vowelfromEntity ?? vowelfromUtterance;
                // get category
                const rawcategory = getEntity(context, "WordCategory");
                const categoryfromEntity = rawcategory? extractCategory(rawcategory) : null;
                const categoryfromUtterance = extractCategory(context.lastResult?.[0]?.utterance ?? "")
                const category = categoryfromEntity ?? categoryfromUtterance;
                return {
                  targetGameMode:  mode ? modeMap[mode] ?? context.targetGameMode : "",
                  targetVowel: vowel ?? context.targetVowel,
                  targetCategory: category ?? context.targetCategory,
                };
              },),
              always: [
                { target: "Planner", guard: ({ context }) => !!context.targetGameMode, actions: { type: "clearCache" } },
                { target: "#Getter.FallbackError" }
              ]
            },
          },
        },
        // == Get Game Mode =========================================================================================================================
        GetGameMode: {
          id: "GetGameMode",
          entry: assign({ target: "game mode" }),
          initial: "Planner",
          states: {
            // If no game mode, get one
            Planner: {
              always: [
                {target: "#Getter", guard: ({ context }) => !context.targetGameMode, actions: assign({temp: ""})},
                {target: "#Getter.CheckExistence", actions: assign({temp: ({ context }) => context.temp + context.targetGameMode,})}
              ]
            },
            // Extract game mode from the user utterance
            CheckCompatibility: {
              entry: assign(({ context }) => {
                const intent = getTopIntent(context);
                const modeMap: Record<string, string> = {
                  ChooseRepeatGame: "Echo",
                  ChooseMultiplayer: "Multiplayer",
                  ChooseSinglePlayer: "Singleplayer"
                };
                return {
                  targetGameMode: intent ? modeMap[intent] ?? "" : ""
                };
              }),
              always: [
                { target: "Planner", guard: ({ context }) => !!context.targetGameMode, actions: { type: "clearCache" },},
                { target: "#Getter.FallbackError" }
              ]
            },
          },
        },
        // == Get Vowel =============================================================================================================================
        GetVowel: {
          id: "GetVowel",
          entry: assign({ target: "vowel" }),
          initial: "Planner",
          states: {
            // If no vowel, get one
            Planner: {
              always: [
                {target: "#Getter", guard: ({ context }) => !context.targetVowel, actions: assign({temp: ""})},
                {target: "#Getter.CheckExistence", actions: assign({temp: ({ context }) => context.temp + context.targetVowel,})}
              ]
            },
            // Extract vowel from the user utterance
            CheckCompatibility: {
              always: [
                // Try hardcoded
                {target: "Planner", actions: {type: "clearCache"},
                  guard: ({ context }) => {
                  const utterance = context.lastResult?.[0]?.utterance ?? "";
                  const vowel = extractVowel(utterance);
                  if (vowel) context.targetVowel = vowel;
                  return !!vowel;},},
                // If no hardcoded, try NLU
                {target: "Planner", guard: ({ context }) => !!getEntity(context, "VowelChoice"),
                actions: [assign(({ context }) => ({ targetVowel: getEntity(context, "VowelChoice")!,})), {type: "clearCache"}]},
                // If no NLU fallback and retry
                { target: "#Getter.FallbackError" },
              ],
            },
          },
        },
        // == Get Word Category =====================================================================================================================
        GetWordCategory: {
          id: "GetWordCategory",
          entry: assign({ target: "word category" }),
          initial: "Planner",
          states: {
            // If no word category, get one
            Planner: {
              always: [
                {target: "#Getter", guard: ({ context }) => !context.targetCategory, actions: assign({temp: ""})},
                {target: "#Getter.CheckExistence", actions: assign({temp: ({ context }) => context.temp + context.targetCategory,})}
              ]
            },
            // Extract word category from the user utterance
            CheckCompatibility: {
              always: [
                // Try hardcoded
                {target: "Planner", actions: [{ type: "clearCache"}, assign({targetWord: ({ context }) => wordRandomizer(context.targetCategory)})],
                  guard: ({ context }) => {
                    const utterance = context.lastResult?.[0]?.utterance ?? "";
                    const category = extractCategory(utterance);
                    if (category) context.targetCategory = category;
                    return !!category;},},
                // If no hardcoded, try NLU
                {target: "Planner", actions: [{ type: "clearCache"}, assign({targetWord: ({ context }) => wordRandomizer(context.targetCategory)})],
                  guard: ({ context }) => {
                    const entity = getEntity(context, "WordCategory");
                    const category = entity ? extractCategory(entity) : null;
                    if (category) context.targetCategory = category;
                    return !!category;},},
                // If no NLU fallback and retry
                { target: "#Getter.FallbackError" }
              ]
            },
          },
        },
        // == Get Guess =============================================================================================================================
        GetGuess: {
          id: "GetGuess",
          entry: assign({ target: "guess" }),
          initial: "Planner",
          states: {
            // If no guess, get one.
            Planner: {
              always: [
                { target: "#Getter", guard: ({ context }) => !context.targetGuess, actions: assign({ temp: "" })},
                { target: "#Getter.CheckExistence", actions: assign({temp: ({ context }) => context.temp + context.targetGuess,}),}
              ]
            },
            // Extract guess from the user utterance
            CheckCompatibility: {
              always: [
                // Try hardcoded, test if guess is exactly one word
                { target: "Planner", actions: { type: "clearCache" },guard: ({ context }) => {
                    const utterance = context.lastResult?.[0]?.utterance ?? "";
                    const guess = extractGuess(utterance);
                    if (guess) context.targetGuess = guess;
                    return !!guess;},},
                // Fallback if not exactly one word
                { target: "#Getter.FallbackError" },
              ],
            },
          },
        },
      },
    },
    // == Games =====================================================================================================================================
    Game: {
      entry: assign({ currentListener: "Game" }),
      id: "Game",
      initial: "ModePicker",
      states: {
        hist: { type: 'history', history: 'deep'},
        ModePicker: { // If there is a game mode stored, redirect accordingly, otherwise go get one
          always: [
            { target: "EchoMode", guard: ({ context }) => context.targetGameMode === "Echo",},
            { target: "Multiplayer", guard: ({ context }) => context.targetGameMode === "Multiplayer", },
            { target: "Singleplayer", guard: ({ context }) => context.targetGameMode === "Singleplayer",},
            { target: "#MainMenu" },
          ],
        },
        // == Echo Mode =================================================================================================
        EchoMode: {
          id: "EchoMode",
          initial: "Setup",
          states: {
            Setup: { // Make sure there is everything needed for the game to work
              always: [
                { target: "#MainMenu.GetVowel", guard: ({ context }) => !context.targetVowel},
                { target: "Prompt"},
              ],
            },
            Prompt: { // Give instruction to user
              entry: { type: "spst.speak", params: ({ context }) => ({ utterance: `Say a sentence and I will change all vowels to ${context.targetVowel}.`}),},
              on: { SPEAK_COMPLETE: "Planner" },
            },
            Planner: { // Listen if no utterance saved, otherwise redirect
              always: [
                { target: "#Listener", guard: ({ context }) => !context.lastResult },
                { target: "Transform", guard: ({ context }) => !!context.lastResult },
              ],
            },    
            Transform: { // Tranform the user utterance
              entry: { type: "spst.speak", params: ({ context }) => ({utterance: changeVowels(context.lastResult![0].utterance, context.targetVowel)})},
              on: { SPEAK_COMPLETE: {target: "Planner", actions: { type: "clearCache" } } }
            },
          },
        },
        // == Multiplayer Mode ==========================================================================================
        Multiplayer: {
          id: "Multiplayer",
          initial: "Setup",
          states: {
            Setup: { // Make sure there is everything needed for the game to work
              always: [
                { target: "#MainMenu.GetVowel", guard: ({ context }) => !context.targetVowel},
                { target: "#MainMenu.GetWordCategory", guard: ({ context }) => !context.targetCategory},
                { target: "Intro"},
              ],
            },
            Intro: {
              entry: [{ type: "spst.speak", params: { utterance: `Multiplayer!!`}}, assign({roundCount: 0, team1score: 0, team2score:0})],
              on: { SPEAK_COMPLETE: "SelectTeam" },
            },
            SelectTeam: { // Let user know which team's turn it is. Also initialize important variables
              entry: [assign({roundCount: ({ context }) => context.roundCount + 1, targetWord: ({ context }) => wordRandomizer(context.targetCategory),
                guessCount: 0}), { type: "spst.speak", params: ({ context }) => ({
                  utterance: `Round: ${context.roundCount}. ${context.roundCount % 2 ? "First" : "Second"} team, you are up!!` })}],
              on: { SPEAK_COMPLETE: "WaitToStart" },
            },
            WaitToStart: {
              entry: [{ type: "spst.speak", params: { utterance: `Say, "Ready"!! After the beep, whisper your description!!`},},
                assign({guessCount: ({ context }) => context.guessCount + 1})
              ],
              on: { SPEAK_COMPLETE: "#EndlessListener" },
            },
            ListenCue: {
              invoke: {
                src: "playBuzzer",
                onDone: {
                  target: "Planner"
                }
              }
            },
            Planner: {
              always: [
                { target: "#Listener", guard: ({ context }) => !context.lastResult},
                { target: "CheckWord", guard: ({ context }) => !!context.lastResult},
              ],
            },
            CheckWord: { // Check if the speaker accidentally included the target word in his utterance.
              always: [
                {target: "GameOverCue", guard: ({ context }) => containsWord(context.lastResult![0].utterance, context.targetWord)},
                {target: "Transform"}
              ]
            },
            Transform: { // Change the vowels in the utterance
              entry: { type: "spst.speak", params: ({ context }) => ({utterance: changeVowels(context.lastResult![0].utterance, context.targetVowel)})},
              on: { SPEAK_COMPLETE: {target: "Silencer", actions: [{ type: "clearCache" }, assign({targetGuess: ""}) ]} }
            },
            Silencer: { // Listens for silence
              initial: "Prompt",
              states: {
                Prompt: { // Give instruction to user
                  entry: { type: "spst.speak", params: {utterance: `You have 10 seconds for guessing. The speaker stay's silent!!`}},
                  on: { SPEAK_COMPLETE: "Listen" },
                },
                WaitReadyNoInput: { // Check if safe to redirect
                  on: { ASRTTS_READY: "#Multiplayer.GuessPlanner", SPEAK_COMPLETE: "#Multiplayer.GuessPlanner" },
                },
                Listen: {
                  entry: { type: "silencer.listen" },
                  on: {
                    ASR_PARTIAL: { // If ASR grasps ANYTHING, stop and GAME OVER
                      actions: { type: "silencer.cancel" }
                    },
                    LISTEN_COMPLETE: { // If ASR grasps ANYTHING, stop and GAME OVER
                      target: "#Multiplayer.GameOverCue", actions: { type: "clearCache" }
                    },
                    ASR_NOINPUT: { // If no input was recognised, continue..
                      target: "WaitReadyNoInput", actions: { type: "clearCache" },
                    },
                  },
                },
              },
            },
            GuessPlanner: { // Gets the guess and redirects accordingly
              always: [
                {target: "#GetGuess", guard: ({ context }) => !context.targetGuess},
                {target: "Win", guard: ({ context }) => context.targetGuess === context.targetWord},
                {target: "WaitToStart", guard: ({ context }) => context.targetGuess === "pass" && context.guessCount < 10},
                {target: "GameOverCue", actions: assign({targetGuess: ""})},
              ]
            },
            Win: { // If guess was correct, increment the score
              entry: [ assign(({ context }) => context.roundCount % 2 === 1
                    ? { team2score: context.team2score + 1 }
                    : { team1score: context.team1score + 1 }),
                { type: "spst.speak", params: { utterance: `Your guess was correct!! You win the round!!` } },],
              on: { SPEAK_COMPLETE: "Evaluation" },
            },
            GameOverCue: { // Play sound for game over
              invoke: {
                src: "playBuzzer",
                onDone: {target: "GameOver"}
              }
            },
            GameOver: { // Game over
              entry: { type: "spst.speak", params: { utterance: "Game Over!! You lose the round!!" } },
              on: {SPEAK_COMPLETE: "Evaluation"}
            },
            Evaluation: { // Speak the score and loop to start
                entry: { type: "spst.speak", params: ({ context }) => ({ utterance: context.roundCount === 1 ? "" :
                  `Current score is: ${context.team1score} - ${context.team2score}. ${context.team1score === context.team2score ? "It is a draw!!" : 
                  `The ${context.team1score > context.team2score ? "First" : "Second"} team is leading!!`}`})},
                  on: {SPEAK_COMPLETE: "SelectTeam"}
                },
            },
          },
        // == Singleplayer Mode =========================================================================================
        Singleplayer: {
          id: "Singleplayer",
        },
      },
    },
  },
});


// == Actor setup & export ==========================================================================================================================
export const dmActor = createActor(dmMachine).start();

dmActor.subscribe((state) => {
  console.group("State update");
  console.log("State value:", state.value);
  console.log("Context:", state.context);
  console.groupEnd();
});