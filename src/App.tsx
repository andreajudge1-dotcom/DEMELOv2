import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import TrainerLayout from './layouts/TrainerLayout'
import ClientLayout from './layouts/ClientLayout'
import Login from './pages/auth/Login'
import Register from './pages/auth/Register'
import Dashboard from './pages/trainer/Dashboard'
import Clients from './pages/trainer/Clients'
import ClientProfile from './pages/trainer/ClientProfile'
import Programs from './pages/trainer/Programs'
import ProgramBuilder from './pages/trainer/ProgramBuilder'
import Exercises from './pages/trainer/Exercises'
import Sessions from './pages/trainer/Sessions'
import Vault from './pages/trainer/Vault'
import Messages from './pages/trainer/Messages'
import Settings from './pages/trainer/Settings'
import Today from './pages/client/Today'
import Progress from './pages/client/Progress'
import ClientMessages from './pages/client/Messages'

function AppRoutes() {
  const { loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <p className="font-bebas text-2xl text-[#C9A84C] tracking-widest">LOADING...</p>
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/trainer" element={<TrainerLayout />}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="clients" element={<Clients />} />
        <Route path="clients/:id" element={<ClientProfile />} />
        <Route path="programs" element={<Programs />} />
        <Route path="programs/new" element={<ProgramBuilder />} />
        <Route path="programs/:id" element={<ProgramBuilder />} />
        <Route path="exercises" element={<Exercises />} />
        <Route path="sessions" element={<Sessions />} />
        <Route path="vault" element={<Vault />} />
        <Route path="messages" element={<Messages />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="/client" element={<ClientLayout />}>
        <Route index element={<Navigate to="today" replace />} />
        <Route path="today" element={<Today />} />
        <Route path="progress" element={<Progress />} />
        <Route path="messages" element={<ClientMessages />} />
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}
