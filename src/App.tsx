import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { Navbar } from './components/Navbar'
import { Instances } from './pages/Instances'
import { InstanceDetail } from './pages/InstanceDetail'

export default function App() {
  return (
    <Router>
      <div className="min-h-screen">
        <Navbar />

        <Routes>
            <Route path="/" element={<Navigate to="/instances" replace />} />
            <Route path="/instances" element={<Instances />} />
            <Route path="/instances/:instanceId" element={<InstanceDetail />} />
        </Routes>
      </div>
    </Router>
  )
}
