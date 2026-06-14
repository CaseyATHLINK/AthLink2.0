"""
AthLink AI filter — Vercel serverless function.
Routes filter/suggestion prompts to Claude API server-side
so the Anthropic API key is never exposed to the browser.
"""

from http.server import BaseHTTPRequestHandler
import json, os

try:
    import urllib.request as urlreq
    import urllib.error as urlerr
except ImportError:
    urlreq = None
    urlerr = None

ANTHROPIC_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
# Haiku 4.5: fast + cheap, ideal for short summaries fired on every hover.
# For richer full-profile prose you could swap to "claude-sonnet-4-6".
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

        if not prompt:
            return self._respond(400, {"ok": False, "error": "No prompt provided."})

        payload = json.dumps({
            "model": CLAUDE_MODEL,
            "max_tokens": max_tok,
            "messages": [{"role": "user", "content": prompt}],
        }).encode()

        req = urlreq.Request(
            "https://api.anthropic.com/v1/messages",
            data=payload,
            headers={
                "Content-Type":      "application/json",
                "x-api-key":         ANTHROPIC_KEY,
                "anthropic-version": "2023-06-01",
            },
            method="POST",
        )

        try:
            with urlreq.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read())
        except urlerr.HTTPError as exc:
            # Surface Anthropic's actual error message, not just the status line.
            try:
                detail = json.loads(exc.read())
                msg = detail.get("error", {}).get("message", str(detail))
            except Exception:
                msg = exc.reason or str(exc)
            return self._respond(502, {"ok": False, "error": f"Anthropic {exc.code}: {msg}", "model": CLAUDE_MODEL})
        except Exception as exc:
            return self._respond(502, {"ok": False, "error": str(exc), "model": CLAUDE_MODEL})

        text = "".join(
            b.get("text", "") for b in data.get("content", [])
            if b.get("type") == "text"
        )
        self._respond(200, {"ok": True, "text": text})

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
