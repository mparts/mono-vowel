import { describe, test, expect } from "vitest";
import type { DMContext } from "../src/state_machine/types";
import {
  getTopIntent,
  getEntity,
  getEntityResolution,
  extractCategory,
  extractVowel,
  changeVowels,
  extractGuess,
  containsWord,
  escapeSsml,
  cleanGuess,
  heardCommand,
} from "../src/state_machine/helpers";

// == Fixtures ======================================================================================================================================
type TestIntent = { category: string; confidenceScore: number };
/** Builds a context holding only an NLU result with the given intents and entities. */
function nlu(intents: TestIntent[], entities: object[] = []): DMContext {
  return { interpretation: { intents, entities } } as unknown as DMContext;
}
/** Builds a context holding only an ASR result with the given utterance, or none. */
function heard(utterance: string | null): DMContext {
  return { lastResult: utterance === null ? null : [{ utterance, confidence: 1 }] } as unknown as DMContext;
}
/** Builds a yes/no-style entity with optional resolutions and ListKey. */
function entity(category: string, opts: { text?: string; resolutions?: any[]; listKey?: string } = {}) {
  return {
    category,
    text: opts.text ?? "",
    resolutions: opts.resolutions ?? [],
    extraInformation: opts.listKey !== undefined
      ? [{ extraInformationKind: "ListKey", key: opts.listKey }]
      : [],
  };
}
const CATEGORIES = ["animals and creatures", "foods and drinks", "objects and items"];

// == NLU helpers ===================================================================================================================================
describe("getTopIntent", () => {
  test("returns the top intent when it meets the threshold", () => {
    const ctx = nlu([{ category: "Yes", confidenceScore: 0.9 }, { category: "No", confidenceScore: 0.05 }]);
    expect(getTopIntent(ctx)).toBe("Yes");
  });
  test("returns the top intent when its gap to the second is large enough", () => {
    const ctx = nlu([{ category: "Yes", confidenceScore: 0.7 }, { category: "No", confidenceScore: 0.3 }]);
    expect(getTopIntent(ctx)).toBe("Yes");
  });
  test("returns undefined when neither threshold nor gap is met", () => {
    const ctx = nlu([{ category: "Yes", confidenceScore: 0.6 }, { category: "No", confidenceScore: 0.4 }]);
    expect(getTopIntent(ctx)).toBeUndefined();
  });
  test("returns undefined for a single low-confidence intent", () => {
    expect(getTopIntent(nlu([{ category: "Yes", confidenceScore: 0.6 }]))).toBeUndefined();
  });
  test("respects a custom threshold", () => {
    const ctx = nlu([{ category: "Yes", confidenceScore: 0.6 }, { category: "No", confidenceScore: 0.4 }]);
    expect(getTopIntent(ctx, 0.5)).toBe("Yes");
  });
  test("returns undefined with no intents or no interpretation", () => {
    expect(getTopIntent(nlu([]))).toBeUndefined();
    expect(getTopIntent({ interpretation: null } as unknown as DMContext)).toBeUndefined();
  });
});

describe("getEntity", () => {
  test("prefers the ListKey over the raw text", () => {
    const ctx = nlu([], [entity("GameMode", { text: "multi player", listKey: "multiplayer" })]);
    expect(getEntity(ctx, "GameMode")).toBe("multiplayer");
  });
  test("falls back to the raw text, and returns undefined for a missing entity", () => {
    const ctx = nlu([], [entity("GameMode", { text: "singleplayer" })]);
    expect(getEntity(ctx, "GameMode")).toBe("singleplayer");
    expect(getEntity(ctx, "Vowel")).toBeUndefined();
  });
});

describe("getEntityResolution", () => {
  test("returns the resolution value first", () => {
    const ctx = nlu([], [entity("YesNo", { resolutions: [{ value: false }], listKey: "true" })]);
    expect(getEntityResolution(ctx, "YesNo")).toBe(false);
  });
  test("maps the ListKey \"true\"/\"false\" to booleans", () => {
    expect(getEntityResolution(nlu([], [entity("YesNo", { listKey: "true" })]), "YesNo")).toBe(true);
    expect(getEntityResolution(nlu([], [entity("YesNo", { listKey: "false" })]), "YesNo")).toBe(false);
  });
  test("returns undefined for other ListKeys, no ListKey or a missing entity", () => {
    expect(getEntityResolution(nlu([], [entity("YesNo", { listKey: "maybe" })]), "YesNo")).toBeUndefined();
    expect(getEntityResolution(nlu([], [entity("YesNo", { text: "yes" })]), "YesNo")).toBeUndefined();
    expect(getEntityResolution(nlu([]), "YesNo")).toBeUndefined();
  });
});

