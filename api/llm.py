"""
AthLink multi-provider LLM helper — Vercel serverless safe.

Pure urllib (no SDK) so it works inside the 60s Vercel function ceiling with no
heavy cold-start imports, matching the existing pattern in ai_filter.py /
parse_pdf.py.

Routing philosophy (see "Handoff - API Provider Integration.md"):
  - Each AI task gets its own provider so no single free tier is the bottleneck.
  - Anthropic Haiku 4.5 is the universal fallback — a provider error NEVER
    hard-fails to "no AI". Anthropic stays wired the whole way.

Task router
-----------
    filter    -> Kimi (Moonshot, OpenAI-compat)
    overview  -> DeepSeek (OpenAI-compat)
    hover     -> Cerebras (OpenAI-compat)
    nat       -> Gemini (vision; used by parse_pdf later)
    <other>   -> Anthropic (default + fallback)
"""

import json, os

try:
    import urllib.request as urlreq
    import urllib.error as urlerr
except ImportError:                       # pragma: no cover
    urlreq = None
    urlerr = None


# ── provider config ──────────────────────────────────────────────────────────
ANTHROPIC_URL   = "https://api.anthropic.com/v1/messages"
ANTHROPIC_MODEL = "claude-haiku-4-5"

# task -> routing config. key_env is the *name* of the env var holding the key,
# resolved at call time so a missing key cleanly falls back to Anthropic.
ROUTES = {
    "filter":   {"provider": "openai", "base_url": "https://api.moonshot.ai/v1",
                 "key_env": "KIMI_API_KEY",     "model": "kimi-k2.5"},
    # overview (athlete/class bio blurbs) → Gemini. Kimi was flaky here: it timed
    # out / returned empty (blank "AI summary unavailable") and drifted into
    # non-English output on foreign-named regattas (the International 49er page
    # rendered in Spanish). Gemini (already live on Vercel via GEMINI_API_KEY) is
    # reliable and English-first. Falls back to Anthropic if the key is missing;
    # model is overridable via env (GEMINI_OVERVIEW_MODEL), matching nat/vision.
    "overview": {"provider": "gemini", "base_url": "https://generativelanguage.googleapis.com/v1beta",
                 "key_env": "GEMINI_API_KEY",   "model": "gemini-3.5-flash",
                 "model_env": "GEMINI_OVERVIEW_MODEL"},
    # hover was Cerebras, but its public endpoint kept erroring (model churn /
    # key), so it's routed to Kimi — already live and free.
    "hover":    {"provider": "openai", "base_url": "https://api.moonshot.ai/v1",
                 "key_env": "KIMI_API_KEY", "model": "kimi-k2.5"},
    "nat":      {"provider": "gemini", "base_url": "https://generativelanguage.googleapis.com/v1beta",
                 "key_env": "GEMINI_API_KEY",   "model": "gemini-3.5-flash",
                 "model_env": "GEMINI_NAT_MODEL"},
    # vision parse (PDF/image) route — Gemini 3.5 Flash, overridable via env.
    "vision":   {"provider": "gemini", "base_url": "https://generativelanguage.googleapis.com/v1beta",
                 "key_env": "GEMINI_API_KEY",   "model": "gemini-3.5-flash",
                 "model_env": "GEMINI_VISION_MODEL"},
}

ANTHROPIC_ROUTE = {"provider": "anthropic", "base_url": ANTHROPIC_URL,
                   "key_env": "ANTHROPIC_API_KEY", "model": ANTHROPIC_MODEL}


def route(task):
    """Resolve a task label to a provider config dict.

    Returns the Anthropic route when the task is unknown/absent OR when the
    chosen provider has no API key configured (so deploys without the new keys
    keep working). The caller is still responsible for falling back to Anthropic
    on a *runtime* provider error — see complete_text().
    """
    cfg = ROUTES.get(task)
    if not cfg:
        return dict(ANTHROPIC_ROUTE)
    if not os.environ.get(cfg["key_env"], ""):
        return dict(ANTHROPIC_ROUTE)
    cfg = dict(cfg)
    # An env override (model_env) lets ops pin/downgrade the model without a code
    # change (e.g. GEMINI_VISION_MODEL=gemini-2.5-flash). Non-empty value wins.
    menv = cfg.get("model_env")
    if menv:
        override = os.environ.get(menv, "").strip()
        if override:
            cfg["model"] = override
    return cfg


# ── low-level callers ────────────────────────────────────────────────────────
class LLMError(Exception):
    """Raised on any provider HTTP/transport error so the caller can fall back."""


def _post_json(url, payload, headers, timeout):
    req = urlreq.Request(url, data=json.dumps(payload).encode(),
                         headers=headers, method="POST")
    try:
        with urlreq.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read())
    except urlerr.HTTPError as exc:
        try:
            detail = json.loads(exc.read())
            msg = (detail.get("error", {}) or {}).get("message") or str(detail)
        except Exception:
            msg = exc.reason or str(exc)
        raise LLMError(f"{exc.code}: {msg}")
    except Exception as exc:
        raise LLMError(str(exc))


