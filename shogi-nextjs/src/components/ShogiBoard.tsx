'use client';

import { useState, useEffect, useCallback } from 'react';
import { GameState, Position, PieceType } from '@/types/shogi';
import { createInitialGameState, getPieceDisplayName, getPossibleMoves, canPromote, isInCheck, isCheckmate } from '@/utils/shogi';
import { getAIMove } from '@/utils/ai';

export default function ShogiBoard() {
  const [gameState, setGameState] = useState<GameState>(createInitialGameState());
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null);
  const [possibleMoves, setPossibleMoves] = useState<Position[]>([]);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [aiSide, setAiSide] = useState<'sente' | 'gote'>('gote');
  const [isThinking, setIsThinking] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [selectedCapturedPiece, setSelectedCapturedPiece] = useState<{piece: PieceType, player: 'sente' | 'gote'} | null>(null);
  const [showCheckAlert, setShowCheckAlert] = useState(false);

  // 王手状態の表示管理
  useEffect(() => {
    const isCurrentPlayerInCheck = isInCheck(gameState.board, gameState.currentPlayer);
    
    if (isCurrentPlayerInCheck && !gameState.gameOver) {
      // 王手状態の場合、少し遅延してから表示
      const timer = setTimeout(() => {
        setShowCheckAlert(true);
      }, 100);
      return () => clearTimeout(timer);
    } else {
      setShowCheckAlert(false);
    }
  }, [gameState.board, gameState.currentPlayer, gameState.gameOver]);

  // 駒の種類に応じたサイズを取得
  const getPieceSize = (pieceType: PieceType) => {
    switch (pieceType) {
      case 'pawn':
      case 'promoted_pawn':
        return { width: 42, height: 52, fontSize: 18 }; // 歩は小さく
      case 'king':
        return { width: 52, height: 62, fontSize: 24 }; // 王は大きく
      case 'rook':
      case 'promoted_rook':
      case 'bishop':
      case 'promoted_bishop':
        return { width: 50, height: 60, fontSize: 22 }; // 大駒は大きめ
      default:
        return { width: 48, height: 58, fontSize: 20 }; // 標準サイズ
    }
  };

  // 持ち駒用のサイズを取得
  const getCapturedPieceSize = (pieceType: PieceType) => {
    switch (pieceType) {
      case 'pawn':
      case 'promoted_pawn':
        return { width: 30, height: 40, fontSize: 14 }; // 歩は小さく
      case 'king':
        return { width: 40, height: 50, fontSize: 18 }; // 王は大きく
      case 'rook':
      case 'promoted_rook':
      case 'bishop':
      case 'promoted_bishop':
        return { width: 38, height: 48, fontSize: 16 }; // 大駒は大きめ
      default:
        return { width: 36, height: 46, fontSize: 15 }; // 標準サイズ
    }
  };

  const handleSquareClick = (row: number, col: number) => {
    if (!gameStarted) setGameStarted(true);
    const clickedPos: Position = { row, col };
    
    // 持ち駒が選択されている場合は打ち手を処理
    if (selectedCapturedPiece) {
      if (gameState.board[row][col] === null && isValidDrop(selectedCapturedPiece.piece, clickedPos)) {
        dropPiece(selectedCapturedPiece.piece, selectedCapturedPiece.player, clickedPos);
      }
      setSelectedCapturedPiece(null);
      setSelectedPosition(null);
      setPossibleMoves([]);
      return;
    }
    
    if (selectedPosition) {
      // 移動を試行
      if (possibleMoves.some(move => move.row === row && move.col === col)) {
        const needsPromotion = canPromote(
          gameState.board[selectedPosition.row][selectedPosition.col]!,
          selectedPosition,
          clickedPos
        );
        
        if (needsPromotion) {
          // 王手表示を一時的に非表示
          setShowCheckAlert(false);
          const shouldPromote = window.confirm('成りますか？');
          makeMove(selectedPosition, clickedPos, shouldPromote);
        } else {
          makeMove(selectedPosition, clickedPos, false);
        }
      }
      // 選択をリセット
      setSelectedPosition(null);
      setPossibleMoves([]);
      setSelectedCapturedPiece(null);
    } else {
      // 駒を選択
      const piece = gameState.board[row][col];
      if (piece && piece.player === gameState.currentPlayer) {
        setSelectedPosition(clickedPos);
        const moves = getPossibleMoves(gameState.board, clickedPos, piece);
        setPossibleMoves(moves);
        setSelectedCapturedPiece(null);
      }
    }
  };

  // 持ち駒クリックのハンドラー
  const handleCapturedPieceClick = (pieceType: PieceType, player: 'sente' | 'gote') => {
    if (player !== gameState.currentPlayer) return; // 自分の手番でない場合は無視
    
    setSelectedCapturedPiece({piece: pieceType, player});
    setSelectedPosition(null);
    setPossibleMoves(getDropPositions(pieceType));
  };

  // 駒を打つ処理
  const dropPiece = (pieceType: PieceType, player: 'sente' | 'gote', position: Position) => {
    const newBoard = gameState.board.map(row => [...row]);
    newBoard[position.row][position.col] = { type: pieceType, player };
    
    // 持ち駒から削除
    const newCaptured = { ...gameState.captured };
    const capturedArray = player === 'sente' ? newCaptured.sente : newCaptured.gote;
    const pieceIndex = capturedArray.indexOf(pieceType);
    if (pieceIndex !== -1) {
      capturedArray.splice(pieceIndex, 1);
    }
    
    const nextPlayer: 'sente' | 'gote' = gameState.currentPlayer === 'sente' ? 'gote' : 'sente';
    
    const newGameState: GameState = {
      ...gameState,
      board: newBoard,
      captured: newCaptured,
      currentPlayer: nextPlayer,
      moves: [...gameState.moves, {
        from: null, // 持ち駒からの打ち手はfromがnull
        to: position,
        piece: pieceType,
        isCapture: false,
        isPromotion: false
      }]
    };
    
    setGameState(newGameState);
    
    // AIの手番ならAIを実行
    if (aiEnabled && nextPlayer === aiSide && !isThinking && gameStarted) {
      setTimeout(() => {
        executeAIMove();
      }, 500);
    }
  };

  // 駒を打てる位置を取得
  const getDropPositions = (pieceType: PieceType): Position[] => {
    const positions: Position[] = [];
    
    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 9; col++) {
        if (gameState.board[row][col] === null && isValidDrop(pieceType, { row, col })) {
          positions.push({ row, col });
        }
      }
    }
    
    return positions;
  };

  // 持ち駒を打つのが有効かチェック
  const isValidDrop = (pieceType: PieceType, position: Position): boolean => {
    // 歩の場合の特殊ルール
    if (pieceType === 'pawn') {
      // 同じ筋に歩がないかチェック
      for (let row = 0; row < 9; row++) {
        const piece = gameState.board[row][position.col];
        if (piece && piece.type === 'pawn' && piece.player === gameState.currentPlayer) {
          return false; // 二歩はダメ
        }
      }
      
      // 敵陣最奥段に歩を打てない
      if (gameState.currentPlayer === 'sente' && position.row === 0) {
        return false;
      }
      if (gameState.currentPlayer === 'gote' && position.row === 8) {
        return false;
      }
    }
    
    // 香車・桂馬の場合の制限
    if (pieceType === 'lance') {
      if (gameState.currentPlayer === 'sente' && position.row === 0) {
        return false;
      }
      if (gameState.currentPlayer === 'gote' && position.row === 8) {
        return false;
      }
    }
    
    if (pieceType === 'knight') {
      if (gameState.currentPlayer === 'sente' && position.row <= 1) {
        return false;
      }
      if (gameState.currentPlayer === 'gote' && position.row >= 7) {
        return false;
      }
    }
    
    return true;
  };

  const makeMove = (from: Position, to: Position, promote: boolean = false, skipAI: boolean = false) => {
    const newBoard = gameState.board.map(row => [...row]);
    let piece = newBoard[from.row][from.col];
    const capturedPiece = newBoard[to.row][to.col];
    
    if (!piece) return;
    
    // 成り処理
    if (promote) {
      piece = { ...piece, type: `promoted_${piece.type}` as PieceType };
    }
    
    // 駒を移動
    newBoard[to.row][to.col] = piece;
    newBoard[from.row][from.col] = null;
    
    // 持ち駒の更新
    const newCaptured = { ...gameState.captured };
    if (capturedPiece) {
      // 成り駒は元の駒に戻す
      let basePieceType = capturedPiece.type;
      if (basePieceType.startsWith('promoted_')) {
        basePieceType = basePieceType.replace('promoted_', '') as PieceType;
      }
      
      if (gameState.currentPlayer === 'sente') {
        newCaptured.sente.push(basePieceType);
      } else {
        newCaptured.gote.push(basePieceType);
      }
    }
    
    const nextPlayer: 'sente' | 'gote' = gameState.currentPlayer === 'sente' ? 'gote' : 'sente';
    const newGameState: GameState = {
      ...gameState,
      board: newBoard,
      captured: newCaptured,
      currentPlayer: nextPlayer,
      moves: [...gameState.moves, {
        from,
        to,
        piece: piece.type,
        isCapture: !!capturedPiece,
        isPromotion: promote
      }]
    };
    
    // 王手・詰みチェック
    const inCheck = isInCheck(newBoard, nextPlayer);
    const checkmate = inCheck && isCheckmate(newBoard, nextPlayer);
    
    if (checkmate) {
      newGameState.gameOver = true;
      newGameState.winner = gameState.currentPlayer;
    }
    
    setGameState(newGameState);
    
    // AIの手番ならAIを実行（skipAIがfalseかつゲーム開始後の場合のみ）
    if (!skipAI && aiEnabled && nextPlayer === aiSide && !checkmate && !isThinking && gameStarted) {
      setTimeout(() => {
        executeAIMove();
      }, 500);
    }
  };
  
  const executeAIMove = useCallback(async () => {
    if (isThinking) return; // 既に思考中の場合は何もしない
    
    setIsThinking(true);
    
    setTimeout(() => {
      // 最新のゲーム状態を取得
      setGameState(currentGameState => {
        try {
          const aiMove = getAIMove(currentGameState.board, aiSide, 2);
          
          if (aiMove && aiMove.from) {
            const piece = currentGameState.board[aiMove.from.row][aiMove.from.col];
            if (piece) {
              // 手動で盤面を更新（makeMove関数を使わずに直接更新）
              const newBoard = currentGameState.board.map(row => [...row]);
              let movingPiece = newBoard[aiMove.from.row][aiMove.from.col];
              const capturedPiece = newBoard[aiMove.to.row][aiMove.to.col];
              
              if (!movingPiece) {
                console.error('No piece found at AI move source position');
                setIsThinking(false);
                return currentGameState;
              }
              
              // 成り処理
              const needsPromotion = canPromote(movingPiece, aiMove.from, aiMove.to);
              if (needsPromotion) {
                movingPiece = { ...movingPiece, type: `promoted_${movingPiece.type}` as PieceType };
              }
              
              // 駒を移動
              newBoard[aiMove.to.row][aiMove.to.col] = movingPiece;
              newBoard[aiMove.from.row][aiMove.from.col] = null;
              
              // 持ち駒の更新
              const newCaptured = { ...currentGameState.captured };
              if (capturedPiece) {
                let basePieceType = capturedPiece.type;
                if (basePieceType.startsWith('promoted_')) {
                  basePieceType = basePieceType.replace('promoted_', '') as PieceType;
                }
                
                if (aiSide === 'sente') {
                  newCaptured.sente.push(basePieceType);
                } else {
                  newCaptured.gote.push(basePieceType);
                }
              }
              
              const nextPlayer: 'sente' | 'gote' = currentGameState.currentPlayer === 'sente' ? 'gote' : 'sente';
              
              // 王手・詰みチェック
              const inCheck = isInCheck(newBoard, nextPlayer);
              const checkmate = inCheck && isCheckmate(newBoard, nextPlayer);
              
              const newGameState: GameState = {
                ...currentGameState,
                board: newBoard,
                captured: newCaptured,
                currentPlayer: nextPlayer,
                moves: [...currentGameState.moves, {
                  from: aiMove.from,
                  to: aiMove.to,
                  piece: movingPiece.type,
                  isCapture: !!capturedPiece,
                  isPromotion: needsPromotion
                }],
                gameOver: checkmate,
                winner: checkmate ? currentGameState.currentPlayer : null
              };
              
              setIsThinking(false);
              return newGameState;
            }
          } else {
            // AIが有効な手を見つけられない場合
            console.log('AI could not find a valid move');
            setIsThinking(false);
            return { 
              ...currentGameState, 
              gameOver: true, 
              winner: aiSide === 'sente' ? 'gote' : 'sente' 
            };
          }
        } catch (error) {
          console.error('AI move error:', error);
          setIsThinking(false);
        }
        return currentGameState;
      });
    }, 1000); // AIの思考時間を演出
  }, [aiSide, isThinking]);

  // ゲーム開始時にAIが先手の場合の処理
  useEffect(() => {
    if (!gameStarted && aiEnabled && gameState.currentPlayer === aiSide && gameState.moves.length === 0) {
      setGameStarted(true);
      setTimeout(() => {
        executeAIMove();
      }, 1000);
    }
  }, [gameState, aiEnabled, aiSide, gameStarted, executeAIMove]);

  const resetGame = () => {
    setGameState(createInitialGameState());
    setSelectedPosition(null);
    setPossibleMoves([]);
    setIsThinking(false);
    setGameStarted(false);
  };

  const currentPlayerInCheck = isInCheck(gameState.board, gameState.currentPlayer);

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-100">
      <div className="flex flex-col items-center p-4">
        {/* ヘッダー */}
        <div className="mb-6 text-center">
          <h1 className="text-4xl font-bold text-amber-900 mb-4" style={{ fontFamily: 'serif' }}>
            将棋
          </h1>
          
          {/* AI設定 */}
          <div className="mb-4 p-3 bg-white rounded-lg shadow-md">
            <div className="flex gap-4 justify-center items-center flex-wrap">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={aiEnabled}
                  onChange={(e) => setAiEnabled(e.target.checked)}
                  className="rounded"
                />
                AI対戦
              </label>
              {aiEnabled && (
                <label className="flex items-center gap-2">
                  AIの手番:
                  <select
                    value={aiSide}
                    onChange={(e) => setAiSide(e.target.value as 'sente' | 'gote')}
                    className="px-2 py-1 border rounded"
                  >
                    <option value="gote">後手</option>
                    <option value="sente">先手</option>
                  </select>
                </label>
              )}
            </div>
          </div>
          
          <div className="flex gap-4 justify-center mb-4">
            <button
              onClick={resetGame}
              className="px-6 py-2 bg-amber-700 text-white rounded-lg hover:bg-amber-800 transition-colors shadow-md"
            >
              新しいゲーム
            </button>
            <div className={`px-6 py-2 rounded-lg shadow-md ${
              gameState.gameOver 
                ? 'bg-red-100 text-red-800' 
                : currentPlayerInCheck 
                  ? 'bg-yellow-100 text-yellow-800' 
                  : isThinking
                    ? 'bg-blue-100 text-blue-800'
                    : 'bg-white text-gray-800'
            }`}>
              {gameState.gameOver 
                ? `${gameState.winner === 'sente' ? '先手' : '後手'}の勝ち！` 
                : currentPlayerInCheck
                  ? `${gameState.currentPlayer === 'sente' ? '先手' : '後手'}王手！`
                  : isThinking
                    ? 'AI思考中...'
                    : `現在の手番: ${gameState.currentPlayer === 'sente' ? '先手' : '後手'}`}
            </div>
          </div>
        </div>

        {/* 後手の持ち駒 */}
        <div className="mb-4 p-4 bg-gradient-to-r from-amber-100 to-amber-200 rounded-xl border-2 border-amber-300 shadow-lg">
          <div className="text-lg font-bold text-amber-900 mb-3 text-center">後手の持ち駒</div>
          <div className="flex flex-wrap gap-2 justify-center min-h-[40px]">
            {gameState.captured.gote.map((pieceType, index) => {
              const isSelected = selectedCapturedPiece?.piece === pieceType && selectedCapturedPiece?.player === 'gote';
              const size = getCapturedPieceSize(pieceType);
              return (
                <div 
                  key={index} 
                  className={`relative flex items-center justify-center cursor-pointer transition-all transform rotate-180 ${
                    gameState.currentPlayer === 'gote' ? 'hover:scale-105' : 'opacity-60 cursor-not-allowed'
                  } ${isSelected ? 'scale-105' : ''}`}
                  style={{
                    width: `${size.width}px`,
                    height: `${size.height}px`,
                    background: isSelected 
                      ? 'linear-gradient(145deg, #a0824a, #6b4423, #4a2c15)' 
                      : 'linear-gradient(145deg, #b8956b, #a0824a, #6b4423)',
                    clipPath: 'polygon(50% 0%, 90% 25%, 85% 100%, 15% 100%, 10% 25%)',
                    boxShadow: isSelected 
                      ? `
                          inset 1px 1px 3px rgba(248,240,225,0.9),
                          inset -1px -1px 3px rgba(150,125,95,0.9),
                          2px 2px 8px rgba(0,0,0,0.5),
                          0 0 0 2px rgba(180,140,95,0.8)
                        `
                      : `
                          inset 1px 1px 3px rgba(248,240,225,0.8),
                          inset -1px -1px 3px rgba(150,125,95,0.6),
                          1px 1px 4px rgba(0,0,0,0.3),
                          0 0 0 1px rgba(130,110,85,0.5)
                        `,
                    fontFamily: '"HiraMinProN-W6", "Hiragino Mincho ProN", "Yu Mincho", "BIZ UDMincho", "Noto Serif JP", serif',
                    fontSize: `${size.fontSize}px`,
                    fontWeight: '900',
                    color: '#1a0f0a',
                    textShadow: '1px 1px 2px rgba(248,240,225,0.8), 0 0 2px rgba(248,240,225,0.3)',
                    letterSpacing: '-0.3px',
                    backgroundImage: `
                      linear-gradient(90deg, transparent 0%, rgba(120,100,75,0.12) 20%, transparent 21%),
                      linear-gradient(0deg, transparent 0%, rgba(120,100,75,0.08) 50%, transparent 51%)
                    `
                  }}
                  onClick={() => gameState.currentPlayer === 'gote' && handleCapturedPieceClick(pieceType, 'gote')}
                >
                  <span style={{ 
                    marginTop: `${size.height * 0.13}px`,
                    lineHeight: '1',
                    transform: 'scaleY(1.1)'
                  }}>
                    {getPieceDisplayName({ type: pieceType, player: 'gote' })}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 将棋盤 */}
        <div className="mb-4 p-6 bg-gradient-to-br from-amber-200 to-amber-300 rounded-xl shadow-2xl">
          
          <div className="relative">
            {/* 王手・勝負決定の表示オーバーレイ */}
            {(showCheckAlert || gameState.gameOver) && (
              <div className="absolute inset-0 bg-black bg-opacity-50 z-10 flex items-center justify-center rounded-lg">
                <div className="bg-white p-6 rounded-xl shadow-2xl text-center border-4 border-red-500">
                  {gameState.gameOver ? (
                    <div>
                      <div className="text-3xl font-bold text-red-600 mb-2">勝負あり！</div>
                      <div className="text-xl text-gray-800">
                        {gameState.winner === 'sente' ? '先手の勝利' : '後手の勝利'}
                      </div>
                    </div>
                  ) : showCheckAlert ? (
                    <div className="text-2xl font-bold text-red-600">王手！</div>
                  ) : null}
                </div>
              </div>
            )}
            
            {/* 盤面 */}
            <div className="grid grid-cols-9 gap-0 bg-gradient-to-br from-yellow-100 to-amber-100 border-4 border-amber-900 shadow-inner rounded-lg overflow-hidden">
              {gameState.board.map((row, rowIndex) =>
                row.map((piece, colIndex) => {
                  const isSelected = 
                    selectedPosition?.row === rowIndex && selectedPosition?.col === colIndex;
                  const isPossibleMove = possibleMoves.some(
                    pos => pos.row === rowIndex && pos.col === colIndex
                  );
                  
                  return (
                    <div
                      key={`${rowIndex}-${colIndex}`}
                      onClick={() => !gameState.gameOver && !isThinking && handleSquareClick(rowIndex, colIndex)}
                      className={`
                        w-16 h-16 border border-amber-800 flex items-center justify-center
                        cursor-pointer text-xl font-bold relative transition-all duration-200
                        ${isSelected ? 'bg-yellow-400 shadow-lg' : ''}
                        ${isPossibleMove ? 'bg-green-300 shadow-md' : ''}
                        ${!isSelected && !isPossibleMove ? 'bg-gradient-to-br from-yellow-50 to-amber-50' : ''}
                        ${!gameState.gameOver && !isThinking ? 'hover:bg-yellow-200' : 'cursor-not-allowed'}
                      `}
                      style={{
                        backgroundImage: !isSelected && !isPossibleMove ? 
                          'linear-gradient(45deg, rgba(180,83,9,0.05) 25%, transparent 25%, transparent 75%, rgba(180,83,9,0.05) 75%)' : 'none'
                      }}
                    >
                      {piece && (
                        (() => {
                          const size = getPieceSize(piece.type);
                          return (
                            <div 
                              className={`
                                relative flex items-center justify-center text-black font-black transition-all hover:scale-105
                                ${piece.player === 'gote' ? 'transform rotate-180' : ''}
                              `}
                              style={{
                                width: `${size.width}px`,
                                height: `${size.height}px`,
                                background: 'linear-gradient(145deg, #b8956b, #a0824a, #6b4423)',
                                clipPath: 'polygon(50% 0%, 90% 25%, 85% 100%, 15% 100%, 10% 25%)',
                                boxShadow: `
                                  inset 2px 2px 4px rgba(248,240,225,0.9),
                                  inset -2px -2px 4px rgba(150,125,95,0.8),
                                  2px 2px 8px rgba(0,0,0,0.4),
                                  0 0 0 1px rgba(130,110,85,0.6)
                                `,
                                fontFamily: '"HiraMinProN-W6", "Hiragino Mincho ProN", "Yu Mincho", "BIZ UDMincho", "Noto Serif JP", serif',
                                fontSize: `${size.fontSize}px`,
                                fontWeight: '900',
                                color: '#1a0f0a',
                                textShadow: '1px 1px 2px rgba(248,240,225,0.8), 0 0 3px rgba(248,240,225,0.3)',
                                letterSpacing: '-0.5px',
                                backgroundImage: `
                                  linear-gradient(90deg, transparent 0%, rgba(120,100,75,0.15) 20%, transparent 21%, transparent 40%, rgba(120,100,75,0.08) 41%, transparent 42%),
                                  linear-gradient(0deg, transparent 0%, rgba(120,100,75,0.08) 30%, transparent 31%, transparent 70%, rgba(120,100,75,0.12) 71%, transparent 72%)
                                `
                              }}
                            >
                              <span style={{ 
                                marginTop: piece.player === 'gote' ? `${size.height * 0.14}px` : `${size.height * 0.04}px`,
                                lineHeight: '1',
                                transform: 'scaleY(1.1)'
                              }}>
                                {getPieceDisplayName(piece)}
                              </span>
                            </div>
                          );
                        })()
                      )}
                      
                      {isPossibleMove && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-3 h-3 bg-green-600 rounded-full shadow-sm"></div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* 先手の持ち駒 */}
        <div className="mb-4 p-4 bg-gradient-to-r from-blue-100 to-blue-200 rounded-xl border-2 border-blue-300 shadow-lg">
          <div className="text-lg font-bold text-blue-900 mb-3 text-center">先手の持ち駒</div>
          <div className="flex flex-wrap gap-2 justify-center min-h-[40px]">
            {gameState.captured.sente.map((pieceType, index) => {
              const isSelected = selectedCapturedPiece?.piece === pieceType && selectedCapturedPiece?.player === 'sente';
              const size = getCapturedPieceSize(pieceType);
              return (
                <div 
                  key={index} 
                  className={`relative flex items-center justify-center cursor-pointer transition-all ${
                    gameState.currentPlayer === 'sente' ? 'hover:scale-105' : 'opacity-60 cursor-not-allowed'
                  } ${isSelected ? 'scale-105' : ''}`}
                  style={{
                    width: `${size.width}px`,
                    height: `${size.height}px`,
                    background: isSelected 
                      ? 'linear-gradient(145deg, #a0824a, #6b4423, #4a2c15)' 
                      : 'linear-gradient(145deg, #b8956b, #a0824a, #6b4423)',
                    clipPath: 'polygon(50% 0%, 90% 25%, 85% 100%, 15% 100%, 10% 25%)',
                    boxShadow: isSelected 
                      ? `
                          inset 1px 1px 3px rgba(248,240,225,0.9),
                          inset -1px -1px 3px rgba(150,125,95,0.9),
                          2px 2px 8px rgba(0,0,0,0.5),
                          0 0 0 2px rgba(180,140,95,0.8)
                        `
                      : `
                          inset 1px 1px 3px rgba(248,240,225,0.8),
                          inset -1px -1px 3px rgba(150,125,95,0.6),
                          1px 1px 4px rgba(0,0,0,0.3),
                          0 0 0 1px rgba(130,110,85,0.5)
                        `,
                    fontFamily: '"HiraMinProN-W6", "Hiragino Mincho ProN", "Yu Mincho", "BIZ UDMincho", "Noto Serif JP", serif',
                    fontSize: `${size.fontSize}px`,
                    fontWeight: '900',
                    color: '#1a0f0a',
                    textShadow: '1px 1px 2px rgba(248,240,225,0.8), 0 0 2px rgba(248,240,225,0.3)',
                    letterSpacing: '-0.3px',
                    backgroundImage: `
                      linear-gradient(90deg, transparent 0%, rgba(120,100,75,0.12) 20%, transparent 21%),
                      linear-gradient(0deg, transparent 0%, rgba(120,100,75,0.08) 50%, transparent 51%)
                    `
                  }}
                  onClick={() => gameState.currentPlayer === 'sente' && handleCapturedPieceClick(pieceType, 'sente')}
                >
                  <span style={{ 
                    marginTop: `${size.height * 0.02}px`,
                    lineHeight: '1',
                    transform: 'scaleY(1.1)'
                  }}>
                    {getPieceDisplayName({ type: pieceType, player: 'sente' })}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}