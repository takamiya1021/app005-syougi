import { Board, Piece, Position, PieceType, Player, GameState } from '@/types/shogi';

// 初期配置の盤面を作成
export function createInitialBoard(): Board {
  const board: Board = Array(9).fill(null).map(() => Array(9).fill(null));
  
  // 後手（相手側）の駒配置
  board[0][0] = { type: 'lance', player: 'gote' };
  board[0][1] = { type: 'knight', player: 'gote' };
  board[0][2] = { type: 'silver', player: 'gote' };
  board[0][3] = { type: 'gold', player: 'gote' };
  board[0][4] = { type: 'king', player: 'gote' };
  board[0][5] = { type: 'gold', player: 'gote' };
  board[0][6] = { type: 'silver', player: 'gote' };
  board[0][7] = { type: 'knight', player: 'gote' };
  board[0][8] = { type: 'lance', player: 'gote' };
  
  board[1][1] = { type: 'rook', player: 'gote' };
  board[1][7] = { type: 'bishop', player: 'gote' };
  
  // 歩兵
  for (let col = 0; col < 9; col++) {
    board[2][col] = { type: 'pawn', player: 'gote' };
    board[6][col] = { type: 'pawn', player: 'sente' };
  }
  
  // 先手（自分側）の駒配置
  board[7][1] = { type: 'bishop', player: 'sente' };
  board[7][7] = { type: 'rook', player: 'sente' };
  
  board[8][0] = { type: 'lance', player: 'sente' };
  board[8][1] = { type: 'knight', player: 'sente' };
  board[8][2] = { type: 'silver', player: 'sente' };
  board[8][3] = { type: 'gold', player: 'sente' };
  board[8][4] = { type: 'king', player: 'sente' };
  board[8][5] = { type: 'gold', player: 'sente' };
  board[8][6] = { type: 'silver', player: 'sente' };
  board[8][7] = { type: 'knight', player: 'sente' };
  board[8][8] = { type: 'lance', player: 'sente' };
  
  return board;
}

// 初期ゲーム状態を作成
export function createInitialGameState(): GameState {
  return {
    board: createInitialBoard(),
    currentPlayer: 'sente',
    captured: {
      sente: [],
      gote: []
    },
    moves: [],
    gameOver: false,
    winner: null
  };
}

// 駒の表示名を取得
export function getPieceDisplayName(piece: Piece): string {
  const names: Record<PieceType, string> = {
    pawn: '歩',
    lance: '香',
    knight: '桂',
    silver: '銀',
    gold: '金',
    bishop: '角',
    rook: '飛',
    king: piece.player === 'sente' ? '王' : '玉',
    promoted_pawn: 'と',
    promoted_lance: '成香',
    promoted_knight: '成桂',
    promoted_silver: '成銀',
    promoted_bishop: '馬',
    promoted_rook: '龍'
  };
  
  return names[piece.type];
}

// 位置が盤面内かどうかチェック
export function isValidPosition(pos: Position): boolean {
  return pos.row >= 0 && pos.row < 9 && pos.col >= 0 && pos.col < 9;
}

// 駒の移動が有効かどうかの基本チェック
export function isValidMove(
  board: Board,
  from: Position,
  to: Position,
  currentPlayer: Player
): boolean {
  if (!isValidPosition(from) || !isValidPosition(to)) {
    return false;
  }
  
  const piece = board[from.row][from.col];
  if (!piece || piece.player !== currentPlayer) {
    return false;
  }
  
  const targetPiece = board[to.row][to.col];
  if (targetPiece && targetPiece.player === currentPlayer) {
    return false; // 自分の駒は取れない
  }
  
  return canPieceMoveTo(board, piece, from, to);
}

