import { useEffect, useState } from 'react'
import { statsAPI } from '../lib/api'
import { 
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell 
} from 'recharts'
import { TrendingUp, Award, Zap, AlertTriangle } from 'lucide-react'

interface Stats {
  total_games: number
  total_wins: number
  total_losses: number
  total_draws: number
  white_games: number
  white_wins: number
  black_games: number
  black_wins: number
  avg_accuracy: number | null
  avg_centipawn_loss: number | null
  total_blunders: number
  total_mistakes: number
  total_inaccuracies: number
}

const Statistics = () => {
  const [stats, setStats] = useState<Stats | null>(null)
  const [performanceData, setPerformanceData] = useState<any[]>([])
  const [timeControlData, setTimeControlData] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchStatistics()
  }, [])

  const fetchStatistics = async () => {
    try {
      const [statsRes, performanceRes, timeControlRes] = await Promise.all([
        statsAPI.getUserStats(),
        statsAPI.getPerformanceOverTime({ months: 12 }),
        statsAPI.getTimeControlStats(),
      ])

      setStats(statsRes.data)
      setPerformanceData(performanceRes.data)
      setTimeControlData(timeControlRes.data)
    } catch (error) {
      console.error('Failed to fetch statistics:', error)
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600">Failed to load statistics</p>
      </div>
    )
  }

  const winRate = stats.total_games > 0 
    ? ((stats.total_wins / stats.total_games) * 100).toFixed(1)
    : '0.0'
  
  const whiteWinRate = stats.white_games > 0
    ? ((stats.white_wins / stats.white_games) * 100).toFixed(1)
    : '0.0'
  
  const blackWinRate = stats.black_games > 0
    ? ((stats.black_wins / stats.black_games) * 100).toFixed(1)
    : '0.0'

  const resultData = [
    { name: 'Wins', value: stats.total_wins, color: '#10b981' },
    { name: 'Losses', value: stats.total_losses, color: '#ef4444' },
    { name: 'Draws', value: stats.total_draws, color: '#6b7280' },
  ]

  const colorData = [
    { color: 'White', games: stats.white_games, wins: stats.white_wins, winRate: parseFloat(whiteWinRate) },
    { color: 'Black', games: stats.black_games, wins: stats.black_wins, winRate: parseFloat(blackWinRate) },
  ]

  const errorData = [
    { type: 'Blunders', count: stats.total_blunders, color: '#ef4444' },
    { type: 'Mistakes', count: stats.total_mistakes, color: '#f59e0b' },
    { type: 'Inaccuracies', count: stats.total_inaccuracies, color: '#eab308' },
  ]

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Statistics</h1>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Total Games</span>
            <Award className="text-primary-600" size={20} />
          </div>
          <p className="text-3xl font-bold text-gray-900">{stats.total_games}</p>
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
            {stats.avg_accuracy ? `${stats.avg_accuracy.toFixed(1)}%` : 'N/A'}
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Total Errors</span>
            <AlertTriangle className="text-red-600" size={20} />
          </div>
          <p className="text-3xl font-bold text-gray-900">
            {stats.total_blunders + stats.total_mistakes + stats.total_inaccuracies}
          </p>
          <p className="text-sm text-gray-600 mt-1">
            {stats.total_blunders}B / {stats.total_mistakes}M / {stats.total_inaccuracies}I
          </p>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Result Distribution */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Result Distribution</h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={resultData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={(entry) => `${entry.name}: ${entry.value} (${((entry.value / stats.total_games) * 100).toFixed(1)}%)`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {resultData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Color Performance */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Performance by Color</h2>
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
              <p className="text-2xl font-bold text-gray-900">{whiteWinRate}%</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-600">Black Win Rate</p>
              <p className="text-2xl font-bold text-gray-900">{blackWinRate}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Performance Over Time */}
      {performanceData.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-6 mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Performance Over Time</h2>
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
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Performance by Time Control</h2>
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
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Error Analysis</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={errorData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="type" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="count" name="Count">
              {errorData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="mt-4 text-center text-sm text-gray-600">
          <p>Total Errors: {stats.total_blunders + stats.total_mistakes + stats.total_inaccuracies}</p>
          {stats.avg_centipawn_loss && (
            <p>Average Centipawn Loss: {stats.avg_centipawn_loss.toFixed(2)}</p>
          )}
        </div>
      </div>
    </div>
  )
}

export default Statistics

