import  {GROQ_API_KEY} from "./secrets";
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_TIMEOUT_MS = 15_000;

/** Sends a prompt to Groq and returns the response text. Throws on an HTTP error, a timeout or an empty reply. */
export async function askGroq(prompt: string): Promise<string> {
  const response = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {"Content-Type": "application/json", "Authorization": `Bearer ${GROQ_API_KEY}`},
    body: JSON.stringify({model: "llama-3.3-70b-versatile", messages: [{ role: "user", content: prompt }],}),
    signal: AbortSignal.timeout(GROQ_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Groq: HTTP ${response.status}`);
  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw new Error("Groq: empty reply");
  return content;
}
