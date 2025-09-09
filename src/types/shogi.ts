// 将棋の基本型定義

export type Player = 'sente' | 'gote';

export type PieceType = 
  | 'pawn' | 'lance' | 'knight' | 'silver' | 'gold' | 'bishop' | 'rook' | 'king'
  | 'promoted_pawn' | 'promoted_lance' | 'promoted_knight' | 'promoted_silver' 
  | 'promoted_bishop' | 'promoted_rook';

export interface Piece {
  type: PieceType;
  player: Player;
}

export interface Position {
  row: number;
  col: number;
}

export interface Move {
  from: Position | null; // null の場合は持ち駒からの打ち手
  to: Position;
  piece: PieceType;
  isCapture: boolean;
  isPromotion: boolean;
}

export type Board = (Piece | null)[][];

export interface GameState {
  board: Board;
  currentPlayer: Player;
  captured: {
    sente: PieceType[];
    gote: PieceType[];
  };
  moves: Move[];
  gameOver: boolean;
  winner: Player | null;
}