// == GAME helpers ==================================================================================================================================
describe("extractCategory", () => {
  test("matches the full category names, in any case", () => {
    expect(extractCategory("animals and creatures")).toBe("animals and creatures");
    expect(extractCategory("I want Foods and Drinks")).toBe("foods and drinks");
  });
  test("matches synonyms", () => {
    expect(extractCategory("food")).toBe("foods and drinks");
    expect(extractCategory("let's do animals")).toBe("animals and creatures");
    expect(extractCategory("items")).toBe("objects and items");
  });
  test("picks one of the categories for random-style phrases", () => {
    for (const phrase of ["random", "surprise me", "whatever you like"]) {
      expect(CATEGORIES).toContain(extractCategory(phrase));
    }
  });
  test("returns null when nothing matches, so ?? keeps an earlier category (B5)", () => {
    expect(extractCategory("hello there")).toBeNull();
  });
});

describe("extractVowel", () => {
  test("accepts a single vowel letter, trimmed and lowercased", () => {
    expect(extractVowel("a")).toBe("a");
    expect(extractVowel(" E ")).toBe("e");
  });
  test("maps common mishearings", () => {
    expect(extractVowel("eye")).toBe("i");
    expect(extractVowel("Oh")).toBe("o");
    expect(extractVowel("you")).toBe("u");
    expect(extractVowel("8")).toBe("a");
    expect(extractVowel("hey")).toBe("a");
  });
  test("finds \"i\" inside a phrase", () => {
    expect(extractVowel("the vowel i please")).toBe("i");
    expect(extractVowel("choose eye")).toBe("i");
  });
  test("returns null when nothing matches", () => {
    expect(extractVowel("banana")).toBeNull();
    expect(extractVowel("")).toBeNull();
  });
});

describe("changeVowels", () => {
  test("replaces every vowel, defaulting to o", () => {
    expect(changeVowels("Hello world")).toBe("Hollo world");
    expect(changeVowels("Hello world", "a")).toBe("Halla warld");
  });
  test("keeps the case of each replaced letter", () => {
    expect(changeVowels("Ice Age", "u")).toBe("Ucu Ugu");
  });
  test("treats y as a vowel except at the start of a word", () => {
    expect(changeVowels("happy", "o")).toBe("hoppo");
    expect(changeVowels("my yoyo", "a")).toBe("ma yaaa");
  });
  test("spells out whole numbers before replacing", () => {
    expect(changeVowels("3 cats", "o")).toBe("throo cots");
    expect(changeVowels("21", "o")).toBe("twonto-ono");
  });
  test("spells out decimals digit by digit", () => {
    expect(changeVowels("2.5", "a")).toBe("twa paant fava");
  });
});

describe("extractGuess", () => {
  test("returns a single word, trimmed and lowercased", () => {
    expect(extractGuess(" Cat ")).toBe("cat");
    expect(extractGuess("CAT")).toBe("cat");
  });
  test("returns null for several words or empty input", () => {
    expect(extractGuess("a cat")).toBeNull();
    expect(extractGuess("")).toBeNull();
    expect(extractGuess("   ")).toBeNull();
  });
});

describe("cleanGuess", () => {
  test("strips punctuation and markdown from an LLM guess (B4)", () => {
    expect(cleanGuess("Cat.")).toBe("cat");
    expect(cleanGuess("**cat**")).toBe("cat");
    expect(cleanGuess(' "Cat"\n')).toBe("cat");
  });
});

describe("escapeSsml", () => {
  test("escapes & < > so text from the ASR or Groq can't break the SSML", () => {
    expect(escapeSsml("Tom & Jerry <3 > 2")).toBe("Tom &amp; Jerry &lt;3 &gt; 2");
  });
  test("escapes & only once", () => {
    expect(escapeSsml("&")).toBe("&amp;");
  });
  test("leaves plain text alone", () => {
    expect(escapeSsml("Hollo world, it's \"fun\"!!")).toBe("Hollo world, it's \"fun\"!!");
  });
});

// == General helpers ===============================================================================================================================
describe("containsWord", () => {
  test("matches a whole word in any case", () => {
    expect(containsWord("I think it is a cat", "cat")).toBe(true);
    expect(containsWord("CAT!", "cat")).toBe(true);
  });
  test("does not match part of a word", () => {
    expect(containsWord("concatenate", "cat")).toBe(false);
  });
  test("returns false for empty input", () => {
    expect(containsWord("", "cat")).toBe(false);
    expect(containsWord("cat", "")).toBe(false);
  });
});

describe("heardCommand", () => {
  test("matches a command in any case, with punctuation or extra words (B11)", () => {
    expect(heardCommand(heard("Ready!"), "ready")).toBe(true);
    expect(heardCommand(heard("wake up please"), "wake up")).toBe(true);
    expect(heardCommand(heard("Wake Up"), "wake up")).toBe(true);
  });
  test("ignores partial words and a missing result", () => {
    expect(heardCommand(heard("already"), "ready")).toBe(false);
    expect(heardCommand(heard(null), "ready")).toBe(false);
  });
});
