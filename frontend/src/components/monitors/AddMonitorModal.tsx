import { useState } from 'react'
import { Globe, Wifi, Radio, Shield, Search, Server } from 'lucide-react'
import Modal from '../ui/Modal'
import { monitorsApi, type MonitorCreate } from '../../api/monitors'
import { useQueryClient } from '@tanstack/react-query'

const MONITOR_TYPES = [
  { id: 'http',    label: 'HTTP(s)',  icon: Globe,   desc: 'Websites & REST APIs' },
  { id: 'keyword', label: 'Keyword', icon: Search,  desc: 'Check for text in page' },
  { id: 'tcp',     label: 'TCP Port',icon: Wifi,    desc: 'TCP port connectivity' },
  { id: 'ping',    label: 'Ping',    icon: Radio,   desc: 'Host reachability' },
  { id: 'ssl',     label: 'SSL Cert',icon: Shield,  desc: 'Certificate health' },
  { id: 'dns',     label: 'DNS',     icon: Server,  desc: 'DNS resolution' },
]

const INTERVALS = [
  { value: 30,   label: '30 Seconds' },
  { value: 60,   label: '1 Minute'   },
  { value: 300,  label: '5 Minutes'  },
  { value: 600,  label: '10 Minutes' },
  { value: 1800, label: '30 Minutes' },
]

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'PATCH']
const DNS_RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT']

interface Props { isOpen: boolean; onClose: () => void }

export default function AddMonitorModal({ isOpen, onClose }: Props) {
  const qc = useQueryClient()
  const [form, setForm] = useState<MonitorCreate>({
    monitor_name: '',
    target_url: '',
    monitor_type: 'http',
    interval: 300,
    timeout: 10,
    http_method: 'GET',
    expected_status_code: 200,
    alert_threshold: 1,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await monitorsApi.create(form)
      qc.invalidateQueries({ queryKey: ['monitors'] })
      qc.invalidateQueries({ queryKey: ['dashboard-stats'] })
      onClose()
      setForm({ monitor_name: '', target_url: '', monitor_type: 'http', interval: 300, timeout: 10, http_method: 'GET', expected_status_code: 200, alert_threshold: 1, keyword: '', dns_record_type: 'A' })
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create monitor')
    } finally {
      setLoading(false)
    }
  }

  const isHttp = form.monitor_type === 'http' || form.monitor_type === 'keyword'
  const isDns  = form.monitor_type === 'dns'

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add New Monitor" size="lg">
      <div className="mb-5">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Monitor Type</p>
        <div className="grid grid-cols-3 gap-2">
          {MONITOR_TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setForm(f => ({ ...f, monitor_type: t.id }))}
              className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all text-xs font-medium ${
                form.monitor_type === t.id
                  ? 'border-primary-500 bg-primary-500/10 text-primary-400'
                  : 'border-slate-600 hover:border-slate-500 text-slate-400'
              }`}
            >
              <t.icon className="w-5 h-5" />
              <span>{t.label}</span>
              <span className="text-slate-500 text-[10px] font-normal leading-tight text-center">{t.desc}</span>
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Monitor Name</label>
            <input
              className="input-field"
              placeholder="e.g. My Website"
              value={form.monitor_name}
              onChange={e => setForm(f => ({ ...f, monitor_name: e.target.value }))}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              {isDns ? 'Domain / Hostname' : 'URL / Address'}
            </label>
            <input
              className="input-field"
              placeholder={isDns ? 'example.com' : form.monitor_type === 'tcp' ? 'host:port' : 'https://example.com'}
              value={form.target_url}
              onChange={e => setForm(f => ({ ...f, target_url: e.target.value }))}
              required
            />
          </div>
        </div>

        {isHttp && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">HTTP Method</label>
              <select className="input-field" value={form.http_method} onChange={e => setForm(f => ({ ...f, http_method: e.target.value }))}>
                {HTTP_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Expected Status</label>
              <input type="number" className="input-field" value={form.expected_status_code} onChange={e => setForm(f => ({ ...f, expected_status_code: Number(e.target.value) }))} />
            </div>
          </div>
        )}

        {form.monitor_type === 'keyword' && (
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Keyword to Check</label>
            <input
              className="input-field"
              placeholder="e.g. Welcome to our site"
              value={form.keyword || ''}
              onChange={e => setForm(f => ({ ...f, keyword: e.target.value }))}
            />
            <p className="text-xs text-slate-500 mt-1">Alert if this text is NOT found in the page response</p>
          </div>
        )}

        {isDns && (
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">DNS Record Type</label>
            <select className="input-field" value={form.dns_record_type || 'A'} onChange={e => setForm(f => ({ ...f, dns_record_type: e.target.value }))}>
              {DNS_RECORD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        )}

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Check Interval</label>
            <select className="input-field" value={form.interval} onChange={e => setForm(f => ({ ...f, interval: Number(e.target.value) }))}>
              {INTERVALS.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Timeout</label>
            <select className="input-field" value={form.timeout} onChange={e => setForm(f => ({ ...f, timeout: Number(e.target.value) }))}>
              {[5, 10, 15, 30, 60].map(t => <option key={t} value={t}>{t}s</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Alert After</label>
            <select className="input-field" value={form.alert_threshold || 1} onChange={e => setForm(f => ({ ...f, alert_threshold: Number(e.target.value) }))}>
              {[1,2,3,5].map(n => <option key={n} value={n}>{n} failure{n > 1 ? 's' : ''}</option>)}
            </select>
          </div>
        </div>

        {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 px-4 py-2.5 rounded-xl">{error}</p>}

        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={loading} className="btn-primary flex-1">
            {loading ? 'Creating...' : 'Create Monitor'}
          </button>
          <button type="button" onClick={onClose} className="btn-secondary px-6">Cancel</button>
        </div>
      </form>
    </Modal>
  )
}
