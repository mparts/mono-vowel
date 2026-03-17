import { assign, createActor, setup, } from "xstate";
import { speechstate } from "speechstate";
import type { DMContext, DMEvents } from "./types";
import { settings } from "../azure/azure_credentials";
import { getTopIntent, getEntity, getEntityResolution } from "./helpers"; // NLU helpers
import {extractCategory, extractVowel, changeVowels, } from "./helpers"; // Game helpers
import {isGlobalCommand, buildConfirmationUtterance} from "./helpers"; // General helpers

// == State Machine =====================================================================================================
const dmMachine = setup({
  types: {
    context: {} as DMContext,
    events: {} as DMEvents,
  },
  actions: {
    "spst.speak": ({ context }, params: { utterance: string }) => {console.log("SPEAKING:", params.utterance); 
      context.spstRef.send({ type: "SPEAK",value: { utterance: params.utterance }});},
    "spst.listen": ({ context }) => context.spstRef.send({ type: "LISTEN", value: { nlu: true }}),
    "storeCommand": assign(({ event }) => ({ lastCommand: (event as any).value?.[0]?.utterance?.trim().toLowerCase(), lastResult: null, interpretation: null,})),
    "clearCache": assign({ lastResult: null, interpretation: null }),
    "clearContext": assign({
      confirm: false, lastResult: null, interpretation: null,
      temp: "", targetVowel: "", targetCategory: "", targetGameMode: "",
    }),
    "defaultContext": assign({
      confirm: false, lastResult: null, interpretation: null,
      temp: "", targetVowel: "o", targetCategory: "animals and creatures", targetGameMode: "Echo",
    }),
  },
}).createMachine({
  context: ({ spawn }) => ({
    targetGameMode: "", targetVowel: "", targetCategory: "",
    temp: "", target: "",
    currentListener: "",
    confirm: false,
    lastCommand: null as string | null, lastResult: null, interpretation: null,
    spstRef: spawn(speechstate, { input: settings }),
  }),
  id: "DM",
  initial: "Core",
  states: {
    // == Components ====================================================================================================
    Core: {
      id: "Core",
      initial: "Boot",
      states: {
        // == Boot ======================================================================================================
        Boot: {
          id: "Boot",
          initial: "Prepare",
          states: {
            Prepare: {
              entry: ({ context }) => context.spstRef.send({ type: "PREPARE" }),
              on: { ASRTTS_READY: "WaitToStart" },
            },
            WaitToStart: {
              on: { CLICK: "Greeting" },
            },
            Greeting: {
              entry: {type: "spst.speak", params: { utterance: "Hey!" },},
              on: { SPEAK_COMPLETE: "#Game" },
            },
          },
        },
        // == Exit ======================================================================================================
        Done: {
          entry: [ {type: "clearContext"}, { type: "spst.speak", params: { utterance: "Thanks for playing!!!" } }],
          on: { CLICK: "#Boot.Greeting" },
        },
        // == Redirects global commands =================================================================================
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
                { target: "#MainMenu.GetVowel", guard: ({ context }) => context.lastCommand === "change vowel",
                  actions: assign({ targetVowel: "" }) },
                { target: "#MainMenu.GetWordCategory", guard: ({ context }) => context.lastCommand === "change category",
                  actions: assign({ targetCategory: "" }) },
                { target: "#MainMenu.GetGameMode", guard: ({ context }) => context.lastCommand === "change mode",
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
        // == Listener ==================================================================================================
        Listener: {
          id: "Listener",
          initial: "Listen",
          states: {
            WaitReadyNoInput: {
              on: { ASRTTS_READY: "NoInput", SPEAK_COMPLETE: "NoInput" },
            },
            NoInput: {
              entry: {type: "spst.speak", params: { utterance: "I didn't catch that." },},
              on: { SPEAK_COMPLETE: "Listen" },
            },
            Listen: {
              entry: { type: "spst.listen" },
              on: {
                RECOGNISED: [
                  { target: "#Core.HandleCommand", guard: isGlobalCommand, actions: { type: "storeCommand" },},
                  { actions: assign(({ event }) => ({ lastResult: event.value, interpretation: event.nluValue})),},
                ],
                ASR_NOINPUT: {
                  actions: { type: "clearCache" }, target: "WaitReadyNoInput",
                },
                LISTEN_COMPLETE: [
                  { target: "#Game.hist", guard: ({ context }) => context.currentListener === "Game" && !!context.lastResult},
                  { target: "#Getter.hist", guard: ({ context }) => context.currentListener=== "Getter" && !!context.lastResult},
                ],
              },
            },
          },
        },
        // == Helps with getting stuff from user utterancies ============================================================
        Getter: {
          entry: assign({ currentListener: "Getter" }),
          id: "Getter",
          initial: "CheckExistence",
          states: {
            hist: { type: 'history', history: 'deep'},
            CheckExistence: {
              always: [
                { target: "ConfirmPromptInit", guard: ({ context }) => !!context.temp && context.target === "Init", actions: assign({ confirm: true })},
                { target: "ConfirmPrompt", guard: ({ context }) => !!context.temp, actions: assign({ confirm: true })},
                { target: "PromptInit", guard: ({ context }) => context.target === "Init"},
                { target: "Prompt" },
              ],
            },
            Prompt: {
              entry: { type: "spst.speak", params: ({ context }) => ({ utterance: `Please choose a ${context.target}.` })},
              on: { SPEAK_COMPLETE: "Planner" },
            },
            PromptInit: {
              entry: { type: "spst.speak", params: { utterance: "What would you like to play?" },},
              on: { SPEAK_COMPLETE: "Planner" },
            },
            Planner: {
              always: [
                { target: "#Listener", guard: ({ context }) => !context.lastResult },
                { target: "CheckCompatibility", guard: ({ context }) => !!context.lastResult },
              ],
            },
            CheckCompatibility: {
              always: [
                { target: "#Initialize.ExtractEverything", guard: ({ context }) => context.target === "Init",},
                { target: "#GetGameMode.CheckCompatibility", guard: ({ context }) => context.target === "game mode"},
                { target: "#GetVowel.CheckCompatibility", guard: ({ context }) => context.target === "vowel"},
                { target: "#GetWordCategory.CheckCompatibility", guard: ({ context }) => context.target === "word category",},
              ]
            },
            Retry: {
              entry: assign({ temp: "" }),
              always: [
                {target: "CheckExistence", actions: {type: "clearContext"}, guard: ({ context }) => context.target === "Init",},        
                {target: "CheckExistence", actions: assign({ targetGameMode: "" }), guard: ({ context }) => context.target === "game mode",},                
                {target: "CheckExistence", actions: assign({ targetVowel: "" }), guard: ({ context }) => context.target === "vowel",},
                {target: "CheckExistence", actions: assign({ targetCategory: "" }), guard: ({ context }) => context.target === "word category",},
              ]
            },
            ConfirmPrompt: {
              entry: { type: "spst.speak", params: ({ context }) => ({utterance: `Confirm choosing ${context.temp} as the ${context.target}?`})},
              on: { SPEAK_COMPLETE: "ConfirmPlanner" },
            },
            ConfirmPromptInit: {
              entry: { type: "spst.speak", params: ({ context }) => ({utterance: buildConfirmationUtterance(context)})},
              on: { SPEAK_COMPLETE: {target: "ConfirmPlanner", actions: assign({confirm: true})} },
            },
            ConfirmPlanner: {
              always: [
                { target: "#Listener", guard: ({ context }) => context.confirm === true, actions: assign({confirm: false})},
                { target: "#Game.hist", guard: ({ context }) => getEntityResolution(context, "YesNo") === true, 
                actions: [assign({ temp: "" }), {type: "clearCache"}] },
                { target: "Retry", guard: ({ context }) => getEntityResolution(context, "YesNo") === false,
                actions: {type: "clearCache"} },
                { target: "ConfirmPrompt", guard: ({ context }) => !getEntityResolution(context, "YesNo"),
                  actions: [{type: "spst.speak", params: { utterance: "Please answer yes or no." } }, assign({confirm: true}) ]},
              ],
            },
            FallbackError: {
              entry: { type: "spst.speak", params: { utterance: "Sorry, I'm not sure how to help with that." }},
              on: { SPEAK_COMPLETE: {target: "Planner", actions: {type: "clearCache"}}},
            },
          },
        },
      },
    },
    // == Main Menu =====================================================================================================
    MainMenu: {
      id: "MainMenu",
      initial: "Initialize",
      states: {
        hist: { type: 'history', history: 'deep'},
        Initialize: {
          id: "Initialize",
          entry: assign({ target: "Init" }),
          initial: "Planner",
          states: {
            Planner: {
              always: [
                {target: "#Getter", guard: ({ context }) => !context.targetGameMode, actions: assign({temp: ""})},
                {target: "#Getter.CheckExistence", actions: assign({temp: ({ context }) => context.temp + context.targetGameMode})}
              ]
            },
            ExtractEverything: {
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
        // == Get Game Mode =============================================================================================
        GetGameMode: {
          id: "GetGameMode",
          entry: assign({ target: "game mode" }),
          initial: "Planner",
          states: {
            Planner: {
              always: [
                {target: "#Getter", guard: ({ context }) => !context.targetGameMode, actions: assign({temp: ""})},
                {target: "#Getter.CheckExistence", actions: assign({temp: ({ context }) => context.temp + context.targetGameMode,})}
              ]
            },
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
        // == Get Vowel =================================================================================================
        GetVowel: {
          id: "GetVowel",
          entry: assign({ target: "vowel" }),
          initial: "Planner",
          states: {
            Planner: {
              always: [
                {target: "#Getter", guard: ({ context }) => !context.targetVowel, actions: assign({temp: ""})},
                {target: "#Getter.CheckExistence", actions: assign({temp: ({ context }) => context.temp + context.targetVowel,})}
              ]
            },            
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
        // == Get Word Category =========================================================================================
        GetWordCategory: {
          id: "GetWordCategory",
          entry: assign({ target: "word category" }),
          initial: "Planner",
          states: {
            Planner: {
              always: [
                {target: "#Getter", guard: ({ context }) => !context.targetCategory, actions: assign({temp: ""})},
                {target: "#Getter.CheckExistence", actions: assign({temp: ({ context }) => context.temp + context.targetCategory,})}
              ]
            },
            CheckCompatibility: {
              always: [
                // Try hardcoded
                {target: "Planner", actions: { type: "clearCache" },
                  guard: ({ context }) => {
                    const utterance = context.lastResult?.[0]?.utterance ?? "";
                    const category = extractCategory(utterance);
                    if (category) context.targetCategory = category;
                    return !!category;},},
                // If no hardcoded, try NLU
                {target: "Planner", actions: { type: "clearCache" },
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
      },
    },
    // == Games =========================================================================================================
    Game: {
      entry: assign({ currentListener: "Game" }),
      id: "Game",
      initial: "modePicker",
      states: {
        hist: { type: 'history', history: 'deep'},
        modePicker: {
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
            Setup: {
              always: [
                { target: "#MainMenu.GetVowel", guard: ({ context }) => context.targetVowel === ""},
                { target: "Prompt"},
              ],
            },
            Prompt: {
              entry: { type: "spst.speak", params: ({ context }) => ({ utterance: `Say a sentence and I will change all vowels to ${context.targetVowel}.`}),},
              on: { SPEAK_COMPLETE: "Planner" },
            },
            Planner: {
              always: [
                { target: "#Listener", guard: ({ context }) => !context.lastResult },
                { target: "Transform", guard: ({ context }) => !!context.lastResult },
              ],
            },                                    
            Transform: {
              entry: { type: "spst.speak", params: ({ context }) => ({utterance: changeVowels(context.lastResult![0].utterance, context.targetVowel)})},
              on: { SPEAK_COMPLETE: {target: "Planner", actions: { type: "clearCache" } } }
            },
          },
        },
        // == Multiplayer Mode ==========================================================================================
        Multiplayer: {
          id: "Multiplayer",
        },
        // == Singleplayer Mode =========================================================================================
        Singleplayer: {
          id: "Singleplayer",
        },
      },
    },
  },
});


// == Actor setup & export ==============================================================================================
export const dmActor = createActor(dmMachine).start();

dmActor.subscribe((state) => {
  console.group("State update");
  console.log("State value:", state.value);
  console.log("Context:", state.context);
  console.groupEnd();
});