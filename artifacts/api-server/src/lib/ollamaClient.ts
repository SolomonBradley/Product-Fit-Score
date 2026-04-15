import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from "./logger";

const apiKey = process.env["GOOGLE_GENAI_API_KEY"];
if (!apiKey) {
  throw new Error("GOOGLE_GENAI_API_KEY environment variable is required");
}

const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

// ─── Health Check ─────────────────────────────────────────────────────────────

export async function isOllamaAvailable(): Promise<boolean> {
  try {
    // Test the API with a simple call
    await model.generateContent("ping");
    return true;
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
  if (start !== -1 && end !== -1 && end > start)
    return text.slice(start, end + 1);
  return text.trim();
}

// ─── Core LLM Call ────────────────────────────────────────────────────────────

export async function generateJSON<T>(
  prompt: string,
  retries = 1,
): Promise<T | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // Wrap the API call with a timeout
      const contentPromise = model.generateContent({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 2000,
        },
      });

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("LLM request timeout (10 min)")),
          600000,
        ),
      );

      const response = await Promise.race([contentPromise, timeoutPromise]);

      const raw = extractJSON(response.response.text().trim());
      return JSON.parse(raw) as T;
    } catch (err: any) {
      const isTimeout = err.message?.includes("timeout");
      if (attempt < retries && !isTimeout) {
        logger.warn(
          `[LLM] Connection attempt ${attempt + 1} failed. Re-trying...`,
        );
        await new Promise((r) => setTimeout(r, 1000)); // Short backoff
        continue;
      }

      const errorMsg = isTimeout
        ? "Timeout (10 min)"
        : err.message || String(err);
      logger.error(
        { error: errorMsg },
        "[LLM] Analysis permanently failed or timed out.",
      );
      return null;
    }
  }
  return null;
}
