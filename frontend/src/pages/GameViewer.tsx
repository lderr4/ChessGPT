import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { gamesAPI } from "../lib/api";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  SkipBack,
  SkipForward,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

interface Move {
  move_number: number;
  is_white: boolean;
  move_san: string;
  evaluation_before: number | null;
  evaluation_after: number | null;
  classification: string | null;
  centipawn_loss: number | null;
  best_move_uci: string | null;
  coach_commentary: string | null;
}

interface GameDetail {
  id: number;
  white_player: string;
  black_player: string;
  white_elo: number;
  black_elo: number;
  result: string;
  date_played: string;
  time_class: string;
  opening_eco: string;
  opening_name: string;
  user_color: string;
  is_analyzed: boolean;
  accuracy: number | null;
  average_centipawn_loss: number | null;
  num_blunders: number;
  num_mistakes: number;
  num_inaccuracies: number;
  pgn: string;
  moves: Move[];
}

const GameViewer = () => {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const [game, setGame] = useState<GameDetail | null>(null);
  const [chess] = useState(new Chess());
  const [currentPosition, setCurrentPosition] = useState(chess.fen());
  const [currentMoveIndex, setCurrentMoveIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(true);
  const [isAnalysisMode, setIsAnalysisMode] = useState(false);
  const [liveEvaluation, setLiveEvaluation] = useState<number | null>(null);
  const [liveBestMove, setLiveBestMove] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [moveHighlight, setMoveHighlight] = useState<{
    from: string;
    to: string;
  } | null>(null);

  // Helper function to format coach commentary
  const formatCoachCommentary = (text: string) => {
    // Remove any markdown formatting
    let cleaned = text.replace(/\*\*/g, "");

    // Split into sentences for better readability
    const sentences = cleaned
      .split(/(?<=[.!?])\s+/)
      .filter((s) => s.trim().length > 0);

    return sentences;
  };

  // Calculate material advantage
  const calculateMaterialAdvantage = (fen: string) => {
    const pieces = fen.split(" ")[0];
    const materialValues: Record<string, number> = {
      q: 9,
      Q: 9,
      r: 5,
      R: 5,
      b: 3,
      B: 3,
      n: 3,
      N: 3,
      p: 1,
      P: 1,
    };

    let whiteMaterial = 0;
    let blackMaterial = 0;

    for (const char of pieces) {
      if (materialValues[char]) {
        if (char === char.toUpperCase()) {
          whiteMaterial += materialValues[char];
        } else {
          blackMaterial += materialValues[char];
        }
      }
    }

    const diff = whiteMaterial - blackMaterial;
    const advantage = Math.abs(diff);
    const side = diff > 0 ? "white" : diff < 0 ? "black" : "equal";

    // Determine piece icon for advantage
    let pieceIcon = "";
    if (advantage >= 9) pieceIcon = side === "white" ? "♕" : "♛";
    else if (advantage >= 5) pieceIcon = side === "white" ? "♖" : "♜";
    else if (advantage >= 3) pieceIcon = side === "white" ? "♗" : "♝";
    else if (advantage >= 1) pieceIcon = side === "white" ? "♙" : "♟";

    return { advantage, side, pieceIcon };
  };

  useEffect(() => {
    if (gameId) {
      fetchGame(parseInt(gameId));
    }
  }, [gameId]);

  // Add keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!game) return;

      // Prevent default behavior for arrow keys
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
        e.preventDefault();

        if (e.key === "ArrowLeft") {
          goToPrevious();
        } else if (e.key === "ArrowRight") {
          goToNext();
        } else if (e.key === "ArrowUp") {
          goToStart();
        } else if (e.key === "ArrowDown") {
          goToEnd();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [game, currentMoveIndex]); // Re-attach when game or move index changes

  const fetchGame = async (id: number) => {
    try {
      const response = await gamesAPI.getGame(id);
      setGame(response.data);
      chess.loadPgn(response.data.pgn);
      chess.reset();
      setCurrentPosition(chess.fen());
    } catch (error) {
      console.error("Failed to fetch game:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const goToMove = (moveIndex: number) => {
    chess.reset();

    let lastMove = null;
    if (moveIndex >= 0 && game) {
      const pgn = game.pgn;
      chess.loadPgn(pgn);
      const history = chess.history({ verbose: true });

      chess.reset();
      for (let i = 0; i <= moveIndex && i < history.length; i++) {
        const move = chess.move(history[i]);
        if (i === moveIndex) {
          lastMove = move;
        }
      }
    }

    setCurrentPosition(chess.fen());
    setCurrentMoveIndex(moveIndex);

    // Set move highlighting for the current move
    if (lastMove) {
      setMoveHighlight({ from: lastMove.from, to: lastMove.to });
    } else {
      setMoveHighlight(null);
    }

    // If in analysis mode, analyze the new position
    if (isAnalysisMode) {
      analyzeLivePosition(chess.fen());
    }
  };

  const analyzeLivePosition = async (fen: string) => {
    setIsAnalyzing(true);
    try {
      const response = await gamesAPI.analyzePosition(fen);
      setLiveEvaluation(response.data.evaluation);
      setLiveBestMove(response.data.best_move_san);
    } catch (error) {
      console.error("Failed to analyze position:", error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const onDrop = (sourceSquare: string, targetSquare: string) => {
    if (!isAnalysisMode) return false;

    try {
      const move = chess.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: "q", // Always promote to queen for simplicity
      });

      if (move === null) return false;

      const newFen = chess.fen();
      setCurrentPosition(newFen);
      setCurrentMoveIndex(-1); // Exit game review mode

      // Analyze the new position
      analyzeLivePosition(newFen);

      return true;
    } catch (error) {
      return false;
    }
  };

  const toggleAnalysisMode = () => {
    const newMode = !isAnalysisMode;
    setIsAnalysisMode(newMode);

    if (newMode) {
      // When entering analysis mode, analyze current position
      analyzeLivePosition(chess.fen());
    } else {
      // When exiting analysis mode, clear live evaluation
      setLiveEvaluation(null);
      setLiveBestMove(null);
    }
  };

  const resetToGamePosition = () => {
    goToMove(currentMoveIndex);
    setIsAnalysisMode(false);
    setLiveEvaluation(null);
    setLiveBestMove(null);
  };

  const goToStart = () => goToMove(-1);
  const goToPrevious = () => goToMove(Math.max(-1, currentMoveIndex - 1));
  const goToNext = () => {
    if (game) {
      const totalMoves = game.moves.length;
      goToMove(Math.min(totalMoves - 1, currentMoveIndex + 1));
    }
  };
  const goToEnd = () => {
    if (game) {
      goToMove(game.moves.length - 1);
    }
  };

  const getClassificationColor = (classification: string | null) => {
    switch (classification) {
      case "best":
      case "excellent":
        return "text-green-600";
      case "good":
        return "text-blue-600";
      case "inaccuracy":
        return "text-yellow-600";
      case "mistake":
        return "text-orange-600";
      case "blunder":
        return "text-red-600";
      default:
        return "text-gray-600";
    }
  };

  const getClassificationSymbol = (classification: string | null) => {
    switch (classification) {
      case "best":
      case "excellent":
        return "!!";
      case "good":
        return "!";
      case "inaccuracy":
        return "?!";
      case "mistake":
        return "?";
      case "blunder":
        return "??";
      default:
        return "";
    }
  };

  const getGamePhase = (
    moveIndex: number,
    totalMoves: number
  ): "opening" | "middlegame" | "endgame" => {
    if (moveIndex < 20) return "opening"; // First 10 moves (20 ply)
    if (moveIndex < totalMoves * 0.7) return "middlegame";
    return "endgame";
  };

  const formatEvaluation = (cp: number | null): string => {
    if (cp === null) return "0.00";
    if (Math.abs(cp) > 5000) {
      const mateIn = Math.round((10000 - Math.abs(cp)) / 100);
      return cp > 0 ? `M${mateIn}` : `-M${mateIn}`;
    }
    return (cp / 100).toFixed(2);
  };

  const getEvaluationColor = (cp: number | null): string => {
    if (cp === null) return "bg-gray-400";
    if (cp > 300) return "bg-green-500";
    if (cp > 100) return "bg-green-400";
    if (cp > 0) return "bg-green-300";
    if (cp === 0) return "bg-gray-400";
    if (cp > -100) return "bg-red-300";
    if (cp > -300) return "bg-red-400";
    return "bg-red-500";
  };

  const getEvaluationBarWidth = (cp: number | null): number => {
    if (cp === null) return 50;
    // Clamp to -1000 to 1000 for display
    const clamped = Math.max(-1000, Math.min(1000, cp));
    // Convert to percentage: -1000 = 0%, 0 = 50%, 1000 = 100%
    return ((clamped + 1000) / 2000) * 100;
  };

  const prepareChartData = () => {
    if (!game || !game.is_analyzed) return [];

    return game.moves.map((move, index) => {
      const phase = getGamePhase(index, game.moves.length);
      const evaluation = move.evaluation_after || 0;

      return {
        moveNumber: Math.floor(index / 2) + 1,
        halfMove: index,
        evaluation: evaluation / 100, // Convert to pawns
        phase,
        phaseName: phase.charAt(0).toUpperCase() + phase.slice(1),
        move: move.move_san,
      };
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600 mb-4">Game not found</p>
        <button
          onClick={() => navigate("/games")}
          className="text-primary-600 hover:text-primary-700"
        >
          Back to Games
        </button>
      </div>
    );
  }

  const currentMove = game.moves[currentMoveIndex];

  return (
    <div>
      <button
        onClick={() => navigate("/games")}
        className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
      >
        <ArrowLeft size={20} />
        Back to Games
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Chess Board */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl shadow-sm p-4">
            {/* Game Info */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">
                    {game.white_player} vs {game.black_player}
                  </h2>
                  <p className="text-sm text-gray-600">
                    {game.opening_name} ({game.opening_eco}) • {game.time_class}
                  </p>
                </div>
                <div
                  className={`px-4 py-2 rounded-lg font-semibold ${
                    game.result === "win"
                      ? "bg-green-100 text-green-700"
                      : game.result === "loss"
                      ? "bg-red-100 text-red-700"
                      : "bg-gray-100 text-gray-700"
                  }`}
                >
                  {game.result.toUpperCase()}
                </div>
              </div>

              {game.is_analyzed && (
                <div className="flex gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Accuracy: </span>
                    <span className="font-medium text-gray-900">
                      {game.accuracy?.toFixed(1)}%
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Errors: </span>
                    <span className="font-medium text-red-600">
                      {game.num_blunders}B{" "}
                    </span>
                    <span className="font-medium text-orange-600">
                      {game.num_mistakes}M{" "}
                    </span>
                    <span className="font-medium text-yellow-600">
                      {game.num_inaccuracies}I
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Analysis Mode Toggle */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <button
                  onClick={toggleAnalysisMode}
                  className={`px-4 py-2 rounded-lg font-medium transition ${
                    isAnalysisMode
                      ? "bg-purple-600 text-white hover:bg-purple-700"
                      : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                  }`}
                >
                  {isAnalysisMode
                    ? "🔬 Analysis Mode: ON"
                    : "🔬 Enable Analysis Mode"}
                </button>
                {isAnalysisMode && (
                  <button
                    onClick={resetToGamePosition}
                    className="px-4 py-2 rounded-lg font-medium bg-gray-200 text-gray-700 hover:bg-gray-300 transition"
                  >
                    Reset to Game
                  </button>
                )}
              </div>
              {isAnalysisMode && (
                <div className="text-xs text-gray-500 italic">
                  💡 Live analysis may differ slightly from game analysis due to
                  engine calculation variations
                </div>
              )}
            </div>

            {/* Evaluation Bar */}
            {(isAnalysisMode || (game.is_analyzed && currentMove)) && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-700">
                      {isAnalysisMode
                        ? "Live Evaluation"
                        : "Current Evaluation"}
                    </span>
                    {isAnalyzing && (
                      <div className="w-4 h-4 border-2 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
                    )}
                  </div>
                  <span className="text-lg font-bold text-gray-900">
                    {isAnalysisMode
                      ? formatEvaluation(liveEvaluation)
                      : currentMove
                      ? formatEvaluation(currentMove.evaluation_after)
                      : "0.00"}
                  </span>
                </div>
                <div className="relative h-8 bg-gray-200 rounded-lg overflow-hidden">
                  <div
                    className={`absolute left-0 top-0 h-full transition-all duration-300 ${
                      isAnalysisMode
                        ? getEvaluationColor(liveEvaluation)
                        : currentMove
                        ? getEvaluationColor(currentMove.evaluation_after)
                        : "bg-gray-400"
                    }`}
                    style={{
                      width: `${
                        isAnalysisMode
                          ? getEvaluationBarWidth(liveEvaluation)
                          : currentMove
                          ? getEvaluationBarWidth(currentMove.evaluation_after)
                          : 50
                      }%`,
                    }}
                  ></div>
                  <div className="absolute left-1/2 top-0 w-0.5 h-full bg-gray-400 transform -translate-x-1/2"></div>
                  <div className="absolute left-2 top-1/2 transform -translate-y-1/2 text-xs font-semibold text-white drop-shadow">
                    White
                  </div>
                  <div className="absolute right-2 top-1/2 transform -translate-y-1/2 text-xs font-semibold text-white drop-shadow">
                    Black
                  </div>
                </div>
                {isAnalysisMode && liveBestMove && (
                  <div className="mt-2 text-sm text-gray-700">
                    <span className="font-medium">Best move:</span>{" "}
                    <span className="text-purple-600 font-semibold">
                      {liveBestMove}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Current Move Display */}
            <div className="mb-3 p-3 bg-gradient-to-r from-primary-50 to-primary-100 rounded-lg border-2 border-primary-300">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">♟️</span>
                  <div>
                    <p className="text-xs text-gray-600 font-medium">
                      Current Position
                    </p>
                    {currentMove && currentMoveIndex >= 0 ? (
                      <p className="text-2xl font-bold text-gray-900">
                        {currentMove.move_number}.
                        {currentMove.is_white ? " " : "... "}
                        {currentMove.move_san}
                      </p>
                    ) : (
                      <p className="text-2xl font-bold text-gray-900">
                        Starting Position
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {/* Material Advantage */}
                  {(() => {
                    const material =
                      calculateMaterialAdvantage(currentPosition);
                    if (material.advantage > 0) {
                      return (
                        <div
                          className={`px-3 py-1 rounded-lg font-semibold flex items-center gap-1 ${
                            material.side === "white"
                              ? "bg-gray-100 text-gray-800"
                              : "bg-gray-800 text-white"
                          }`}
                        >
                          <span className="text-xl">{material.pieceIcon}</span>
                          <span className="text-sm">+{material.advantage}</span>
                        </div>
                      );
                    }
                    return null;
                  })()}

                  {currentMove?.classification && (
                    <span
                      className={`px-3 py-1 rounded-full text-sm font-semibold ${getClassificationColor(
                        currentMove.classification
                      )}`}
                    >
                      {currentMove.classification}
                      {getClassificationSymbol(currentMove.classification)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Board */}
            <div className="mb-4">
              <Chessboard
                position={currentPosition}
                boardWidth={Math.min(500, window.innerWidth - 100)}
                boardOrientation={
                  game.user_color === "white" ? "white" : "black"
                }
                onPieceDrop={onDrop}
                arePiecesDraggable={isAnalysisMode}
                customBoardStyle={{
                  borderRadius: "8px",
                  boxShadow: isAnalysisMode
                    ? "0 0 0 3px rgba(139, 92, 246, 0.3)"
                    : "none",
                }}
                customSquareStyles={
                  moveHighlight
                    ? {
                        [moveHighlight.from]: {
                          backgroundColor: "rgba(255, 255, 0, 0.4)",
                        },
                        [moveHighlight.to]: {
                          backgroundColor: "rgba(255, 255, 0, 0.6)",
                        },
                      }
                    : {}
                }
              />
              {isAnalysisMode && (
                <div className="mt-2 text-center text-sm text-purple-600 font-medium">
                  🎯 Make moves on the board to see live engine analysis
                </div>
              )}
              {!isAnalysisMode && moveHighlight && (
                <div className="mt-2 text-center text-xs text-gray-500">
                  💡 Tip: Use arrow keys to navigate
                </div>
              )}
            </div>

            {/* Controls - Centered and Prominent */}
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={goToStart}
                className="p-3 border-2 border-gray-400 rounded-lg hover:bg-gray-100 hover:border-primary-500 transition-all active:scale-95"
                title="Start (↑)"
              >
                <SkipBack size={24} className="text-gray-700" />
              </button>
              <button
                onClick={goToPrevious}
                className="p-4 border-2 border-primary-400 rounded-lg hover:bg-primary-50 hover:border-primary-600 transition-all active:scale-95 shadow-sm"
                title="Previous (←)"
              >
                <ChevronLeft size={32} className="text-primary-600" />
              </button>
              <button
                onClick={goToNext}
                className="p-4 border-2 border-primary-400 rounded-lg hover:bg-primary-50 hover:border-primary-600 transition-all active:scale-95 shadow-sm"
                title="Next (→)"
              >
                <ChevronRight size={32} className="text-primary-600" />
              </button>
              <button
                onClick={goToEnd}
                className="p-3 border-2 border-gray-400 rounded-lg hover:bg-gray-100 hover:border-primary-500 transition-all active:scale-95"
                title="End (↓)"
              >
                <SkipForward size={24} className="text-gray-700" />
              </button>
            </div>

            {/* Evaluation Graph - Collapsible */}
            {game.is_analyzed && game.moves.length > 0 && (
              <div className="mt-4">
                <details className="group">
                  <summary className="cursor-pointer font-semibold text-gray-900 mb-3 flex items-center gap-2 hover:text-primary-600">
                    <span className="group-open:rotate-90 transition-transform">
                      ▶
                    </span>
                    📈 Game Evaluation Graph
                  </summary>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart
                        data={prepareChartData()}
                        onClick={(data) => {
                          if (
                            data &&
                            data.activePayload &&
                            data.activePayload[0]
                          ) {
                            const halfMove =
                              data.activePayload[0].payload.halfMove;
                            goToMove(halfMove);
                          }
                        }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis
                          dataKey="moveNumber"
                          label={{
                            value: "Move Number",
                            position: "insideBottom",
                            offset: -5,
                          }}
                          tick={{ fontSize: 12 }}
                        />
                        <YAxis
                          label={{
                            value: "Evaluation (Pawns)",
                            angle: -90,
                            position: "insideLeft",
                          }}
                          tick={{ fontSize: 12 }}
                          domain={[-10, 10]}
                        />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const data = payload[0].payload;
                              return (
                                <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
                                  <p className="font-semibold text-gray-900">
                                    Move {data.moveNumber}: {data.move}
                                  </p>
                                  <p className="text-sm text-gray-600">
                                    Eval: {data.evaluation.toFixed(2)}
                                  </p>
                                  <p className="text-sm text-primary-600 font-medium">
                                    {data.phaseName}
                                  </p>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <ReferenceLine y={0} stroke="#9ca3af" strokeWidth={2} />

                        {/* Color different phases */}
                        <defs>
                          <linearGradient
                            id="colorOpening"
                            x1="0"
                            y1="0"
                            x2="1"
                            y2="0"
                          >
                            <stop
                              offset="0%"
                              stopColor="#3b82f6"
                              stopOpacity={0.1}
                            />
                            <stop
                              offset="100%"
                              stopColor="#3b82f6"
                              stopOpacity={0.1}
                            />
                          </linearGradient>
                          <linearGradient
                            id="colorMiddlegame"
                            x1="0"
                            y1="0"
                            x2="1"
                            y2="0"
                          >
                            <stop
                              offset="0%"
                              stopColor="#10b981"
                              stopOpacity={0.1}
                            />
                            <stop
                              offset="100%"
                              stopColor="#10b981"
                              stopOpacity={0.1}
                            />
                          </linearGradient>
                          <linearGradient
                            id="colorEndgame"
                            x1="0"
                            y1="0"
                            x2="1"
                            y2="0"
                          >
                            <stop
                              offset="0%"
                              stopColor="#f59e0b"
                              stopOpacity={0.1}
                            />
                            <stop
                              offset="100%"
                              stopColor="#f59e0b"
                              stopOpacity={0.1}
                            />
                          </linearGradient>
                        </defs>

                        <Line
                          type="monotone"
                          dataKey="evaluation"
                          stroke="#8b5cf6"
                          strokeWidth={2}
                          dot={(props: any) => {
                            const { cx, cy, payload } = props;
                            if (payload.halfMove === currentMoveIndex) {
                              return (
                                <circle
                                  cx={cx}
                                  cy={cy}
                                  r={6}
                                  fill="#8b5cf6"
                                  stroke="#fff"
                                  strokeWidth={2}
                                />
                              );
                            }
                            return null;
                          }}
                        />
                      </LineChart>
                    </ResponsiveContainer>

                    {/* Graph Legend */}
                    <div className="mt-3 text-center text-xs text-gray-500">
                      Click on any point to jump to that move
                    </div>
                  </div>
                </details>
              </div>
            )}
          </div>
        </div>

        {/* Right Sidebar - Move Analysis & List */}
        <div className="lg:col-span-1 space-y-4">
          {/* Current Move Analysis - Prominent Position */}
          {currentMove && game.is_analyzed && (
            <div className="bg-white rounded-xl shadow-sm p-4">
              <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <span>📊</span> Move Analysis
              </h3>
              <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                <div>
                  <span className="text-gray-600">Classification: </span>
                  <span
                    className={`font-medium ${getClassificationColor(
                      currentMove.classification
                    )}`}
                  >
                    {currentMove.classification}{" "}
                    {getClassificationSymbol(currentMove.classification)}
                  </span>
                </div>
                {currentMove.evaluation_after !== null && (
                  <div>
                    <span className="text-gray-600">Evaluation: </span>
                    <span className="font-medium text-gray-900">
                      {(currentMove.evaluation_after / 100).toFixed(2)}
                    </span>
                  </div>
                )}
                <div>
                  <span className="text-gray-600">Phase: </span>
                  <span className="font-medium text-primary-600">
                    {getGamePhase(currentMoveIndex, game.moves.length)
                      .charAt(0)
                      .toUpperCase() +
                      getGamePhase(currentMoveIndex, game.moves.length).slice(
                        1
                      )}
                  </span>
                </div>
              </div>

              {/* Coach Commentary - Prominent */}
              {currentMove.coach_commentary && (
                <div className="p-3 bg-gradient-to-r from-purple-50 to-blue-50 border-l-4 border-purple-500 rounded-lg">
                  <div className="flex items-start gap-2">
                    <div className="text-xl">🎓</div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-purple-900 mb-2 text-sm flex items-center gap-1">
                        <span>Coach's Insight</span>
                        <span className="text-xs font-normal text-purple-600">
                          ({currentMove.classification})
                        </span>
                      </h4>
                      <div className="space-y-2">
                        {formatCoachCommentary(
                          currentMove.coach_commentary
                        ).map((sentence, idx) => (
                          <p
                            key={idx}
                            className="text-gray-800 text-sm leading-relaxed flex items-start gap-2"
                          >
                            <span className="text-purple-400 font-bold mt-0.5">
                              •
                            </span>
                            <span className="flex-1">{sentence}</span>
                          </p>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Move List */}
          <div className="bg-white rounded-xl shadow-sm p-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Moves</h3>
            <div className="space-y-1 max-h-[500px] overflow-y-auto">
              {game.moves
                .reduce((acc: any[], move, index) => {
                  if (move.is_white) {
                    acc.push({
                      white: move,
                      black: null,
                      moveNumber: move.move_number,
                      whiteIndex: index,
                    });
                  } else {
                    if (
                      acc.length > 0 &&
                      acc[acc.length - 1].moveNumber === move.move_number
                    ) {
                      acc[acc.length - 1].black = move;
                      acc[acc.length - 1].blackIndex = index;
                    } else {
                      acc.push({
                        white: null,
                        black: move,
                        moveNumber: move.move_number,
                        blackIndex: index,
                      });
                    }
                  }
                  return acc;
                }, [])
                .map((movePair, pairIndex) => (
                  <div
                    key={pairIndex}
                    className="flex items-center gap-2 text-sm"
                  >
                    <span className="text-gray-600 w-8">
                      {movePair.moveNumber}.
                    </span>

                    {movePair.white && (
                      <button
                        onClick={() => goToMove(movePair.whiteIndex)}
                        className={`flex-1 px-2 py-1 rounded text-left ${
                          currentMoveIndex === movePair.whiteIndex
                            ? "bg-primary-100 text-primary-900 font-medium"
                            : "hover:bg-gray-100"
                        }`}
                      >
                        <span
                          className={getClassificationColor(
                            movePair.white.classification
                          )}
                        >
                          {movePair.white.move_san}
                          {getClassificationSymbol(
                            movePair.white.classification
                          )}
                        </span>
                        {movePair.white.coach_commentary && (
                          <span
                            className="ml-1 text-purple-600"
                            title="Coach commentary available"
                          >
                            🎓
                          </span>
                        )}
                      </button>
                    )}

                    {movePair.black ? (
                      <button
                        onClick={() => goToMove(movePair.blackIndex)}
                        className={`flex-1 px-2 py-1 rounded text-left ${
                          currentMoveIndex === movePair.blackIndex
                            ? "bg-primary-100 text-primary-900 font-medium"
                            : "hover:bg-gray-100"
                        }`}
                      >
                        <span
                          className={getClassificationColor(
                            movePair.black.classification
                          )}
                        >
                          {movePair.black.move_san}
                          {getClassificationSymbol(
                            movePair.black.classification
                          )}
                        </span>
                        {movePair.black.coach_commentary && (
                          <span
                            className="ml-1 text-purple-600"
                            title="Coach commentary available"
                          >
                            🎓
                          </span>
                        )}
                      </button>
                    ) : (
                      <div className="flex-1"></div>
                    )}
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GameViewer;
