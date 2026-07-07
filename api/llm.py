"""
AthLink multi-provider LLM helper — Vercel serverless safe.

Pure urllib (no SDK) so it works inside the 60s Vercel function ceiling with no
heavy cold-start imports, matching the existing pattern in ai_filter.py /
parse_pdf.py.

Routing philosophy (parser v3, Casey 2026-07)
---------------------------------------------
  - ONE paid Gemini key (`Gemini_API_Key_Universal`) powers EVERY AI task in
    AthLink — search suggestions, overviews, hover blurbs, flag/nat reads,
    photo/scan vision parsing and date/country enrichment. Resolve it in exactly
    one place: `_gemini_key()` (mixed-case Vercel name, with the legacy
    `GEMINI_API_KEY` as a local-dev fallback).
  - Anthropic **Sonnet 5** (`claude-sonnet-5`) is the ONE universal fallback —
    it fires only when Gemini errors/rate-limits, handles both text and vision,
    and never degrades to "no AI". No Haiku anywhere.
  - Kimi / DeepSeek / Cerebras are retired from the DEFAULT routes. The
    OpenAI-compatible caller stays wired so a provider can be re-added purely via
    env, but no task routes to them out of the box.

Task router (see §5b of PROMPT_parser_v3.md)
--------------------------------------------
    filter    -> Gemini gemini-3.1-flash-lite   (search-bar suggestions; latency)
    overview  -> Gemini gemini-3.1-flash-lite   (athlete overview blurbs)
    hover     -> Gemini gemini-3.1-flash-lite   (hover summaries)
    nat       -> Gemini gemini-3-flash          (flag/nationality vision reads)
    vision    -> Gemini gemini-3-flash          (photo/scan results parsing)
    enrich    -> Gemini gemini-3-flash + Google Search grounding
    <other>   -> Anthropic Sonnet 5 (default + universal fallback)
"""

import json, os

try:
    import urllib.request as urlreq
    import urllib.error as urlerr
except ImportError:                       # pragma: no cover
    urlreq = None
    urlerr = None


# ── key resolution (single source of truth) ──────────────────────────────────
def _gemini_key():
    """The one paid Gemini key for EVERY AI task.

    Prefers the mixed-case name Vercel provisions (`Gemini_API_Key_Universal`);
    falls back to the legacy `GEMINI_API_KEY` so local dev (.env.local still has
    the old value) keeps working. Every Gemini call in the codebase must resolve
    its key through this helper — there is exactly one resolution path.
    """
    return os.environ.get("Gemini_API_Key_Universal") or os.environ.get("GEMINI_API_KEY", "")


# ── provider config ──────────────────────────────────────────────────────────
GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta"

ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
# Universal fallback model — Sonnet 5 (text + vision). Env-overridable so Casey
# can retune without a deploy. NEVER Haiku.
def _anthropic_fallback_model():
    return os.environ.get("ANTHROPIC_FALLBACK_MODEL", "").strip() or "claude-sonnet-5"

# Back-compat alias (some callers still import ANTHROPIC_MODEL). Resolved lazily
# via _anthropic_fallback_model() everywhere that matters; kept as a constant for
# imports that expect a string.
ANTHROPIC_MODEL = _anthropic_fallback_model()

# task -> routing config. Every default route is provider "gemini" and resolves
# its key via _gemini_key(). `model_env` (and the legacy alias in
# `model_env_legacy`) let ops pin/downgrade a model without a code change.
ROUTES = {
    "filter":   {"provider": "gemini", "base_url": GEMINI_BASE,
                 "model": "gemini-3.1-flash-lite", "model_env": "FILTER_MODEL"},
    "overview": {"provider": "gemini", "base_url": GEMINI_BASE,
                 "model": "gemini-3.1-flash-lite", "model_env": "OVERVIEW_MODEL"},
    "hover":    {"provider": "gemini", "base_url": GEMINI_BASE,
                 "model": "gemini-3.1-flash-lite", "model_env": "HOVER_MODEL"},
    "nat":      {"provider": "gemini", "base_url": GEMINI_BASE,
                 "model": "gemini-3-flash", "model_env": "NAT_MODEL",
                 "model_env_legacy": "GEMINI_NAT_MODEL"},
    "vision":   {"provider": "gemini", "base_url": GEMINI_BASE,
                 "model": "gemini-3-flash", "model_env": "VISION_MODEL",
                 "model_env_legacy": "GEMINI_VISION_MODEL"},
    "enrich":   {"provider": "gemini", "base_url": GEMINI_BASE,
                 "model": "gemini-3-flash", "model_env": "ENRICH_MODEL",
                 "grounding": True},
}


def _anthropic_route():
    return {"provider": "anthropic", "base_url": ANTHROPIC_URL,
            "key_env": "ANTHROPIC_API_KEY", "model": _anthropic_fallback_model()}


