import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuth } from './store'
import Login from './pages/Login'
import Register from './pages/Register'
import SetPassword from './pages/SetPassword'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import Home from './pages/Home'
import ItemList from './pages/ItemList'
import ItemDetail from './pages/ItemDetail'
import ItemForm from './pages/ItemForm'
import WorkLogNew from './pages/WorkLogNew'
import WorkLogEdit from './pages/WorkLogEdit'
import Harvests from './pages/Harvests'
import AdminUsers from './pages/AdminUsers'
import SensorDetail from './pages/SensorDetail'

const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } })

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = useAuth((s) => s.token)
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  const init = useAuth((s) => s.init)
  useEffect(() => { init() }, [init])

  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/set-password" element={<SetPassword />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/" element={<RequireAuth><Home /></RequireAuth>} />
          <Route path="/items" element={<RequireAuth><ItemList /></RequireAuth>} />
          <Route path="/sensors" element={<RequireAuth><SensorDetail /></RequireAuth>} />
          <Route path="/admin/users" element={<RequireAuth><AdminUsers /></RequireAuth>} />
          <Route path="/items/new" element={<RequireAuth><ItemForm /></RequireAuth>} />
          <Route path="/items/:id" element={<RequireAuth><ItemDetail /></RequireAuth>} />
          <Route path="/items/:id/edit" element={<RequireAuth><ItemForm /></RequireAuth>} />
          <Route path="/items/:id/log/new" element={<RequireAuth><WorkLogNew /></RequireAuth>} />
          <Route path="/items/:id/log/:logId/edit" element={<RequireAuth><WorkLogEdit /></RequireAuth>} />
          <Route path="/items/:id/harvests" element={<RequireAuth><Harvests /></RequireAuth>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
