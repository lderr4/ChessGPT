import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { puzzlesAPI } from "../lib/api";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import { Target, Loader2, RotateCcw, ExternalLink } from "lucide-react";

interface Puzzle {
  puzzle_id: string;
  fen: string;
  solution_uci: string;
  solution_uci_list: string[];
  game_id: number;
  user_color: string;
  last_move?: { from_square: string; to_square: string };
  date_played?: string;
  white_player?: string;
  black_player?: string;
  white_elo?: number;
  black_elo?: number;
}

const Puzzles = () => {
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [position, setPosition] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [solvedThisSession, setSolvedThisSession] = useState(0);
  const [lastResult, setLastResult] = useState<"correct" | "wrong" | null>(null);
  const [boardKey, setBoardKey] = useState(0);

  const fetchPuzzle = async () => {
    setIsLoading(true);
    setError(null);
    setLastResult(null);
    try {
      const response = await puzzlesAPI.getNextPuzzle();
      const data = response.data;
      setPuzzle(data);
      setPosition(data.fen);
      setBoardKey((k) => k + 1);
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      setError(
        typeof detail === "string"
          ? detail
          : "Failed to load puzzle. Analyze more games to unlock puzzles from your mistakes."
      );
      setPuzzle(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPuzzle();
  }, []);

  const moveToUCI = (
    sourceSquare: string,
    targetSquare: string,
    promotion?: string
  ): string => {
    let uci = sourceSquare + targetSquare;
    if (promotion) {
      uci += promotion.toLowerCase();
    }
    return uci;
  };

  const onDrop = (sourceSquare: string, targetSquare: string) => {
    if (!puzzle) return false;

    const chess = new Chess(position);
    const piece = chess.get(sourceSquare);
    const isPromotion =
      piece?.type === "p" &&
      ((piece.color === "w" && targetSquare[1] === "8") ||
        (piece.color === "b" && targetSquare[1] === "1"));
    const move = chess.move({
      from: sourceSquare,
      to: targetSquare,
      ...(isPromotion && { promotion: "q" }),
    });

    if (!move) return false;

    const userUci = moveToUCI(sourceSquare, targetSquare, move.promotion);
    const solutions = puzzle.solution_uci_list?.map((s) => s.toLowerCase()) ?? [
      puzzle.solution_uci.toLowerCase(),
    ];
    const isCorrect = solutions.includes(userUci);

    if (isCorrect) {
      setPosition(chess.fen());
      setLastResult("correct");
      setSolvedThisSession((n) => n + 1);
      setTimeout(() => fetchPuzzle(), 800);
      return true;
    } else {
      setLastResult("wrong");
      setTimeout(() => setLastResult(null), 1500);
      return false;
    }
  };

  if (isLoading && !puzzle) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <Loader2 size={48} className="animate-spin text-primary-600 mb-4" />
        <p className="text-gray-600">Loading puzzle...</p>
        <p className="text-sm text-gray-400 mt-2">
          First load may take a few seconds while the position is analyzed.
        </p>
      </div>
    );
  }

  if (error && !puzzle) {
    return (
      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Puzzles</h1>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-8 text-center max-w-lg mx-auto">
          <Target size={48} className="mx-auto text-amber-600 mb-4" />
          <p className="text-gray-700 mb-4">{error}</p>
          <Link
            to="/games"
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition"
          >
            Go to Games
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Puzzles</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-gray-600">
            Solved this session: {solvedThisSession}
          </span>
          <button
            onClick={fetchPuzzle}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
          >
            <RotateCcw size={18} />
            Skip
          </button>
        </div>
      </div>

      <p className="text-gray-600 mb-6">
        Find the best move from positions in your analyzed games. These are
        positions where you played a mistake or blunder.
      </p>

      {puzzle && (puzzle.date_played || puzzle.white_player || puzzle.black_player) && (
        <div className="mb-6 p-4 bg-white rounded-xl shadow-sm border border-gray-200 max-w-md mx-auto">
          {puzzle.date_played && (
            <p className="text-sm text-gray-500 mb-2">
              {new Date(puzzle.date_played).toLocaleDateString(undefined, {
                weekday: "short",
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </p>
          )}
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 text-right">
              <span className="font-medium text-gray-900">
                {puzzle.white_player || "White"}
              </span>
              {puzzle.white_elo != null && (
                <span className="ml-2 text-gray-500">({puzzle.white_elo})</span>
              )}
            </div>
            <span className="text-gray-400 font-medium">vs</span>
            <div className="flex-1 text-left">
              <span className="font-medium text-gray-900">
                {puzzle.black_player || "Black"}
              </span>
              {puzzle.black_elo != null && (
                <span className="ml-2 text-gray-500">({puzzle.black_elo})</span>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col items-center">
        <div
          className={`relative transition-all duration-300 ${
            lastResult === "correct"
              ? "ring-4 ring-green-400 rounded-xl"
              : lastResult === "wrong"
                ? "ring-4 ring-red-400 rounded-xl animate-shake"
                : ""
          }`}
        >
          <Chessboard
            key={boardKey}
            position={position}
            boardWidth={Math.min(500, window.innerWidth - 100)}
            boardOrientation={
              puzzle.user_color === "white" ? "white" : "black"
            }
            onPieceDrop={onDrop}
            arePiecesDraggable={true}
            customBoardStyle={{
              borderRadius: "8px",
              boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
            }}
            customSquareStyles={
              puzzle.last_move
                ? {
                    [puzzle.last_move.from_square]: {
                      backgroundColor: "rgba(255, 255, 0, 0.4)",
                    },
                    [puzzle.last_move.to_square]: {
                      backgroundColor: "rgba(255, 255, 0, 0.6)",
                    },
                  }
                : {}
            }
          />
          {lastResult === "correct" && (
            <div className="absolute inset-0 flex items-center justify-center bg-green-500/20 rounded-xl pointer-events-none">
              <span className="text-4xl font-bold text-green-700">Correct!</span>
            </div>
          )}
        </div>

        {lastResult === "wrong" && (
          <p className="mt-4 text-red-600 font-medium">Wrong move. Try again.</p>
        )}

        {puzzle && lastResult !== "correct" && (
          <Link
            to={`/games/${puzzle.game_id}`}
            className="mt-6 flex items-center gap-2 text-primary-600 hover:text-primary-700 font-medium"
          >
            <ExternalLink size={18} />
            View source game
          </Link>
        )}
      </div>
    </div>
  );
};

export default Puzzles;
