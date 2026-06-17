import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Activity, AlertTriangle, Globe, Bell, BarChart2,
  Settings, LogOut, Radio, Users, Key, Wrench, ShieldCheck, Webhook,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import clsx from 'clsx'

const navItems = [
  { to: '/dashboard',   icon: LayoutDashboard, label: 'Overview'    },
  { to: '/monitors',    icon: Activity,        label: 'Monitors'    },
  { to: '/incidents',   icon: AlertTriangle,   label: 'Incidents'   },
  { to: '/status-pages',icon: Globe,           label: 'Status Pages'},
  { to: '/notifications',icon: Bell,           label: 'Alerts'      },
  { to: '/reports',     icon: BarChart2,       label: 'Reports'     },
]

const teamItems = [
  { to: '/teams',         icon: Users,     label: 'Teams'        },
  { to: '/org-analytics', icon: BarChart2, label: 'Org Analytics'},
  { to: '/maintenance',   icon: Wrench,    label: 'Maintenance'  },
]

const devItems = [
  { to: '/api-keys',    icon: Key,             label: 'API Keys'    },
  { to: '/webhooks',    icon: Webhook,         label: 'Webhooks'    },
  { to: '/audit-logs',  icon: ShieldCheck,     label: 'Audit Logs'  },
]

export default function Sidebar() {
  const { user, logout } = useAuth()

  return (
    <aside className="w-60 min-h-screen app-sidebar flex flex-col fixed left-0 top-0 z-40">
      {/* Logo */}
      <div className="px-5 py-5 app-divider-b">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
            <Radio className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold app-title text-lg tracking-tight">Uptime</span>
        </div>
      </div>

      {/* Org selector */}
      <div className="px-3 py-3 app-divider-b">
        <button className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-[var(--surface-hover)] transition-colors text-left focus-ring">
          <div className="w-7 h-7 bg-primary-600/20 rounded-lg flex items-center justify-center text-xs font-bold text-primary-400">
            {user?.name?.[0]?.toUpperCase() || 'A'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium app-title truncate">{user?.name || 'Acme Inc.'}</p>
            <p className="text-xs text-muted truncate">{user?.email}</p>
          </div>
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 overflow-y-auto space-y-4">
        {/* Main */}
        <div className="space-y-0.5">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} className={({ isActive }) => clsx('sidebar-link', isActive && 'active')}>
              <Icon className="w-4 h-4 flex-shrink-0" />{label}
            </NavLink>
          ))}
        </div>

        {/* Team */}
        <div>
          <p className="text-xs font-semibold text-subtle uppercase tracking-wider px-3 mb-1.5">Team</p>
          <div className="space-y-0.5">
            {teamItems.map(({ to, icon: Icon, label }) => (
              <NavLink key={to} to={to} className={({ isActive }) => clsx('sidebar-link', isActive && 'active')}>
                <Icon className="w-4 h-4 flex-shrink-0" />{label}
              </NavLink>
            ))}
          </div>
        </div>

        {/* Developer */}
        <div>
          <p className="text-xs font-semibold text-subtle uppercase tracking-wider px-3 mb-1.5">Developer</p>
          <div className="space-y-0.5">
            {devItems.map(({ to, icon: Icon, label }) => (
              <NavLink key={to} to={to} className={({ isActive }) => clsx('sidebar-link', isActive && 'active')}>
                <Icon className="w-4 h-4 flex-shrink-0" />{label}
              </NavLink>
            ))}
          </div>
        </div>
      </nav>

      {/* Bottom */}
      <div className="px-3 py-4 app-divider-t space-y-0.5">
        <NavLink to="/settings" className={({ isActive }) => clsx('sidebar-link', isActive && 'active')}>
          <Settings className="w-4 h-4 flex-shrink-0" />Settings
        </NavLink>
        <button onClick={logout} className="sidebar-link w-full text-red-400 hover:text-red-300 hover:bg-red-500/10">
          <LogOut className="w-4 h-4 flex-shrink-0" />Sign Out
        </button>
      </div>
    </aside>
  )
}
