import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

const Register = () => {
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [chessComUsername, setChessComUsername] = useState('')
  const [localError, setLocalError] = useState('')
  const { register, isLoading, isAuthenticated, error: storeError, clearError } = useAuthStore()
  const navigate = useNavigate()
  const hasRedirected = useRef(false)

  // Clear error when component unmounts
  useEffect(() => {
    return () => {
      clearError();
      setLocalError('');
    };
  }, [clearError]);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && !hasRedirected.current) {
      hasRedirected.current = true
      navigate('/dashboard', { replace: true })
    }
  }, [isAuthenticated, navigate])

  const error = localError || storeError

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLocalError('')

    if (password !== confirmPassword) {
      setLocalError('Passwords do not match')
      return
    }

    if (password.length < 8) {
      setLocalError('Password must be at least 8 characters')
      return
    }

    try {
      await register(email, username, password, chessComUsername || undefined)
      // Navigation handled by useEffect when isAuthenticated changes
    } catch (err: any) {
      // Error is now handled in the store
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-primary-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Create Account</h1>
          <p className="text-gray-600">Start tracking your chess journey</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div
            className={`bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm transition-all duration-200 ${
              error
                ? "opacity-100 max-h-20"
                : "opacity-0 max-h-0 overflow-hidden border-0 py-0"
            }`}
          >
            {error || "\u00A0"}
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition"
              placeholder="your.email@example.com"
              required
            />
          </div>

          <div>
            <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-2">
              Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition"
              placeholder="Choose a username"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition"
              placeholder="At least 8 characters"
              required
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition"
              placeholder="Re-enter password"
              required
            />
          </div>

          <div>
            <label htmlFor="chessComUsername" className="block text-sm font-medium text-gray-700 mb-2">
              Chess.com Username <span className="text-gray-400">(optional)</span>
            </label>
            <input
              id="chessComUsername"
              type="text"
              value={chessComUsername}
              onChange={(e) => setChessComUsername(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition"
              placeholder="Your Chess.com username"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-primary-600 text-white py-3 rounded-lg font-medium hover:bg-primary-700 transition disabled:opacity-50 disabled:cursor-not-allowed mt-6"
          >
            {isLoading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <p className="mt-6 text-center text-gray-600">
          Already have an account?{' '}
          <Link to="/login" className="text-primary-600 font-medium hover:text-primary-700">
            Login
          </Link>
        </p>
      </div>
    </div>
  )
}

export default Register

