from __future__ import annotations

import time
import math
from typing import Optional, Tuple, Dict

from .board import State, SENTE, GOTE, KING, piece_base


PIECE_VALUES = {
    1: 100,   # P
    2: 300,   # L
    3: 320,   # N
    4: 450,   # S
    5: 500,   # G
    6: 800,   # B
    7: 1000,  # R
    8: 0,     # K
    9: 500,   # +P ≈ G
    10: 500,  # +L
    11: 500,  # +N
    12: 500,  # +S
    13: 900,  # 馬
    14: 1200, # 竜
}


def evaluate(st: State) -> int:
    # 先手視点評価（正:先手良し）
    score = 0
    for x in range(9):
        for y in range(9):
            p = st.board[x][y]
            if p == 0:
                continue
            score += (1 if p>0 else -1) * PIECE_VALUES[abs(p)]
    # 手駒
    for side in (SENTE,GOTE):
        sgn = 1 if side==SENTE else -1
        for base,cnt in st.hands[side].items():
            score += sgn * PIECE_VALUES[base] * cnt
    return score


class Searcher:
    def __init__(self, max_depth:int=3):
        self.max_depth = max_depth
        self.nodes = 0
        self.tt: Dict[str, Tuple[int,int]] = {}  # key -> (depth, value)
        self.end_time = 0.0

    def choose(self, st: State, time_budget: float) -> Optional[Tuple[int,int,int,int,bool,Optional[int]]]:
        legal = st.legal_moves()
        if not legal:
            return None
        self.nodes = 0
        self.tt.clear()
        self.end_time = time.time() + time_budget
        best = legal[0]
        best_val = -math.inf
        for depth in range(1, self.max_depth+1):
            val, mv = self._search_root(st, depth)
            if mv is not None:
                best = mv
                best_val = val
            if time.time() > self.end_time:
                break
        return best

    def _search_root(self, st: State, depth:int):
        best_val = -math.inf
        best_mv = None
        moves = st.legal_moves()
        # 簡易ソート: 取り、成り優先
        def mv_key(m):
            fx,fy,tx,ty,prom,drop = m
            score = 0
            if drop:
                score += 10
            else:
                if st.board[tx][ty] != 0:
                    score += 100 + abs(st.board[tx][ty])
                if prom:
                    score += 20
            return -score
        moves.sort(key=mv_key)
        for mv in moves:
            if time.time() > self.end_time:
                break
            child = st.clone()
            child.push(mv)
            val = -self._alphabeta(child, depth-1, -math.inf, math.inf)
            if val > best_val:
                best_val = val
                best_mv = mv
        return best_val, best_mv

    def _alphabeta(self, st: State, depth:int, alpha:float, beta:float) -> int:
        self.nodes += 1
        if time.time() > self.end_time:
            return evaluate(st)
        end = st.is_game_over()
        if end == "lose":
            return -100000 + (3 - depth)
        if end == "draw":
            return 0
        if depth == 0:
            return evaluate(st)
        key = st.key()
        if key in self.tt and self.tt[key][0] >= depth:
            return self.tt[key][1]
        val = -math.inf
        moves = st.legal_moves()
        if not moves:
            return evaluate(st)
        # 同様に軽いソート
        def mv_key(m):
            fx,fy,tx,ty,prom,drop = m
            score = 0
            if drop:
                score += 10
            else:
                if st.board[tx][ty] != 0:
                    score += 100 + abs(st.board[tx][ty])
                if prom:
                    score += 20
            return -score
        moves.sort(key=mv_key)
        for mv in moves:
            child = st.clone()
            child.push(mv)
            val = max(val, -self._alphabeta(child, depth-1, -beta, -alpha))
            alpha = max(alpha, val)
            if alpha >= beta:
                break
        self.tt[key] = (depth, val)
        return val

