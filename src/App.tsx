import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { Navbar } from './components/Navbar'
import { Dashboard } from './pages/Dashboard'
import { Mappings } from './pages/Mappings'
import { Config } from './pages/Config'
import { Logs } from './pages/Logs'
import { Settings } from './pages/Settings'
import { useFrpcStore } from './store'
import { useEffect } from 'react'

export default function App() {
  const { error, clearError, fetchPanelConfig } = useFrpcStore()

  useEffect(() => {
    fetchPanelConfig()
  }, [fetchPanelConfig])

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => clearError(), 5000)
      return () => clearTimeout(timer)
    }
  }, [error, clearError])

  return (
    <Router>
      <div className="min-h-screen">
        <Navbar />

        {error && (
          <div className="fixed top-20 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded z-50">
            {error}
          </div>
        )}

        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/mappings" element={<Mappings />} />
          <Route path="/config" element={<Config />} />
          <Route path="/logs" element={<Logs />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </div>
    </Router>
  )
}