// 各駒種の移動可能性をチェック
function canPieceMoveTo(board: Board, piece: Piece, from: Position, to: Position): boolean {
  const rowDiff = to.row - from.row;
  const colDiff = to.col - from.col;
  const absRowDiff = Math.abs(rowDiff);
  const absColDiff = Math.abs(colDiff);
  
  // 先手は上向き（-1）、後手は下向き（+1）
  const direction = piece.player === 'sente' ? -1 : 1;
  
  switch (piece.type) {
    case 'pawn':
      return rowDiff === direction && colDiff === 0;
    
    case 'lance':
      return colDiff === 0 && rowDiff * direction > 0 && isPathClear(board, from, to);
    
    case 'knight':
      return rowDiff === 2 * direction && absColDiff === 1;
    
    case 'silver':
      return (absRowDiff === 1 && absColDiff === 1) || (rowDiff === direction && colDiff === 0);
    
    case 'gold':
    case 'promoted_pawn':
    case 'promoted_lance':
    case 'promoted_knight':
    case 'promoted_silver':
      return (absRowDiff <= 1 && absColDiff <= 1) && !(rowDiff === -direction && absColDiff === 1);
    
    case 'bishop':
      return absRowDiff === absColDiff && absRowDiff > 0 && isPathClear(board, from, to);
    
    case 'promoted_bishop':
      return ((absRowDiff === absColDiff && absRowDiff > 0) || (absRowDiff <= 1 && absColDiff <= 1)) && 
             (absRowDiff === absColDiff ? isPathClear(board, from, to) : true);
    
    case 'rook':
      return ((rowDiff === 0 && colDiff !== 0) || (colDiff === 0 && rowDiff !== 0)) && 
             isPathClear(board, from, to);
    
    case 'promoted_rook':
      return (((rowDiff === 0 && colDiff !== 0) || (colDiff === 0 && rowDiff !== 0)) || 
             (absRowDiff <= 1 && absColDiff <= 1)) && 
             ((rowDiff === 0 || colDiff === 0) ? isPathClear(board, from, to) : true);
    
    case 'king':
      return absRowDiff <= 1 && absColDiff <= 1 && (absRowDiff > 0 || absColDiff > 0);
    
    default:
      return false;
  }
}

// パスが空いているかチェック（飛び駒用）
function isPathClear(board: Board, from: Position, to: Position): boolean {
  const rowStep = to.row > from.row ? 1 : to.row < from.row ? -1 : 0;
  const colStep = to.col > from.col ? 1 : to.col < from.col ? -1 : 0;
  
  let currentRow = from.row + rowStep;
  let currentCol = from.col + colStep;
  
  while (currentRow !== to.row || currentCol !== to.col) {
    if (board[currentRow][currentCol] !== null) {
      return false;
    }
    currentRow += rowStep;
    currentCol += colStep;
  }
  
  return true;
}

// 可能な移動先を取得
export function getPossibleMoves(board: Board, from: Position, piece: Piece): Position[] {
  const moves: Position[] = [];
  
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      const to: Position = { row, col };
      if (canPieceMoveTo(board, piece, from, to)) {
        const targetPiece = board[row][col];
        if (!targetPiece || targetPiece.player !== piece.player) {
          moves.push(to);
        }
      }
    }
  }
  
  return moves;
}

// 成ることができるかチェック
export function canPromote(piece: Piece, from: Position, to: Position): boolean {
  if (piece.type.startsWith('promoted_') || piece.type === 'gold' || piece.type === 'king') {
    return false;
  }
  
  const enemyZone = piece.player === 'sente' ? [0, 1, 2] : [6, 7, 8];
  
  return enemyZone.includes(from.row) || enemyZone.includes(to.row);
}

// 王手されているかチェック
export function isInCheck(board: Board, player: Player): boolean {
  // 王の位置を探す
  let kingPos: Position | null = null;
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      const piece = board[row][col];
      if (piece && piece.type === 'king' && piece.player === player) {
        kingPos = { row, col };
        break;
      }
    }
    if (kingPos) break;
  }
  
  if (!kingPos) return false;
  
  // 敵の駒が王を攻撃できるかチェック
  const enemyPlayer = player === 'sente' ? 'gote' : 'sente';
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      const piece = board[row][col];
      if (piece && piece.player === enemyPlayer) {
        if (canPieceMoveTo(board, piece, { row, col }, kingPos)) {
          return true;
        }
      }
    }
  }
  
  return false;
}

// 詰みかどうかチェック
export function isCheckmate(board: Board, player: Player): boolean {
  if (!isInCheck(board, player)) {
    return false;
  }
  
  // プレイヤーの全ての駒で全ての可能な移動を試す
  for (let fromRow = 0; fromRow < 9; fromRow++) {
    for (let fromCol = 0; fromCol < 9; fromCol++) {
      const piece = board[fromRow][fromCol];
      if (piece && piece.player === player) {
        const moves = getPossibleMoves(board, { row: fromRow, col: fromCol }, piece);
        
        for (const move of moves) {
          // 仮想的に移動してみる
          const testBoard = board.map(row => [...row]);
          testBoard[move.row][move.col] = piece;
          testBoard[fromRow][fromCol] = null;
          
          // この移動で王手が解除されるかチェック
          if (!isInCheck(testBoard, player)) {
            return false; // 詰みではない
          }
        }
      }
    }
  }
  
  return true; // すべての移動を試しても王手が解除されない = 詰み
}