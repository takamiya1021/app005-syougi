from __future__ import annotations

# シンプルで正確な将棋ルール実装（持ち駒・成り・二歩・打ち歩詰め対応）
# 盤座標は (file(0..8), rank(0..8)) で先手側から見て右上を(0,0)。

from dataclasses import dataclass
from typing import List, Tuple, Optional, Dict, Iterable

FILES = 9
RANKS = 9

# 駒ID（先手は+1, 後手は-1を掛ける）
PAWN = 1
LANCE = 2
KNIGHT = 3
SILVER = 4
GOLD = 5
BISHOP = 6
ROOK = 7
KING = 8

PROM_PAWN = 9
PROM_LANCE = 10
PROM_KNIGHT = 11
PROM_SILVER = 12
HORSE = 13  # 角成
DRAGON = 14  # 飛成

PIECE_NAMES_JP = {
    PAWN: "歩",
    LANCE: "香",
    KNIGHT: "桂",
    SILVER: "銀",
    GOLD: "金",
    BISHOP: "角",
    ROOK: "飛",
    KING: "玉",
    PROM_PAWN: "と",
    PROM_LANCE: "成香",
    PROM_KNIGHT: "成桂",
    PROM_SILVER: "成銀",
    HORSE: "馬",
    DRAGON: "竜",
}

# 先後
SENTE = 1
GOTE = -1


def in_board(x: int, y: int) -> bool:
    return 0 <= x < FILES and 0 <= y < RANKS


def promo_zone(player: int) -> range:
    # 先手は上段3段（y=0,1,2）、後手は下段3段（y=6,7,8）
    return range(0, 3) if player == SENTE else range(6, 9)


def piece_base(p: int) -> int:
    a = abs(p)
    if a in (PROM_PAWN, PROM_LANCE, PROM_KNIGHT, PROM_SILVER):
        return {PROM_PAWN: PAWN, PROM_LANCE: LANCE, PROM_KNIGHT: KNIGHT, PROM_SILVER: SILVER}[a]
    if a in (HORSE, DRAGON):
        return {HORSE: BISHOP, DRAGON: ROOK}[a]
    return a


def can_promote(piece: int) -> bool:
    a = abs(piece)
    return a in (PAWN, LANCE, KNIGHT, SILVER, BISHOP, ROOK)


def to_promoted(piece: int) -> int:
    s = 1 if piece > 0 else -1
    a = abs(piece)
    prom = {
        PAWN: PROM_PAWN,
        LANCE: PROM_LANCE,
        KNIGHT: PROM_KNIGHT,
        SILVER: PROM_SILVER,
        BISHOP: HORSE,
        ROOK: DRAGON,
    }[a]
    return s * prom


def is_promoted(piece: int) -> bool:
    return abs(piece) in (PROM_PAWN, PROM_LANCE, PROM_KNIGHT, PROM_SILVER, HORSE, DRAGON)


def gold_like(piece: int) -> bool:
    return abs(piece) in (GOLD, PROM_PAWN, PROM_LANCE, PROM_KNIGHT, PROM_SILVER)


Move = Tuple[int, int, int, int, bool, Optional[int]]
# (from_x, from_y, to_x, to_y, promote, drop_piece)
# drop の場合: from_x/from_y は -1、drop_piece は +種別（先手視点）


