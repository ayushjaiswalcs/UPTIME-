import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import {
  FileText, AlertTriangle, Users, TrendingUp,
  Download, CheckCircle, XCircle, Clock, Activity,
  Building2, Search, ChevronDown, Star, AlertCircle,
  FileBarChart, UserCheck, Briefcase,
} from 'lucide-react'
import { orgsApi } from '../api/organizations'
import { reportsApi, downloadReport } from '../api/reports'
import Header from '../components/layout/Header'
import { useTheme } from '../context/ThemeContext'
import { useToast } from '../context/ToastContext'
import { Skeleton, ChartSkeleton, StatCardSkeleton } from '../components/ui/Skeleton'

// ─── Types ────────────────────────────────────────────────────────────────────
type TabId = 'uptime' | 'incidents' | 'team' | 'executive'
type DateRange = 7 | 14 | 30 | 90
type ExportFormat = 'pdf' | 'csv' | 'excel' | 'json'

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  color = 'text-primary-400',
  bgColor = 'bg-primary-500/10',
}: {
  label: string
  value: string | number
  sub?: string
  icon: React.ElementType
  color?: string
  bgColor?: string
}) {
  return (
    <div className="glass-card p-5 flex items-start gap-4">
      <div className={`w-11 h-11 rounded-xl ${bgColor} flex items-center justify-center flex-shrink-0`}>
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <div>
        <p className="text-sm text-slate-400">{label}</p>
        <p className="text-2xl font-bold text-white mt-0.5">{value}</p>
        {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

function SlaGauge({ pct }: { pct: number }) {
  const radius = 80
  const stroke = 12
  const circumference = Math.PI * radius // semi-circle
  const progress = (pct / 100) * circumference
  const color = pct >= 99.9 ? '#22c55e' : pct >= 99 ? '#f59e0b' : '#ef4444'

  return (
    <div className="glass-card p-6 flex flex-col items-center">
      <h3 className="text-sm font-semibold text-slate-300 mb-4">Overall SLA</h3>
      <div className="relative" style={{ width: radius * 2 + stroke, height: radius + stroke / 2 + 24 }}>
        <svg
          width={radius * 2 + stroke}
          height={radius + stroke / 2 + 8}
          viewBox={`0 0 ${radius * 2 + stroke} ${radius + stroke / 2 + 8}`}
        >
          {/* background arc */}
          <path
            d={`M ${stroke / 2} ${radius + 4} A ${radius} ${radius} 0 0 1 ${radius * 2 + stroke / 2} ${radius + 4}`}
            fill="none"
            stroke="#1e293b"
            strokeWidth={stroke}
            strokeLinecap="round"
          />
          {/* foreground arc */}
          <path
            d={`M ${stroke / 2} ${radius + 4} A ${radius} ${radius} 0 0 1 ${radius * 2 + stroke / 2} ${radius + 4}`}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${progress} ${circumference}`}
            style={{ transition: 'stroke-dasharray 0.8s ease' }}
          />
        </svg>
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-center">
          <p className="text-3xl font-bold" style={{ color }}>{pct.toFixed(2)}%</p>
          <p className="text-xs text-slate-500">SLA Compliance</p>
        </div>
      </div>
      <div className="mt-4 flex gap-4 text-xs">
        <span className="flex items-center gap-1 text-green-400"><span className="w-2 h-2 rounded-full bg-green-400 inline-block" />≥ 99.9%</span>
        <span className="flex items-center gap-1 text-yellow-400"><span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" />≥ 99%</span>
        <span className="flex items-center gap-1 text-red-400"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" />&lt; 99%</span>
      </div>
    </div>
  )
}

// ─── Tab: Uptime Report ────────────────────────────────────────────────────────

function UptimeTab({
  orgId,
  days,
  tokens: t,
}: {
  orgId: number | undefined
  days: DateRange
  tokens: ReturnType<typeof useTheme>['tokens']
}) {
  const [search, setSearch] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['reports-uptime', orgId, days],
    queryFn: () => reportsApi.getUptime({ org_id: orgId, days }).then(r => r.data),
  })

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)}
        </div>
        <ChartSkeleton height={250} />
        <ChartSkeleton height={250} />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500">
        <FileText className="w-12 h-12 mb-3 opacity-30" />
        <p>No uptime data available for this period.</p>
      </div>
    )
  }

  const filtered = data.monitors.filter(m =>
    m.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total Monitors" value={data.total_monitors} icon={Activity} />
        <KpiCard
          label="Avg Uptime"
          value={`${data.avg_uptime_pct.toFixed(2)}%`}
          icon={TrendingUp}
          color="text-green-400"
          bgColor="bg-green-500/10"
        />
        <KpiCard
          label="SLA Compliant"
          value={`${data.sla_compliant_count}/${data.total_monitors}`}
          icon={CheckCircle}
          color="text-blue-400"
          bgColor="bg-blue-500/10"
        />
        <KpiCard
          label="Total Downtime"
          value={`${data.total_downtime_hours.toFixed(1)}h`}
          icon={Clock}
          color="text-red-400"
          bgColor="bg-red-500/10"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="glass-card p-5 lg:col-span-2">
          <h3 className="font-semibold text-white mb-5">Uptime Trend</h3>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={data.uptime_trend}>
              <CartesianGrid strokeDasharray="3 3" stroke={t.grid} />
              <XAxis dataKey="date" tick={{ fill: t.tick, fontSize: 11 }} />
              <YAxis domain={[98, 100]} tick={{ fill: t.tick, fontSize: 11 }} tickFormatter={v => `${v}%`} />
              <Tooltip
                contentStyle={{ background: t.tooltipBg, border: `1px solid ${t.tooltipBorder}`, borderRadius: 8, color: t.tooltipText }}
                formatter={(v: number) => [`${v.toFixed(3)}%`, 'Uptime']}
              />
              <Line type="monotone" dataKey="uptime" stroke={t.primary} strokeWidth={2.5} dot={{ r: 3, fill: t.primary }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <SlaGauge pct={data.overall_sla_pct} />
      </div>

      <div className="glass-card p-5">
        <h3 className="font-semibold text-white mb-5">Response Time Trend (ms)</h3>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={data.response_trend}>
            <defs>
              <linearGradient id="rtGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={t.success} stopOpacity={0.3} />
                <stop offset="95%" stopColor={t.success} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={t.grid} />
            <XAxis dataKey="date" tick={{ fill: t.tick, fontSize: 11 }} />
            <YAxis tick={{ fill: t.tick, fontSize: 11 }} />
            <Tooltip
              contentStyle={{ background: t.tooltipBg, border: `1px solid ${t.tooltipBorder}`, borderRadius: 8, color: t.tooltipText }}
              formatter={(v: number) => [`${v}ms`, 'Avg Response']}
            />
            <Area type="monotone" dataKey="response_time" stroke={t.success} strokeWidth={2} fill="url(#rtGrad)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Table */}
      <div className="glass-card overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-slate-700/50">
          <h3 className="font-semibold text-white">Monitor Details</h3>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              className="input-field text-sm pl-9 py-1.5 w-52"
              placeholder="Search monitors..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50 text-left">
                <th className="px-4 py-3 text-slate-400 font-medium">Monitor</th>
                <th className="px-4 py-3 text-slate-400 font-medium">Status</th>
                <th className="px-4 py-3 text-slate-400 font-medium">Uptime %</th>
                <th className="px-4 py-3 text-slate-400 font-medium">Downtime %</th>
                <th className="px-4 py-3 text-slate-400 font-medium">Avg Response</th>
                <th className="px-4 py-3 text-slate-400 font-medium">SLA</th>
                <th className="px-4 py-3 text-slate-400 font-medium">Last Incident</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-500">No monitors match your search</td>
                </tr>
              ) : (
                filtered.map(m => (
                  <tr key={m.id} className="border-b border-slate-700/30 hover:bg-slate-700/20 transition-colors">
                    <td className="px-4 py-3 text-white font-medium">{m.name}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${
                        m.status === 'up' ? 'bg-green-500/15 text-green-400' :
                        m.status === 'down' ? 'bg-red-500/15 text-red-400' :
                        m.status === 'warning' ? 'bg-yellow-500/15 text-yellow-400' :
                        'bg-slate-500/15 text-slate-400'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          m.status === 'up' ? 'bg-green-400' :
                          m.status === 'down' ? 'bg-red-400' :
                          m.status === 'warning' ? 'bg-yellow-400' : 'bg-slate-400'
                        }`} />
                        {m.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`font-semibold ${m.uptime_pct >= 99.9 ? 'text-green-400' : m.uptime_pct >= 99 ? 'text-yellow-400' : 'text-red-400'}`}>
                        {m.uptime_pct.toFixed(3)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-300">{m.downtime_pct.toFixed(3)}%</td>
                    <td className="px-4 py-3 text-slate-300">{m.avg_response_ms}ms</td>
                    <td className="px-4 py-3">
                      {m.sla_compliant
                        ? <CheckCircle className="w-4 h-4 text-green-400" />
                        : <XCircle className="w-4 h-4 text-red-400" />
                      }
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">
                      {m.last_incident ? new Date(m.last_incident).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Tab: Incident Report ─────────────────────────────────────────────────────

function IncidentsTab({
  orgId,
  days,
  tokens: t,
}: {
  orgId: number | undefined
  days: DateRange
  tokens: ReturnType<typeof useTheme>['tokens']
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['reports-incidents', orgId, days],
    queryFn: () => reportsApi.getIncidents({ org_id: orgId, days }).then(r => r.data),
  })

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)}
        </div>
        <ChartSkeleton height={250} />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500">
        <AlertTriangle className="w-12 h-12 mb-3 opacity-30" />
        <p>No incident data available.</p>
      </div>
    )
  }

  const avgHours = (data.avg_resolution_minutes / 60).toFixed(1)

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total Incidents" value={data.total_incidents} icon={AlertTriangle} color="text-orange-400" bgColor="bg-orange-500/10" />
        <KpiCard label="Resolved" value={data.resolved_count} icon={CheckCircle} color="text-green-400" bgColor="bg-green-500/10" />
        <KpiCard label="Ongoing" value={data.ongoing_count} icon={AlertCircle} color="text-red-400" bgColor="bg-red-500/10" />
        <KpiCard label="Avg Resolution" value={`${avgHours}h`} icon={Clock} color="text-blue-400" bgColor="bg-blue-500/10" />
      </div>

      {/* Bar chart */}
      <div className="glass-card p-5">
        <h3 className="font-semibold text-white mb-5">Incidents Per Day</h3>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data.daily_counts}>
            <CartesianGrid strokeDasharray="3 3" stroke={t.grid} />
            <XAxis dataKey="date" tick={{ fill: t.tick, fontSize: 11 }} />
            <YAxis allowDecimals={false} tick={{ fill: t.tick, fontSize: 11 }} />
            <Tooltip
              contentStyle={{ background: t.tooltipBg, border: `1px solid ${t.tooltipBorder}`, borderRadius: 8, color: t.tooltipText }}
              formatter={(v: number) => [v, 'Incidents']}
            />
            <Bar dataKey="count" fill="#f97316" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Incident table */}
        <div className="glass-card overflow-hidden">
          <div className="p-5 border-b border-slate-700/50">
            <h3 className="font-semibold text-white">Incident Log</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50 text-left">
                  <th className="px-4 py-3 text-slate-400 font-medium">Monitor</th>
                  <th className="px-4 py-3 text-slate-400 font-medium">Start</th>
                  <th className="px-4 py-3 text-slate-400 font-medium">Duration</th>
                  <th className="px-4 py-3 text-slate-400 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.incidents.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-500">No incidents in this period</td>
                  </tr>
                ) : (
                  data.incidents.map(inc => (
                    <tr key={inc.id} className="border-b border-slate-700/30 hover:bg-slate-700/20">
                      <td className="px-4 py-3 text-white text-xs font-medium">{inc.monitor_name}</td>
                      <td className="px-4 py-3 text-slate-400 text-xs">{new Date(inc.started_at).toLocaleString()}</td>
                      <td className="px-4 py-3 text-slate-300 text-xs">
                        {inc.duration_minutes !== undefined ? `${Math.round(inc.duration_minutes)}m` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${inc.status === 'resolved' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
                          {inc.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Timeline */}
        <div className="glass-card p-5">
          <h3 className="font-semibold text-white mb-5">Incident Timeline</h3>
          {data.incidents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-slate-500">
              <CheckCircle className="w-10 h-10 mb-2 text-green-500/50" />
              <p className="text-sm">No incidents in this period</p>
            </div>
          ) : (
            <div className="relative pl-6 space-y-4 max-h-72 overflow-y-auto">
              <div className="absolute left-2.5 top-0 bottom-0 w-0.5 bg-slate-700" />
              {data.incidents.map(inc => (
                <div key={inc.id} className="relative">
                  <div className={`absolute -left-4 top-1.5 w-3 h-3 rounded-full border-2 border-slate-800 ${inc.status === 'resolved' ? 'bg-green-400' : 'bg-red-400'}`} />
                  <div className="bg-slate-700/30 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-white">{inc.monitor_name}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${inc.status === 'resolved' ? 'text-green-400' : 'text-red-400'}`}>
                        {inc.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">{new Date(inc.started_at).toLocaleString()}</p>
                    {inc.error_message && (
                      <p className="text-xs text-slate-500 mt-1 truncate">{inc.error_message}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Tab: Team Activity ────────────────────────────────────────────────────────

const ACTION_ICONS: Record<string, React.ElementType> = {
  create: FileBarChart,
  update: Activity,
  delete: AlertTriangle,
  invite: UserCheck,
  login: Users,
}

function TeamTab({
  orgId,
  days,
  tokens: t,
}: {
  orgId: number | undefined
  days: DateRange
  tokens: ReturnType<typeof useTheme>['tokens']
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['reports-team', orgId, days],
    queryFn: () => reportsApi.getTeamActivity({ org_id: orgId, days }).then(r => r.data),
  })

  if (isLoading) {
    return (
      <div className="space-y-6">
        <ChartSkeleton height={250} />
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500">
        <Users className="w-12 h-12 mb-3 opacity-30" />
        <p>No activity data available.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Actions per user chart */}
        <div className="glass-card p-5">
          <h3 className="font-semibold text-white mb-5">Actions Per Team Member</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.actions_per_user} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke={t.grid} horizontal={false} />
              <XAxis type="number" tick={{ fill: t.tick, fontSize: 11 }} allowDecimals={false} />
              <YAxis type="category" dataKey="user_name" tick={{ fill: t.tick, fontSize: 11 }} width={90} />
              <Tooltip
                contentStyle={{ background: t.tooltipBg, border: `1px solid ${t.tooltipBorder}`, borderRadius: 8, color: t.tooltipText }}
                formatter={(v: number) => [v, 'Actions']}
              />
              <Bar dataKey="action_count" fill={t.primary} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Activity feed */}
        <div className="glass-card p-5">
          <h3 className="font-semibold text-white mb-4">Activity Feed</h3>
          {data.activities.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500">
              <Activity className="w-10 h-10 mb-2 opacity-30" />
              <p className="text-sm">No activity recorded</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
              {data.activities.map(act => {
                const actionWord = act.action.split('_')[0]
                const Icon = ACTION_ICONS[actionWord] || Activity
                return (
                  <div key={act.id} className="flex items-start gap-3 p-3 rounded-xl bg-slate-700/30">
                    <div className="w-8 h-8 rounded-lg bg-primary-500/10 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-4 h-4 text-primary-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-medium text-white">{act.user_name}</span>
                        <span className="text-xs text-slate-400">{act.action.replace(/_/g, ' ')}</span>
                        <span className="text-xs text-slate-500 truncate">{act.resource}</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{new Date(act.timestamp).toLocaleString()}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Tab: Executive Summary ────────────────────────────────────────────────────

function ExecutiveTab({
  orgId,
}: {
  orgId: number | undefined
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['reports-summary', orgId],
    queryFn: () => reportsApi.getSummary({ org_id: orgId, days: 30 }).then(r => r.data),
  })

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-24 w-full" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)}
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500">
        <FileText className="w-12 h-12 mb-3 opacity-30" />
        <p>No summary data available.</p>
      </div>
    )
  }

  const uptimeDelta = data.overall_uptime_pct - data.prev_period_uptime
  const incidentDelta = data.total_incidents - data.prev_period_incidents

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glass-card p-6 flex items-center gap-5">
        <div className="w-16 h-16 rounded-2xl bg-primary-600/20 flex items-center justify-center text-2xl font-bold text-primary-400">
          {data.org_name[0]?.toUpperCase()}
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">{data.org_name}</h2>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-primary-500/20 text-primary-300 uppercase tracking-wider">
              {data.plan} Plan
            </span>
            <span className="text-sm text-slate-400">· 30-day Executive Summary</span>
          </div>
        </div>
      </div>

      {/* Scorecard */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Overall Uptime"
          value={`${data.overall_uptime_pct.toFixed(2)}%`}
          sub={`${uptimeDelta >= 0 ? '+' : ''}${uptimeDelta.toFixed(2)}% vs last period`}
          icon={TrendingUp}
          color="text-green-400"
          bgColor="bg-green-500/10"
        />
        <KpiCard
          label="SLA Compliance"
          value={`${data.sla_compliance_pct.toFixed(1)}%`}
          icon={CheckCircle}
          color="text-blue-400"
          bgColor="bg-blue-500/10"
        />
        <KpiCard
          label="Performance Score"
          value={`${data.performance_score}/100`}
          icon={Star}
          color="text-yellow-400"
          bgColor="bg-yellow-500/10"
        />
        <KpiCard
          label="Total Incidents"
          value={data.total_incidents}
          sub={`${incidentDelta >= 0 ? '+' : ''}${incidentDelta} vs last period`}
          icon={AlertTriangle}
          color="text-orange-400"
          bgColor="bg-orange-500/10"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Best performing */}
        <div className="glass-card p-5">
          <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
            <Star className="w-4 h-4 text-green-400" />Best Performing
          </h3>
          <div className="space-y-3">
            {data.best_monitors.length === 0 ? (
              <p className="text-sm text-slate-500 py-4 text-center">No data</p>
            ) : (
              data.best_monitors.map((m, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-green-500/5 border border-green-500/20">
                  <div className="w-8 h-8 rounded-full bg-green-500/15 flex items-center justify-center text-xs font-bold text-green-400">
                    #{i + 1}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white">{m.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <div className="flex-1 h-1.5 rounded-full bg-slate-700">
                        <div className="h-full rounded-full bg-green-400" style={{ width: `${m.uptime_pct}%` }} />
                      </div>
                      <span className="text-xs text-green-400 font-semibold">{m.uptime_pct.toFixed(3)}%</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Worst performing */}
        <div className="glass-card p-5">
          <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400" />Needs Attention
          </h3>
          <div className="space-y-3">
            {data.worst_monitors.length === 0 ? (
              <p className="text-sm text-slate-500 py-4 text-center">No data</p>
            ) : (
              data.worst_monitors.map((m, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-red-500/5 border border-red-500/20">
                  <div className="w-8 h-8 rounded-full bg-red-500/15 flex items-center justify-center text-xs font-bold text-red-400">
                    #{i + 1}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white">{m.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <div className="flex-1 h-1.5 rounded-full bg-slate-700">
                        <div className="h-full rounded-full bg-red-400" style={{ width: `${m.uptime_pct}%` }} />
                      </div>
                      <span className="text-xs text-red-400 font-semibold">{m.uptime_pct.toFixed(3)}%</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Recommendations */}
      {data.recommendations.length > 0 && (
        <div className="glass-card p-5">
          <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-yellow-400" />Recommendations
          </h3>
          <ul className="space-y-2">
            {data.recommendations.map((rec, i) => (
              <li key={i} className="flex items-start gap-3 p-3 rounded-lg bg-yellow-500/5 border border-yellow-500/20">
                <span className="w-5 h-5 rounded-full bg-yellow-500/20 text-yellow-400 text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <span className="text-sm text-slate-300">{rec}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Monthly comparison */}
      <div className="glass-card p-5">
        <h3 className="font-semibold text-white mb-4">Monthly Comparison</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 rounded-xl bg-slate-700/30">
            <p className="text-xs text-slate-400">Previous Period Uptime</p>
            <p className="text-xl font-bold text-white mt-1">{data.prev_period_uptime.toFixed(2)}%</p>
          </div>
          <div className="p-4 rounded-xl bg-slate-700/30">
            <p className="text-xs text-slate-400">This Period Uptime</p>
            <p className={`text-xl font-bold mt-1 ${data.overall_uptime_pct >= data.prev_period_uptime ? 'text-green-400' : 'text-red-400'}`}>
              {data.overall_uptime_pct.toFixed(2)}%
            </p>
          </div>
          <div className="p-4 rounded-xl bg-slate-700/30">
            <p className="text-xs text-slate-400">Previous Period Incidents</p>
            <p className="text-xl font-bold text-white mt-1">{data.prev_period_incidents}</p>
          </div>
          <div className="p-4 rounded-xl bg-slate-700/30">
            <p className="text-xs text-slate-400">This Period Incidents</p>
            <p className={`text-xl font-bold mt-1 ${data.total_incidents <= data.prev_period_incidents ? 'text-green-400' : 'text-red-400'}`}>
              {data.total_incidents}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'uptime',     label: 'Uptime Report',     icon: TrendingUp   },
  { id: 'incidents',  label: 'Incident Report',   icon: AlertTriangle },
  { id: 'team',       label: 'Team Activity',     icon: Users        },
  { id: 'executive',  label: 'Executive Summary', icon: Briefcase    },
]

const EXPORT_FORMATS: { format: ExportFormat; label: string; color: string }[] = [
  { format: 'pdf',   label: 'PDF',   color: 'text-red-400 border-red-500/30 hover:bg-red-500/10'    },
  { format: 'csv',   label: 'CSV',   color: 'text-green-400 border-green-500/30 hover:bg-green-500/10' },
  { format: 'excel', label: 'Excel', color: 'text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10' },
  { format: 'json',  label: 'JSON',  color: 'text-blue-400 border-blue-500/30 hover:bg-blue-500/10' },
]

const DATE_RANGES: DateRange[] = [7, 14, 30, 90]

const TAB_TO_REPORT: Record<TabId, string> = {
  uptime:     'uptime',
  incidents:  'incidents',
  team:       'team-activity',
  executive:  'summary',
}

export default function Reports() {
  const [activeTab, setActiveTab] = useState<TabId>('uptime')
  const [days, setDays] = useState<DateRange>(30)
  const [selectedOrgId, setSelectedOrgId] = useState<number | undefined>(undefined)
  const [exportingFormat, setExportingFormat] = useState<ExportFormat | null>(null)
  const { tokens: t } = useTheme()
  const { toast } = useToast()

  const { data: orgs = [] } = useQuery({
    queryKey: ['orgs'],
    queryFn: () => orgsApi.list().then(r => r.data),
  })

  async function handleExport(format: ExportFormat) {
    setExportingFormat(format)
    toast(`Generating ${format.toUpperCase()}...`, 'info')
    try {
      await downloadReport(format, TAB_TO_REPORT[activeTab], selectedOrgId, days)
      toast(`Downloaded ${format.toUpperCase()} report!`, 'success')
    } catch (err) {
      toast(`Export failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error')
    } finally {
      setExportingFormat(null)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <Header title="Reports Center" />

      {/* Tab nav */}
      <div className="flex items-center gap-1 p-1 glass-card rounded-xl w-fit">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === id
                ? 'bg-primary-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <Icon className="w-4 h-4" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Org selector */}
        <div className="relative">
          <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <select
            className="input-field text-sm pl-9 pr-8 py-2 appearance-none"
            value={selectedOrgId ?? ''}
            onChange={e => setSelectedOrgId(e.target.value ? Number(e.target.value) : undefined)}
          >
            <option value="">All Organizations</option>
            {orgs.map(org => (
              <option key={org.id} value={org.id}>{org.name}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>

        {/* Date range */}
        <div className="flex items-center gap-1 p-1 bg-slate-800/50 rounded-lg border border-slate-700/50">
          {DATE_RANGES.map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                days === d ? 'bg-primary-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Export buttons */}
        <div className="flex items-center gap-2">
          {EXPORT_FORMATS.map(({ format, label, color }) => (
            <button
              key={format}
              onClick={() => handleExport(format)}
              disabled={exportingFormat !== null}
              className={`btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5 border ${color} disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <Download className="w-3.5 h-3.5" />
              {exportingFormat === format ? '...' : label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {activeTab === 'uptime'    && <UptimeTab    orgId={selectedOrgId} days={days} tokens={t} />}
      {activeTab === 'incidents' && <IncidentsTab orgId={selectedOrgId} days={days} tokens={t} />}
      {activeTab === 'team'      && <TeamTab      orgId={selectedOrgId} days={days} tokens={t} />}
      {activeTab === 'executive' && <ExecutiveTab orgId={selectedOrgId} />}
    </div>
  )
}
