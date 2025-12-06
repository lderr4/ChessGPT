import { useEffect, useState } from "react";
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

  const GAMES_PER_PAGE = 20;

  useEffect(() => {
    fetchGames();
  }, [page, filters]);

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
      setGames(response.data);
    } catch (error) {
      console.error("Failed to fetch games:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFilterChange = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(0); // Reset to first page when filtering
  };

  const clearFilters = () => {
    setFilters({ time_class: "", result: "", opening_eco: "" });
    setPage(0);
  };

  const handleAnalyzeGame = async (gameId: number) => {
    // Add to analyzing set
    setAnalyzingGameIds((prev) => new Set(prev).add(gameId));

    try {
      await gamesAPI.analyzeGame(gameId);

      // Poll for completion (analysis takes 30-60 seconds)
      let attempts = 0;
      const maxAttempts = 60; // 2 minutes max (60 * 2 seconds)

      const checkStatus = setInterval(async () => {
        attempts++;
        try {
          const response = await gamesAPI.getGame(gameId);
          if (response.data.is_analyzed) {
            clearInterval(checkStatus);
            setAnalyzingGameIds((prev) => {
              const newSet = new Set(prev);
              newSet.delete(gameId);
              return newSet;
            });
            // Refresh the games list
            fetchGames();
          } else if (attempts >= maxAttempts) {
            // Timeout - stop polling
            clearInterval(checkStatus);
            setAnalyzingGameIds((prev) => {
              const newSet = new Set(prev);
              newSet.delete(gameId);
              return newSet;
            });
            alert(
              `Analysis timeout for game ${gameId}. It may still be processing. Try refreshing in a minute.`
            );
          }
        } catch (error) {
          console.error("Error checking analysis status:", error);
          clearInterval(checkStatus);
          setAnalyzingGameIds((prev) => {
            const newSet = new Set(prev);
            newSet.delete(gameId);
            return newSet;
          });
        }
      }, 2000); // Check every 2 seconds
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

        if (shouldCancel && stuckJobId) {
          try {
            await gamesAPI.cancelAnalysisJob(stuckJobId);
            alert("✅ Old job cancelled! You can now start a new analysis.");
            // Automatically retry
            handleBatchAnalysis();
            return;
          } catch (cancelError) {
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

      {/* Analysis Status Banner */}
      {analyzingGameIds.size > 0 && (
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
                      {game.is_analyzed && game.accuracy !== null ? (
                        <span className="font-medium text-gray-900">
                          {game.accuracy.toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-gray-400 text-sm">
                          Not analyzed
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-6 text-center">
                      {game.is_analyzed ? (
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
                      {!game.is_analyzed ? (
                        analyzingGameIds.has(game.id) ? (
                          <div className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium text-blue-600 bg-blue-50 rounded">
                            <Loader2 size={14} className="animate-spin" />
                            Analyzing...
                          </div>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              handleAnalyzeGame(game.id);
                            }}
                            className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium text-primary-600 bg-primary-50 rounded hover:bg-primary-100 transition"
                            title="Analyze with Stockfish (~30-60 seconds)"
                          >
                            <Zap size={14} />
                            Analyze
                          </button>
                        )
                      ) : (
                        <span className="text-xs text-green-600 font-medium">
                          ✓ Analyzed
                        </span>
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
