/* Shared AI client — calls the serverless /api/ai_filter endpoint.
   Multi-provider routing (Kimi text, Gemini vision, Anthropic fallback) is handled
   server-side in api/llm.py. Sports should call this, not the providers directly.
   task: "filter" | "overview" | "hover"  */
export async function aiComplete(task, prompt, { debug = false } = {}) {
  try {
    const r = await fetch("/api/ai_filter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task, prompt, debug }),
    });
    if (!r.ok) return { ok: false, text: "", model: null };
    return r.json(); // { ok, text, model, fallback_error? }
  } catch (e) {
    console.error("aiComplete error", e);
    return { ok: false, text: "", model: null };
  }
}
