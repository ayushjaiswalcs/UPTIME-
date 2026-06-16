import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Radio, Eye, EyeOff, Smartphone } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { login, verify2fa } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [remember, setRemember] = useState(true)
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // 2FA state
  const [preToken, setPreToken] = useState<string | null>(null)
  const [totpCode, setTotpCode] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const result = await login(form.email, form.password, remember)
      if (result?.requires_2fa) {
        setPreToken(result.pre_token)
      } else {
        navigate('/dashboard')
      }
    } catch (err: any) {
      const detail = err.response?.data?.detail
      setError(typeof detail === 'string' ? detail : 'Login failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handle2faSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!preToken) return
    setError('')
    setLoading(true)
    try {
      await verify2fa(preToken, totpCode, remember)
      navigate('/dashboard')
    } catch (err: any) {
      const detail = err.response?.data?.detail
      setError(typeof detail === 'string' ? detail : 'Invalid 2FA code. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2.5">
            <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center">
              <Radio className="w-5 h-5 text-white" />
            </div>
            <span className="text-2xl font-bold text-white">Uptime</span>
          </Link>
          <p className="text-slate-400 mt-3 text-sm">
            {preToken ? 'Enter your authenticator code' : 'Sign in to your account'}
          </p>
        </div>

        <div className="glass-card p-7">
          {!preToken ? (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Email address</label>
                <input
                  type="email"
                  className="input-field"
                  placeholder="you@example.com"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Password</label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    className="input-field pr-10"
                    placeholder="Your password"
                    value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    required
                  />
                  <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={e => setRemember(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-primary-600 focus:ring-primary-500/30 focus:ring-2"
                  />
                  Remember me
                </label>
                <Link to="/forgot-password" className="text-sm text-primary-400 hover:text-primary-300 font-medium">
                  Forgot password?
                </Link>
              </div>

              {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 px-4 py-2.5 rounded-xl">{error}</p>}

              <button type="submit" disabled={loading} className="btn-primary w-full py-3">
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Signing in...
                  </span>
                ) : 'Sign In'}
              </button>
            </form>
          ) : (
            <form onSubmit={handle2faSubmit} className="space-y-5">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-primary-500/10 border border-primary-500/20">
                <Smartphone className="w-5 h-5 text-primary-400 flex-shrink-0" />
                <p className="text-sm text-slate-300">Open your authenticator app and enter the 6-digit code.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Verification Code</label>
                <input
                  className="input-field font-mono tracking-widest text-center text-2xl"
                  maxLength={6}
                  placeholder="000000"
                  value={totpCode}
                  onChange={e => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  autoFocus
                  required
                />
              </div>

              {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 px-4 py-2.5 rounded-xl">{error}</p>}

              <button type="submit" disabled={loading || totpCode.length !== 6} className="btn-primary w-full py-3">
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Verifying...
                  </span>
                ) : 'Verify & Sign In'}
              </button>
              <button type="button" onClick={() => { setPreToken(null); setTotpCode(''); setError('') }} className="w-full text-sm text-slate-400 hover:text-white text-center">
                ← Back to login
              </button>
            </form>
          )}

          {!preToken && (
            <p className="text-center text-sm text-slate-400 mt-5">
              Don't have an account?{' '}
              <Link to="/register" className="text-primary-400 hover:text-primary-300 font-medium">Create one free</Link>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
