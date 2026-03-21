import  {GROQ_API_KEY} from "./secrets";
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

/** Sends a prompt to Groq and returns the response text. */
export async function askGroq(prompt: string): Promise<string> {
  const response = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {"Content-Type": "application/json", "Authorization": `Bearer ${GROQ_API_KEY}`},
    body: JSON.stringify({model: "llama-3.3-70b-versatile", messages: [{ role: "user", content: prompt }], temperature: 0.9,}),
  });
  const data = await response.json();
  return data.choices[0].message.content as string;
}