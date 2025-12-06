import { useEffect, useState } from 'react'
import { statsAPI } from '../lib/api'
import { TrendingUp, TrendingDown, BookOpen } from 'lucide-react'

interface Opening {
  opening_eco: string
  opening_name: string
  games_played: number
  wins: number
  losses: number
  draws: number
  win_rate: number
  avg_accuracy: number | null
}

const Openings = () => {
  const [openings, setOpenings] = useState<Opening[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [sortBy, setSortBy] = useState<'games' | 'winRate' | 'accuracy'>('games')

  useEffect(() => {
    fetchOpenings()
  }, [])

  const fetchOpenings = async () => {
    try {
      const response = await statsAPI.getOpeningStats({ limit: 50 })
      setOpenings(response.data)
    } catch (error) {
      console.error('Failed to fetch openings:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const sortedOpenings = [...openings].sort((a, b) => {
    switch (sortBy) {
      case 'games':
        return b.games_played - a.games_played
      case 'winRate':
        return b.win_rate - a.win_rate
      case 'accuracy':
        return (b.avg_accuracy || 0) - (a.avg_accuracy || 0)
      default:
        return 0
    }
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (openings.length === 0) {
    return (
      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Openings</h1>
        <div className="bg-white rounded-xl shadow-sm p-12 text-center">
          <BookOpen size={48} className="mx-auto text-gray-400 mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No opening data yet</h3>
          <p className="text-gray-600">
            Import and analyze your games to see opening statistics
          </p>
        </div>
      </div>
    )
  }

  // Calculate summary statistics
  const totalGames = openings.reduce((sum, o) => sum + o.games_played, 0)
  const bestOpening = [...openings].sort((a, b) => b.win_rate - a.win_rate)[0]
  const mostPlayed = openings[0]
  const avgWinRate = openings.reduce((sum, o) => sum + o.win_rate, 0) / openings.length

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Opening Repertoire</h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Total Openings</span>
            <BookOpen className="text-primary-600" size={20} />
          </div>
          <p className="text-3xl font-bold text-gray-900">{openings.length}</p>
          <p className="text-sm text-gray-600 mt-1">{totalGames} games total</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Best Opening</span>
            <TrendingUp className="text-green-600" size={20} />
          </div>
          <p className="text-lg font-bold text-gray-900">{bestOpening.opening_eco}</p>
          <p className="text-sm text-gray-600">{bestOpening.win_rate.toFixed(1)}% win rate</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Most Played</span>
            <BookOpen className="text-blue-600" size={20} />
          </div>
          <p className="text-lg font-bold text-gray-900">{mostPlayed.opening_eco}</p>
          <p className="text-sm text-gray-600">{mostPlayed.games_played} games</p>
        </div>
      </div>

      {/* Sort Controls */}
      <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-gray-700">Sort by:</span>
          <div className="flex gap-2">
            <button
              onClick={() => setSortBy('games')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                sortBy === 'games'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Games Played
            </button>
            <button
              onClick={() => setSortBy('winRate')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                sortBy === 'winRate'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Win Rate
            </button>
            <button
              onClick={() => setSortBy('accuracy')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                sortBy === 'accuracy'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Accuracy
            </button>
          </div>
        </div>
      </div>

      {/* Openings Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {sortedOpenings.map((opening) => {
          const isGoodWinRate = opening.win_rate >= avgWinRate
          
          return (
            <div key={opening.opening_eco} className="bg-white rounded-xl shadow-sm p-6 hover:shadow-md transition">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{opening.opening_eco}</h3>
                  <p className="text-gray-600">{opening.opening_name}</p>
                </div>
                <div className={`flex items-center gap-1 ${
                  isGoodWinRate ? 'text-green-600' : 'text-red-600'
                }`}>
                  {isGoodWinRate ? (
                    <TrendingUp size={20} />
                  ) : (
                    <TrendingDown size={20} />
                  )}
                  <span className="font-bold text-xl">{opening.win_rate.toFixed(1)}%</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600">Games</p>
                  <p className="text-xl font-bold text-gray-900">{opening.games_played}</p>
                </div>
                <div className="text-center p-3 bg-green-50 rounded-lg">
                  <p className="text-sm text-green-600">Wins</p>
                  <p className="text-xl font-bold text-green-700">{opening.wins}</p>
                </div>
                <div className="text-center p-3 bg-red-50 rounded-lg">
                  <p className="text-sm text-red-600">Losses</p>
                  <p className="text-xl font-bold text-red-700">{opening.losses}</p>
                </div>
              </div>

              <div className="flex items-center justify-between text-sm">
                <div>
                  <span className="text-gray-600">Draws: </span>
                  <span className="font-medium text-gray-900">{opening.draws}</span>
                </div>
                {opening.avg_accuracy && (
                  <div>
                    <span className="text-gray-600">Avg Accuracy: </span>
                    <span className="font-medium text-gray-900">{opening.avg_accuracy.toFixed(1)}%</span>
                  </div>
                )}
              </div>

              {/* Win Rate Bar */}
              <div className="mt-4">
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${
                      opening.win_rate >= 60 ? 'bg-green-500' :
                      opening.win_rate >= 50 ? 'bg-yellow-500' :
                      'bg-red-500'
                    }`}
                    style={{ width: `${opening.win_rate}%` }}
                  />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Summary Statistics */}
      <div className="mt-8 bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Summary</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <p className="text-sm text-gray-600">Average Win Rate</p>
            <p className="text-2xl font-bold text-gray-900">{avgWinRate.toFixed(1)}%</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Total Games Analyzed</p>
            <p className="text-2xl font-bold text-gray-900">{totalGames}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Openings with 50%+ Win Rate</p>
            <p className="text-2xl font-bold text-gray-900">
              {openings.filter(o => o.win_rate >= 50).length}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Openings

