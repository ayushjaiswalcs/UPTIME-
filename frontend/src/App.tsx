import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { AuthProvider, useAuth } from './context/AuthContext'
import { DemoProvider, useDemo } from './context/DemoContext'
import { ThemeProvider } from './context/ThemeContext'
import { ToastProvider } from './context/ToastContext'
import ThemeToggle from './components/ui/ThemeToggle'
import ToastContainer from './components/ui/Toast'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Register from './pages/Register'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import VerifyEmail from './pages/VerifyEmail'
import Dashboard from './pages/Dashboard'
import Monitors from './pages/Monitors'
import MonitorDetail from './pages/MonitorDetail'
import Incidents from './pages/Incidents'
import StatusPages from './pages/StatusPages'
import Notifications from './pages/Notifications'
import Reports from './pages/Reports'
import Settings from './pages/Settings'
import PublicStatus from './pages/PublicStatus'
import Teams from './pages/Teams'
import ApiKeys from './pages/ApiKeys'
import Maintenance from './pages/Maintenance'
import AuditLogs from './pages/AuditLogs'
import Webhooks from './pages/Webhooks'
import OrgAnalytics from './pages/OrgAnalytics'
import Demo from './pages/Demo'
import Layout from './components/layout/Layout'

// Drives React Query cache updates during demo simulation
function DemoSimulator() {
  const qc = useQueryClient()
  const { isDemoMode, tick, getStats, getMonitors } = useDemo()

  useEffect(() => {
    if (!isDemoMode) return
    const interval = setInterval(() => {
      tick()
      qc.setQueryData(['dashboard-stats'], getStats())
      qc.setQueryData(['monitors'], getMonitors())
    }, 3000)
    return () => clearInterval(interval)
  }, [isDemoMode, qc, tick, getStats, getMonitors])

  return null
}

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const { isDemoMode } = useDemo()
  if (loading && !isDemoMode) return (
    <div className="min-h-screen app-shell flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
  return (user || isDemoMode) ? <>{children}</> : <Navigate to="/login" replace />
}

function AppRoutes() {
  const { user } = useAuth()
  const { isDemoMode } = useDemo()
  const isLoggedIn = !!(user || isDemoMode)
  return (
    <Routes>
      <Route path="/" element={isLoggedIn ? <Navigate to="/dashboard" replace /> : <Landing />} />
      <Route path="/login" element={isLoggedIn ? <Navigate to="/dashboard" replace /> : <Login />} />
      <Route path="/register" element={isLoggedIn ? <Navigate to="/dashboard" replace /> : <Register />} />
      <Route path="/forgot-password" element={isLoggedIn ? <Navigate to="/dashboard" replace /> : <ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/status/:slug" element={<PublicStatus />} />
      <Route path="/demo" element={<Demo />} />

      {/* Protected routes */}
      {(
        [
          ['/dashboard',    <Dashboard />],
          ['/monitors',          <Monitors />],
          ['/monitors/:id',     <MonitorDetail />],
          ['/incidents',    <Incidents />],
          ['/status-pages', <StatusPages />],
          ['/notifications',<Notifications />],
          ['/reports',      <Reports />],
          ['/settings',     <Settings />],
          ['/teams',        <Teams />],
          ['/api-keys',     <ApiKeys />],
          ['/maintenance',  <Maintenance />],
          ['/audit-logs',    <AuditLogs />],
          ['/webhooks',      <Webhooks />],
          ['/org-analytics', <OrgAnalytics />],
        ] as [string, React.ReactNode][]
      ).map(([path, page]) => (
        <Route
          key={path}
          path={path}
          element={<PrivateRoute><Layout>{page}</Layout></PrivateRoute>}
        />
      ))}
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <ToastProvider>
          <DemoProvider>
            <AuthProvider>
              <DemoSimulator />
              <AppRoutes />
              <ThemeToggle />
              <ToastContainer />
            </AuthProvider>
          </DemoProvider>
        </ToastProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}
