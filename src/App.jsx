import { Routes, Route, BrowserRouter, Navigate } from 'react-router-dom'
import Login from './components/pages/Login'
import Dashboard from './components/developer/Dashboard'
import AdminDashboard from './components/admin/AdminDashboard'
import TesterDashboard from './components/tester/TesterDashboard'

const ROLE_PATHS = {
  admin: '/admin',
  developer: '/developer',
  tester: '/tester',
}

function RoleRoute({ role, element }) {
  const token = localStorage.getItem('token')
  let user = null

  try {
    user = JSON.parse(localStorage.getItem('user') || 'null')
  } catch {
    user = null
  }

  if (!token || !user?.role) {
    return <Navigate to="/" replace />
  }

  const userRole = String(user.role).toLowerCase()
  if (!ROLE_PATHS[userRole]) {
    return <Navigate to="/" replace />
  }

  if (userRole !== role) {
    return <Navigate to={ROLE_PATHS[userRole]} replace />
  }

  return element
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/developer" element={<RoleRoute role="developer" element={<Dashboard />} />} />
        <Route path="/admin" element={<RoleRoute role="admin" element={<AdminDashboard />} />} />
        <Route path="/tester" element={<RoleRoute role="tester" element={<TesterDashboard />} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
