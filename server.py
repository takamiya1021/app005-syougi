from __future__ import annotations

import json
import os
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse
from typing import Any, Dict, Optional, Tuple

from shogi_ai.board import State, SENTE, GOTE, PAWN, LANCE, KNIGHT, SILVER, GOLD, BISHOP, ROOK
from shogi_ai.search import Searcher


GAME: Dict[str, Any] = {
    "state": State.initial(),
    "ai_side": GOTE,
    "search": Searcher(max_depth=3),
}

PIECE_TO_LETTER = {PAWN: "P", LANCE: "L", KNIGHT: "N", SILVER: "S", GOLD: "G", BISHOP: "B", ROOK: "R"}


def move_to_usi(st: State, mv: Tuple[int, int, int, int, bool, Optional[int]]) -> str:
    fx, fy, tx, ty, prom, drop = mv
    if drop:
        return f"{PIECE_TO_LETTER[drop]}*{State.xy_to_usi(tx, ty)}"
    s = State.xy_to_usi(fx, fy) + State.xy_to_usi(tx, ty)
    if prom:
        s += "+"
    return s


def serialize_state(st: State) -> Dict[str, Any]:
    return {
        "board": st.board,
        "side": st.side,
        "hands": {str(SENTE): st.hands[SENTE], str(GOTE): st.hands[GOTE]},
        "legal": [move_to_usi(st, mv) for mv in st.legal_moves()],
        "over": st.is_game_over(),
    }


class Handler(SimpleHTTPRequestHandler):
    # ルートをこのリポ直下に。static/ と templates/ を明示対応
    def translate_path(self, path: str) -> str:
        # / -> templates/index.html
        if path == "/":
            return os.path.join(os.getcwd(), 'templates', 'index.html')
        if path.startswith('/static/'):
            return os.path.join(os.getcwd(), path.lstrip('/'))
        if path.startswith('/templates/'):
            return os.path.join(os.getcwd(), path.lstrip('/'))
        return os.path.join(os.getcwd(), path.lstrip('/'))

    def _json(self, code: int, obj: Any):
        data = json.dumps(obj).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == '/api/state':
            self._json(200, serialize_state(GAME["state"]))
            return
        if parsed.path == '/api/config':
            self._json(200, {"ai_side": "sente" if GAME["ai_side"] == SENTE else "gote", "ai_depth": GAME["search"].max_depth})
            return
        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        length = int(self.headers.get('Content-Length', '0'))
        raw = self.rfile.read(length) if length > 0 else b''
        try:
            body = json.loads(raw.decode('utf-8')) if raw else {}
        except Exception:
            body = {}
        if parsed.path == '/api/reset':
            GAME["state"] = State.initial()
            return self._json(200, {"ok": True, "state": serialize_state(GAME["state"])})
        if parsed.path == '/api/config':
            ai_side = body.get('ai_side')
            if ai_side in ('sente', 'gote'):
                GAME['ai_side'] = SENTE if ai_side == 'sente' else GOTE
            depth = body.get('ai_depth')
            if isinstance(depth, int) and 1 <= depth <= 5:
                GAME['search'] = Searcher(max_depth=depth)
            return self._json(200, {"ok": True})
        if parsed.path == '/api/move':
            usi = (body.get('usi') or '').strip()
            if not usi:
                return self._json(400, {"ok": False, "error": "missing usi"})
            st: State = GAME['state']
            try:
                mv = st.parse_usi(usi)
                st.push(mv)
            except Exception as e:
                return self._json(400, {"ok": False, "error": str(e)})
            return self._json(200, {"ok": True, "state": serialize_state(st)})
        if parsed.path == '/api/ai_move':
            st: State = GAME['state']
            if st.is_game_over():
                return self._json(400, {"ok": False, "error": "game over"})
            if st.side != GAME['ai_side']:
                return self._json(400, {"ok": False, "error": "not AI side"})
            mv = GAME['search'].choose(st, time_budget=1.5)
            if mv is None:
                return self._json(400, {"ok": False, "error": "no move"})
            st.push(mv)
            return self._json(200, {"ok": True, "move": move_to_usi(st, mv), "state": serialize_state(st)})
        # 未対応
        return self._json(404, {"ok": False, "error": "not found"})


def main():
    port = int(os.environ.get('PORT', '8000'))
    httpd = HTTPServer(('0.0.0.0', port), Handler)
    print(f"Serving on http://localhost:{port}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()

