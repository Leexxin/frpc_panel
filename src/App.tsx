import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { Navbar } from './components/Navbar'
import { Login } from './pages/Login'
import { Instances } from './pages/Instances'
import { InstanceDetail } from './pages/InstanceDetail'
import { auth } from './lib/api'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  return auth.isLoggedIn() ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/*"
          element={
            <PrivateRoute>
              <div className="min-h-screen">
                <Navbar />
                <Routes>
                  <Route path="/" element={<Navigate to="/instances" replace />} />
                  <Route path="/instances" element={<Instances />} />
                  <Route path="/instances/:instanceId" element={<InstanceDetail />} />
                </Routes>
              </div>
            </PrivateRoute>
          }
        />
      </Routes>
    </Router>
  )
}
