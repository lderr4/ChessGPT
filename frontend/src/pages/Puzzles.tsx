import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { puzzlesAPI } from "../lib/api";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import { Target, Loader2, RotateCcw, ExternalLink, Check } from "lucide-react";
import { PUZZLE_QUESTIONS } from "../config/puzzleQuestions";

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
  const [puzzleHistory, setPuzzleHistory] = useState<Puzzle[]>([]);
  const [viewingIndex, setViewingIndex] = useState<number | null>(null);
  const [questionAnswers, setQuestionAnswers] = useState<Record<string, string>>({});
  const [activeArrowQuestion, setActiveArrowQuestion] = useState<string | null>(null);
  const [arrowFromSquare, setArrowFromSquare] = useState<string | null>(null);
  const [arrowsByQuestion, setArrowsByQuestion] = useState<Record<string, Array<[string, string]>>>({});

  const displayPuzzle = viewingIndex !== null ? puzzleHistory[viewingIndex] : puzzle;
  const canMakeMove = PUZZLE_QUESTIONS.every(
    (q) => (questionAnswers[q.id] ?? "").trim().length > 0
  );

  const setAnswer = (questionId: string, value: string) => {
    setQuestionAnswers((prev) => ({ ...prev, [questionId]: value }));
  };
  const isViewingHistory = viewingIndex !== null;

  const fetchPuzzle = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setLastResult(null);
    setViewingIndex(null);
    setQuestionAnswers({});
    setActiveArrowQuestion(null);
    setArrowFromSquare(null);
    setArrowsByQuestion({});
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
  }, []);

  useEffect(() => {
    fetchPuzzle();
  }, [fetchPuzzle]);

  const goToPuzzle = (index: number | null) => {
    setQuestionAnswers({});
    setActiveArrowQuestion(null);
    setArrowFromSquare(null);
    setArrowsByQuestion({});
    if (index === null) {
      setViewingIndex(null);
      if (puzzle) {
        setPosition(puzzle.fen);
        setBoardKey((k) => k + 1);
      }
    } else if (index >= 0 && index < puzzleHistory.length) {
      setViewingIndex(index);
      const p = puzzleHistory[index];
      setPosition(p.fen);
      setBoardKey((k) => k + 1);
      setLastResult(null);
    }
  };

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

  const getMoveSanAndValidate = (
    from: string,
    to: string,
    arrowMode: "checks" | "captures" | "attacks"
  ): string | null => {
    try {
      const chess = new Chess(position);
      const piece = chess.get(from);
      const isPromotion =
        piece?.type === "p" &&
        ((piece.color === "w" && to[1] === "8") || (piece.color === "b" && to[1] === "1"));
      const move = chess.move({
        from,
        to,
        ...(isPromotion && { promotion: "q" }),
      });
      if (!move) return null;

      const isCheck = chess.inCheck();
      const isCapture = !!move.captured;

      if (arrowMode === "checks" && !isCheck) return null;
      if (arrowMode === "captures" && !isCapture) return null;

      return move.san;
    } catch {
      return null;
    }
  };

  const onArrowsChange = useCallback(
    (arrows: Array<[string, string, string?]>) => {
      if (!activeArrowQuestion || !displayPuzzle) return;

      const question = PUZZLE_QUESTIONS.find((q) => q.id === activeArrowQuestion);
      if (!question?.arrowMode) return;

      const knownArrows = new Set(
        (arrowsByQuestion[activeArrowQuestion] ?? []).map(([f, t]) => `${f}-${t}`)
      );
      const newArrows = arrows.filter(
        ([from, to]) => from !== to && !knownArrows.has(`${from}-${to}`)
      );

      const validMoves: Array<{ from: string; to: string; san: string }> = [];
      for (const [from, to] of newArrows) {
        const san = getMoveSanAndValidate(from, to, question.arrowMode!);
        if (san) {
          validMoves.push({ from, to, san });
        }
      }

      if (validMoves.length > 0) {
        const current = questionAnswers[activeArrowQuestion] ?? "";
        const newText = validMoves.reduce(
          (acc, { san }) => (acc ? `${acc}, ${san}` : san),
          current.trim()
        );
        setAnswer(activeArrowQuestion, newText);
        setArrowsByQuestion((prev) => ({
          ...prev,
          [activeArrowQuestion]: [
            ...(prev[activeArrowQuestion] ?? []),
            ...validMoves.map((m) => [m.from, m.to] as [string, string]),
          ],
        }));
      }
    },
    [
      activeArrowQuestion,
      displayPuzzle,
      arrowsByQuestion,
      questionAnswers,
      position,
    ]
  );

  const onSquareClick = (square: string) => {
    if (!activeArrowQuestion || !displayPuzzle) return;

    const question = PUZZLE_QUESTIONS.find((q) => q.id === activeArrowQuestion);
    if (!question?.arrowMode) return;

    if (!arrowFromSquare) {
      const chess = new Chess(position);
      const piece = chess.get(square);
      const userColor = displayPuzzle.user_color === "white" ? "w" : "b";
      if (piece && piece.color === userColor) {
        setArrowFromSquare(square);
      }
      return;
    }

    if (arrowFromSquare === square) {
      setArrowFromSquare(null);
      return;
    }

    const san = getMoveSanAndValidate(arrowFromSquare, square, question.arrowMode);
    if (san) {
      const current = questionAnswers[activeArrowQuestion] ?? "";
      const newText = current.trim()
        ? `${current}, ${san}`
        : san;
      setAnswer(activeArrowQuestion, newText);
      setArrowsByQuestion((prev) => ({
        ...prev,
        [activeArrowQuestion]: [...(prev[activeArrowQuestion] ?? []), [arrowFromSquare, square]],
      }));
    }
    setArrowFromSquare(null);
  };

  const onDrop = (sourceSquare: string, targetSquare: string) => {
    if (!displayPuzzle || !canMakeMove) return false;

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
    const solutions = displayPuzzle.solution_uci_list?.map((s) => s.toLowerCase()) ?? [
      displayPuzzle.solution_uci.toLowerCase(),
    ];
    const isCorrect = solutions.includes(userUci);

    if (isCorrect) {
      setPosition(chess.fen());
      setLastResult("correct");
      if (!isViewingHistory) {
        setSolvedThisSession((n) => n + 1);
        setPuzzleHistory((prev) => [...prev, displayPuzzle]);
        setTimeout(() => fetchPuzzle(), 800);
      } else {
        setTimeout(() => setLastResult(null), 800);
      }
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
    <div className="flex gap-8">
      {/* Question prompts - left side */}
      <aside className="w-64 flex-shrink-0 flex flex-col gap-4 py-4 border-r border-gray-200">
        <h3 className="text-sm font-semibold text-gray-700">
          Think before you move
        </h3>
        <p className="text-xs text-gray-500 -mt-2">
          Answer each question before making your move.
        </p>
        <div className="flex flex-col gap-4">
          {PUZZLE_QUESTIONS.map((q) => (
            <div key={q.id} className="flex flex-col gap-1.5">
              <label
                htmlFor={q.id}
                className={`text-sm font-medium text-gray-700 ${
                  q.arrowMode
                    ? "cursor-pointer hover:text-primary-600"
                    : ""
                } ${activeArrowQuestion === q.id ? "text-primary-600 font-semibold" : ""}`}
                onClick={
                  q.arrowMode
                    ? () =>
                        setActiveArrowQuestion((prev) =>
                          prev === q.id ? null : q.id
                        )
                    : undefined
                }
              >
                {q.label}
                {q.arrowMode && (
                  <span className="ml-1 text-xs text-gray-500">
                    (right-click drag on board)
                  </span>
                )}
              </label>
              <textarea
                id={q.id}
                value={questionAnswers[q.id] ?? ""}
                onChange={(e) => setAnswer(q.id, e.target.value)}
                placeholder={q.placeholder}
                rows={2}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none"
              />
            </div>
          ))}
        </div>
        {!canMakeMove && (
          <p className="text-xs text-amber-600 mt-2">
            Complete all answers to enable the board.
          </p>
        )}
      </aside>

      <div className="flex-1 min-w-0">
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

      {displayPuzzle && (displayPuzzle.date_played || displayPuzzle.white_player || displayPuzzle.black_player) && (
        <div className="mb-6 p-4 bg-white rounded-xl shadow-sm border border-gray-200 max-w-md mx-auto">
          {displayPuzzle.date_played && (
            <p className="text-sm text-gray-500 mb-2">
              {new Date(displayPuzzle.date_played).toLocaleDateString(undefined, {
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
                {displayPuzzle.white_player || "White"}
              </span>
              {displayPuzzle.white_elo != null && (
                <span className="ml-2 text-gray-500">({displayPuzzle.white_elo})</span>
              )}
            </div>
            <span className="text-gray-400 font-medium">vs</span>
            <div className="flex-1 text-left">
              <span className="font-medium text-gray-900">
                {displayPuzzle.black_player || "Black"}
              </span>
              {displayPuzzle.black_elo != null && (
                <span className="ml-2 text-gray-500">({displayPuzzle.black_elo})</span>
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
            boardWidth={Math.min(500, window.innerWidth - 200)}
            boardOrientation={
              displayPuzzle?.user_color === "white" ? "white" : "black"
            }
            onPieceDrop={onDrop}
            onSquareClick={onSquareClick}
            onArrowsChange={onArrowsChange}
            arePiecesDraggable={canMakeMove}
            areArrowsAllowed={true}
            customBoardStyle={{
              borderRadius: "8px",
              boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
            }}
            customSquareStyles={{
              ...(displayPuzzle?.last_move
                ? {
                    [displayPuzzle.last_move.from_square]: {
                      backgroundColor: "rgba(255, 255, 0, 0.4)",
                    },
                    [displayPuzzle.last_move.to_square]: {
                      backgroundColor: "rgba(255, 255, 0, 0.6)",
                    },
                  }
                : {}),
              ...(arrowFromSquare
                ? {
                    [arrowFromSquare]: {
                      backgroundColor: "rgba(34, 211, 238, 0.5)",
                    },
                  }
                : {}),
            }}
            customArrows={
              activeArrowQuestion
                ? (arrowsByQuestion[activeArrowQuestion] ?? []).map(
                    ([from, to]) => [from, to] as [string, string]
                  )
                : undefined
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

        {activeArrowQuestion && (
          <p className="mt-4 text-sm text-primary-600 font-medium">
            Arrow mode: Right-click and drag from your piece to the destination
            square. Valid moves will be added to the text box. Click the
            question again to exit.
          </p>
        )}

        {displayPuzzle && lastResult !== "correct" && (
          <Link
            to={`/games/${displayPuzzle.game_id}`}
            className="mt-6 flex items-center gap-2 text-primary-600 hover:text-primary-700 font-medium"
          >
            <ExternalLink size={18} />
            View source game
          </Link>
        )}
      </div>
      </div>

      {/* Progress bar - right side */}
      <aside className="w-16 flex-shrink-0 flex flex-col items-center gap-2 py-4 border-l border-gray-200 bg-white/50 rounded-l-xl">
        <span className="text-xs font-medium text-gray-500 mb-2">Progress</span>
        <div className="flex flex-col gap-2 max-h-[calc(100vh-12rem)] overflow-y-auto">
          {puzzleHistory.map((_, idx) => (
            <button
              key={idx}
              onClick={() => goToPuzzle(idx)}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shrink-0 ${
                viewingIndex === idx
                  ? "bg-primary-600 text-white ring-2 ring-primary-300 ring-offset-2"
                  : "bg-green-100 text-green-700 hover:bg-green-200"
              }`}
              title={`Puzzle ${idx + 1}${viewingIndex === idx ? " (viewing)" : ""}`}
            >
              <Check size={18} />
            </button>
          ))}
          {puzzle && (
            <button
              onClick={() => goToPuzzle(null)}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shrink-0 ${
                viewingIndex === null
                  ? "bg-primary-600 text-white ring-2 ring-primary-300 ring-offset-2"
                  : "bg-gray-200 text-gray-600 hover:bg-gray-300"
              }`}
              title="Current puzzle"
            >
              {puzzleHistory.length + 1}
            </button>
          )}
        </div>
        <span className="text-xs text-gray-400 mt-2">
          {puzzleHistory.length} solved
        </span>
      </aside>
    </div>
  );
};

export default Puzzles;
