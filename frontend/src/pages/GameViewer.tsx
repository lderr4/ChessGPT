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

  useEffect(() => {
    if (gameId) {
      fetchGame(parseInt(gameId));
    }
  }, [gameId]);

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

    if (moveIndex >= 0 && game) {
      const pgn = game.pgn;
      chess.loadPgn(pgn);
      const history = chess.history({ verbose: true });

      chess.reset();
      for (let i = 0; i <= moveIndex && i < history.length; i++) {
        chess.move(history[i]);
      }
    }

    setCurrentPosition(chess.fen());
    setCurrentMoveIndex(moveIndex);

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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chess Board */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl shadow-sm p-6">
            {/* Game Info */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">
                    {game.white_player} vs {game.black_player}
                  </h2>
                  <p className="text-gray-600">
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
            <div className="mb-4 flex items-center justify-between">
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

            {/* Board */}
            <div className="mb-6">
              <Chessboard
                position={currentPosition}
                boardWidth={Math.min(600, window.innerWidth - 100)}
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
              />
              {isAnalysisMode && (
                <div className="mt-2 text-center text-sm text-purple-600 font-medium">
                  🎯 Make moves on the board to see live engine analysis
                </div>
              )}
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={goToStart}
                className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                title="Start"
              >
                <SkipBack size={20} />
              </button>
              <button
                onClick={goToPrevious}
                className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                title="Previous"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                onClick={goToNext}
                className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                title="Next"
              >
                <ChevronRight size={20} />
              </button>
              <button
                onClick={goToEnd}
                className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                title="End"
              >
                <SkipForward size={20} />
              </button>
            </div>

            {/* Evaluation Graph */}
            {game.is_analyzed && game.moves.length > 0 && (
              <div className="mt-6">
                <h3 className="font-semibold text-gray-900 mb-3">
                  Game Evaluation
                </h3>
                <div className="bg-gray-50 rounded-lg p-4">
                  <ResponsiveContainer width="100%" height={250}>
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

                  {/* Phase Legend */}
                  <div className="flex items-center justify-center gap-6 mt-4 text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-blue-100 border border-blue-400 rounded"></div>
                      <span className="text-gray-700">
                        Opening (1-10 moves)
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-green-100 border border-green-400 rounded"></div>
                      <span className="text-gray-700">Middlegame</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-amber-100 border border-amber-400 rounded"></div>
                      <span className="text-gray-700">Endgame</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Current Move Info */}
            {currentMove && game.is_analyzed && (
              <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                <h3 className="font-semibold text-gray-900 mb-2">
                  Move Analysis
                </h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
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
                  {currentMove.centipawn_loss !== null && (
                    <div>
                      <span className="text-gray-600">CP Loss: </span>
                      <span className="font-medium text-gray-900">
                        {currentMove.centipawn_loss.toFixed(1)}
                      </span>
                    </div>
                  )}
                  {currentMove.evaluation_after !== null && (
                    <div>
                      <span className="text-gray-600">Evaluation: </span>
                      <span className="font-medium text-gray-900">
                        {(currentMove.evaluation_after / 100).toFixed(2)}
                      </span>
                    </div>
                  )}
                  <div>
                    <span className="text-gray-600">Game Phase: </span>
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
              </div>
            )}
          </div>
        </div>

        {/* Move List */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Moves</h3>
            <div className="space-y-1 max-h-[600px] overflow-y-auto">
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
