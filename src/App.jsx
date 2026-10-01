import { Routes, Route, BrowserRouter } from 'react-router-dom'
import Login from './components/pages/Login'
import Dashboard from './components/developer/Dashboard'
import AdminDashboard from './components/admin/AdminDashboard'
import TesterDashboard from './components/tester/TesterDashboard'



function App() {

  return (
    <BrowserRouter>
    <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/developer" element={<Dashboard />} />
        <Route path='/admin' element={<AdminDashboard/>}/>
        <Route path='tester' element={<TesterDashboard/>}/>
    </Routes>
    </BrowserRouter>
  )
}

export default App
