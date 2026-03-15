import type { Settings } from "speechstate";
import  {SPEECH_KEY, NLU_KEY} from "./azure";

// == Azure Related Credentials =========================================================================================
const azureCredentials = {
  endpoint: "https://swedencentral.api.cognitive.microsoft.com/sts/v1.0/issuetoken",
  key: SPEECH_KEY,
};
const azureLanguageCredentials = {
  endpoint: "https://ds2026-gusbaranj.cognitiveservices.azure.com/language/:analyze-conversations?api-version=2024-11-15-preview",
  key: NLU_KEY,
  deploymentName: "PhoneticsGameCategories",
  projectName: "ProjectChooseSettings",
};
export const settings: Settings = {
  azureCredentials,
  azureLanguageCredentials,
  azureRegion: "swedencentral",
  asrDefaultCompleteTimeout: 0,
  asrDefaultNoInputTimeout: 5000,
  locale: "en-US",
  ttsDefaultVoice: "en-US-DavisNeural",
};