import "./style.css";
import { dmActor } from "./state_machine/dm.ts";

// == HTML Skeleton =================================================================================================================================
document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <div id="header">
    <span id="header-title">MONO-VOWEL</span>
    <span id="header-mode">STANDBY</span>
  </div>

  <!-- Vowelina — left character column -->
  <div class="char-col" id="col-vowelina">
    <div class="char-avatar">V</div>
    <div class="char-name">Vowelina</div>
    <div class="side-bubble" id="vowelina-bubble"></div>
  </div>

  <!-- Center HUD -->
  <div id="hud">

    <div id="scoreboard">
      <div class="score-panel left" id="panel-t1">
        <div class="score-label" id="label-t1">TEAM 1</div>
        <div class="score-value" id="score-t1">0</div>
      </div>
      <div class="score-divider">VS</div>
      <div class="score-panel right" id="panel-t2">
        <div class="score-label" id="label-t2">TEAM 2</div>
        <div class="score-value" id="score-t2">0</div>
      </div>
    </div>

    <div id="meta-row">
      <div class="meta-cell">
        <div class="meta-label">ROUND</div>
        <div class="meta-value" id="meta-round">—</div>
      </div>
      <div class="meta-cell">
        <div class="meta-label">VOWEL</div>
        <div class="meta-value highlight" id="meta-vowel">—</div>
      </div>
      <div class="meta-cell">
        <div class="meta-label">CATEGORY</div>
        <div class="meta-value" id="meta-category">—</div>
      </div>
    </div>

    <!-- Word panel: target (left) | divider | guess count + pending guess (right) -->
    <div id="word-panel">
      <div id="reveal-countdown"></div>
      <div id="silence-countdown"></div>
      <div id="word-left">
        <div id="word-label">TARGET WORD</div>
        <div id="word-value" class="hidden">—</div>
      </div>
      <div id="word-divider"></div>
      <div id="guess-right">
        <div id="guess-label">GUESS</div>
        <div id="guess-sublabel"></div>
        <div id="guess-value">—</div>
      </div>
    </div>

    <div id="status-strip">
      <div id="status-dot" class="idle"></div>
      <div id="status-text">Waiting to start...</div>
      <div id="status-state"></div>
    </div>

    <button id="click-btn" type="button">CLICK TO START</button>

    <!-- Raptor bubble — below button, spans full HUD width -->
    <div id="raptor-row">
      <div id="raptor-avatar">R</div>
      <div id="raptor-bubble"></div>
    </div>

  </div>

  <!-- Mono — right character column -->
  <div class="char-col" id="col-mono">
    <div class="char-avatar">M</div>
    <div class="char-name">Mono</div>
    <div class="side-bubble" id="mono-bubble"></div>
  </div>

  <div id="footer">
    <div id="footer-commands">
      <div class="cmd-cell">
        <span class="cmd-key">"exit"</span>
        <span class="cmd-desc">quit the game</span>
      </div>
      <div class="cmd-cell">
        <span class="cmd-key">"restart"</span>
        <span class="cmd-desc">restart from intro</span>
      </div>
      <div class="cmd-cell">
        <span class="cmd-key">"reset"</span>
        <span class="cmd-desc">clear all settings</span>
      </div>
      <div class="cmd-cell">
        <span class="cmd-key">"default"</span>
        <span class="cmd-desc">apply default settings</span>
      </div>
    </div>
  </div>
