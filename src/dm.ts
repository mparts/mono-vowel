// == Imports ===========================================================================================================
import { assign, createActor, setup, } from "xstate";
import type { Settings } from "speechstate";
import { speechstate } from "speechstate";
import { KEY, NLU_KEY } from "./azure";
import type { DMContext, DMEvents } from "./types";


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

function getEntityResolution(context: DMContext, category: string): any | undefined {
  const ent = context.interpretation?.entities.find(e => e.category === category);
  if (!ent) return undefined;

  const resolution = ent.resolutions?.[0];
  return resolution?.value;
}


// == GAME helpers ======================================================================================================
function extractCategory(result: string): string | null {
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

function extractVowel(result: string): string | null {
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

function changeVowels(text: string, vowel: string = "i"): string {
  return text.replace(/[aeiou]|(?<!\b)y/gi, (m) =>
    m === m.toUpperCase() ? vowel.toUpperCase() : vowel
  );
}

const GLOBAL_COMMANDS = ["exit", "restart", "reset", "default", "vowel", "mode", "category", ];
const isGlobalCommand = ({ event }: { event: DMEvents }) =>
  GLOBAL_COMMANDS.includes(
    (event as any).value?.[0]?.utterance?.trim().toLowerCase()
  );

function buildConfirmationUtterance(context: any): string {
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


// == Machine ===========================================================================================================
const dmMachine = setup({
  types: {
    context: {} as DMContext,
    events: {} as DMEvents,
  },
  actions: {
    "spst.speak": ({ context }, params: { utterance: string }) => {console.log("SPEAKING:", params.utterance); 
      context.spstRef.send({ type: "SPEAK",value: { utterance: params.utterance }});},
    "spst.listen": ({ context }) =>
      context.spstRef.send({ type: "LISTEN", value: { nlu: true }}),
    "storeCommand": assign(({ event }) => ({
      lastCommand: (event as any).value?.[0]?.utterance?.trim().toLowerCase(), lastResult: null, interpretation: null,})),
    "clearCache": assign({ lastResult: null, interpretation: null }),
    "clearContext": assign({
      lastResult: null,
      interpretation: null,
      confirm: false,
      current: "",
      targetVowel: "",
      targetCategory: "",
      targetGameMode: "",
      lastCommand: null as string | null,
    }),
    "defaultContext": assign({
      lastResult: null,
      interpretation: null,
      confirm: false,
      current: "",
      targetVowel: "o",
      targetCategory: "animals and creatures",
      targetGameMode: "Echo",
      lastCommand: null as string | null,
    }),
  },
}).createMachine({
  context: ({ spawn }) => ({
    spstRef: spawn(speechstate, { input: settings }),
    lastResult: null,
    interpretation: null,
    confirm: false,
    current: "",
    targetVowel: "",
    targetCategory: "",
    targetGameMode: "",
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
          entry: [assign({ current: "Boot" })],
          id: "Boot",
          initial: "Prepare",
          states: {
            hist: {
              type: 'history',
              history: 'deep',
            },
            Prepare: {
              entry: ({ context }) => context.spstRef.send({ type: "PREPARE" }),
              on: { ASRTTS_READY: "WaitToStart" },
            },
            WaitToStart: {
              on: { CLICK: "Greeting" },
            },
            Greeting: {
              entry: {type: "spst.speak", params: { utterance: "Hey!" },},
              on: { SPEAK_COMPLETE: "GetSettings" },
            },
            GetSettings: {
              entry: {type: "spst.speak", params: { utterance: "Use default settings?" },},
              on: { SPEAK_COMPLETE: {target: "ConfirmPlanner", actions: assign({ confirm: true })} },
            },
            ConfirmPlanner: {
              always: [
                { target: "#Listener", guard: ({ context }) => context.confirm === true, actions: assign({confirm: false})},
                { target: "#Game", guard: ({ context }) => getEntityResolution(context, "YesNo") === true, actions: {type: "defaultContext"}},
                { target: "#MainMenu", guard: ({ context }) => getEntityResolution(context, "YesNo") === false, actions: {type: "clearContext"} },
                { target: "GetSettings", guard: ({ context }) => !getEntityResolution(context, "YesNo"), 
                actions: {type: "spst.speak", params: { utterance: "Please answer yes or no." }}},
              ],
            },
            DefaultSettings: {
              entry: [{type: "defaultContext"}, { type: "spst.speak", params: { utterance: "Default settings applied." } }],
              on: { SPEAK_COMPLETE: "#Game"}
            },
            ResetSettings: {
              entry: [{type: "clearContext"}, { type: "spst.speak", params: { utterance: "Settings reset." } }],
              on: { SPEAK_COMPLETE: "#MainMenu" }
            },
          },
        },
        // == Exit ======================================================================================================
        Done: {
          entry: [ {type: "clearContext"}, { type: "spst.speak", params: { utterance: "Thanks for playing!!!" } }],
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
                { target: "#Boot.Greeting", guard: ({ context }) => context.lastCommand === "restart" },
                { target: "#Boot.ResetSettings", guard: ({ context }) => context.lastCommand === "reset"},
                { target: "#Boot.DefaultSettings", guard: ({ context }) => context.lastCommand === "default"},
                { target: "#MainMenu.GetVowel", guard: ({ context }) => context.lastCommand === "vowel",
                  actions: assign({ targetVowel: "" }) },
                { target: "#MainMenu.GetWordCategory", guard: ({ context }) => context.lastCommand === "category",
                  actions: assign({ targetCategory: "" }) },
                { target: "#MainMenu.GetGameMode", guard: ({ context }) => context.lastCommand === "mode",
                  actions: assign({ targetGameMode: "" }) },
              ],
            },
          },
        },
        // == Listener ======================================================================================================
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
                  { target: "#Boot.hist", guard: ({ context }) => context.current === "Boot" && !!context.lastResult},
                  { target: "#MainMenu.hist", guard: ({ context }) => context.current === "MainMenu" && !!context.lastResult},
                  { target: "#Game.hist", guard: ({ context }) => context.current === "Game" && !!context.lastResult},
                ],
              },
            },
          },
        },
      },
    },
    // == Main Menu =====================================================================================================
    MainMenu: {
      entry: [assign({ current: "MainMenu" })],
      id: "MainMenu",
      initial: "Initialize",
      states: {
        hist: {
          type: 'history',
          history: 'deep',
        },
        Initialize: {
          initial: "Prompt",
          states: {
            Prompt: {
              entry: { type: "spst.speak", params: { utterance: "What would you like to play?" },},
              on: { SPEAK_COMPLETE: "Planner" },
            },
            ConfirmPrompt: {
              entry: {
                type: "spst.speak",
                params: ({ context }) => ({utterance: buildConfirmationUtterance(context)}),
              },
              on: { SPEAK_COMPLETE: {target: "ConfirmPlanner", actions: assign({confirm: true})} },
            },
            Planner: {
              always: [
                { target: "#Listener", guard: ({ context }) => !context.lastResult },
                { target: "ExtractEverything", guard: ({ context }) => !!context.lastResult },
              ],
            },
            ExtractEverything: {
              entry: assign(({ context }) => {
                // get vowel
                const Vowel = getEntity(context, "VowelChoice");
                // get category
                const entity = getEntity(context, "WordCategory");
                const category = entity ? extractCategory(entity) : null;
                // get game mode
                const mode = getTopIntent(context);
                const modeMap: Record<string, string> = {
                  ChooseRepeatGame: "Echo",
                  ChooseMultiplayer: "Multiplayer",
                  ChooseSinglePlayer: "Singleplayer"
                };
                return {
                  targetVowel: Vowel ?? context.targetVowel,
                  targetCategory: category ?? context.targetCategory,
                  targetGameMode:  mode ? modeMap[mode] ?? context.targetGameMode : "",
                };
              }),
              always: [
                { target: "ConfirmPrompt", guard: ({ context }) => !!context.targetGameMode, actions: { type: "clearCache" } },
                { target: "FallbackError" }
              ]
            },
            ConfirmPlanner: {
              always: [
                { target: "#Listener", guard: ({ context }) => context.confirm === true, actions: assign({confirm: false})},
                { target: "#Game", guard: ({ context }) => getEntityResolution(context, "YesNo") === true, actions: {type: "clearCache"} },
                { target: "#MainMenu.GetGameMode", guard: ({ context }) => getEntityResolution(context, "YesNo") === false, actions: {type: "clearContext"}},
                { target: "ConfirmPrompt", guard: ({ context }) => !getEntityResolution(context, "YesNo"),
                  actions: [{type: "spst.speak", params: { utterance: "Please answer yes or no." } }, assign({confirm: true}) ]},
              ],
            },
            FallbackError: {
              entry: { type: "spst.speak", params: { utterance: "Sorry, I'm not sure how to help with that." }},
              on: { SPEAK_COMPLETE: {target: "#MainMenu.GetGameMode", actions: {type: "clearContext"}}},
            },
          },
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
                { target: "#Listener", guard: ({ context }) => !context.lastResult },
                { target: "CheckCompatibility", guard: ({ context }) => !!context.lastResult },
              ],
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
                { target: "CheckExistence", guard: ({ context }) => !!context.targetGameMode, actions: { type: "clearCache" } },
                { target: "FallbackError" }
              ]
            },
            ConfirmPlanner: {
              always: [
                { target: "#Listener", guard: ({ context }) => context.confirm === true, actions: assign({confirm: false})},
                { target: "#Game", guard: ({ context }) => getEntityResolution(context, "YesNo") === true, actions: {type: "clearCache"} },
                { target: "CheckExistence", guard: ({ context }) => getEntityResolution(context, "YesNo") === false,
                actions: [assign({ targetGameMode: "" }), {type: "clearCache"}] },
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
                { target: "#Listener", guard: ({ context }) => !context.lastResult },
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
                { target: "#Listener", guard: ({ context }) => context.confirm === true, actions: assign({confirm: false})},
                { target: "#Game.hist", guard: ({ context }) => getEntityResolution(context, "YesNo") === true, actions: {type: "clearCache"} },
                { target: "CheckExistence", guard: ({ context }) => getEntityResolution(context, "YesNo") === false,
                actions: [assign({ targetVowel: "" }), {type: "clearCache"}] },
                { target: "ConfirmPrompt", guard: ({ context }) => !getEntityResolution(context, "YesNo"),
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
                  target: "ConfirmPrompt", guard: ({ context }) => !!context.targetCategory, actions: assign({ confirm: true }),
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
            ConfirmPrompt: {
              entry: {
                type: "spst.speak",
                params: ({ context }) => ({utterance: `Confirm the category ${context.targetCategory}?`}),
              },
              on: { SPEAK_COMPLETE: "ConfirmPlanner"},
            },
            Planner: {
              always: [
                { target: "#Listener", guard: ({ context }) => !context.lastResult },
                { target: "CheckCompatibility", guard: ({ context }) => !!context.lastResult },
              ],
            },
            CheckCompatibility: {
              always: [
                {
                  target: "CheckExistence",
                  guard: ({ context }) => {
                    const utterance = context.lastResult?.[0]?.utterance ?? "";
                    const category = extractCategory(utterance);
                    if (category) context.targetCategory = category;
                    return !!category;
                  }, actions: { type: "clearCache" }
                },
                {
                  target: "CheckExistence",
                  guard: ({ context }) => {
                    const entity = getEntity(context, "WordCategory");
                    const category = entity ? extractCategory(entity) : null;
                    if (category) context.targetCategory = category;
                    return !!category;
                  }, actions: { type: "clearCache" }
                },
                { target: "FallbackError" }
              ]
            },
            ConfirmPlanner: {
              always: [
                { target: "#Listener", guard: ({ context }) => context.confirm === true, actions: assign({confirm: false})},
                { target: "#Game.hist", guard: ({ context }) => getEntityResolution(context, "YesNo") === true, actions: {type: "clearCache"} },
                { target: "CheckExistence", guard: ({ context }) => getEntityResolution(context, "YesNo") === false,
                actions: [assign({ targetCategory: "" }), {type: "clearCache"}] },
                { target: "ConfirmPrompt", guard: ({ context }) => getEntityResolution(context, "YesNo") !== true && getEntityResolution(context, "YesNo") !== false,
                  actions: [{type: "spst.speak", params: { utterance: "Please answer yes or no." } }, assign({confirm: true}) ]},
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
      entry: [assign({ current: "Game" })],
      id: "Game",
      initial: "modePicker",
      states: {
        hist: {
              type: 'history',
              history: 'deep',
            },
        modePicker: {
          always: [
            { target: "EchoMode", guard: ({ context }) => context.targetGameMode === "Echo",},
            { target: "Multiplayer", guard: ({ context }) => context.targetGameMode === "Multiplayer", },
            { target: "Singleplayer", guard: ({ context }) => context.targetGameMode === "Singleplayer",},
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
                { target: "#Listener", guard: ({ context }) => !context.lastResult },
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
const dmActor = createActor(dmMachine).start();

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