def call_openai_compat(base_url, key, model, messages, max_tokens, tools=None,
                       timeout=20):
    """Kimi / DeepSeek / Cerebras — OpenAI chat-completions shape.

    Returns the raw response dict. For tools=None text use openai_text().
    """
    payload = {"model": model, "messages": messages, "max_tokens": max_tokens}
    if tools:
        payload["tools"] = tools
    # Kimi/Moonshot turns "thinking" ON by default. For our short-output tasks
    # (filter JSON, hover/overview blurbs, parse JSON) the reasoning eats the
    # whole max_tokens budget and the model returns EMPTY content with a valid
    # 200 — which the UI then shows as "AI summary unavailable". Disable it so we
    # get the answer directly. Harmless for non-Kimi OpenAI-compat providers
    # since it's only sent to moonshot.
    if "moonshot" in base_url:
        payload["thinking"] = {"type": "disabled"}
    url = base_url.rstrip("/") + "/chat/completions"
    headers = {"Content-Type": "application/json",
               "Authorization": f"Bearer {key}"}
    return _post_json(url, payload, headers, timeout)


def openai_text(resp):
    try:
        return resp["choices"][0]["message"].get("content") or ""
    except (KeyError, IndexError, TypeError):
        return ""


def call_anthropic(key, model, messages, max_tokens, system=None, tools=None,
                   timeout=20):
    """Anthropic native /v1/messages. messages = [{role, content}]."""
    payload = {"model": model, "max_tokens": max_tokens, "messages": messages}
    if system:
        payload["system"] = system
    if tools:
        payload["tools"] = tools
    headers = {"Content-Type": "application/json",
               "x-api-key": key,
               "anthropic-version": "2023-06-01"}
    return _post_json(ANTHROPIC_URL, payload, headers, timeout)


def anthropic_text(resp):
    return "".join(b.get("text", "") for b in resp.get("content", [])
                   if b.get("type") == "text")


def call_gemini(key, model, parts, max_tokens=400, timeout=30):
    """Gemini REST generateContent. parts = list of Gemini content parts
    (e.g. [{"text": ...}, {"inline_data": {"mime_type": ..., "data": b64}}]).
    Gemini ingests PDF/image natively via inline_data. Returns raw dict."""
    url = (f"https://generativelanguage.googleapis.com/v1beta/models/"
           f"{model}:generateContent?key={key}")
    payload = {"contents": [{"parts": parts}],
               "generationConfig": {"maxOutputTokens": max_tokens}}
    headers = {"Content-Type": "application/json"}
    return _post_json(url, payload, headers, timeout)


def gemini_text(resp):
    try:
        parts = resp["candidates"][0]["content"]["parts"]
        return "".join(p.get("text", "") for p in parts)
    except (KeyError, IndexError, TypeError):
        return ""


# ── high-level convenience: route a text task, fall back to Anthropic ─────────
def complete_text(task, prompt, max_tokens, timeout=20):
    """Run a single-prompt text task through its routed provider.

    On ANY provider error, transparently retries on Anthropic Haiku so nothing
    ever degrades to "no AI". Returns (text, model_used, fallback_error) where
    fallback_error is None on the happy path, or the primary provider's error
    string when the call fell back to Anthropic (for diagnostics — not secret).
    """
    cfg = route(task)
    key = os.environ.get(cfg["key_env"], "")
    # Force English for the prose tasks. Non-English-first models (e.g. Kimi on
    # the still-routed "hover" task) otherwise drift into the language of the
    # source data — foreign-named regattas made the International 49er page
    # render in Spanish. Left off "filter"/"nat" (structured/JSON output).
    if task in ("overview", "hover"):
        prompt = ("Respond in English only, regardless of the language of any "
                  "names, competitions, or places mentioned below.\n\n") + prompt
    messages = [{"role": "user", "content": prompt}]

    try:
        if cfg["provider"] == "anthropic":
            resp = call_anthropic(key, cfg["model"], messages, max_tokens,
                                  timeout=timeout)
            return anthropic_text(resp), cfg["model"], None
        if cfg["provider"] == "openai":
            resp = call_openai_compat(cfg["base_url"], key, cfg["model"],
                                      messages, max_tokens, timeout=timeout)
            return openai_text(resp), cfg["model"], None
        # gemini text-only path (rare for ai_filter; supported for completeness)
        if cfg["provider"] == "gemini":
            resp = call_gemini(key, cfg["model"], [{"text": prompt}],
                               max_tokens=max_tokens, timeout=timeout)
            return gemini_text(resp), cfg["model"], None
        fallback_error = f"unknown provider '{cfg['provider']}'"
    except LLMError as exc:
        fallback_error = f"{cfg['provider']}/{cfg['model']}: {exc}"

    # ── Anthropic fallback ──
    akey = os.environ.get("ANTHROPIC_API_KEY", "")
    if not akey:
        raise LLMError("primary provider failed and ANTHROPIC_API_KEY not set")
    resp = call_anthropic(akey, ANTHROPIC_MODEL, messages, max_tokens,
                          timeout=timeout)
    return anthropic_text(resp), ANTHROPIC_MODEL, fallback_error
