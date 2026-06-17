import client from './client'
import { tokens } from './tokens'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

export interface UptimeMonitorRow {
  id: number
  name: string
  status: 'up' | 'down' | 'paused' | 'warning'
  uptime_pct: number
  downtime_pct: number
  avg_response_ms: number
  sla_compliant: boolean
  last_incident?: string
}

export interface UptimeReport {
  total_monitors: number
  avg_uptime_pct: number
  sla_compliant_count: number
  total_downtime_hours: number
  monitors: UptimeMonitorRow[]
  uptime_trend: { date: string; uptime: number }[]
  response_trend: { date: string; response_time: number }[]
  overall_sla_pct: number
}

export interface IncidentRow {
  id: number
  monitor_name: string
  started_at: string
  resolved_at?: string
  duration_minutes?: number
  status: 'resolved' | 'ongoing'
  error_message?: string
}

export interface IncidentReport {
  total_incidents: number
  resolved_count: number
  ongoing_count: number
  avg_resolution_minutes: number
  incidents: IncidentRow[]
  daily_counts: { date: string; count: number }[]
}

export interface ActivityEntry {
  id: number
  action: string
  user_name: string
  resource: string
  timestamp: string
}

export interface TeamActivityReport {
  activities: ActivityEntry[]
  actions_per_user: { user_name: string; action_count: number }[]
}

export interface ExecutiveSummary {
  org_name: string
  plan: string
  overall_uptime_pct: number
  sla_compliance_pct: number
  performance_score: number
  total_incidents: number
  best_monitors: { name: string; uptime_pct: number }[]
  worst_monitors: { name: string; uptime_pct: number }[]
  recommendations: string[]
  prev_period_uptime: number
  prev_period_incidents: number
}

export const reportsApi = {
  getUptime: (params: { org_id?: number; days?: number }) =>
    client.get<UptimeReport>('/reports/uptime', { params }),
  getIncidents: (params: { org_id?: number; days?: number }) =>
    client.get<IncidentReport>('/reports/incidents', { params }),
  getTeamActivity: (params: { org_id?: number; days?: number }) =>
    client.get<TeamActivityReport>('/reports/team-activity', { params }),
  getSummary: (params: { org_id?: number; days?: number }) =>
    client.get<ExecutiveSummary>('/reports/summary', { params }),
}

export async function downloadReport(
  format: 'pdf' | 'csv' | 'excel' | 'json',
  reportType: string,
  orgId: number | undefined,
  days: number
): Promise<void> {
  const params = new URLSearchParams({ report_type: reportType, days: String(days) })
  if (orgId !== undefined) params.set('org_id', String(orgId))
  const url = `${API_BASE}/reports/export/${format}?${params.toString()}`

  const token = tokens.access
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) throw new Error(`Export failed: ${res.statusText}`)

  const blob = await res.blob()
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  const ext = format === 'excel' ? 'xlsx' : format
  a.download = `${reportType}-report.${ext}`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(objectUrl)
}
