from __future__ import annotations

import os
from typing import Any, Dict, List, Optional, Tuple

from flask import Flask, jsonify, request, render_template, send_from_directory

from shogi_ai.board import State, SENTE, GOTE, PAWN, LANCE, KNIGHT, SILVER, GOLD, BISHOP, ROOK
from shogi_ai.search import Searcher


app = Flask(__name__)


# 単一対局のインメモリ状態（最小実装）
GAME: Dict[str, Any] = {
    "state": State.initial(),
    "ai_side": GOTE,  # 先手:人間 / 後手:AI をデフォルトに
    "search": Searcher(max_depth=3),
}


PIECE_TO_LETTER = {
    PAWN: "P",
    LANCE: "L",
    KNIGHT: "N",
    SILVER: "S",
    GOLD: "G",
    BISHOP: "B",
    ROOK: "R",
}


def move_to_usi(st: State, mv: Tuple[int, int, int, int, bool, Optional[int]]) -> str:
    fx, fy, tx, ty, prom, drop = mv
    if drop:
        return f"{PIECE_TO_LETTER[drop]}*{State.xy_to_usi(tx, ty)}"
    s = State.xy_to_usi(fx, fy) + State.xy_to_usi(tx, ty)
    if prom:
        s += "+"
    return s


def serialize_state(st: State) -> Dict[str, Any]:
    # そのまま配列で返す（フロントで描画）
    legal_usi = [move_to_usi(st, mv) for mv in st.legal_moves()]
    return {
        "board": st.board,
        "side": st.side,
        "hands": {
            str(SENTE): st.hands[SENTE],
            str(GOTE): st.hands[GOTE],
        },
        "legal": legal_usi,
        "over": st.is_game_over(),
    }


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/state")
def api_state():
    st: State = GAME["state"]
    return jsonify(serialize_state(st))


@app.route("/api/reset", methods=["POST"])
def api_reset():
    GAME["state"] = State.initial()
    return jsonify({"ok": True, "state": serialize_state(GAME["state"])})


@app.route("/api/config", methods=["GET", "POST"])
def api_config():
    if request.method == "POST":
        data = request.get_json(silent=True) or {}
        ai_side = data.get("ai_side")
        if ai_side in ("sente", "gote"):
            GAME["ai_side"] = SENTE if ai_side == "sente" else GOTE
        depth = data.get("ai_depth")
        if isinstance(depth, int) and 1 <= depth <= 5:
            GAME["search"] = Searcher(max_depth=depth)
    return jsonify({
        "ai_side": "sente" if GAME["ai_side"] == SENTE else "gote",
        "ai_depth": GAME["search"].max_depth,
    })


@app.route("/api/move", methods=["POST"])
def api_move():
    data = request.get_json(silent=True) or {}
    usi = data.get("usi", "").strip()
    if not usi:
        return jsonify({"ok": False, "error": "missing usi"}), 400
    st: State = GAME["state"]
    try:
        mv = st.parse_usi(usi)
        st.push(mv)
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 400
    return jsonify({"ok": True, "state": serialize_state(st)})


@app.route("/api/ai_move", methods=["POST"])
def api_ai_move():
    st: State = GAME["state"]
    if st.is_game_over():
        return jsonify({"ok": False, "error": "game over"}), 400
    if st.side != GAME["ai_side"]:
        return jsonify({"ok": False, "error": "not AI side"}), 400
    search: Searcher = GAME["search"]
    mv = search.choose(st, time_budget=1.5)
    if mv is None:
        return jsonify({"ok": False, "error": "no move"}), 400
    st.push(mv)
    return jsonify({"ok": True, "move": move_to_usi(st, mv), "state": serialize_state(st)})


@app.route('/static/<path:path>')
def send_static(path):
    # 直接静的ファイルを配信
    return send_from_directory('static', path)


def main():
    port = int(os.environ.get("PORT", "8000"))
    debug = os.environ.get("FLASK_DEBUG", "0") == "1"
    app.run(host="0.0.0.0", port=port, debug=debug)


if __name__ == "__main__":
    main()

