import { useEffect, useState } from "react";
import { statsAPI } from "../lib/api";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from "recharts";
import {
  TrendingUp,
  Award,
  Zap,
  AlertTriangle,
  Target,
  BookOpen,
  Swords,
  Crown,
} from "lucide-react";

interface Stats {
  total_games: number;
  total_wins: number;
  total_losses: number;
  total_draws: number;
  white_games: number;
  white_wins: number;
  black_games: number;
  black_wins: number;
  avg_accuracy: number | null;
  avg_centipawn_loss: number | null;
  total_blunders: number;
  total_mistakes: number;
  total_inaccuracies: number;
}

interface ErrorByPhase {
  phase: string;
  blunders: number;
  mistakes: number;
  inaccuracies: number;
  total_errors: number;
  total_moves: number;
  error_rate: number;
}

interface WinLossCorrelation {
  wins: {
    blunders: number;
    mistakes: number;
    inaccuracies: number;
    accuracy: number;
  };
  losses: {
    blunders: number;
    mistakes: number;
    inaccuracies: number;
    accuracy: number;
  };
  win_game_count: number;
  loss_game_count: number;
}

interface PerformanceByPhase {
  phase: string;
  wins: number;
  losses: number;
  draws: number;
  total_games: number;
  win_rate: number;
  avg_accuracy: number;
}

