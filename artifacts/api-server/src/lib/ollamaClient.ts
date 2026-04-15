import { Ollama } from "ollama";
import { logger } from "./logger";

const OLLAMA_BASE_URL = process.env["OLLAMA_BASE_URL"] ?? "http://localhost:11434";
export const OLLAMA_MODEL = process.env["OLLAMA_MODEL"] ?? "llama3";

const client = new Ollama({ host: OLLAMA_BASE_URL });

// ─── Health Check ─────────────────────────────────────────────────────────────

export async function isOllamaAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      signal: AbortSignal.timeout(10000), // Increase to 10s for health check
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── JSON Extractor ───────────────────────────────────────────────────────────

function extractJSON(text: string): string {
  const mdMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (mdMatch) return mdMatch[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) return text.slice(start, end + 1);
  return text.trim();
}

// ─── Core LLM Call ────────────────────────────────────────────────────────────

export async function generateJSON<T>(prompt: string, retries = 1): Promise<T | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // 💀 CRITICAL FIX: Wrap client.chat() with a timeout that actually cancels
      const chatPromise = client.chat({
        model: OLLAMA_MODEL,
        messages: [{ role: "user", content: prompt }],
        format: "json",
        options: { temperature: 0.1, num_predict: 2000 },
      });

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("LLM request timeout (10 min)")), 600000)
      );

      const response = await Promise.race([chatPromise, timeoutPromise]);

      const raw = extractJSON(response.message.content.trim());
      return JSON.parse(raw) as T;
    } catch (err: any) {
      const isTimeout = err.message?.includes("timeout");
      if (attempt < retries && !isTimeout) {
        logger.warn(`[LLM] Connection attempt ${attempt + 1} failed. Re-trying...`);
        await new Promise(r => setTimeout(r, 1000)); // Short backoff
        continue;
      }

      const errorMsg = isTimeout ? "Timeout (10 min)" : (err.message || String(err));
      logger.error({ error: errorMsg }, "[LLM] Analysis permanently failed or timed out.");
      return null;
    }
  }
  return null;
}
