import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import Layout from './components/Layout'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import Games from './pages/Games'
import GameViewer from './pages/GameViewer'
import Statistics from './pages/Statistics'
import Openings from './pages/Openings'
import Profile from './pages/Profile'
import Puzzles from './pages/Puzzles'
import ProtectedRoute from './components/ProtectedRoute'

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        
        <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/games" element={<Games />} />
          <Route path="/games/:gameId" element={<GameViewer />} />
          <Route path="/statistics" element={<Statistics />} />
          <Route path="/openings" element={<Openings />} />
          <Route path="/puzzles" element={<Puzzles />} />
          <Route path="/profile" element={<Profile />} />
        </Route>
        
        <Route path="/" element={<Navigate to="/dashboard" />} />
      </Routes>
    </Router>
  )
}

export default App

