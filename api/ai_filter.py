"""
AthLink AI filter — Vercel serverless function.
Routes filter/suggestion prompts to Claude API server-side
so the Anthropic API key is never exposed to the browser.
"""

from http.server import BaseHTTPRequestHandler
import json, os, sys

# Sibling import (same pattern parse_pdf.py uses for validate.py).
_API_DIR = os.path.dirname(os.path.abspath(__file__))
if _API_DIR not in sys.path:
    sys.path.insert(0, _API_DIR)
from llm import complete_text, LLMError

ANTHROPIC_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
# Haiku 4.5 is the universal fallback. Per-task routing (filter→Kimi,
# overview→DeepSeek, hover→Cerebras) lives in llm.py; a request with no `task`
# label routes to Anthropic, keeping older clients backward-compatible.
CLAUDE_MODEL = "claude-haiku-4-5"


class handler(BaseHTTPRequestHandler):

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_POST(self):
        if not ANTHROPIC_KEY:
            return self._respond(500, {"ok": False, "error": "ANTHROPIC_API_KEY not set in environment."})

        length = int(self.headers.get("Content-Length", 0))
        if not length:
            return self._respond(400, {"ok": False, "error": "Empty body."})

        try:
            body = json.loads(self.rfile.read(length))
        except Exception:
            return self._respond(400, {"ok": False, "error": "Invalid JSON."})

        prompt   = body.get("prompt", "")
        max_tok  = body.get("max_tokens", 400)
        task     = body.get("task")  # "filter"|"overview"|"hover" — absent → Anthropic
        debug    = body.get("debug")  # when truthy, surface the fallback reason

        if not prompt:
            return self._respond(400, {"ok": False, "error": "No prompt provided."})

        # complete_text routes to the per-task provider and transparently falls
        # back to Anthropic Haiku on any provider error, so we never hard-fail.
        try:
            text, model, fallback_error = complete_text(task, prompt, max_tok)
        except LLMError as exc:
            return self._respond(502, {"ok": False, "error": str(exc), "task": task})

        out = {"ok": True, "text": text, "model": model}
        if debug and fallback_error:
            out["fallback_error"] = fallback_error  # why the primary provider was skipped
        self._respond(200, out)

    # ── helpers ──────────────────────────────────────────────────────────
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin",  "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _respond(self, status, data):
        body = json.dumps(data).encode()
        self.send_response(status)
        self._cors()
        self.send_header("Content-Type",   "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_):
        pass
