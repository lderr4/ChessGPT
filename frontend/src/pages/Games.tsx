import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { gamesAPI } from "../lib/api";
import { ChevronLeft, ChevronRight, Filter, Zap, Loader2 } from "lucide-react";

interface Game {
  id: number;
  white_player: string;
  black_player: string;
  result: string;
  date_played: string;
  time_class: string;
  opening_eco: string;
  opening_name: string;
  is_analyzed: boolean;
  analysis_state: "unanalyzed" | "in_progress" | "analyzed";
  accuracy: number | null;
  num_blunders: number;
  num_mistakes: number;
  num_inaccuracies: number;
  user_color: string;
}

const Games = () => {
  const [games, setGames] = useState<Game[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [analyzingGameIds, setAnalyzingGameIds] = useState<Set<number>>(
    new Set()
  );
  const [filters, setFilters] = useState({
    time_class: "",
    result: "",
    opening_eco: "",
  });
  const [showBatchAnalysisModal, setShowBatchAnalysisModal] = useState(false);
  const [batchAnalysisJob, setBatchAnalysisJob] = useState<any>(null);
  const [isBatchAnalyzing, setIsBatchAnalyzing] = useState(false);
  const fetchGamesRef = useRef<() => Promise<void>>();
  const analyzingGameIdsRef = useRef<Set<number>>(new Set());

  const GAMES_PER_PAGE = 20;

  // Keep ref in sync with state
  useEffect(() => {
    analyzingGameIdsRef.current = analyzingGameIds;
  }, [analyzingGameIds]);

  // SSE connection for real-time game analysis updates
  useEffect(() => {
    const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
    const token = localStorage.getItem("access_token");

    if (!token) {
      console.log("No auth token found, skipping SSE connection");
      return;
    }

    // Build SSE URL with token as query parameter (EventSource doesn't support headers)
    // Alternative: backend could use cookies for auth
    const sseUrl = `${API_URL}/api/games/events/analysis?token=${encodeURIComponent(
      token
    )}`;

    console.log("Connecting to SSE endpoint for analysis events...");
    const eventSource = new EventSource(sseUrl);

    eventSource.addEventListener("connected", (e) => {
      const data = JSON.parse(e.data);
      console.log("SSE connected:", data);
    });

    eventSource.addEventListener("game_analysis_completed", (e) => {
      try {
        const data = JSON.parse(e.data);
        console.log("Game analysis completed event received:", data);

        const { game_id } = data;

        if (!game_id) {
          console.warn(
            "Received analysis completion event without game_id:",
            data
          );
          return;
        }

        // Update the specific game in state
        setGames((prevGames) =>
          prevGames.map((game) =>
            game.id === game_id
              ? { ...game, analysis_state: "analyzed" as const }
              : game
          )
        );

        // Remove from analyzing set
        setAnalyzingGameIds((prev) => {
          const newSet = new Set(prev);
          newSet.delete(game_id);
          console.log(
            `Removed game ${game_id} from analyzing set. Remaining:`,
            Array.from(newSet)
          );
          return newSet;
        });

        // Fetch updated game data to get analysis stats (accuracy, blunders, etc.)
        // Update only this game in state to avoid triggering loading state
        setTimeout(async () => {
          try {
            const response = await gamesAPI.getGame(game_id);
            const updatedGame = response.data;
            setGames((prevGames) =>
              prevGames.map((game) =>
                game.id === game_id
                  ? {
                      ...game,
                      analysis_state: "analyzed" as const,
                      is_analyzed: true,
                      accuracy: updatedGame.accuracy,
                      num_blunders: updatedGame.num_blunders,
                      num_mistakes: updatedGame.num_mistakes,
                      num_inaccuracies: updatedGame.num_inaccuracies,
                    }
                  : game
              )
            );
            console.log(`Updated game ${game_id} with analysis stats`);
          } catch (error) {
            console.error(`Failed to fetch updated game ${game_id}:`, error);
            // Game is already marked as analyzed, so this is not critical
          }
        }, 500);
      } catch (error) {
        console.error(
          "Error processing game analysis completion event:",
          error
        );
      }
    });

    eventSource.addEventListener("error", (e) => {
      console.error("SSE connection error:", e);
      // EventSource will automatically attempt to reconnect
    });

    // Cleanup on unmount
    return () => {
      console.log("Closing SSE connection");
      eventSource.close();
    };
  }, []); // Only run once on mount

  const fetchGames = async () => {
    setIsLoading(true);
    try {
      const params: any = {
        skip: page * GAMES_PER_PAGE,
        limit: GAMES_PER_PAGE,
      };

      if (filters.time_class) params.time_class = filters.time_class;
      if (filters.result) params.result = filters.result;
      if (filters.opening_eco) params.opening_eco = filters.opening_eco;

      const response = await gamesAPI.getGames(params);

      // Update games: if a game is in analyzingGameIds, ensure it shows as in_progress
      const currentAnalyzingIds = analyzingGameIdsRef.current;
      const updatedGames = response.data.map((game: Game) => {
        if (
          currentAnalyzingIds.has(game.id) &&
          game.analysis_state !== "in_progress"
        ) {
          // Game is being analyzed but API hasn't updated yet - treat as in_progress
          console.log(
            `Game ${game.id} is in analyzingGameIds, forcing in_progress state`
          );
          return { ...game, analysis_state: "in_progress" as const };
        }
        return game;
      });

      setGames(updatedGames);

      // Update analyzingGameIds based on games with analysis_state === "in_progress"
      const inProgressGames = updatedGames
        .filter((game: Game) => game.analysis_state === "in_progress")
        .map((game: Game) => game.id);

      if (inProgressGames.length > 0) {
        console.log(
          `Found ${inProgressGames.length} in-progress games on current page:`,
          inProgressGames
        );
      }

      setAnalyzingGameIds((prev) => {
        const newSet = new Set(prev);
        // Add games that are in progress
        inProgressGames.forEach((id) => newSet.add(id));
        // Don't remove games that are not on current page - they might still be in progress
        // Only remove if we explicitly see they're not in progress
        updatedGames.forEach((game: Game) => {
          if (
            game.analysis_state === "analyzed" ||
            game.analysis_state === "unanalyzed"
          ) {
            newSet.delete(game.id);
          }
        });
        return newSet;
      });
    } catch (error) {
      console.error("Failed to fetch games:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Store fetchGames in ref so it's always current
  fetchGamesRef.current = fetchGames;

  // Fetch in-progress games first, then fetch regular games
  useEffect(() => {
    const loadGames = async () => {
      // First, fetch in-progress games to populate analyzingGameIds
      let inProgressGameIds: number[] = [];
      try {
        console.log("Fetching in-progress games...");
        const inProgressResponse = await gamesAPI.getGames({
          skip: 0,
          limit: 1000,
          analysis_state: "in_progress",
        });

        console.log("In-progress games API response:", inProgressResponse.data);
        inProgressGameIds = inProgressResponse.data.map(
          (game: Game) => game.id
        );

        console.log(
          `Extracted ${inProgressGameIds.length} in-progress game IDs:`,
          inProgressGameIds
        );

        if (inProgressGameIds.length > 0) {
          console.log(
            `Found ${inProgressGameIds.length} in-progress games:`,
            inProgressGameIds
          );
          const inProgressSet = new Set(inProgressGameIds);
          setAnalyzingGameIds(inProgressSet);
          analyzingGameIdsRef.current = inProgressSet; // Update ref immediately
          console.log(
            "Updated analyzingGameIds state and ref:",
            Array.from(inProgressSet)
          );
        } else {
          console.log("No in-progress games found in API response");
        }
      } catch (error) {
        console.error("Failed to fetch in-progress games:", error);
      }

      // Then fetch regular games, passing the in-progress IDs so we can update game states
      setIsLoading(true);
      try {
        const params: any = {
          skip: page * GAMES_PER_PAGE,
          limit: GAMES_PER_PAGE,
        };

        if (filters.time_class) params.time_class = filters.time_class;
        if (filters.result) params.result = filters.result;
        if (filters.opening_eco) params.opening_eco = filters.opening_eco;

        const response = await gamesAPI.getGames(params);
        console.log(
          "Fetched games for current page:",
          response.data.map((g: Game) => ({
            id: g.id,
            analysis_state: g.analysis_state,
          }))
        );

        // Update games: if a game is in inProgressGameIds, ensure it shows as in_progress
        const inProgressSet = new Set(inProgressGameIds);
        const updatedGames = response.data.map((game: Game) => {
          if (
            inProgressSet.has(game.id) &&
            game.analysis_state !== "in_progress"
          ) {
            // Game is being analyzed but API hasn't updated yet - treat as in_progress
            console.log(
              `Game ${game.id} is in in-progress list (state: ${game.analysis_state}), forcing in_progress state`
            );
            return { ...game, analysis_state: "in_progress" as const };
          }
          // Also check if game is in analyzingGameIds (from state)
          if (
            analyzingGameIdsRef.current.has(game.id) &&
            game.analysis_state !== "in_progress"
          ) {
            console.log(
              `Game ${game.id} is in analyzingGameIds ref (state: ${game.analysis_state}), forcing in_progress state`
            );
            return { ...game, analysis_state: "in_progress" as const };
          }
          return game;
        });
        console.log(
          "Updated games array:",
          updatedGames.map((g: Game) => ({
            id: g.id,
            analysis_state: g.analysis_state,
          }))
        );

        setGames(updatedGames);
        console.log("Set games array with updated analysis states");

        // Update analyzingGameIds based on games with analysis_state === "in_progress"
        const inProgressGames = updatedGames
          .filter((game: Game) => game.analysis_state === "in_progress")
          .map((game: Game) => game.id);

        if (inProgressGames.length > 0) {
          console.log(
            `Found ${inProgressGames.length} in-progress games on current page:`,
            inProgressGames
          );
        }

        setAnalyzingGameIds((prev) => {
          const newSet = new Set(prev);
          // Add games that are in progress
          inProgressGames.forEach((id) => newSet.add(id));
          // Don't remove games that are not on current page - they might still be in progress
          // Only remove if we explicitly see they're not in progress
          updatedGames.forEach((game: Game) => {
            if (
              game.analysis_state === "analyzed" ||
              game.analysis_state === "unanalyzed"
            ) {
              newSet.delete(game.id);
            }
          });
          analyzingGameIdsRef.current = newSet; // Update ref
          console.log("Updated analyzingGameIds:", Array.from(newSet));
          return newSet;
        });
      } catch (error) {
        console.error("Failed to fetch games:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadGames();
  }, [page, filters]);

  const handleFilterChange = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(0); // Reset to first page when filtering
  };

  const clearFilters = () => {
    setFilters({ time_class: "", result: "", opening_eco: "" });
    setPage(0);
  };

  // Update games array when analyzingGameIds changes to ensure UI reflects current state
  useEffect(() => {
    setGames((currentGames) => {
      if (currentGames.length === 0 || analyzingGameIds.size === 0) {
        return currentGames;
      }

      const updatedGames = currentGames.map((game: Game) => {
        // If game is in analyzingGameIds but doesn't show as in_progress, update it
        if (
          analyzingGameIds.has(game.id) &&
          game.analysis_state !== "in_progress"
        ) {
          console.log(
            `Updating game ${game.id} to in_progress based on analyzingGameIds`
          );
          return { ...game, analysis_state: "in_progress" as const };
        }
        return game;
      });

      // Only update if something changed
      const hasChanges = updatedGames.some(
        (game: Game, index: number) =>
          game.analysis_state !== currentGames[index].analysis_state
      );

      if (hasChanges) {
        console.log("Updating games array due to analyzingGameIds change");
        return updatedGames;
      }

      return currentGames;
    });
  }, [analyzingGameIds]); // Only re-run when analyzingGameIds changes

  const handleAnalyzeGame = async (
    gameId: number,
    event?: React.MouseEvent
  ) => {
    // Prevent any default behavior and stop propagation
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    console.log(`Starting analysis for game ${gameId}`);
    // Add to analyzing set
    setAnalyzingGameIds((prev) => {
      const newSet = new Set(prev).add(gameId);
      return newSet;
    });

    try {
      await gamesAPI.analyzeGame(gameId);
      console.log(`Analysis started for game ${gameId}`);
      // No need to refresh - UI is updated optimistically via analyzingGameIds state
      // SSE will handle the update when analysis completes
    } catch (error) {
      console.error("Failed to analyze game:", error);
      alert("Failed to start analysis. Please try again.");
      setAnalyzingGameIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(gameId);
        return newSet;
      });
    }
  };

  const handleBatchAnalysis = async () => {
    setShowBatchAnalysisModal(false);
    setIsBatchAnalyzing(true);

    try {
      const response = await gamesAPI.analyzeAllGames();
      const jobId = response.data.job_id;
      setBatchAnalysisJob(response.data);

      // Poll for batch analysis status
      const checkBatchStatus = setInterval(async () => {
        try {
          const statusResponse = await gamesAPI.getAnalysisStatus(jobId);
          setBatchAnalysisJob(statusResponse.data);

          if (
            statusResponse.data.status === "completed" ||
            statusResponse.data.status === "failed"
          ) {
            clearInterval(checkBatchStatus);
            setIsBatchAnalyzing(false);
            // Refresh games list
            fetchGames();

            if (statusResponse.data.status === "completed") {
              alert(
                `Batch analysis completed! ${statusResponse.data.analyzed_games} games have been analyzed.`
              );
            }
          }
        } catch (error) {
          console.error("Error checking batch analysis status:", error);
        }
      }, 5000); // Check every 5 seconds
    } catch (error: any) {
      console.error("Failed to start batch analysis:", error);
      const status = error.response?.status;
      const errorMessage =
        error.response?.data?.detail || "Failed to start batch analysis";

      if (status === 429) {
        // User already has a job running - extract job ID
        const jobIdMatch = errorMessage.match(/Job #(\d+)/);
        const stuckJobId = jobIdMatch ? parseInt(jobIdMatch[1]) : null;

        const shouldCancel = window.confirm(
          `⏳ ${errorMessage}\n\n` +
            `It looks like you have a stuck job from before the server restarted.\n\n` +
            `Click OK to cancel the old job and start fresh, or Cancel to wait.`
        );

        if (shouldCancel) {
          try {
            await gamesAPI.cancelAnalysisJob(stuckJobId ?? undefined);
            alert("✅ Old job cancelled! You can now start a new analysis.");
            // Automatically retry
            handleBatchAnalysis();
            return;
          } catch (cancelError: any) {
            const cancelStatus = cancelError?.response?.status;
            // 404 = job already gone, 400 = already completed/cancelled
            if (cancelStatus === 404 || cancelStatus === 400) {
              alert("✅ Job is no longer active. Starting fresh analysis.");
              handleBatchAnalysis();
              return;
            }
            console.error("Failed to cancel job:", cancelError);
            alert(
              "Failed to cancel the old job. Please refresh the page and try again."
            );
          }
        }
      } else if (status === 503) {
        // Server at capacity
        alert(
          `🚦 ${errorMessage}\n\nThe server is busy analyzing games for other users. Please try again in a few minutes.`
        );
      } else {
        alert(errorMessage);
      }

      setIsBatchAnalyzing(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Games</h1>
        <div className="flex gap-3">
          <button
            onClick={() => setShowBatchAnalysisModal(true)}
            disabled={isBatchAnalyzing}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Zap size={18} />
            Analyze All Games
          </button>
          <Link
            to="/profile"
            className="px-4 py-2 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition"
          >
            Import Games
          </Link>
        </div>
      </div>

      {/* Batch Analysis Status Banner */}
      {isBatchAnalyzing && batchAnalysisJob && (
        <div className="mb-6 bg-purple-50 border border-purple-200 rounded-lg p-4">
          <div className="flex items-center gap-3 mb-3">
            <Loader2 size={20} className="animate-spin text-purple-600" />
            <div>
              <p className="text-sm font-medium text-purple-900">
                Batch Analysis in Progress
              </p>
              <p className="text-xs text-purple-700 mt-1">
                {batchAnalysisJob.analyzed_games || 0} /{" "}
                {batchAnalysisJob.total_games || 0} games analyzed (
                {batchAnalysisJob.progress || 0}%)
              </p>
            </div>
          </div>
          <div className="w-full bg-purple-200 rounded-full h-2">
            <div
              className="bg-purple-600 h-2 rounded-full transition-all duration-500"
              style={{ width: `${batchAnalysisJob.progress || 0}%` }}
            ></div>
          </div>
          <p className="text-xs text-purple-700 mt-2">
            ⏰ This will take a while. Feel free to close this page and come
            back later!
          </p>
        </div>
      )}

      {/* Analysis Status Banner - only show when NOT in batch mode (batch has its own purple banner) */}
      {analyzingGameIds.size > 0 && !isBatchAnalyzing && (
        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center gap-3">
          <Loader2 size={20} className="animate-spin text-blue-600" />
          <div>
            <p className="text-sm font-medium text-blue-900">
              Analyzing {analyzingGameIds.size} game
              {analyzingGameIds.size > 1 ? "s" : ""}...
            </p>
            <p className="text-xs text-blue-700 mt-1">
              This may take 30-60 seconds per game. Feel free to continue
              browsing.
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter size={20} className="text-gray-600" />
          <h2 className="text-lg font-semibold text-gray-900">Filters</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Time Control
            </label>
            <select
              value={filters.time_class}
              onChange={(e) => handleFilterChange("time_class", e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
            >
              <option value="">All</option>
              <option value="bullet">Bullet</option>
              <option value="blitz">Blitz</option>
              <option value="rapid">Rapid</option>
              <option value="daily">Daily</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Result
            </label>
            <select
              value={filters.result}
              onChange={(e) => handleFilterChange("result", e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
            >
              <option value="">All</option>
              <option value="win">Wins</option>
              <option value="loss">Losses</option>
              <option value="draw">Draws</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={clearFilters}
              className="w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Games List */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        </div>
      ) : games.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center">
          <p className="text-gray-600 mb-4">No games found</p>
          <Link
            to="/profile"
            className="inline-block px-6 py-3 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition"
          >
            Import Games
          </Link>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl shadow-sm overflow-hidden mb-6">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left py-4 px-6 text-sm font-medium text-gray-600">
                    Players
                  </th>
                  <th className="text-center py-4 px-6 text-sm font-medium text-gray-600">
                    Opening
                  </th>
                  <th className="text-center py-4 px-6 text-sm font-medium text-gray-600">
                    Time
                  </th>
                  <th className="text-center py-4 px-6 text-sm font-medium text-gray-600">
                    Result
                  </th>
                  <th className="text-center py-4 px-6 text-sm font-medium text-gray-600">
                    Accuracy
                  </th>
                  <th className="text-center py-4 px-6 text-sm font-medium text-gray-600">
                    Errors
                  </th>
                  <th className="text-right py-4 px-6 text-sm font-medium text-gray-600">
                    Date
                  </th>
                  <th className="text-center py-4 px-6 text-sm font-medium text-gray-600">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {games.map((game) => (
                  <tr key={game.id} className="hover:bg-gray-50">
                    <td className="py-4 px-6">
                      <Link
                        to={`/games/${game.id}`}
                        className="hover:text-primary-600"
                      >
                        <div className="font-medium text-gray-900">
                          {game.user_color === "white" ? (
                            <>
                              <span className="text-primary-600">
                                {game.white_player}
                              </span>{" "}
                              vs {game.black_player}
                            </>
                          ) : (
                            <>
                              {game.white_player} vs{" "}
                              <span className="text-primary-600">
                                {game.black_player}
                              </span>
                            </>
                          )}
                        </div>
                      </Link>
                    </td>
                    <td className="py-4 px-6 text-center">
                      <div className="text-sm">
                        <p className="font-medium text-gray-900">
                          {game.opening_eco || "N/A"}
                        </p>
                        <p className="text-gray-600 truncate max-w-[200px]">
                          {game.opening_name || "Unknown"}
                        </p>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-center">
                      <span className="inline-block px-2 py-1 bg-gray-100 text-gray-700 rounded text-sm">
                        {game.time_class}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-center">
                      <span
                        className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
                          game.result === "win"
                            ? "bg-green-100 text-green-700"
                            : game.result === "loss"
                            ? "bg-red-100 text-red-700"
                            : "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {game.result}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-center">
                      {game.analysis_state === "analyzed" &&
                      game.accuracy !== null ? (
                        <span className="font-medium text-gray-900">
                          {game.accuracy.toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-gray-400 text-sm">
                          {game.analysis_state === "in_progress" ||
                          analyzingGameIds.has(game.id)
                            ? "Analyzing..."
                            : "Not analyzed"}
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-6 text-center">
                      {game.analysis_state === "analyzed" ? (
                        <div className="text-sm text-gray-600">
                          {game.num_blunders > 0 && (
                            <span className="text-red-600">
                              {game.num_blunders}B{" "}
                            </span>
                          )}
                          {game.num_mistakes > 0 && (
                            <span className="text-orange-600">
                              {game.num_mistakes}M{" "}
                            </span>
                          )}
                          {game.num_inaccuracies > 0 && (
                            <span className="text-yellow-600">
                              {game.num_inaccuracies}I
                            </span>
                          )}
                          {game.num_blunders === 0 &&
                            game.num_mistakes === 0 &&
                            game.num_inaccuracies === 0 && (
                              <span className="text-green-600">Perfect</span>
                            )}
                        </div>
                      ) : (
                        <span className="text-gray-400 text-sm">-</span>
                      )}
                    </td>
                    <td className="py-4 px-6 text-right text-sm text-gray-600">
                      {new Date(game.date_played).toLocaleDateString()}
                    </td>
                    <td className="py-4 px-6 text-center">
                      {game.analysis_state === "in_progress" ||
                      analyzingGameIds.has(game.id) ? (
                        <div className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium text-blue-600 bg-blue-50 rounded">
                          <Loader2 size={14} className="animate-spin" />
                          Analyzing...
                        </div>
                      ) : game.analysis_state === "analyzed" ? (
                        <span className="text-xs text-green-600 font-medium">
                          ✓ Analyzed
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => handleAnalyzeGame(game.id, e)}
                          className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium text-primary-600 bg-primary-50 rounded hover:bg-primary-100 transition"
                          title="Analyze with Stockfish (~30-60 seconds)"
                        >
                          <Zap size={14} />
                          Analyze
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              <ChevronLeft size={20} />
              Previous
            </button>

            <span className="text-gray-600">Page {page + 1}</span>

            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={games.length < GAMES_PER_PAGE}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              Next
              <ChevronRight size={20} />
            </button>
          </div>
        </>
      )}

      {/* Batch Analysis Modal */}
      {showBatchAnalysisModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">
              ⚡ Analyze All Unanalyzed Games?
            </h3>

            <div className="mb-6 space-y-3">
              <p className="text-gray-700">
                This will analyze all your games that haven't been analyzed yet
                with Stockfish.
              </p>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <p className="text-sm text-amber-900 font-medium mb-2">
                  ⏰ This will take a long time!
                </p>
                <ul className="text-xs text-amber-800 space-y-1">
                  <li>• Each game takes ~30-60 seconds to analyze</li>
                  <li>• The analysis runs in the background on the server</li>
                  <li>
                    • You can close this page and come back later to see the
                    results
                  </li>
                  <li>• Check back in a few hours if you have many games</li>
                </ul>
              </div>

              <p className="text-sm text-gray-600">
                You'll see a progress bar above once the analysis starts. The
                page will automatically refresh when complete, or you can come
                back later to see your analyzed games.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowBatchAnalysisModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleBatchAnalysis}
                className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition"
              >
                Start Analysis
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Games;
