import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import {
  Activity, AlertTriangle, Users, TrendingUp,
  CheckCircle, Server, Building2, ChevronDown,
} from 'lucide-react'
import client from '../api/client'
import { orgsApi, type OrgOut } from '../api/organizations'
import Header from '../components/layout/Header'
import { useTheme } from '../context/ThemeContext'
import { Skeleton, StatCardSkeleton, ChartSkeleton } from '../components/ui/Skeleton'

// ─── API types ────────────────────────────────────────────────────────────────

interface OrgStats {
  total_monitors: number
  active_monitors: number
  down_monitors: number
  total_members: number
  monthly_incidents: number
  sla_score: number
  avg_response_time: number
}

interface OrgAnalytics {
  uptime_trend: { date: string; uptime: number }[]
  incident_trend: { date: string; count: number }[]
  top_failing: { name: string; incident_count: number }[]
  member_activity: { user_name: string; action_count: number }[]
}

interface MonitorRow {
  id: number
  name: string
  status: 'up' | 'down' | 'paused' | 'warning'
  uptime_pct: number
  avg_response_ms: number
  incident_count: number
  sla_compliant: boolean
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  color = 'text-primary-400',
  bg = 'bg-primary-500/10',
}: {
  label: string
  value: string | number
  sub?: string
  icon: React.ElementType
  color?: string
  bg?: string
}) {
  return (
    <div className="glass-card p-5 flex items-start gap-4">
      <div className={`w-11 h-11 rounded-xl ${bg} flex items-center justify-center flex-shrink-0`}>
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <div>
        <p className="text-xs text-slate-400">{label}</p>
        <p className="text-2xl font-bold text-white mt-0.5">{value}</p>
        {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// Activity heatmap: rows = members, cols = last 7 days
function ActivityHeatmap({
  data,
}: {
  data: { user_name: string; action_count: number }[]
}) {
  // Generate synthetic per-day breakdown from total action_count (for UI demo)
  const today = new Date()
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today)
    d.setDate(d.getDate() - (6 - i))
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' })
  })

  return (
    <div className="glass-card p-5">
      <h3 className="font-semibold text-white mb-4">Team Activity Heatmap (7 days)</h3>
      {data.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-slate-500">
          <Users className="w-10 h-10 mb-2 opacity-30" />
          <p className="text-sm">No activity data</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className="text-left text-slate-400 font-medium pb-2 pr-3 w-28">Member</th>
                {days.map(d => (
                  <th key={d} className="text-center text-slate-500 font-medium pb-2 px-1 min-w-[48px]">{d}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map(member => {
                // Distribute action_count randomly-but-deterministically across days
                const seed = member.user_name.length
                const dayCounts = days.map((_, i) => {
                  const pseudo = Math.abs(Math.sin(seed * 17 + i * 31)) * member.action_count
                  return Math.round(pseudo / days.length)
                })
                const maxCount = Math.max(...dayCounts, 1)

                return (
                  <tr key={member.user_name}>
                    <td className="text-slate-300 font-medium pr-3 py-1 truncate max-w-[7rem]">{member.user_name}</td>
                    {dayCounts.map((count, i) => {
                      const intensity = count / maxCount
                      const opacity = intensity === 0 ? 0.05 : 0.1 + intensity * 0.8
                      return (
                        <td key={i} className="py-1 px-1 text-center">
                          <div
                            className="w-10 h-7 rounded mx-auto flex items-center justify-center text-xs font-medium text-blue-200"
                            style={{ background: `rgba(99,102,241,${opacity})` }}
                            title={`${member.user_name}: ${count} actions`}
                          >
                            {count > 0 ? count : ''}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="flex items-center gap-2 mt-3">
            <span className="text-xs text-slate-500">Less</span>
            {[0.05, 0.2, 0.4, 0.6, 0.9].map(op => (
              <div key={op} className="w-5 h-5 rounded" style={{ background: `rgba(99,102,241,${op})` }} />
            ))}
            <span className="text-xs text-slate-500">More</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function OrgAnalytics() {
  const [selectedOrgId, setSelectedOrgId] = useState<number | undefined>(undefined)
  const { tokens: t } = useTheme()

  const { data: orgs = [], isLoading: orgsLoading } = useQuery({
    queryKey: ['orgs'],
    queryFn: () => orgsApi.list().then(r => r.data),
  })

  // Auto-select first org when the list loads for the first time
  useEffect(() => {
    if (orgs.length > 0 && selectedOrgId === undefined) {
      setSelectedOrgId(orgs[0].id)
    }
  }, [orgs, selectedOrgId])

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['org-stats', selectedOrgId],
    queryFn: () =>
      client.get<OrgStats>(`/organizations/${selectedOrgId}/stats`).then(r => r.data),
    enabled: !!selectedOrgId,
  })

  const { data: analytics, isLoading: analyticsLoading } = useQuery({
    queryKey: ['org-analytics', selectedOrgId],
    queryFn: () =>
      client.get<OrgAnalytics>(`/organizations/${selectedOrgId}/analytics`).then(r => r.data),
    enabled: !!selectedOrgId,
  })

  const { data: monitorsData, isLoading: monitorsLoading } = useQuery({
    queryKey: ['org-monitors-perf', selectedOrgId],
    queryFn: () =>
      client.get<MonitorRow[]>(`/organizations/${selectedOrgId}/monitors`).then(r => r.data),
    enabled: !!selectedOrgId,
  })

  const selectedOrg = orgs.find(o => o.id === selectedOrgId)

  return (
    <div className="p-6 space-y-6">
      <Header title="Org Analytics" />

      {/* Org selector */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          {orgsLoading ? (
            <Skeleton className="h-10 w-56" />
          ) : (
            <select
              className="input-field text-sm pl-9 pr-8 py-2 appearance-none w-64"
              value={selectedOrgId ?? ''}
              onChange={e => setSelectedOrgId(e.target.value ? Number(e.target.value) : undefined)}
            >
              <option value="">Select organization</option>
              {orgs.map(org => (
                <option key={org.id} value={org.id}>{org.name}</option>
              ))}
            </select>
          )}
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>
        {selectedOrg && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary-600/20 flex items-center justify-center text-sm font-bold text-primary-400">
              {selectedOrg.name[0].toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-medium text-white">{selectedOrg.name}</p>
              <p className="text-xs text-slate-500 capitalize">{selectedOrg.plan} plan</p>
            </div>
          </div>
        )}
      </div>

      {!selectedOrgId ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-500">
          <Building2 className="w-14 h-14 mb-3 opacity-20" />
          <p className="font-medium">Select an organization to view analytics</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* KPI row */}
          {statsLoading ? (
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
              {Array.from({ length: 6 }).map((_, i) => <StatCardSkeleton key={i} />)}
            </div>
          ) : stats ? (
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
              <KpiCard label="Total Monitors"    value={stats.total_monitors}    icon={Server}         />
              <KpiCard label="Active"            value={stats.active_monitors}   icon={Activity}       color="text-green-400"  bg="bg-green-500/10"  />
              <KpiCard label="Down"              value={stats.down_monitors}     icon={AlertTriangle}  color="text-red-400"    bg="bg-red-500/10"    />
              <KpiCard label="Team Members"      value={stats.total_members}     icon={Users}          color="text-blue-400"   bg="bg-blue-500/10"   />
              <KpiCard label="Monthly Incidents" value={stats.monthly_incidents} icon={AlertTriangle}  color="text-orange-400" bg="bg-orange-500/10" />
              <KpiCard
                label="SLA Score"
                value={`${stats.sla_score.toFixed(1)}%`}
                icon={CheckCircle}
                color={stats.sla_score >= 99.9 ? 'text-green-400' : stats.sla_score >= 99 ? 'text-yellow-400' : 'text-red-400'}
                bg={stats.sla_score >= 99.9 ? 'bg-green-500/10' : stats.sla_score >= 99 ? 'bg-yellow-500/10' : 'bg-red-500/10'}
              />
            </div>
          ) : null}

          {/* Charts row 1 */}
          {analyticsLoading ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ChartSkeleton height={250} />
              <ChartSkeleton height={250} />
            </div>
          ) : analytics ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Uptime trend */}
              <div className="glass-card p-5">
                <h3 className="font-semibold text-white mb-5 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary-400" />Uptime Trend (30 days)
                </h3>
                <ResponsiveContainer width="100%" height={230}>
                  <AreaChart data={analytics.uptime_trend}>
                    <defs>
                      <linearGradient id="uptimeGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={t.primary} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={t.primary} stopOpacity={0}   />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={t.grid} />
                    <XAxis dataKey="date" tick={{ fill: t.tick, fontSize: 11 }} />
                    <YAxis domain={[98, 100]} tick={{ fill: t.tick, fontSize: 11 }} tickFormatter={v => `${v}%`} />
                    <Tooltip
                      contentStyle={{ background: t.tooltipBg, border: `1px solid ${t.tooltipBorder}`, borderRadius: 8, color: t.tooltipText }}
                      formatter={(v: number) => [`${v.toFixed(3)}%`, 'Uptime']}
                    />
                    <Area type="monotone" dataKey="uptime" stroke={t.primary} strokeWidth={2} fill="url(#uptimeGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Incident trend */}
              <div className="glass-card p-5">
                <h3 className="font-semibold text-white mb-5 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-orange-400" />Incident Trend (30 days)
                </h3>
                <ResponsiveContainer width="100%" height={230}>
                  <BarChart data={analytics.incident_trend}>
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
            </div>
          ) : null}

          {/* Charts row 2 */}
          {analyticsLoading ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ChartSkeleton height={250} />
              <ChartSkeleton height={250} />
            </div>
          ) : analytics ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Top failing services */}
              <div className="glass-card p-5">
                <h3 className="font-semibold text-white mb-5">Top Failing Services</h3>
                {analytics.top_failing.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-slate-500">
                    <CheckCircle className="w-10 h-10 mb-2 text-green-500/50" />
                    <p className="text-sm">No failing services — great job!</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={230}>
                    <BarChart data={analytics.top_failing} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke={t.grid} horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tick={{ fill: t.tick, fontSize: 11 }} />
                      <YAxis type="category" dataKey="name" tick={{ fill: t.tick, fontSize: 11 }} width={100} />
                      <Tooltip
                        contentStyle={{ background: t.tooltipBg, border: `1px solid ${t.tooltipBorder}`, borderRadius: 8, color: t.tooltipText }}
                        formatter={(v: number) => [v, 'Incidents']}
                      />
                      <Bar dataKey="incident_count" fill="#ef4444" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Team activity heatmap */}
              <ActivityHeatmap data={analytics.member_activity} />
            </div>
          ) : null}

          {/* Monitor performance table */}
          <div className="glass-card overflow-hidden">
            <div className="p-5 border-b border-slate-700/50">
              <h3 className="font-semibold text-white">Monitor Performance</h3>
            </div>
            {monitorsLoading ? (
              <div className="p-5 space-y-3">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : !monitorsData || monitorsData.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                <Server className="w-10 h-10 mb-2 opacity-30" />
                <p className="text-sm">No monitors found for this organization</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700/50 text-left">
                      <th className="px-4 py-3 text-slate-400 font-medium">Monitor</th>
                      <th className="px-4 py-3 text-slate-400 font-medium">Status</th>
                      <th className="px-4 py-3 text-slate-400 font-medium">Uptime %</th>
                      <th className="px-4 py-3 text-slate-400 font-medium">Avg Response</th>
                      <th className="px-4 py-3 text-slate-400 font-medium">Incidents</th>
                      <th className="px-4 py-3 text-slate-400 font-medium">SLA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monitorsData.map(m => (
                      <tr key={m.id} className="border-b border-slate-700/30 hover:bg-slate-700/20 transition-colors">
                        <td className="px-4 py-3 text-white font-medium">{m.name}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${
                            m.status === 'up'      ? 'bg-green-500/15 text-green-400'   :
                            m.status === 'down'    ? 'bg-red-500/15 text-red-400'       :
                            m.status === 'warning' ? 'bg-yellow-500/15 text-yellow-400' :
                                                     'bg-slate-500/15 text-slate-400'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              m.status === 'up' ? 'bg-green-400' : m.status === 'down' ? 'bg-red-400' : m.status === 'warning' ? 'bg-yellow-400' : 'bg-slate-400'
                            }`} />
                            {m.status.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`font-semibold ${m.uptime_pct >= 99.9 ? 'text-green-400' : m.uptime_pct >= 99 ? 'text-yellow-400' : 'text-red-400'}`}>
                            {m.uptime_pct.toFixed(3)}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-300">{m.avg_response_ms}ms</td>
                        <td className="px-4 py-3 text-slate-300">{m.incident_count}</td>
                        <td className="px-4 py-3">
                          {m.sla_compliant ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-green-500/15 text-green-400">
                              <CheckCircle className="w-3 h-3" />Met
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-red-500/15 text-red-400">
                              <AlertTriangle className="w-3 h-3" />Missed
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