const Statistics = () => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [performanceData, setPerformanceData] = useState<any[]>([]);
  const [timeControlData, setTimeControlData] = useState<any[]>([]);
  const [errorsByPhase, setErrorsByPhase] = useState<ErrorByPhase[]>([]);
  const [winLossCorrelation, setWinLossCorrelation] =
    useState<WinLossCorrelation | null>(null);
  const [performanceByPhase, setPerformanceByPhase] = useState<
    PerformanceByPhase[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchStatistics();
  }, []);

  const fetchStatistics = async () => {
    try {
      const [
        statsRes,
        performanceRes,
        timeControlRes,
        errorsPhaseRes,
        correlationRes,
        phasePerformanceRes,
      ] = await Promise.all([
        statsAPI.getUserStats(),
        statsAPI.getPerformanceOverTime({ months: 12 }),
        statsAPI.getTimeControlStats(),
        statsAPI.getErrorsByPhase(),
        statsAPI.getWinLossCorrelation(),
        statsAPI.getPerformanceByPhase(),
      ]);

      setStats(statsRes.data);
      setPerformanceData(performanceRes.data);
      setTimeControlData(timeControlRes.data);
      setErrorsByPhase(errorsPhaseRes.data);
      setWinLossCorrelation(correlationRes.data);
      setPerformanceByPhase(phasePerformanceRes.data);
    } catch (error) {
      console.error("Failed to fetch statistics:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600">Failed to load statistics</p>
      </div>
    );
  }

  const winRate =
    stats.total_games > 0
      ? ((stats.total_wins / stats.total_games) * 100).toFixed(1)
      : "0.0";

  const whiteWinRate =
    stats.white_games > 0
      ? ((stats.white_wins / stats.white_games) * 100).toFixed(1)
      : "0.0";

  const blackWinRate =
    stats.black_games > 0
      ? ((stats.black_wins / stats.black_games) * 100).toFixed(1)
      : "0.0";

  const resultData = [
    { name: "Wins", value: stats.total_wins, color: "#10b981" },
    { name: "Losses", value: stats.total_losses, color: "#ef4444" },
    { name: "Draws", value: stats.total_draws, color: "#6b7280" },
  ];

  const colorData = [
    {
      color: "White",
      games: stats.white_games,
      wins: stats.white_wins,
      winRate: parseFloat(whiteWinRate),
    },
    {
      color: "Black",
      games: stats.black_games,
      wins: stats.black_wins,
      winRate: parseFloat(blackWinRate),
    },
  ];

  const errorData = [
    { type: "Blunders", count: stats.total_blunders, color: "#ef4444" },
    { type: "Mistakes", count: stats.total_mistakes, color: "#f59e0b" },
    { type: "Inaccuracies", count: stats.total_inaccuracies, color: "#eab308" },
  ];

  // Generate insights based on data
  const generateInsights = () => {
    const insights = [];

    // Phase-based insights
    if (errorsByPhase.length > 0) {
      const maxErrorPhase = errorsByPhase.reduce((prev, current) =>
        prev.error_rate > current.error_rate ? prev : current
      );
      insights.push({
        icon: <AlertTriangle className="text-red-500" />,
        title: `Most Errors in ${maxErrorPhase.phase}`,
        description: `You make ${maxErrorPhase.error_rate.toFixed(
          1
        )}% errors in the ${maxErrorPhase.phase.toLowerCase()}. Focus your study here.`,
        color: "red",
      });
    }

    // Performance by phase insights
    if (performanceByPhase.length > 0) {
      const weakestPhase = performanceByPhase.reduce((prev, current) =>
        prev.win_rate < current.win_rate ? prev : current
      );
      insights.push({
        icon: <Target className="text-orange-500" />,
        title: `Weakest in ${weakestPhase.phase}`,
        description: `${weakestPhase.win_rate.toFixed(
          1
        )}% win rate when games reach ${weakestPhase.phase.toLowerCase()}. Study ${weakestPhase.phase.toLowerCase()} positions.`,
        color: "orange",
      });
    }

    // Win/Loss correlation insights
    if (winLossCorrelation) {
      const winErrors =
        winLossCorrelation.wins.blunders + winLossCorrelation.wins.mistakes;
      const lossErrors =
        winLossCorrelation.losses.blunders + winLossCorrelation.losses.mistakes;
      if (lossErrors > winErrors * 2) {
        insights.push({
          icon: <Zap className="text-yellow-500" />,
          title: "Errors Cost You Games",
          description: `You average ${lossErrors.toFixed(
            1
          )} serious errors in losses vs ${winErrors.toFixed(
            1
          )} in wins. Focus on reducing blunders and mistakes.`,
          color: "yellow",
        });
      }
    }

    // Accuracy insight
    if (stats.avg_accuracy) {
      if (stats.avg_accuracy < 70) {
        insights.push({
          icon: <TrendingUp className="text-blue-500" />,
          title: "Room for Improvement",
          description: `${stats.avg_accuracy.toFixed(
            1
          )}% average accuracy. Aim for 75%+ by studying tactical patterns and avoiding mistakes.`,
          color: "blue",
        });
      } else if (stats.avg_accuracy >= 80) {
        insights.push({
          icon: <Award className="text-green-500" />,
          title: "Strong Play!",
          description: `${stats.avg_accuracy.toFixed(
            1
          )}% average accuracy shows solid fundamentals. Keep it up!`,
          color: "green",
        });
      }
    }

    return insights;
  };

  const insights = generateInsights();

  // Prepare radar chart data for strengths/weaknesses
  const radarData = performanceByPhase.map((phase) => ({
    phase: phase.phase,
    "Win Rate": phase.win_rate,
    Accuracy: phase.avg_accuracy || 0,
  }));

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-gray-900">
          Comprehensive Statistics
        </h1>
        <p className="text-sm text-gray-600">
          Understanding your chess strengths & weaknesses
        </p>
      </div>

      {/* Key Insights */}
      {insights.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Target size={24} className="text-primary-600" />
            Key Insights & Recommendations
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {insights.map((insight, idx) => (
              <div
                key={idx}
                className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-${insight.color}-500"
              >
                <div className="flex items-start gap-3">
                  <div className="mt-1">{insight.icon}</div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 mb-1">
                      {insight.title}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {insight.description}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Total Games</span>
            <Award className="text-primary-600" size={20} />
          </div>
          <p className="text-3xl font-bold text-gray-900">
            {stats.total_games}
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Win Rate</span>
            <TrendingUp className="text-green-600" size={20} />
          </div>
          <p className="text-3xl font-bold text-gray-900">{winRate}%</p>
          <p className="text-sm text-gray-600 mt-1">
            {stats.total_wins}W / {stats.total_losses}L / {stats.total_draws}D
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Avg Accuracy</span>
            <Zap className="text-yellow-600" size={20} />
          </div>
          <p className="text-3xl font-bold text-gray-900">
            {stats.avg_accuracy ? `${stats.avg_accuracy.toFixed(1)}%` : "N/A"}
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Total Errors</span>
            <AlertTriangle className="text-red-600" size={20} />
          </div>
          <p className="text-3xl font-bold text-gray-900">
            {stats.total_blunders +
              stats.total_mistakes +
              stats.total_inaccuracies}
          </p>
          <p className="text-sm text-gray-600 mt-1">
            {stats.total_blunders}B / {stats.total_mistakes}M /{" "}
            {stats.total_inaccuracies}I
          </p>
        </div>
      </div>

      {/* NEW: Phase Performance Overview */}
      {performanceByPhase.length > 0 && (
        <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-xl shadow-sm p-6 mb-8 border border-purple-200">
          <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Crown className="text-purple-600" size={24} />
            Strengths & Weaknesses by Game Phase
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <ResponsiveContainer width="100%" height={300}>
                <RadarChart data={radarData}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="phase" />
                  <PolarRadiusAxis angle={90} domain={[0, 100]} />
                  <Radar
                    name="Win Rate"
                    dataKey="Win Rate"
                    stroke="#10b981"
                    fill="#10b981"
                    fillOpacity={0.6}
                  />
                  <Radar
                    name="Accuracy"
                    dataKey="Accuracy"
                    stroke="#f59e0b"
                    fill="#f59e0b"
                    fillOpacity={0.6}
                  />
                  <Legend />
                  <Tooltip />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-3 gap-4">
              {performanceByPhase.map((phase, idx) => (
                <div key={idx} className="bg-white rounded-lg p-4 shadow-sm">
                  <div className="text-center">
                    <div className="text-3xl mb-2">
                      {phase.phase === "Opening" && (
                        <BookOpen className="mx-auto text-blue-500" />
                      )}
                      {phase.phase === "Middlegame" && (
                        <Swords className="mx-auto text-green-500" />
                      )}
                      {phase.phase === "Endgame" && (
                        <Crown className="mx-auto text-purple-500" />
                      )}
                    </div>
                    <h3 className="font-semibold text-gray-900 mb-2">
                      {phase.phase}
                    </h3>
                    <p className="text-2xl font-bold text-primary-600">
                      {phase.win_rate.toFixed(1)}%
                    </p>
                    <p className="text-xs text-gray-600 mt-1">Win Rate</p>
                    <p className="text-sm text-gray-700 mt-2">
                      {phase.avg_accuracy.toFixed(1)}% Accuracy
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {phase.total_games} games
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* NEW: Errors by Game Phase */}
      {errorsByPhase.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-6 mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <AlertTriangle className="text-red-600" size={24} />
            Error Distribution by Game Phase
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            Understanding where you make mistakes helps focus your study
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={errorsByPhase}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="phase" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar
                  dataKey="blunders"
                  fill="#ef4444"
                  name="Blunders"
                  stackId="a"
                />
                <Bar
                  dataKey="mistakes"
                  fill="#f59e0b"
                  name="Mistakes"
                  stackId="a"
                />
                <Bar
                  dataKey="inaccuracies"
                  fill="#eab308"
                  name="Inaccuracies"
                  stackId="a"
                />
              </BarChart>
            </ResponsiveContainer>
            <div className="space-y-4">
              {errorsByPhase.map((phase, idx) => (
                <div key={idx} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-gray-900">
                      {phase.phase}
                    </h3>
                    <span className="text-2xl font-bold text-red-600">
                      {phase.error_rate.toFixed(1)}%
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div className="text-center">
                      <p className="text-red-600 font-semibold">
                        {phase.blunders}
                      </p>
                      <p className="text-gray-600 text-xs">Blunders</p>
                    </div>
                    <div className="text-center">
                      <p className="text-orange-600 font-semibold">
                        {phase.mistakes}
                      </p>
                      <p className="text-gray-600 text-xs">Mistakes</p>
                    </div>
                    <div className="text-center">
                      <p className="text-yellow-600 font-semibold">
                        {phase.inaccuracies}
                      </p>
                      <p className="text-gray-600 text-xs">Inaccuracies</p>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    {phase.total_moves} moves analyzed
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* NEW: Win vs Loss Error Comparison */}
      {winLossCorrelation && (
        <div className="bg-white rounded-xl shadow-sm p-6 mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <TrendingUp className="text-green-600" size={24} />
            Wins vs Losses: Error Patterns
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            Compare your error rates in games you win vs games you lose
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={[
                    {
                      category: "Blunders",
                      Wins: winLossCorrelation.wins.blunders,
                      Losses: winLossCorrelation.losses.blunders,
                    },
                    {
                      category: "Mistakes",
                      Wins: winLossCorrelation.wins.mistakes,
                      Losses: winLossCorrelation.losses.mistakes,
                    },
                    {
                      category: "Inaccuracies",
                      Wins: winLossCorrelation.wins.inaccuracies,
                      Losses: winLossCorrelation.losses.inaccuracies,
                    },
                  ]}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="category" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="Wins" fill="#10b981" name="Avg in Wins" />
                  <Bar dataKey="Losses" fill="#ef4444" name="Avg in Losses" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-4">
              <div className="border border-green-200 bg-green-50 rounded-lg p-4">
                <h3 className="font-semibold text-green-900 mb-3 flex items-center gap-2">
                  ✓ Your Winning Games ({winLossCorrelation.win_game_count}{" "}
                  games)
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-3xl font-bold text-green-700">
                      {winLossCorrelation.wins.accuracy.toFixed(1)}%
                    </p>
                    <p className="text-sm text-gray-600">Avg Accuracy</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-gray-700">
                      {winLossCorrelation.wins.blunders.toFixed(1)} B /{" "}
                      {winLossCorrelation.wins.mistakes.toFixed(1)} M
                    </p>
                    <p className="text-sm text-gray-600">Avg Errors</p>
                  </div>
                </div>
              </div>
              <div className="border border-red-200 bg-red-50 rounded-lg p-4">
                <h3 className="font-semibold text-red-900 mb-3 flex items-center gap-2">
                  ✗ Your Losing Games ({winLossCorrelation.loss_game_count}{" "}
                  games)
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-3xl font-bold text-red-700">
                      {winLossCorrelation.losses.accuracy.toFixed(1)}%
                    </p>
                    <p className="text-sm text-gray-600">Avg Accuracy</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-gray-700">
                      {winLossCorrelation.losses.blunders.toFixed(1)} B /{" "}
                      {winLossCorrelation.losses.mistakes.toFixed(1)} M
                    </p>
                    <p className="text-sm text-gray-600">Avg Errors</p>
                  </div>
                </div>
              </div>
              <div className="bg-blue-50 rounded-lg p-4">
                <p className="text-sm text-gray-700">
                  <span className="font-semibold">💡 Tip:</span> You make{" "}
                  <span className="font-bold text-red-600">
                    {(
                      (winLossCorrelation.losses.blunders +
                        winLossCorrelation.losses.mistakes) /
                      (winLossCorrelation.wins.blunders +
                        winLossCorrelation.wins.mistakes)
                    ).toFixed(1)}
                    x
                  </span>{" "}
                  more serious errors in losses. Focus on reducing blunders and
                  mistakes to improve your win rate.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Result Distribution */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Result Distribution
          </h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={resultData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={(entry: any) =>
                  `${entry.name}: ${entry.value} (${(
                    (entry.value / stats.total_games) *
                    100
                  ).toFixed(1)}%)`
                }
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {resultData.map((entry: any, index: number) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Color Performance */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Performance by Color
          </h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={colorData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="color" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="games" fill="#6b7280" name="Games Played" />
              <Bar dataKey="wins" fill="#10b981" name="Wins" />
            </BarChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div className="text-center">
              <p className="text-sm text-gray-600">White Win Rate</p>
              <p className="text-2xl font-bold text-gray-900">
                {whiteWinRate}%
              </p>
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-600">Black Win Rate</p>
              <p className="text-2xl font-bold text-gray-900">
                {blackWinRate}%
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Performance Over Time */}
      {performanceData.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-6 mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Performance Over Time
          </h2>
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={performanceData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis yAxisId="left" />
              <YAxis yAxisId="right" orientation="right" />
              <Tooltip />
              <Legend />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="win_rate"
                stroke="#10b981"
                name="Win Rate %"
                strokeWidth={2}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="games"
                stroke="#0ea5e9"
                name="Games Played"
                strokeWidth={2}
              />
              {performanceData[0].avg_accuracy && (
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="avg_accuracy"
                  stroke="#f59e0b"
                  name="Avg Accuracy %"
                  strokeWidth={2}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Time Control Performance */}
      {timeControlData.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-6 mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Performance by Time Control
          </h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={timeControlData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time_class" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="win_rate" fill="#10b981" name="Win Rate %" />
              <Bar dataKey="games_played" fill="#0ea5e9" name="Games Played" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Error Analysis */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Overall Error Analysis
        </h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={errorData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="type" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="count" name="Count">
              {errorData.map((entry: any, index: number) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="mt-4 text-center text-sm text-gray-600">
          <p>
            Total Errors:{" "}
            {stats.total_blunders +
              stats.total_mistakes +
              stats.total_inaccuracies}
          </p>
          {stats.avg_centipawn_loss && (
            <p>Average Centipawn Loss: {stats.avg_centipawn_loss.toFixed(2)}</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default Statistics;
