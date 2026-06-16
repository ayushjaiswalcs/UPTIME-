import client from './client'

export interface User {
  id: number
  name: string
  email: string
  role: string
  subscription_plan: string
  is_verified: boolean
  totp_enabled: boolean
  avatar_url?: string
  last_login_at?: string
  created_at: string
}

export interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
  user: User
}

export interface TwoFAChallenge {
  requires_2fa: true
  pre_token: string
}

export const authApi = {
  register: (name: string, email: string, password: string) =>
    client.post<TokenResponse>('/auth/register', { name, email, password }),

  login: (email: string, password: string) =>
    client.post<TokenResponse | TwoFAChallenge>('/auth/login', { email, password }),

  verify2fa: (pre_token: string, code: string) =>
    client.post<TokenResponse>(`/auth/2fa/verify?pre_token=${encodeURIComponent(pre_token)}&code=${encodeURIComponent(code)}`),

  getMe: () => client.get<User>('/auth/me'),

  updateMe: (data: { name?: string; email?: string }) =>
    client.put<User>('/auth/me', data),

  changePassword: (current_password: string, new_password: string) =>
    client.post('/auth/change-password', { current_password, new_password }),

  forgotPassword: (email: string) =>
    client.post<{ message: string; dev_reset_link?: string }>('/auth/forgot-password', { email }),

  resetPassword: (token: string, new_password: string) =>
    client.post<{ message: string }>('/auth/reset-password', { token, new_password }),

  verifyEmail: (token: string) =>
    client.post<{ message: string }>('/auth/verify-email', { token }),

  resendVerification: () =>
    client.post<{ message: string; dev_verify_link?: string }>('/auth/resend-verification'),
}