@dataclass
class State:
    board: List[List[int]]  # 先手正で駒符号、後手は負
    side: int               # SENTE or GOTE
    hands: Dict[int, Dict[int, int]]  # hands[side][base_piece] = count（成りは原種換算）
    history: List[Tuple[str, int]]    # (hash_key, repeats)

    @staticmethod
    def initial() -> "State":
        # 標準初期配置
        B = [[0 for _ in range(RANKS)] for _ in range(FILES)]
        def put(x, y, p):
            B[x][y] = p
        # 先手下、後手上（y=0が後手陣）
        # 上段（後手）
        for x in range(FILES):
            put(x, 2, -PAWN)
        put(0, 0, -LANCE); put(8, 0, -LANCE)
        put(1, 0, -KNIGHT); put(7, 0, -KNIGHT)
        put(2, 0, -SILVER); put(6, 0, -SILVER)
        put(3, 0, -GOLD); put(5, 0, -GOLD)
        put(4, 0, -KING)
        put(1, 1, -BISHOP)
        put(7, 1, -ROOK)
        # 下段（先手）
        for x in range(FILES):
            put(x, 6, PAWN)
        put(0, 8, LANCE); put(8, 8, LANCE)
        put(1, 8, KNIGHT); put(7, 8, KNIGHT)
        put(2, 8, SILVER); put(6, 8, SILVER)
        put(3, 8, GOLD); put(5, 8, GOLD)
        put(4, 8, KING)
        put(7, 7, BISHOP)
        put(1, 7, ROOK)
        st = State(B, SENTE, {SENTE: {}, GOTE: {}}, [])
        st._push_history()
        return st

    def clone(self) -> "State":
        B = [col[:] for col in self.board]
        hands = {SENTE: dict(self.hands[SENTE]), GOTE: dict(self.hands[GOTE])}
        hist = list(self.history)
        return State(B, self.side, hands, hist)

    # --- 盤面表示 ---
    def render(self) -> str:
        lines = []
        lines.append("  ９ ８ ７ ６ ５ ４ ３ ２ １")
        for y in range(RANKS):
            row = []
            for x in range(FILES-1, -1, -1):
                p = self.board[x][y]
                if p == 0:
                    row.append("・")
                else:
                    s = "▲" if p > 0 else "△"
                    row.append(s + PIECE_NAMES_JP[abs(p)])
            lines.append(f"{y+1} " + " ".join(row))
        def hand_str(side):
            items = []
            for base in (ROOK,BISHOP,GOLD,SILVER,KNIGHT,LANCE,PAWN):
                c = self.hands[side].get(base,0)
                if c:
                    items.append(f"{PIECE_NAMES_JP[base]}{c}")
            return " ".join(items) or "(なし)"
        lines.append(f"先手持ち駒: {hand_str(SENTE)}")
        lines.append(f"後手持ち駒: {hand_str(GOTE)}")
        lines.append(f"手番: {'先手' if self.side==SENTE else '後手'}")
        return "\n".join(lines)

    # --- ハッシュ（簡易、局面同一判定用）---
    def key(self) -> str:
        rows = []
        for y in range(RANKS):
            row = []
            for x in range(FILES):
                row.append(str(self.board[x][y]))
            rows.append(",".join(row))
        h = ["/".join(rows), str(self.side)]
        for s in (SENTE, GOTE):
            parts = [f"{k}:{self.hands[s].get(k,0)}" for k in (PAWN,LANCE,KNIGHT,SILVER,GOLD,BISHOP,ROOK)]
            h.append("|".join(parts))
        return "#".join(h)

    def _push_history(self):
        k = self.key()
        cnt = 1
        if self.history and self.history[-1][0] == k:
            cnt = self.history[-1][1] + 1
            self.history[-1] = (k, cnt)
        else:
            self.history.append((k, 1))

    # --- 王位置・利き ---
    def king_pos(self, side: int) -> Tuple[int,int]:
        target = KING * side
        for x in range(FILES):
            for y in range(RANKS):
                if self.board[x][y] == target:
                    return (x,y)
        raise RuntimeError("king not found")

    def attacks(self, x: int, y: int, attacker_side: int) -> bool:
        # (x,y) が attacker_side の駒で利かされるか
        for mx,my,_ in self._generate_pseudo_from_side(attacker_side):
            if mx == x and my == y:
                return True
        return False

    # --- 疑似合法手生成（王手放置は未考慮）---
    def _step_moves(self, x: int, y: int, piece: int) -> Iterable[Tuple[int,int]]:
        s = 1 if piece > 0 else -1
        a = abs(piece)
        dirs = []
        if a == KING or a == HORSE or a == DRAGON or gold_like(piece) or a == SILVER:
            if a == SILVER:
                dirs = [(0,-1*s),(-1,-1*s),(1,-1*s),(-1,1*s),(1,1*s)]
            elif gold_like(piece):
                dirs = [(0,-1*s),(-1,-1*s),(1,-1*s),(-1,0),(1,0),(0,1*s)]
            elif a == KING:
                dirs = [(-1,-1), (0,-1), (1,-1), (-1,0), (1,0), (-1,1), (0,1), (1,1)]
            elif a == HORSE:
                dirs = [(-1,-1), (0,-1), (1,-1), (-1,0), (1,0), (-1,1), (0,1), (1,1)]
            elif a == DRAGON:
                dirs = [(-1,-1), (1,-1), (-1,1), (1,1)]
            for dx,dy in dirs:
                tx,ty = x+dx, y+dy
                if in_board(tx,ty):
                    yield (tx,ty)
        if a == KNIGHT:
            for dx in (-1,1):
                tx,ty = x+dx, y-2*s
                if in_board(tx,ty):
                    yield (tx,ty)
        if a in (PAWN, LANCE):
            tx,ty = x, y-1*s
            if in_board(tx,ty):
                yield (tx,ty)

    def _rays(self, x:int, y:int, piece:int) -> Iterable[Tuple[int,int]]:
        a = abs(piece)
        s = 1 if piece>0 else -1
        if a in (BISHOP, HORSE):
            for dx,dy in [(-1,-1),(1,-1),(-1,1),(1,1)]:
                tx,ty = x+dx, y+dy
                while in_board(tx,ty):
                    yield (tx,ty)
                    if self.board[tx][ty] != 0:
                        break
                    tx += dx; ty += dy
        if a in (ROOK, DRAGON):
            for dx,dy in [(-1,0),(1,0),(0,-1),(0,1)]:
                tx,ty = x+dx, y+dy
                while in_board(tx,ty):
                    yield (tx,ty)
                    if self.board[tx][ty] != 0:
                        break
                    tx += dx; ty += dy
        if a == LANCE:
            dx,dy = 0, -1*s
            tx,ty = x+dx, y+dy
            while in_board(tx,ty):
                yield (tx,ty)
                if self.board[tx][ty] != 0:
                    break
                tx += dx; ty += dy

    def _generate_pseudo_moves(self, side: int) -> List[Move]:
        moves: List[Move] = []
        for x in range(FILES):
            for y in range(RANKS):
                p = self.board[x][y]
                if p * side <= 0:
                    continue
                # step-like
                for tx,ty in self._step_moves(x,y,p):
                    tp = self.board[tx][ty]
                    if tp * side > 0:
                        continue
                    promote = False
                    # 成り可能判定
                    if can_promote(p) and (y in promo_zone(side) or ty in promo_zone(side)):
                        # 成り/不成の両手を後で分岐
                        moves.append((x,y,tx,ty,True,None))
                        # 強制成り（不成不可）: 歩香は最終段、桂は最終2段
                        force_promote = (
                            (abs(p) in (PAWN, LANCE) and ty == (0 if side == SENTE else 8)) or
                            (abs(p) == KNIGHT and ((ty in (0, 1)) if side == SENTE else (ty in (7, 8))))
                        )
                        if not force_promote:
                            moves.append((x,y,tx,ty,False,None))
                    else:
                        moves.append((x,y,tx,ty,False,None))
                # rays
                if abs(p) in (BISHOP,ROOK,LANCE,HORSE,DRAGON):
                    for tx,ty in self._rays(x,y,p):
                        tp = self.board[tx][ty]
                        if tp * side > 0:
                            continue
                        if can_promote(p) and (y in promo_zone(side) or ty in promo_zone(side)):
                            moves.append((x,y,tx,ty,True,None))
                            # 強制成り判定（ここで対象は実質香）
                            force_promote = (
                                (abs(p) in (PAWN, LANCE) and ty == (0 if side == SENTE else 8))
                            )
                            if not force_promote:
                                moves.append((x,y,tx,ty,False,None))
                        else:
                            moves.append((x,y,tx,ty,False,None))
        # 打ち
        for piece_base_id, cnt in self.hands[side].items():
            if cnt <= 0:
                continue
            for x in range(FILES):
                for y in range(RANKS):
                    if self.board[x][y] != 0:
                        continue
                    # 置けない段
                    if piece_base_id == PAWN or piece_base_id == LANCE:
                        if y == (0 if side==SENTE else 8):
                            continue
                    if piece_base_id == KNIGHT:
                        if y in ((0,1) if side==SENTE else (7,8)):
                            continue
                    # 二歩
                    if piece_base_id == PAWN:
                        if self._has_unpromoted_pawn_on_file(side, x):
                            continue
                    moves.append((-1,-1,x,y,False,piece_base_id))
        return moves

    def _has_unpromoted_pawn_on_file(self, side:int, file_x:int) -> bool:
        for y in range(RANKS):
            p = self.board[file_x][y]
            if p * side > 0 and abs(p) == PAWN:
                return True
        return False

    def _generate_pseudo_from_side(self, side:int) -> Iterable[Tuple[int,int,bool]]:
        # 攻撃先座標列挙（駒種の利きを見る用途）
        for x in range(FILES):
            for y in range(RANKS):
                p = self.board[x][y]
                if p * side <= 0:
                    continue
                a = abs(p)
                # step-like
                for tx,ty in self._step_moves(x,y,p):
                    tp = self.board[tx][ty]
                    if tp * side > 0:
                        continue
                    yield (tx,ty,False)
                # rays
                if a in (BISHOP,ROOK,LANCE,HORSE,DRAGON):
                    for tx,ty in self._rays(x,y,p):
                        tp = self.board[tx][ty]
                        if tp * side > 0:
                            continue
                        yield (tx,ty,False)

    # --- 合法手生成 ---
    def legal_moves(self) -> List[Move]:
        moves = []
        for mv in self._generate_pseudo_moves(self.side):
            if self._is_legal(mv):
                moves.append(mv)
        return moves

    def _is_legal(self, mv: Move) -> bool:
        # 自玉放置NG + 打ち歩詰めNG
        st = self.clone()
        st._apply(mv)
        kx,ky = st.king_pos(self.side)
        if st.attacks(kx,ky,-self.side):
            return False
        # 打ち歩詰め
        if mv[5] == PAWN:
            # 直後に相手玉が詰みか？
            if st.is_checkmate(-self.side):
                return False
        return True

    def is_checkmate(self, side:int) -> bool:
        # side が詰まされているか（合合法手なし、かつ王手）
        kx,ky = self.king_pos(side)
        if not self.attacks(kx,ky,-side):
            return False
        # 合法手が一つでもあれば詰みでない
        for mv in self._generate_pseudo_moves(side):
            st = self.clone()
            st.side = side
            st._apply(mv)
            kx2,ky2 = st.king_pos(side)
            if not st.attacks(kx2,ky2,-side):
                # 打ち歩詰め判定は不要（side側の合法性）
                return False
        return True

    # --- 指し手適用/巻き戻し（巻き戻しは簡略化せず都度cloneで対処） ---
    def _apply(self, mv: Move) -> None:
        fx,fy,tx,ty,prom,drop = mv
        side = self.side
        if drop:
            # 手駒消費
            self.hands[side][drop] = self.hands[side].get(drop,0)-1
            if self.hands[side][drop] == 0:
                del self.hands[side][drop]
            p = drop * side
            self.board[tx][ty] = p
        else:
            p = self.board[fx][fy]
            cap = self.board[tx][ty]
            # 取った駒は手駒（不成に戻す）
            if cap != 0:
                base = piece_base(cap)
                self.hands[side][base] = self.hands[side].get(base,0)+1
            self.board[fx][fy] = 0
            if prom:
                p = to_promoted(p)
            self.board[tx][ty] = p
        self.side = -self.side
        self._push_history()

    def push(self, mv: Move) -> None:
        # 事前に合法手集合に含まれるかチェック（強制成り等を担保）
        if mv not in self.legal_moves():
            raise ValueError("illegal move")
        self._apply(mv)

    # --- USI入出力 ---
    @staticmethod
    def usi_to_xy(sq: str) -> Tuple[int,int]:
        # 例: '7g' → x=2（0左→右8), y=6（0上→下8）
        file = int(sq[0])  # 1..9（右→左）
        rank = sq[1]       # a..i（上→下）
        file_idx = 9 - file
        rank_idx = ord(rank) - ord('a')
        return file_idx, rank_idx

    @staticmethod
    def xy_to_usi(x:int,y:int) -> str:
        file = 9 - x
        rank = chr(ord('a') + y)
        return f"{file}{rank}"

    def parse_usi(self, usi: str) -> Move:
        usi = usi.strip()
        # 打ち 'P*7f'
        if '*' in usi:
            pch, dst = usi.split('*')
            base = {'P':PAWN,'L':LANCE,'N':KNIGHT,'S':SILVER,'G':GOLD,'B':BISHOP,'R':ROOK}[pch.upper()]
            x,y = self.usi_to_xy(dst)
            return (-1,-1,x,y,False,base)
        # 通常 '7g7f' + 成りは末尾'+'
        promote = usi.endswith('+')
        if promote:
            usi = usi[:-1]
        src = usi[:2]; dst = usi[2:]
        fx,fy = self.usi_to_xy(src)
        tx,ty = self.usi_to_xy(dst)
        return (fx,fy,tx,ty,promote,None)

    # --- ゲーム状態 ---
    def is_game_over(self) -> Optional[str]:
        # 千日手（4回同一局面）
        key = self.key()
        repeats = sum(1 for k,c in self.history if k == key)
        if repeats >= 4:
            return "draw"
        # 合法手がない
        if not self.legal_moves():
            # 王手がかかってるなら負け
            kx,ky = self.king_pos(self.side)
            if self.attacks(kx,ky,-self.side):
                return "lose"
            return "stall"  # 原則起きない
        return None