def route(task):
    """Resolve a task label to a provider config dict.

    Returns the Anthropic (Sonnet) route when the task is unknown/absent OR when
    the chosen Gemini key isn't configured (so deploys without the Gemini key
    still work via the fallback). The caller is still responsible for falling
    back to Anthropic on a *runtime* provider error — see complete_text().
    """
    cfg = ROUTES.get(task)
    if not cfg:
        return _anthropic_route()
    cfg = dict(cfg)
    if cfg["provider"] == "gemini" and not _gemini_key():
        return _anthropic_route()
    if cfg["provider"] != "gemini":
        # A re-added openai-compat / other provider still gates on its key_env.
        if cfg.get("key_env") and not os.environ.get(cfg["key_env"], ""):
            return _anthropic_route()
    # Model overrides: new name wins, then legacy alias, else the coded default.
    for env_name in (cfg.get("model_env"), cfg.get("model_env_legacy")):
        if env_name:
            override = os.environ.get(env_name, "").strip()
            if override:
                cfg["model"] = override
                break
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
    """OpenAI chat-completions shape — kept so a provider (Kimi/DeepSeek/…) can
    be re-added purely via env. Not used by any DEFAULT route in v3.

    Returns the raw response dict. For tools=None text use openai_text().
    """
    payload = {"model": model, "messages": messages, "max_tokens": max_tokens}
    if tools:
        payload["tools"] = tools
    # Moonshot/Kimi turns "thinking" ON by default, which eats the whole
    # max_tokens budget on our short-output tasks and returns empty content.
    # Harmless for other providers (only sent to moonshot).
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


def call_gemini(key, model, parts, max_tokens=400, timeout=30, tools=None,
                thinking_budget=None):
    """Gemini REST generateContent. parts = list of Gemini content parts
    (e.g. [{"text": ...}, {"inline_data": {"mime_type": ..., "data": b64}}]).
    Gemini ingests PDF/image natively via inline_data.

    tools: optional list of Gemini tool declarations, e.g.
    [{"google_search": {}}] to enable Google Search grounding (used by enrich).
    thinking_budget: pass 0 to DISABLE reasoning on flash models. Gemini flash
    turns thinking ON by default; for short-output TEXT tasks the reasoning eats
    the maxOutputTokens budget and the visible answer comes back truncated (a
    2-sentence bio degraded to just the athlete's name). Left None for the
    PDF/image vision parser, which uses a large budget and benefits from it.
    Returns raw dict."""
    gen = {"maxOutputTokens": max_tokens}
    if thinking_budget is not None:
        gen["thinkingConfig"] = {"thinkingBudget": thinking_budget}
    url = f"{GEMINI_BASE}/models/{model}:generateContent?key={key}"
    payload = {"contents": [{"parts": parts}], "generationConfig": gen}
    if tools:
        payload["tools"] = tools
    headers = {"Content-Type": "application/json"}
    return _post_json(url, payload, headers, timeout)


def gemini_text(resp):
    try:
        parts = resp["candidates"][0]["content"]["parts"]
        return "".join(p.get("text", "") for p in parts)
    except (KeyError, IndexError, TypeError):
        return ""


# ── high-level convenience: route a text task, fall back to Anthropic Sonnet ──
def complete_text(task, prompt, max_tokens, timeout=20):
    """Run a single-prompt text task through its routed provider.

    On ANY provider error, transparently retries on Anthropic Sonnet 5 so
    nothing ever degrades to "no AI". Returns (text, model_used, fallback_error)
    where fallback_error is None on the happy path, or the primary provider's
    error string when the call fell back to Anthropic (for diagnostics — not
    secret).
    """
    cfg = route(task)
    # Force English for the prose tasks. Flash otherwise drifts into the language
    # of the source data — foreign-named regattas rendered an athlete's overview
    # in Spanish. Left off filter/nat (structured/JSON output).
    if task in ("overview", "hover"):
        prompt = ("Respond in English only, regardless of the language of any "
                  "names, competitions, or places mentioned below.\n\n") + prompt
    messages = [{"role": "user", "content": prompt}]

    try:
        if cfg["provider"] == "anthropic":
            key = os.environ.get("ANTHROPIC_API_KEY", "")
            resp = call_anthropic(key, cfg["model"], messages, max_tokens,
                                  timeout=timeout)
            return anthropic_text(resp), cfg["model"], None
        if cfg["provider"] == "gemini":
            # thinking_budget=0: short text blurbs — reasoning would consume the
            # token budget and truncate the answer (main's bio-truncation fix).
            resp = call_gemini(_gemini_key(), cfg["model"], [{"text": prompt}],
                               max_tokens=max_tokens, timeout=timeout,
                               thinking_budget=0)
            return gemini_text(resp), cfg["model"], None
        if cfg["provider"] == "openai":
            key = os.environ.get(cfg.get("key_env", ""), "")
            resp = call_openai_compat(cfg["base_url"], key, cfg["model"],
                                      messages, max_tokens, timeout=timeout)
            return openai_text(resp), cfg["model"], None
        fallback_error = f"unknown provider '{cfg['provider']}'"
    except LLMError as exc:
        fallback_error = f"{cfg['provider']}/{cfg['model']}: {exc}"

    # ── Anthropic Sonnet fallback ──
    akey = os.environ.get("ANTHROPIC_API_KEY", "")
    if not akey:
        raise LLMError("primary provider failed and ANTHROPIC_API_KEY not set")
    fb_model = _anthropic_fallback_model()
    resp = call_anthropic(akey, fb_model, messages, max_tokens, timeout=timeout)
    return anthropic_text(resp), fb_model, fallback_error
