import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { statsAPI } from '../lib/api'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { TrendingUp, TrendingDown, Trophy, Target, Zap, Clock, Award } from 'lucide-react'
import { useAuthStore } from '../store/authStore'

interface DashboardData {
  user_stats: {
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
  recent_games: any[]
  opening_stats: any[]
  time_control_stats: any[]
  performance_over_time: any[]
}

const Dashboard = () => {
  const { user } = useAuthStore()
  const [data, setData] = useState<DashboardData | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    try {
      const response = await statsAPI.getDashboardStats()
      setData(response.data)
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error)
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

  if (!data) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600">Failed to load dashboard data</p>
      </div>
    )
  }

  const { user_stats } = data
  const winRate = user_stats.total_games > 0 
    ? ((user_stats.total_wins / user_stats.total_games) * 100).toFixed(1)
    : '0.0'
  
  const whiteWinRate = user_stats.white_games > 0
    ? ((user_stats.white_wins / user_stats.white_games) * 100).toFixed(1)
    : '0.0'
  
  const blackWinRate = user_stats.black_games > 0
    ? ((user_stats.black_wins / user_stats.black_games) * 100).toFixed(1)
    : '0.0'

  // Data for result distribution pie chart
  const resultData = [
    { name: 'Wins', value: user_stats.total_wins, color: '#10b981' },
    { name: 'Losses', value: user_stats.total_losses, color: '#ef4444' },
    { name: 'Draws', value: user_stats.total_draws, color: '#6b7280' },
  ]

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Dashboard</h1>

      {/* Current Rating - Featured */}
      {user?.current_rating && (
        <div className="bg-gradient-to-br from-primary-500 to-primary-700 rounded-xl shadow-lg p-6 mb-8 text-white">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Award size={24} />
                <span className="text-primary-100 text-sm font-medium">Current Rating</span>
              </div>
              <p className="text-5xl font-bold">{user.current_rating}</p>
              <p className="text-primary-100 text-sm mt-2">Chess.com {data?.time_control_stats?.[0]?.time_class || 'Rating'}</p>
            </div>
            <div className="text-right">
              <TrendingUp size={48} className="text-primary-200" />
            </div>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Total Games</span>
            <Target className="text-primary-600" size={20} />
          </div>
          <p className="text-3xl font-bold text-gray-900">{user_stats.total_games}</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Win Rate</span>
            <Trophy className="text-green-600" size={20} />
          </div>
          <p className="text-3xl font-bold text-gray-900">{winRate}%</p>
          <div className="mt-2 text-sm text-gray-600">
            {user_stats.total_wins}W / {user_stats.total_losses}L / {user_stats.total_draws}D
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Avg Accuracy</span>
            <Zap className="text-yellow-600" size={20} />
          </div>
          <p className="text-3xl font-bold text-gray-900">
            {user_stats.avg_accuracy ? `${user_stats.avg_accuracy.toFixed(1)}%` : 'N/A'}
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Blunders</span>
            <TrendingDown className="text-red-600" size={20} />
          </div>
          <p className="text-3xl font-bold text-gray-900">{user_stats.total_blunders}</p>
          <div className="mt-2 text-sm text-gray-600">
            {user_stats.total_mistakes} mistakes, {user_stats.total_inaccuracies} inaccuracies
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Result Distribution */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Result Distribution</h2>
          {user_stats.total_games > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={resultData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry) => `${entry.name}: ${entry.value}`}
                  outerRadius={80}
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
          ) : (
            <p className="text-gray-500 text-center py-12">No games yet</p>
          )}
        </div>

        {/* Color Performance */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Performance by Color</h2>
          {user_stats.total_games > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart
                data={[
                  { color: 'White', games: user_stats.white_games, winRate: parseFloat(whiteWinRate) },
                  { color: 'Black', games: user_stats.black_games, winRate: parseFloat(blackWinRate) },
                ]}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="color" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="winRate" fill="#0ea5e9" name="Win Rate %" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-500 text-center py-12">No games yet</p>
          )}
        </div>
      </div>

      {/* Performance Over Time */}
      {data.performance_over_time && data.performance_over_time.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-6 mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Performance Over Time</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data.performance_over_time}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="win_rate" stroke="#10b981" name="Win Rate %" />
              <Line type="monotone" dataKey="games" stroke="#0ea5e9" name="Games Played" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Top Openings */}
      {data.opening_stats && data.opening_stats.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900">Top Openings</h2>
            <Link to="/openings" className="text-primary-600 hover:text-primary-700 text-sm font-medium">
              View All
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-gray-200">
                <tr>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Opening</th>
                  <th className="text-center py-3 px-4 text-sm font-medium text-gray-600">Games</th>
                  <th className="text-center py-3 px-4 text-sm font-medium text-gray-600">Win Rate</th>
                  <th className="text-center py-3 px-4 text-sm font-medium text-gray-600">Accuracy</th>
                </tr>
              </thead>
              <tbody>
                {data.opening_stats.slice(0, 5).map((opening, index) => (
                  <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <div>
                        <p className="font-medium text-gray-900">{opening.opening_name}</p>
                        <p className="text-sm text-gray-600">{opening.opening_eco}</p>
                      </div>
                    </td>
                    <td className="text-center py-3 px-4 text-gray-900">{opening.games_played}</td>
                    <td className="text-center py-3 px-4">
                      <span className={`font-medium ${
                        opening.win_rate >= 50 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {opening.win_rate}%
                      </span>
                    </td>
                    <td className="text-center py-3 px-4 text-gray-900">
                      {opening.avg_accuracy ? `${opening.avg_accuracy}%` : 'N/A'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent Games */}
      {data.recent_games && data.recent_games.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900">Recent Games</h2>
            <Link to="/games" className="text-primary-600 hover:text-primary-700 text-sm font-medium">
              View All
            </Link>
          </div>
          <div className="space-y-3">
            {data.recent_games.slice(0, 5).map((game) => (
              <Link
                key={game.id}
                to={`/games/${game.id}`}
                className="block p-4 border border-gray-200 rounded-lg hover:border-primary-300 hover:bg-primary-50 transition"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">
                      {game.white_player} vs {game.black_player}
                    </p>
                    <p className="text-sm text-gray-600">
                      {game.opening_name || 'Unknown Opening'} • {game.time_class}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
                      game.result === 'win' ? 'bg-green-100 text-green-700' :
                      game.result === 'loss' ? 'bg-red-100 text-red-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {game.result}
                    </span>
                    {game.accuracy && (
                      <p className="text-sm text-gray-600 mt-1">{game.accuracy.toFixed(1)}% accuracy</p>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {user_stats.total_games === 0 && (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center">
          <Clock size={48} className="mx-auto text-gray-400 mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No games yet</h3>
          <p className="text-gray-600 mb-6">
            Import your games from Chess.com to start tracking your progress
          </p>
          <Link
            to="/profile"
            className="inline-block px-6 py-3 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition"
          >
            Import Games
          </Link>
        </div>
      )}
    </div>
  )
}

export default Dashboard

