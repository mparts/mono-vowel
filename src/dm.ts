// == Imports ===========================================================================================================
import { assign, createActor, setup, transition } from "xstate";
import type { Settings } from "speechstate";
import { speechstate } from "speechstate";
import { createBrowserInspector } from "@statelyai/inspect";
import { KEY, NLU_KEY } from "./azure";
import type { DMContext, DMEvents } from "./types";

const inspector = createBrowserInspector();

// == Azure Related Credentials =========================================================================================
const azureCredentials = {
  endpoint:
    "https://swedencentral.api.cognitive.microsoft.com/sts/v1.0/issuetoken",
  key: KEY,
};

const azureLanguageCredentials = {
  endpoint: "https://ds2026-gusbaranj.cognitiveservices.azure.com/language/:analyze-conversations?api-version=2024-11-15-preview",
  key: NLU_KEY,
  deploymentName: "PhoneticsGameCategories",
  projectName: "ProjectChooseSettings",
};

const settings: Settings = {
  azureCredentials,
  azureLanguageCredentials,
  azureRegion: "swedencentral",
  asrDefaultCompleteTimeout: 0,
  asrDefaultNoInputTimeout: 5000,
  locale: "en-US",
  ttsDefaultVoice: "en-US-DavisNeural",
};

// == NLU helpers =======================================================================================================
function getTopIntent(context: DMContext, threshold = 0.7): string | undefined {
  const intents = context.interpretation?.intents;
  console.log("INTENTS:", JSON.stringify(intents, null, 2), "threshold:", threshold);
  if (!intents || intents.length === 0) return undefined;

  const top = intents[0];
  console.log("TOP INTENT USED:", top);
  return top.confidenceScore >= threshold ? top.category : undefined;
}


function getEntity(context: DMContext, category: string): string | undefined {
  const ent = context.interpretation?.entities.find(e => e.category === category);
  if (!ent) return undefined;

  const listKey = ent.extraInformation?.find(
    (info: any) => info.extraInformationKind === "ListKey"
  )?.key as string | undefined;

  return listKey ?? ent.text;
}

// == GAME helpers ======================================================================================================
function extractCategory(result: string): string | null {
  const normalized = result.trim().toLowerCase();
  if (["animals and creatures", "food and drink", "geography and countries",
    "nature and science", "objects and items"].some((cat) => cat === normalized)) return normalized;
  const map: Record<string, string> = {
    "animals": "animals and creatures",
    "creatures": "animals and creatures",
    "food": "food and drink",
    "drink": "food and drink",
    "countries": "geography and countries",
    "geography": "geography and countries",
    "science": "nature and science",
    "nature": "nature and science",
    "items": "objects and items",
    "objects": "objects and items",
  };
  return map[normalized] ?? null;
}

