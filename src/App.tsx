import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import { NavigationGuardProvider } from './contexts/NavigationGuardContext'
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
import Onboarding from './pages/client/Onboarding'
import ClientHome from './pages/client/Home'
import CheckIn from './pages/client/CheckIn'
import TrainerSession from './pages/trainer/Session'
import ClientSession from './pages/client/Session'
import ClientProgram from './pages/client/Program'
import Nutrition from './pages/trainer/Nutrition'
import Analytics from './pages/trainer/Analytics'
import ClientVault from './pages/client/Vault'

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
      <Route path="/onboarding" element={<Onboarding />} />
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
        <Route path="session/:sessionId" element={<TrainerSession />} />
        <Route path="vault" element={<Vault />} />
        <Route path="messages" element={<Messages />} />
        <Route path="settings" element={<Settings />} />
        <Route path="nutrition" element={<Nutrition />} />
        <Route path="analytics" element={<Analytics />} />
      </Route>
      <Route path="/client" element={<ClientLayout />}>
        <Route index element={<Navigate to="home" replace />} />
        <Route path="home" element={<ClientHome />} />
        <Route path="checkin" element={<CheckIn />} />
        <Route path="today" element={<Today />} />
        <Route path="session/:sessionId" element={<ClientSession />} />
        <Route path="program" element={<ClientProgram />} />
        <Route path="progress" element={<Progress />} />
        <Route path="messages" element={<ClientMessages />} />
        <Route path="vault" element={<ClientVault />} />
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <NavigationGuardProvider>
        <AppRoutes />
      </NavigationGuardProvider>
    </BrowserRouter>
  )
}
