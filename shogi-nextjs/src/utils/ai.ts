import { Board, Player, Move } from '@/types/shogi';
import { getPossibleMoves, isInCheck, isCheckmate } from './shogi';

// 駒の価値を定義
const PIECE_VALUES: Record<string, number> = {
  pawn: 1,
  lance: 3,
  knight: 4,
  silver: 6,
  gold: 7,
  bishop: 8,
  rook: 9,
  king: 1000,
  promoted_pawn: 6,
  promoted_lance: 6,
  promoted_knight: 6,
  promoted_silver: 7,
  promoted_bishop: 10,
  promoted_rook: 11
};

// 盤面評価
function evaluateBoard(board: Board, player: Player): number {
  let score = 0;
  
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      const piece = board[row][col];
      if (piece) {
        const value = PIECE_VALUES[piece.type] || 0;
        if (piece.player === player) {
          score += value;
        } else {
          score -= value;
        }
      }
    }
  }
  
  // 王手状態の評価
  if (isInCheck(board, player)) {
    score -= 50;
  }
  
  const opponent = player === 'sente' ? 'gote' : 'sente';
  if (isInCheck(board, opponent)) {
    score += 50;
  }
  
  // 詰みの評価
  if (isCheckmate(board, opponent)) {
    score += 10000;
  }
  
  if (isCheckmate(board, player)) {
    score -= 10000;
  }
  
  return score;
}

// 全ての合法手を取得
function getAllLegalMoves(board: Board, player: Player): Move[] {
  const moves: Move[] = [];
  
  for (let fromRow = 0; fromRow < 9; fromRow++) {
    for (let fromCol = 0; fromCol < 9; fromCol++) {
      const piece = board[fromRow][fromCol];
      if (piece && piece.player === player) {
        const possibleMoves = getPossibleMoves(board, { row: fromRow, col: fromCol }, piece);
        
        for (const to of possibleMoves) {
          // この手が自分の王を危険にさらさないかチェック
          const testBoard = board.map(row => [...row]);
          const capturedPiece = testBoard[to.row][to.col];
          testBoard[to.row][to.col] = piece;
          testBoard[fromRow][fromCol] = null;
          
          if (!isInCheck(testBoard, player)) {
            moves.push({
              from: { row: fromRow, col: fromCol },
              to: to,
              piece: piece.type,
              isCapture: !!capturedPiece,
              isPromotion: false // 簡単のため成りは考慮しない
            });
          }
        }
      }
    }
  }
  
  return moves;
}

// ミニマックス法でAIの手を決定
export function getAIMove(board: Board, player: Player, depth: number = 2): Move | null {
  const moves = getAllLegalMoves(board, player);
  
  if (moves.length === 0) {
    return null;
  }
  
  let bestMove = moves[0];
  let bestScore = -Infinity;
  
  for (const move of moves) {
    // 手を試す
    const testBoard = board.map(row => [...row]);
    const piece = testBoard[move.from!.row][move.from!.col];
    testBoard[move.to.row][move.to.col] = piece;
    testBoard[move.from!.row][move.from!.col] = null;
    
    // ミニマックスで評価
    const score = minimax(testBoard, depth - 1, false, player, -Infinity, Infinity);
    
    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }
  
  return bestMove;
}

// ミニマックス法の実装
function minimax(
  board: Board, 
  depth: number, 
  isMaximizing: boolean, 
  aiPlayer: Player,
  alpha: number,
  beta: number
): number {
  if (depth === 0) {
    return evaluateBoard(board, aiPlayer);
  }
  
  const currentPlayer = isMaximizing ? aiPlayer : (aiPlayer === 'sente' ? 'gote' : 'sente');
  const moves = getAllLegalMoves(board, currentPlayer);
  
  if (moves.length === 0) {
    // 手がない場合は評価値を返す
    return evaluateBoard(board, aiPlayer);
  }
  
  if (isMaximizing) {
    let maxScore = -Infinity;
    
    for (const move of moves) {
      const testBoard = board.map(row => [...row]);
      const piece = testBoard[move.from!.row][move.from!.col];
      testBoard[move.to.row][move.to.col] = piece;
      testBoard[move.from!.row][move.from!.col] = null;
      
      const score = minimax(testBoard, depth - 1, false, aiPlayer, alpha, beta);
      maxScore = Math.max(maxScore, score);
      alpha = Math.max(alpha, score);
      
      if (beta <= alpha) {
        break; // Alpha-Beta pruning
      }
    }
    
    return maxScore;
  } else {
    let minScore = Infinity;
    
    for (const move of moves) {
      const testBoard = board.map(row => [...row]);
      const piece = testBoard[move.from!.row][move.from!.col];
      testBoard[move.to.row][move.to.col] = piece;
      testBoard[move.from!.row][move.from!.col] = null;
      
      const score = minimax(testBoard, depth - 1, true, aiPlayer, alpha, beta);
      minScore = Math.min(minScore, score);
      beta = Math.min(beta, score);
      
      if (beta <= alpha) {
        break; // Alpha-Beta pruning
      }
    }
    
    return minScore;
  }
}