`;

// == Button ========================================================================================================================================
document.getElementById("click-btn")!.addEventListener("click", () => {
  dmActor.send({ type: "CLICK" });
});

// == Flatens the state, to be used as a pointer ====================================================================================================
function flattenState(value: unknown, prefix = ""): string {
  if (typeof value === "string") return prefix ? `${prefix}.${value}` : value;
  if (typeof value === "object" && value !== null) {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => flattenState(v, prefix ? `${prefix}.${k}` : k))
      .join(" | ");
  }
  return prefix;
}
function el(id: string): HTMLElement {
  return document.getElementById(id) as HTMLElement;
}
function setClass(element: HTMLElement, classes: string[], active: string) {
  classes.forEach(c => element.classList.remove(c));
  if (active) element.classList.add(active);
}

// == Speaker detection =============================================================================================================================
const VOWELINA_STATES = [
  "VowelinaIntro", "VowelinaMono", "VowelinaRaptor", "VowelinaOutro", "EchoMode.Prompt", "Core.Done.Vowelina",
  "Multiplayer.Intro", "Multiplayer.SelectTeam", "Multiplayer.WaitToStart", "Multiplayer.Silencer.Prompt", "Multiplayer.Evaluation", "Multiplayer.EndGame",
  "Singleplayer.Intro", "Singleplayer.SelectRole", "Singleplayer.Evaluation", "Singleplayer.EvaluateGroqGuess", "Singleplayer.EndGame",
];
const MONO_STATES = [
  "MonoIntro", "Singleplayer.Transform", "Multiplayer.Transform", "TransformGroq", "EchoMode.Transform", "Core.Done.Mono",
];
const RAPTOR_STATES = [
  "Boot.Greeting.Raptor", "RaptorIntro",
  "Core.Done.Raptor", "DefaultSettings", "ResetSettings",
  "Listener.NoInput", "Getter.Prompt", "Getter.ConfirmPrompt", "Getter.ConfirmPlanner", "Getter.FallbackError",
  "Multiplayer.Win", "Multiplayer.GameOver", "Multiplayer.RetryPrompt",
  "Singleplayer.Win", "Singleplayer.GameOver", "Singleplayer.RetryPrompt", "Singleplayer.RetryGroqDescribe",
];
type Speaker = "vowelina" | "mono" | "raptor" | null;

function detectSpeaker(statePath: string): Speaker {
  if (VOWELINA_STATES.some(s => statePath.includes(s))) return "vowelina";
  if (MONO_STATES.some(s => statePath.includes(s)))     return "mono";
  if (RAPTOR_STATES.some(s => statePath.includes(s)))   return "raptor";
  return null;
}

function getBubbleText(statePath: string, speaker: Speaker): string {
  if (!speaker) return "";
  if (speaker === "mono") {
    if (statePath.includes("MonoIntro"))     return "○ speaking — intro";
    if (statePath.includes("TransformGroq")) return "○ reading description…";
    if (statePath.includes("Core.Done"))     return "○ You made my day!!";
    return "○ repeating with vowel change…";
  }
  if (speaker === "vowelina") {
    if (statePath.includes("VowelinaIntro"))     return "○ introducing herself…";
    if (statePath.includes("VowelinaMono"))      return "○ introducing Mono…";
    if (statePath.includes("VowelinaRaptor"))    return "○ introducing Raptor…";
    if (statePath.includes("VowelinaOutro"))     return "○ explaining the game…";
    if (statePath.includes("Silencer.Prompt"))   return "○ telling team to think silently…";
    if (statePath.includes("SelectTeam"))        return "○ announcing next team…";
    if (statePath.includes("SelectRole"))        return "○ announcing next role…";
    if (statePath.includes("EvaluateGroqGuess")) return "○ making a guess…";
    if (statePath.includes("Evaluation"))        return "○ reading the score…";
    if (statePath.includes("EndGame"))           return "○ announcing the winner…";
    if (statePath.includes("WaitToStart"))       return "○ giving instructions…";
    if (statePath.includes("Intro"))             return "○ explaining the mode…";
    if (statePath.includes("Core.Done"))         return "○ saying farewell..";
    return "○ speaking…";
  }
  if (speaker === "raptor") {
    if (statePath.includes("RaptorIntro"))     return "○ introducing himself…";
    if (statePath.includes("DefaultSettings")) return "○ default settings applied";
    if (statePath.includes("ResetSettings"))   return "○ settings reset";
    if (statePath.includes("NoInput"))         return "○ make sure your mic is unmuted.. or speak louder";
    if (statePath.includes("ConfirmPrompt"))   return "○ asking for confirmation…";
    if (statePath.includes("Getter.Prompt"))   return "○ asking for input…";
    if (statePath.includes("FallbackError"))   return "○ didn't understand…";
    if (statePath.includes("Win"))             return "○ correct guess!!";
    if (statePath.includes("GameOver"))        return "○ game over…";
    if (statePath.includes("RetryPrompt") || statePath.includes("RetryGroqDescribe")) return "○ try again…";
    if (statePath.includes("Core.Done"))       return "○ saying goodbye…";
    return "○ speaking…";
  }
  return "";
}

// == Raptor tips, shown in the raptor bubble whenever Raptor isn't speaking ========================================================================
// matched against the flattened state path (for stable states)
const STATE_TIPS: [string, string][] = [
  // Boot and exit
  ["Boot.WaitForClick",            "Tip: Click the button, then say \"Wake up\" to begin."],
  ["Boot.Greeting.VowelinaOutro",  "Tip: Use any of the global commands, during ANY listen state. Using 'reset' + 'vowel' / 'category' / 'mode' resets only the target, e.g. 'reset vowel'."],
  ["Boot.Greeting",                "Characters: Vowelina (Narrator), Mono (vowel change), InterRaptor (Command handler, information getter)"],
  ["Core.Done",                    "Tip: Self destruct in 10, 9, 8, 7.."],
  ["EchoMode",                     "Tip: When done conversating with Mono, say 'Continue' to progress with the game.."],
  // MUltiplayer
  ["Multiplayer.SelectTeam",       "ALERT: Guessers: After Vowelina is done speaking, LOOK AWAY!!"],
  ["Multiplayer.Unblur",           "ALERT: Leader: memorise the word!!"],
  ["Multiplayer.WaitToStart",      "Tip: Leader, say \"Ready\". Then, whisper your description to Mono!!"],
  ["Multiplayer.Silencer",         "ALERT: Leader stays silent!! Guessers, silently think/discuss the guess"],
  ["Multiplayer.Win",              "Tip: You scored a point! First to 3 wins."],
  ["Multiplayer.GameOver",         "Tip: You lose.. Next round coming up.."],
  ["Multiplayer",                  "Tip: Use 'reset vowel' / 'reset category', to change them. Mind that changing category mid turn will result in the target word changing!!"],
  // Singleplayer
  ["Singleplayer.PlayerDescribes", "Tip: Describe the word without saying it. Mono will transform your voice."],
  ["Singleplayer.TransformGroq",   "Tip: Listen to Mono carefully.."],
  ["Singleplayer.Transform",       "Tip: Vowelina is thinking… she'll guess from what she heard."],
  ["Singleplayer.GroqGuessing",    "Tip: Vowelina is thinking… she'll guess from what she heard."],
  ["Singleplayer.Win",             "Tip: You scored a point! First to 3 wins."],
  ["Singleplayer.GameOver",        "Tip: Next round coming up.."],
  ["Singleplayer.Intro",           "Tip: Use 'reset vowel' / 'reset category', to change them. Mind that changing category mid turn will result in the target word changing!!"],
  ["Singleplayer",                 "Tip: Keep in mind that the LLM doesn't have history of what you said. You cannot just add information on your previous description."],

  ["GetGuess",                     "Tip: Say exactly one word as your guess."],
  ["MainMenu",                     "Tip: You can say the game mode, vowel, and category all at once."],
  ["Game",                         "Tip: Don't forget about the global commands!! Play arround with the categories / vowels.."],
];
// matched against ctx.target (used for the menu states / getter)
const TARGET_TIPS: Record<string, string> = {
  "Init":          "Tip: Choose a game mode (Multiplayer / Singleplayer). You can include a vowel, and/or a category.",
  "game mode":     "Tip: Pick \"Multiplayer\" for team play with friends, or \"Singleplayer\" to play against Vowelina.",
  "vowel":         "Tip: Pick the vowel of your choice: A, E, I, O, or U.",
  "word category": "Tip: Options are: \"animals\", \"food\", or \"objects\". I can also just pick a \"random\" one for you.",
  "guess":         "Tip: Say exactly one word as your guess.",
};

let lastTip = "Tip: Click the button to get started.";
function getRaptorTip(statePath: string, target: string): string {
  // Check state-based tips first
  for (const [pattern, tip] of STATE_TIPS) {
    if (statePath.includes(pattern)) return tip;
  }
  // Fall back to ctx.target-based tip
  if (target && TARGET_TIPS[target]) return TARGET_TIPS[target];
  // Nothing matched, signal "no new tip" with empty string
  return "";
}

// == Countdowns ====================================================================================================================================
const REVEAL_DURATION_MS  = 3000;
const SILENCE_DURATION_MS = 10000;

let revealTimer:  ReturnType<typeof setTimeout> | null = null;
let silenceTimer: ReturnType<typeof setTimeout> | null = null;

function startRevealCountdown() {
  const bar = el("reveal-countdown");
  bar.classList.remove("running");
  bar.style.setProperty("--reveal-duration", `${REVEAL_DURATION_MS / 1000}s`);
  void bar.offsetWidth;
  bar.classList.add("running");
  if (revealTimer) clearTimeout(revealTimer);
  revealTimer = setTimeout(() => { revealTimer = null; }, REVEAL_DURATION_MS + 500);
}
function stopRevealCountdown() {
  el("reveal-countdown").classList.remove("running");
  if (revealTimer) { clearTimeout(revealTimer); revealTimer = null; }
}

function startSilenceCountdown() {
  const bar = el("silence-countdown");
  bar.classList.remove("running");
  bar.style.setProperty("--silence-duration", `${SILENCE_DURATION_MS / 1000}s`);
  void bar.offsetWidth;
  bar.classList.add("running");
  if (silenceTimer) clearTimeout(silenceTimer);
  silenceTimer = setTimeout(() => { silenceTimer = null; }, SILENCE_DURATION_MS + 500);
}
function stopSilenceCountdown() {
  el("silence-countdown").classList.remove("running");
  if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; }
}

// == Signals =======================================================================================================================================
interface UISignals {
  modeName: string;
  modeActive: boolean;
  score1: number;
  score2: number;
  label1: string;
  label2: string;
  team1Active: boolean;
  team2Active: boolean;
  team1Winning: boolean;
  team2Winning: boolean;
  round: string;
  vowel: string;
  category: string;
  wordText: string;
  wordClass: string;
  wordPanelClass: string;
  pendingGuess: string | null;
  guessCount: string;
  isUnblurState: boolean;
  isSilencerListen: boolean;
  dotClass: string;
  statusText: string;
  statusHot: boolean;
  statePath: string;
  bodyClass: string;
  btnLabel: string;
  btnClass: string;
  speaker: Speaker;
  raptorContent: string;
}

function deriveSignals(snapshot: ReturnType<typeof dmActor.getSnapshot>): UISignals {
  const ctx = snapshot.context;
  const statePath = flattenState(snapshot.value);

  const isBooting       = statePath.includes("Boot");
  const isMenu          = statePath.includes("MainMenu");
  const isMultiplayer   = statePath.includes("Multiplayer");
  const isSingleplayer  = statePath.includes("Singleplayer");
  const isEcho          = statePath.includes("EchoMode");
  const isUnblurState   = statePath.includes("UnblurTimer");
  const isSilencer      = statePath.includes("Silencer");
  const isSilencerListen = statePath.includes("Silencer.Listen");
  const isWin           = statePath.includes("Win") && !statePath.includes("WinCue");
  const isGameOver      = statePath.includes("GameOver") && !statePath.includes("GameOverCue");
  const isEvaluation    = statePath.includes("Evaluation");
  const isListening     = statePath.includes("Listen") && !statePath.includes("EndlessListener");
  const isSpeaking      = statePath.includes("Transform") || statePath.includes("Speak");

  // == Target World blur/unblur ======================================================================================
  // Singleplayer: unblur from the moment SelectRole sets a new round with odd
  // Blur immediately when round is even.
  const isSpPastSetup = (isSingleplayer || ctx.targetGameMode === "Singleplayer") &&
    !statePath.includes("Setup") && !statePath.includes("Intro") && !statePath.includes("EndGame");
  const isPlayerDescribeTurn = isSpPastSetup && ctx.roundCount % 2 !== 0;

  const wordClass =
    isWin                 ? "correct"
    : isGameOver          ? "wrong"
    : isUnblurState       ? "revealing"
    : isPlayerDescribeTurn ? "visible"
    : "hidden";          

  // == Usser Guess ===================================================================================================
  const isConfirmingGuess =
    ctx.target === "guess" &&
    (statePath.includes("ConfirmPrompt") || statePath.includes("ConfirmPlanner"));
  const pendingGuess = isConfirmingGuess && ctx.temp ? ctx.temp : null;
  // Guess count — shown when there is no pending guess but we're in a game
  const inActiveGame = (isMultiplayer || isSingleplayer || 
    (ctx.targetGameMode !== "" && ctx.currentListener === "Game")) &&
    !statePath.includes("Setup") && !statePath.includes("Intro");
  const guessCount = inActiveGame ? `${ctx.guessCount} / 5` : "";

  // == Score labels ==================================================================================================
  const isGameModeMultiplayer = ctx.targetGameMode === "Multiplayer";
  const label1 = isGameModeMultiplayer ? "TEAM 1" : "YOU";
  const label2 = isGameModeMultiplayer ? "TEAM 2" : "VOWELINA";
  const team1Active = isGameModeMultiplayer && isMultiplayer && ctx.roundCount % 2 === 1;
  const team2Active = isGameModeMultiplayer && isMultiplayer && ctx.roundCount % 2 === 0 && ctx.roundCount > 0;

  // == Highlights ====================================================================================================
  const isRoundEndPhase = isWin || isGameOver || isEvaluation;
  const team1Winning = isRoundEndPhase && ctx.team1score > ctx.team2score;
  const team2Winning = isRoundEndPhase && ctx.team2score > ctx.team1score;

  const wordPanelClass =
    isSilencer              ? "danger"
    : isWin                 ? "success"
    : isGameOver            ? "danger"
    : isUnblurState         ? "reveal"
    : (team1Active || team2Active || isPlayerDescribeTurn) ? "warning"
    : "";

  // == Button label ==================================================================================================
  const rawMeta = Object.values(
    ctx.spstRef.getSnapshot().getMeta()
  )[0] as { view?: string } | undefined;
  const metaView = rawMeta?.view && rawMeta.view.trim() !== "" ? rawMeta.view : undefined;
  const btnLabel = metaView
    ?? (statePath.includes("WaitForClick") ? "CLICK TO START"
      : isWin      ? "NEXT ROUND →"
      : isGameOver ? "CONTINUE →"
      : isBooting  ? "CLICK TO START"
      : "···");

  // == Status Text ===================================================================================================
  const statusText =
    isUnblurState         ? "LOOK NOW — word visible for 3 seconds "
    : isSilencer          ? "SILENCE"
    : isWin               ? "CORRECT GUESS — round won"
    : isGameOver          ? "ROUND LOST"
    : isConfirmingGuess   ? `Confirm guess: "${ctx.temp}"?`
    : isPlayerDescribeTurn ? "YOUR TURN — whisper a description to Mono"
    : isListening         ? "Listening..."
    : isSpeaking          ? "Speaking..."
    : isMenu              ? "Setting up game..."
    : isBooting           ? "Ready to start"
    : "···";

  // == Speakers + raptor content =====================================================================================
  const speaker = detectSpeaker(statePath);
  const raptorContent = speaker === "raptor"
    ? getBubbleText(statePath, "raptor")
    : getRaptorTip(statePath, ctx.target);

  return {
    modeName: ctx.targetGameMode
      ? ctx.targetGameMode.toUpperCase()
      : isMenu ? "SETUP" : "STANDBY",
    modeActive: isMultiplayer || isSingleplayer || isEcho,
    score1: ctx.team1score,
    score2: ctx.team2score,
    label1,
    label2,
    team1Active,
    team2Active,
    team1Winning,
    team2Winning,
    round: ctx.roundCount > 0 ? String(ctx.roundCount) : "—",
    vowel: ctx.targetVowel ? ctx.targetVowel.toUpperCase() : "—",
    category: ctx.targetCategory
      ? ctx.targetCategory.replace(" and ", " & ").toUpperCase()
      : "—",
    wordText: ctx.targetWord || "—",
    wordClass,
    wordPanelClass,
    pendingGuess,
    guessCount,
    isUnblurState,
    isSilencerListen,
    dotClass: isSilencer   ? "danger"
      : isListening ? "listening"
      : isSpeaking  ? "speaking"
      : "idle",
    statusText,
    statusHot: isSilencer || isWin || isGameOver || isUnblurState || isConfirmingGuess || isPlayerDescribeTurn,
    statePath,
    bodyClass: isSilencer     ? "state-silence"
      : isWin          ? "state-win"
      : isUnblurState  ? "state-reveal"
      : "",
    btnLabel,
    btnClass: isWin ? "ready" : isGameOver ? "danger" : "",
    speaker,
    raptorContent,
  };
}

// == Apply signals =================================================================================================================================
let wasUnblurState    = false;
let wasSilencerListen = false;
let lastPendingGuess  = "";

function applySignals(s: UISignals) {
  // Header
  el("header-mode").textContent = s.modeName;
  el("header-mode").classList.toggle("active", s.modeActive);

  // Button
  el("click-btn").textContent = s.btnLabel;
  setClass(el("click-btn"), ["ready", "danger"], s.btnClass);

  // Scores
  el("score-t1").textContent = String(s.score1);
  el("score-t2").textContent = String(s.score2);
  el("label-t1").textContent = s.label1;
  el("label-t2").textContent = s.label2;
  setClass(el("panel-t1"), ["active-team", "winning"],
    s.team1Winning ? "winning" : s.team1Active ? "active-team" : "");
  setClass(el("panel-t2"), ["active-team", "winning"],
    s.team2Winning ? "winning" : s.team2Active ? "active-team" : "");

  // Meta
  el("meta-round").textContent    = s.round;
  el("meta-vowel").textContent    = s.vowel;
  el("meta-category").textContent = s.category;

  // Word
  el("word-value").textContent = s.wordText;
  setClass(el("word-value"), ["hidden", "revealing", "visible", "correct", "wrong"], s.wordClass);
  setClass(el("word-panel"), ["danger", "success", "warning", "reveal"], s.wordPanelClass);

  // Guess panel, three display modes:
  const guessRight = el("guess-right");
  if (s.pendingGuess) {
    // Mode 1: confirming a guess
    if (s.pendingGuess !== lastPendingGuess) {
      el("guess-value").textContent = s.pendingGuess.toUpperCase();
      el("guess-sublabel").textContent = s.guessCount;
      setClass(guessRight, ["visible", "count-only"], "visible");
      void guessRight.offsetWidth;
      guessRight.classList.add("visible");
      lastPendingGuess = s.pendingGuess;
    }
  } else if (s.guessCount) {
    // Mode 2: show attempt counter
    el("guess-value").textContent = s.guessCount;
    el("guess-sublabel").textContent = "";
    setClass(guessRight, ["visible", "count-only"], "count-only");
    lastPendingGuess = "";
  } else {
    // Mode 3: hide
    setClass(guessRight, ["visible", "count-only"], "");
    lastPendingGuess = "";
  }

  // Reveal countdown (word unblur for 3s, show amber bar at bottom)
  if (s.isUnblurState && !wasUnblurState) startRevealCountdown();
  else if (!s.isUnblurState && wasUnblurState) stopRevealCountdown();
  wasUnblurState = s.isUnblurState;

  // Silence countdown (Silencer.Listen for 10s show red bar at top)
  if (s.isSilencerListen && !wasSilencerListen) startSilenceCountdown();
  else if (!s.isSilencerListen && wasSilencerListen) stopSilenceCountdown();
  wasSilencerListen = s.isSilencerListen;

  // Status strip
  setClass(el("status-dot"), ["listening", "speaking", "danger", "idle"], s.dotClass);
  el("status-text").textContent = s.statusText;
  el("status-text").classList.toggle("hot", s.statusHot);
  el("status-state").textContent = s.statePath.split(" | ")[0];

  // Body tint
  setClass(document.body, ["state-silence", "state-win", "state-reveal"], s.bodyClass);

  // Character bubbles 
  const bubbleText = getBubbleText(s.statePath, s.speaker);
  // Vowelina
  el("col-vowelina").classList.toggle("speaking", s.speaker === "vowelina");
  if (s.speaker === "vowelina") el("vowelina-bubble").textContent = bubbleText;
  // Mono
  el("col-mono").classList.toggle("speaking", s.speaker === "mono");
  if (s.speaker === "mono") el("mono-bubble").textContent = bubbleText;
  // Raptor tips or speaking text; row gets .speaking only when actually speaking
  el("raptor-row").classList.toggle("speaking", s.speaker === "raptor");
  // Persist: only update lastTip when we have a fresh non-empty string.
  if (s.raptorContent) lastTip = s.raptorContent;
  el("raptor-bubble").textContent = lastTip;
  // .tip class = muted style (showing tip, not speaking)
  el("raptor-row").classList.toggle("tip", s.speaker !== "raptor");
}

// == Subscriber ====================================================================================================================================
dmActor.subscribe((snapshot) => {
  applySignals(deriveSignals(snapshot));
});