function extractVowel(result: string): string | null {
  const normalized = result.trim().toLowerCase();
  if (/^[aeiou]$/.test(normalized)) return normalized;
  const map: Record<string, string> = {
    "8": "a",
    "hey": "a",
    "eh": "e",
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

function changeVowels(text: string, vowel: string = "i"): string {
  return text.replace(/[aeiou]|(?<!\b)y/gi, (m) =>
    m === m.toUpperCase() ? vowel.toUpperCase() : vowel
  );
}

// == Command helpers ===================================================================================================
const GLOBAL_COMMANDS = ["exit", "change vowel", "change mode", "change category"];

const isGlobalCommand = ({ event }: { event: DMEvents }) =>
  GLOBAL_COMMANDS.includes(
    (event as any).value?.[0]?.utterance?.trim().toLowerCase()
  );

// == Machine ===========================================================================================================
const dmMachine = setup({
  types: {
    context: {} as DMContext,
    events: {} as DMEvents,
  },
  actions: {
    "spst.speak": ({ context }, params: { utterance: string }) => {
      console.log("SPEAKING:", params.utterance); 
      context.spstRef.send({
        type: "SPEAK",
        value: { utterance: params.utterance },
      });
    },
    "spst.listen": ({ context }) =>
      context.spstRef.send({
        type: "LISTEN",
        value: { nlu: true },
      }),
    "storeCommand": assign(({ event }) => ({
      lastCommand: (event as any).value?.[0]?.utterance?.trim().toLowerCase(),
      lastResult: null,
      interpretation: null,
    })),
    "clearCache": assign({ lastResult: null, interpretation: null }),
  },
}).createMachine({
  context: ({ spawn }) => ({
    spstRef: spawn(speechstate, { input: settings }),
    lastResult: null,
    interpretation: null,
    confirm: false,
    targetVowel: "u",
    targetCategory: "",
    targetGameMode: "ChooseRepeatGame",
    lastCommand: null as string | null,
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
              on: { SPEAK_COMPLETE: "#MainMenu" },
            },
          },
        },
        // == Exit ======================================================================================================
        Done: {
          entry: assign({
            lastResult: null,
            interpretation: null,
            targetVowel: "",
            targetCategory: "",
            targetGameMode: "",
            lastCommand: null as string | null,
          }),
          on: { CLICK: "#Boot.Greeting" },
        },
        // == Global Command Handler ====================================================================================
        HandleCommand: {
          initial: "WaitReady",
          states: {
            WaitReady:{
              on: { ASRTTS_READY: "Commands", SPEAK_COMPLETE: "Commands" },
            },
            Commands:{
              always: [
                { target: "#Core.Done", guard: ({ context }) => context.lastCommand === "exit" },
                { target: "#MainMenu.GetVowel", guard: ({ context }) => context.lastCommand === "change vowel",
                  actions: assign({ targetVowel: "" }) },
                { target: "#MainMenu.GetWordCategory", guard: ({ context }) => context.lastCommand === "change category",
                  actions: assign({ targetCategory: "" }) },                
                { target: "#MainMenu.GetGameMode", guard: ({ context }) => context.lastCommand === "change mode",
                  actions: assign({ targetGameMode: "" }) },
              ],
            },
          },
        },
        // == Listeners =================================================================================================
        MenuListener: {
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
                  { guard: isGlobalCommand,
                    target: "#Core.HandleCommand",
                    actions: { type: "storeCommand" },
                  },
                  {
                    actions: assign(({ event }) => ({
                      lastResult: event.value,
                      interpretation: event.nluValue,
                    })),
                  },
                ],
                ASR_NOINPUT: {
                  actions: { type: "clearCache" },
                  target: "WaitReadyNoInput",
                },
                LISTEN_COMPLETE: [
                  { target: "#MainMenu.hist", guard: ({ context }) => !!context.lastResult },
                ],
              },
            },
          },
        },
        GameListener: {
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
                  { guard: isGlobalCommand,
                    target: "#Core.HandleCommand",
                    actions: { type: "storeCommand" },
                  },
                  {
                    actions: assign(({ event }) => ({
                      lastResult: event.value,
                      interpretation: event.nluValue,
                    })),
                  },
                ],
                ASR_NOINPUT: {
                  actions: { type: "clearCache" },
                  target: "WaitReadyNoInput",
                },
                LISTEN_COMPLETE: [
                  { target: "#Game.hist", guard: ({ context }) => !!context.lastResult },
                ],
              },
            },
          },
        },
      },
    },
    // == Main Menu =====================================================================================================
    MainMenu: {
      id: "MainMenu",
      initial: "ExtractEverything",
      states: {
        hist: {
          type: 'history',
          history: 'deep',
        },
        ExtractEverything: {
          entry: assign(({ context }) => {
            const targetVowel = getEntity(context, "VowelChoice");
            const targetCategory = getEntity(context, "WordCategory");
            const targetGameMode = getTopIntent(context);

            return {
              targetVowel: targetVowel ?? context.targetVowel,
              targetCategory: targetCategory ?? context.targetCategory,
              targetGameMode: targetGameMode ?? context.targetGameMode,
            };
          }),
          always: "GetGameMode",
        },
        // == Get Game Mode =============================================================================================
        GetGameMode: {
          initial: "CheckExistence",
          states: {
            CheckExistence: {
              always: [
                {
                  target: "ConfirmPrompt", guard: ({ context }) => !!context.targetGameMode, actions: assign({ confirm: true }),
                },
                { target: "Prompt" },
              ],
            },
            Prompt: {
              entry: { type: "spst.speak", params: { utterance: "Please choose a game mode." },},
              on: { SPEAK_COMPLETE: "Planner" },
            },
            ConfirmPrompt: {
              entry: {
                type: "spst.speak",
                params: ({ context }) => ({utterance: `Confirm ${context.targetGameMode} game mode?`}),
              },
              on: { SPEAK_COMPLETE: "ConfirmPlanner" },
            },
            Planner: {
              always: [
                { target: "#Core.MenuListener", guard: ({ context }) => !context.lastResult },
                { target: "CheckCompatibility", guard: ({ context }) => !!context.lastResult },
              ],
            },
            CheckCompatibility: {
              entry: assign(({ context }) => ({targetGameMode: getTopIntent(context) ?? ""})),
              always: [
                { target: "CheckExistence", guard: ({ context }) => !!context.targetGameMode, actions: {type: "clearCache"} },
                { target: "FallbackError" }
              ]
            },
            ConfirmPlanner: {
              always: [
                { target: "#Core.MenuListener", guard: ({ context }) => context.confirm === true, actions: assign({confirm: false})},
                { target: "#Game", guard: ({ context }) => getEntity(context, "YesNo") === "Yes", actions: {type: "clearCache"} },
                { target: "CheckExistence", guard: ({ context }) => getEntity(context, "YesNo") === "No",
                actions: [assign({ targetGameMode: "" }), {type: "clearCache"}] },
                { target: "ConfirmPrompt", guard: ({ context }) => getEntity(context, "YesNo") !== "Yes" && getEntity(context, "YesNo") !== "No",
                  actions: [{type: "spst.speak", params: { utterance: "Please answer yes or no." } }, assign({confirm: true}) ]},
              ],
            },
            FallbackError: {
              entry: { type: "spst.speak", params: { utterance: "Sorry, I'm not sure how to help with that." }},
              on: { SPEAK_COMPLETE: {target: "Planner", actions: {type: "clearCache"}}},
            },
          },
        },
        // == Get Vowel =================================================================================================
        GetVowel: {
          initial: "CheckExistence",
          states: {
            CheckExistence: {
              always: [
                {
                  target: "ConfirmPrompt", guard: ({ context }) => !!context.targetVowel, actions: assign({ confirm: true }),
                },
                { target: "Prompt" },
              ],
            },
            Prompt: {
              entry: {
                type: "spst.speak", params: { utterance: "Please choose a vowel." },
              },
              on: { SPEAK_COMPLETE: "Planner" },
            },
            ConfirmPrompt: {
              entry: {
                type: "spst.speak",
                params: ({ context }) => ({utterance: `Confirm the vowel ${context.targetVowel}?`}),
              },
              on: { SPEAK_COMPLETE: "ConfirmPlanner"},
            },
            Planner: {
              always: [
                { target: "#Core.MenuListener", guard: ({ context }) => !context.lastResult },
                { target: "CheckCompatibility", guard: ({ context }) => !!context.lastResult },
              ],
            },            
            CheckCompatibility: {
              always: [
                {
                  target: "CheckExistence",
                  guard: ({ context }) => {
                  const utterance = context.lastResult?.[0]?.utterance ?? "";
                  const vowel = extractVowel(utterance);
                  if (vowel) context.targetVowel = vowel;
                  return !!vowel;},
                  actions: {type: "clearCache"}
                },
                {
                  target: "CheckExistence",
                  guard: ({ context }) => !!getEntity(context, "VowelChoice"),
                  actions: [assign(({ context }) => ({
                    targetVowel: getEntity(context, "VowelChoice")!,
                  })), 
                  {type: "clearCache"}]
                },
                { target: "FallbackError" },
              ],
            },
            ConfirmPlanner: {
              always: [
                { target: "#Core.MenuListener", guard: ({ context }) => context.confirm === true, actions: assign({confirm: false})},
                { target: "#Game.hist", guard: ({ context }) => getEntity(context, "YesNo") === "Yes", actions: {type: "clearCache"} },
                { target: "CheckExistence", guard: ({ context }) => getEntity(context, "YesNo") === "No",
                actions: [assign({ targetVowel: "" }), {type: "clearCache"}] },
                { target: "ConfirmPrompt", guard: ({ context }) => getEntity(context, "YesNo") !== "Yes" && getEntity(context, "YesNo") !== "No",
                  actions: [{type: "spst.speak", params: { utterance: "Please answer yes or no." } }, assign({confirm: true}) ]},
              ],
            },
            FallbackError: {
              entry:{ type: "spst.speak", params:{ utterance: `Sorry, I didn't understand. Try saying a vowel.`} },
              on: { SPEAK_COMPLETE: {target: "Planner", actions: {type: "clearCache"}}},
            },
          },
        },
        // == Get Word Category =========================================================================================
        GetWordCategory: {
          initial: "CheckExistence",
          states: {
            CheckExistence: {
              always: [
                {
                  target: "Confirm", guard: ({ context }) => !!context.targetCategory,
                },
                { target: "Prompt" },
              ],
            },
            Prompt: {
              entry: {
                type: "spst.speak",
                params: { utterance: "Please choose a word category." },
              },
              on: { SPEAK_COMPLETE: "Planner" },
            },
            Planner: {
              always: [
                { target: "#Core.MenuListener", guard: ({ context }) => !context.lastResult },
                { target: "CheckCompatibility", guard: ({ context }) => !!context.lastResult },
              ],
            },
            CheckCompatibility: {
              always: [
                {
                  target: "#Game.hist",
                  guard: ({ context }) => {
                  const utterance = context.lastResult?.[0]?.utterance ?? "";
                  const category = extractCategory(utterance);
                  if (category) context.targetCategory = category;
                  return !!category;},
                  actions: {type: "clearCache"}
                },
                {
                  target: "#Game.hist",
                  guard: ({ context }) => !!getEntity(context, "WordCategory"),
                  actions: [assign(({ context }) => ({
                    targetCategory: getEntity(context, "WordCategory")!,
                  })), 
                  {type: "clearCache"}]
                },
                { target: "FallbackError" },
              ],
            },
            Confirm: {
              always: [
                { target: "#Game.hist", guard: ({ context }) => !!context.targetGameMode, actions: {type: "clearCache"} },
                { target: "FallbackError" }
              ],
            },
            FallbackError: {
              entry: { type: "spst.speak", params: { utterance: `Sorry, I don't know this word category. Please try again.`, } },
              on: { SPEAK_COMPLETE: {target: "Planner", actions: {type: "clearCache"}}},
            },
          },
        },
      },
    },
    // == Games =========================================================================================================
    Game: {
      id: "Game",
      initial: "modePicker",
      states: {
        hist: {
              type: 'history',
              history: 'deep',
            },
        modePicker: {
          always: [
            { target: "EchoMode", guard: ({ context }) => context.targetGameMode === "ChooseRepeatGame",},
            { target: "Multiplayer", guard: ({ context }) => context.targetGameMode === "ChooseMultiplayer", },
            { target: "Singleplayer", guard: ({ context }) => context.targetGameMode === "ChooseSinglePlayer",},
            { target: "#MainMenu.GetGameMode" },
          ],
        },
        // == Echo Mode =================================================================================================
        EchoMode: {
          id: "EchoMode",
          initial: "Setup",
          states: {
            Setup: {
              always: [
                { target: "#MainMenu.GetVowel", guard: ({ context }) => context.targetVowel === "", },
                { target: "#MainMenu.GetWordCategory", guard: ({ context }) => context.targetCategory === "", },
                { target: "Prompt", },
              ],
            },
            Prompt: {
              entry: {
                type: "spst.speak",
                params: ({ context }) => ({
                  utterance: `Say a sentence and I will change all vowels to ${context.targetVowel}.`,
                }),
              },
              on: { SPEAK_COMPLETE: "Planner" },
            },
            Planner: {
              always: [
                { target: "#Core.GameListener", guard: ({ context }) => !context.lastResult },
                { target: "Transform", guard: ({ context }) => !!context.lastResult },
              ],
            },                                    
            Transform: {
              entry: {
                type: "spst.speak",
                params: ({ context }) => ({
                  utterance: changeVowels(context.lastResult![0].utterance, context.targetVowel),
                }),
              },
              on: { SPEAK_COMPLETE: {target: "Planner", actions: { type: "clearCache" } } }
            },
          },
        },
        // == Multiplayer Mode ==========================================================================================
        Multiplayer: {
          id: "Multiplayer",
          initial: "Setup",
          states: {
            Setup: {
              always: [
                { target: "#MainMenu.GetVowel", guard: ({ context }) => context.targetVowel === "", },
                { target: "Prompt", },
              ],
            },
            Prompt: {
              entry: {
                type: "spst.speak",
                params: ({ context }) => ({
                  utterance: `Say a sentence and I will change all vowels to ${context.targetVowel}.`,
                }),
              },
              on: { SPEAK_COMPLETE: "Listen" },
            },
            WaitReadyNoInput: {
              on: { ASRTTS_READY: "NoInput", SPEAK_COMPLETE: "NoInput" },
            },
            NoInput: {
              entry: {
                type: "spst.speak",
                params: { utterance: "I didn't catch that. Try again." },
              },
              on: { SPEAK_COMPLETE: "Listen" },
            },

            Listen: {
              entry: { type: "spst.listen" },
              on: {
                RECOGNISED: [
                  {
                    guard: isGlobalCommand,
                    target: "#Core.HandleCommand",
                    actions: { type: "storeCommand" },
                  },
                  {
                    actions: assign(({ event }) => ({
                      lastResult: event.value,
                      interpretation: event.nluValue,
                    })),
                  },
                ],
                ASR_NOINPUT: {
                  actions: { type: "clearCache" },
                  target: "WaitReadyNoInput",
                },
                LISTEN_COMPLETE: [
                  { target: "Transform", guard: ({ context }) => !!context.lastResult },
                ],
              },
            },
            Transform: {
              entry: {
                type: "spst.speak",
                params: ({ context }) => ({
                  utterance: changeVowels(context.lastResult![0].utterance, context.targetVowel),
                }),
              },
              on: { SPEAK_COMPLETE: "Listen" },
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

// == Actor setup =======================================================================================================
const dmActor = createActor(dmMachine, {
  inspect: inspector.inspect,
}).start();

dmActor.subscribe((state) => {
  console.group("State update");
  console.log("State value:", state.value);
  console.log("Context:", state.context);
  console.groupEnd();
});

// == Button setup for starting the dialogue ============================================================================
export function setupButton(element: HTMLButtonElement) {
  element.addEventListener("click", () => {
    dmActor.send({ type: "CLICK" });
  });
  dmActor.subscribe((snapshot) => {
    const meta: { view?: string } = Object.values(
      snapshot.context.spstRef.getSnapshot().getMeta(),
    )[0] || { view: undefined };
    element.innerHTML = `${meta.view}`;
  });
}