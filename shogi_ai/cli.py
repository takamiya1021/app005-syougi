from __future__ import annotations

import argparse
import time
import sys

from .board import State
from .search import Searcher


def parse_args():
    ap = argparse.ArgumentParser()
    ap.add_argument('--time', type=int, default=300, help='持ち時間（秒）')
    ap.add_argument('--byoyomi', type=int, default=5, help='秒読み（秒）')
    ap.add_argument('--ai-level', type=int, default=2, help='AI深さ（0..3）')
    ap.add_argument('--human', choices=['sente','gote'], default='sente')
    return ap.parse_args()


def main():
    args = parse_args()
    st = State.initial()
    print("将棋CLI（USI風入力: 例 7g7f, P*7f, 7g7f+）")
    print("終了: 'quit'、合法手一覧: 'legal'")
    print(st.render())

    # クロック
    remain = {
        1: args.time,
        -1: args.time,
    }
    byoyomi = args.byoyomi

    human_side = 1 if args.human == 'sente' else -1
    search = Searcher(max_depth=max(1,min(5,args.ai_level+1)))

    while True:
        over = st.is_game_over()
        if over:
            if over == 'draw':
                print('千日手: 引き分け')
            elif over == 'lose':
                print('詰み: ' + ('先手負け' if st.side==1 else '後手負け'))
            else:
                print('終了: ', over)
            break

        side = st.side
        print(f"残り時間 先手:{remain[1]}s 後手:{remain[-1]}s")
        if side == human_side:
            # ユーザ入力
            start = time.time()
            try:
                s = input(('先手' if side==1 else '後手') + 'の手 > ').strip()
            except EOFError:
                print()
                return
            if s in ('quit','exit'):
                print('対局終了')
                return
            if s == 'legal':
                print('合法手:')
                for mv in st.legal_moves():
                    fx,fy,tx,ty,prom,drop = mv
                    if drop:
                        pm = {1:'P',2:'L',3:'N',4:'S',5:'G',6:'B',7:'R'}
                        print(f" {pm[drop]}*{State.xy_to_usi(tx,ty)}")
                    else:
                        u = State.xy_to_usi(fx,fy)+State.xy_to_usi(tx,ty)+('+' if prom else '')
                        print(' ',u)
                continue
            try:
                mv = st.parse_usi(s)
                st.push(mv)
            except Exception as e:
                print('指し手エラー:', e)
                continue
            elapsed = time.time() - start
            # 時間更新
            consume = max(0, int(elapsed) - byoyomi)
            remain[side] -= max(0, consume)
        else:
            # AI手番
            print('AI思考中...')
            start = time.time()
            time_budget = max(0.1, min(3.0, remain[side] * 0.05 + byoyomi))
            mv = search.choose(st, time_budget=time_budget)
            if mv is None:
                print('パス/投了')
                return
            st.push(mv)
            elapsed = time.time() - start
            consume = max(0, int(elapsed) - byoyomi)
            remain[side] -= max(0, consume)

        print(st.render())
        if remain[side] <= 0:
            print(('先手' if side==1 else '後手') + 'の時間切れ負け')
            break


if __name__ == '__main__':
    main()
