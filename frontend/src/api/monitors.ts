import client from './client'

export interface Monitor {
  id: number
  user_id: number
  monitor_name: string
  target_url: string
  monitor_type: string
  interval: number
  timeout: number
  http_method: string
  expected_status_code: number
  current_status: string
  is_paused: boolean
  uptime_percentage: string
  keyword: string | null
  dns_record_type: string | null
  alert_threshold: number
  failure_count: number
  created_at: string
  last_checked_at: string | null
}

export interface MonitorLog {
  id: number
  monitor_id: number
  response_time: number | null
  http_status: number | null
  is_up: boolean
  error_message: string | null
  checked_at: string
}

export interface MonitorCreate {
  monitor_name: string
  target_url: string
  monitor_type: string
  interval: number
  timeout: number
  http_method: string
  expected_status_code: number
  custom_headers?: string
  request_body?: string
  keyword?: string
  dns_record_type?: string
  alert_threshold?: number
}

export const monitorsApi = {
  list: () => client.get<Monitor[]>('/monitors'),
  create: (data: MonitorCreate) => client.post<Monitor>('/monitors', data),
  update: (id: number, data: Partial<MonitorCreate> & { is_paused?: boolean }) =>
    client.put<Monitor>(`/monitors/${id}`, data),
  delete: (id: number) => client.delete(`/monitors/${id}`),
  pause: (id: number) => client.post(`/monitors/${id}/pause`),
  getLogs: (id: number, hours = 24) =>
    client.get<MonitorLog[]>(`/monitors/${id}/logs`, { params: { hours } }),
}
