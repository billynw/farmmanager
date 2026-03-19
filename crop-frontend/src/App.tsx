import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuth } from './store'
import Login from './pages/Login'
import ItemList from './pages/ItemList'
import ItemDetail from './pages/ItemDetail'
import ItemForm from './pages/ItemForm'
import WorkLogNew from './pages/WorkLogNew'
import Harvests from './pages/Harvests'

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
          <Route path="/" element={<RequireAuth><ItemList /></RequireAuth>} />
          <Route path="/items/new" element={<RequireAuth><ItemForm /></RequireAuth>} />
          <Route path="/items/:id" element={<RequireAuth><ItemDetail /></RequireAuth>} />
          <Route path="/items/:id/edit" element={<RequireAuth><ItemForm /></RequireAuth>} />
          <Route path="/items/:id/log/new" element={<RequireAuth><WorkLogNew /></RequireAuth>} />
          <Route path="/items/:id/harvests" element={<RequireAuth><Harvests /></RequireAuth>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
