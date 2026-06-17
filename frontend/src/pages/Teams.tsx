import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Users, Plus, Trash2, Building2, Crown, Shield, Code2, Eye,
  UserPlus, Briefcase, Check, Minus, Settings, Lock, Save, X,
} from 'lucide-react'
import { orgsApi, type OrgOut, type OrgCreate, type MemberOut } from '../api/organizations'
import Header from '../components/layout/Header'
import Modal from '../components/ui/Modal'
import { useToast } from '../context/ToastContext'
import { Skeleton } from '../components/ui/Skeleton'

// ─── Types & constants ────────────────────────────────────────────────────────

type Role = 'owner' | 'admin' | 'manager' | 'developer' | 'viewer'
type PanelTab = 'members' | 'permissions' | 'settings'

interface RoleMeta {
  label: string
  icon: React.ElementType
  color: string
  bg: string
  border: string
}

const ROLE_META: Record<Role, RoleMeta> = {
  owner:     { label: 'Owner',     icon: Crown,    color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30' },
  admin:     { label: 'Admin',     icon: Shield,   color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/30'    },
  manager:   { label: 'Manager',   icon: Briefcase,color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/30' },
  developer: { label: 'Developer', icon: Code2,    color: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/30'   },
  viewer:    { label: 'Viewer',    icon: Eye,      color: 'text-slate-400',  bg: 'bg-slate-500/10',  border: 'border-slate-500/30'  },
}

function getRoleMeta(role: string): RoleMeta {
  return ROLE_META[role as Role] ?? ROLE_META.viewer
}

type Permission =
  | 'create_monitor'
  | 'edit_monitor'
  | 'delete_monitor'
  | 'view_reports'
  | 'export_reports'
  | 'manage_team'
  | 'manage_billing'

const PERMISSIONS: { key: Permission; label: string }[] = [
  { key: 'create_monitor',  label: 'Create Monitor'  },
  { key: 'edit_monitor',    label: 'Edit Monitor'    },
  { key: 'delete_monitor',  label: 'Delete Monitor'  },
  { key: 'view_reports',    label: 'View Reports'    },
  { key: 'export_reports',  label: 'Export Reports'  },
  { key: 'manage_team',     label: 'Manage Team'     },
  { key: 'manage_billing',  label: 'Manage Billing'  },
]

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner:     ['create_monitor', 'edit_monitor', 'delete_monitor', 'view_reports', 'export_reports', 'manage_team', 'manage_billing'],
  admin:     ['create_monitor', 'edit_monitor', 'delete_monitor', 'view_reports', 'export_reports', 'manage_team'],
  manager:   ['create_monitor', 'edit_monitor', 'view_reports', 'export_reports'],
  developer: ['create_monitor', 'edit_monitor'],
  viewer:    [],
}

const ORDERED_ROLES: Role[] = ['owner', 'admin', 'manager', 'developer', 'viewer']

// ─── Sub-components ───────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: string }) {
  const meta = getRoleMeta(role)
  const Icon = meta.icon
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${meta.color} ${meta.bg} ${meta.border}`}>
      <Icon className="w-3 h-3" />{meta.label}
    </span>
  )
}

function OrgAvatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'w-7 h-7 text-xs', md: 'w-10 h-10 text-sm', lg: 'w-14 h-14 text-lg' }
  return (
    <div className={`${sizes[size]} rounded-xl bg-primary-600/20 flex items-center justify-center font-bold text-primary-400 flex-shrink-0`}>
      {name[0]?.toUpperCase()}
    </div>
  )
}

// ─── Members Tab ──────────────────────────────────────────────────────────────

function MembersPanel({
  org,
  members,
  membersLoading,
  onInvite,
}: {
  org: OrgOut
  members: MemberOut[]
  membersLoading: boolean
  onInvite: () => void
}) {
  const qc = useQueryClient()
  const { toast } = useToast()

  const removeMember = useMutation({
    mutationFn: ({ orgId, memberId }: { orgId: number; memberId: number }) =>
      orgsApi.removeMember(orgId, memberId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-members', org.id] })
      toast('Member removed', 'success')
    },
    onError: () => toast('Failed to remove member', 'error'),
  })

  const updateRole = useMutation({
    mutationFn: ({ memberId, role }: { memberId: number; role: string }) =>
      orgsApi.updateMemberRole(org.id, memberId, role),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-members', org.id] })
      toast('Role updated', 'success')
    },
    onError: () => toast('Failed to update role', 'error'),
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-400">{members.length} member{members.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={onInvite}
          className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5"
        >
          <UserPlus className="w-3.5 h-3.5" />Invite Member
        </button>
      </div>

      {membersLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : members.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-slate-500">
          <Users className="w-10 h-10 mb-2 opacity-30" />
          <p className="text-sm">No members yet. Invite someone!</p>
        </div>
      ) : (
        <div className="space-y-2">
          {members.map(m => {
            const isOwner = m.role === 'owner'
            return (
              <div
                key={m.id}
                className="flex items-center gap-3 p-3 rounded-xl bg-slate-700/30 hover:bg-slate-700/50 transition-colors"
              >
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-600 to-primary-800 flex items-center justify-center text-sm font-bold text-white flex-shrink-0">
                  {(m.user_name || '?')[0].toUpperCase()}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{m.user_name || 'Unknown'}</p>
                  <p className="text-xs text-slate-500 truncate">{m.user_email}</p>
                </div>

                {/* Role dropdown / badge */}
                {isOwner ? (
                  <RoleBadge role="owner" />
                ) : (
                  <select
                    className="input-field text-xs py-1 pl-2 pr-7 w-36"
                    value={m.role}
                    onChange={e => updateRole.mutate({ memberId: m.id, role: e.target.value })}
                  >
                    {ORDERED_ROLES.filter(r => r !== 'owner').map(r => (
                      <option key={r} value={r}>{ROLE_META[r].label}</option>
                    ))}
                  </select>
                )}

                {/* Remove button */}
                {!isOwner && (
                  <button
                    onClick={() => removeMember.mutate({ orgId: org.id, memberId: m.id })}
                    disabled={removeMember.isPending}
                    title="Remove member"
                    className="text-slate-500 hover:text-red-400 transition-colors disabled:opacity-40 ml-1"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Permissions Tab ──────────────────────────────────────────────────────────

function PermissionsPanel() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Lock className="w-4 h-4 text-slate-400" />
        <p className="text-sm text-slate-400">Role permission matrix — read-only reference</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700/50">
              <th className="py-3 pr-4 text-left text-slate-400 font-medium w-32">Permission</th>
              {ORDERED_ROLES.map(role => {
                const meta = ROLE_META[role]
                const Icon = meta.icon
                return (
                  <th key={role} className="py-3 px-3 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <Icon className={`w-4 h-4 ${meta.color}`} />
                      <span className={`text-xs font-medium ${meta.color}`}>{meta.label}</span>
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {PERMISSIONS.map(({ key, label }) => (
              <tr key={key} className="border-b border-slate-700/20 hover:bg-slate-700/10 transition-colors">
                <td className="py-3 pr-4 text-slate-300 font-medium text-xs">{label}</td>
                {ORDERED_ROLES.map(role => {
                  const has = ROLE_PERMISSIONS[role].includes(key)
                  return (
                    <td key={role} className="py-3 px-3 text-center">
                      {has
                        ? <Check className="w-4 h-4 text-green-400 mx-auto" />
                        : <Minus className="w-4 h-4 text-slate-600 mx-auto" />
                      }
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────

function SettingsPanel({
  org,
  onDeleted,
}: {
  org: OrgOut
  onDeleted: () => void
}) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [name, setName] = useState(org.name)
  const [logoUrl, setLogoUrl] = useState(org.logo_url || '')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const updateOrg = useMutation({
    mutationFn: () => orgsApi.update(org.id, { name, logo_url: logoUrl || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orgs'] })
      toast('Organization updated', 'success')
    },
    onError: () => toast('Failed to update organization', 'error'),
  })

  const deleteOrg = useMutation({
    mutationFn: () => orgsApi.delete(org.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orgs'] })
      toast('Organization deleted', 'success')
      onDeleted()
    },
    onError: () => toast('Failed to delete organization', 'error'),
  })

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-slate-300">Organization Details</h3>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Organization Name</label>
          <input
            className="input-field"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="My Organization"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Logo URL</label>
          <input
            className="input-field"
            value={logoUrl}
            onChange={e => setLogoUrl(e.target.value)}
            placeholder="https://example.com/logo.png"
          />
        </div>
        <button
          onClick={() => updateOrg.mutate()}
          disabled={updateOrg.isPending}
          className="btn-primary flex items-center gap-2"
        >
          <Save className="w-4 h-4" />
          {updateOrg.isPending ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      <div className="border-t border-red-500/20 pt-6">
        <h3 className="text-sm font-semibold text-red-400 mb-3">Danger Zone</h3>
        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            className="btn-secondary text-red-400 border-red-500/30 hover:bg-red-500/10 flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />Delete Organization
          </button>
        ) : (
          <div className="p-4 rounded-xl bg-red-500/5 border border-red-500/30 space-y-3">
            <p className="text-sm text-red-400">
              This will permanently delete <strong>{org.name}</strong> and all its data. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => deleteOrg.mutate()}
                disabled={deleteOrg.isPending}
                className="btn-secondary text-red-400 border-red-500/30 hover:bg-red-500/10"
              >
                {deleteOrg.isPending ? 'Deleting...' : 'Yes, Delete'}
              </button>
              <button onClick={() => setConfirmDelete(false)} className="btn-ghost flex items-center gap-1.5">
                <X className="w-4 h-4" />Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────

const PANEL_TABS: { id: PanelTab; label: string; icon: React.ElementType }[] = [
  { id: 'members',     label: 'Members',     icon: Users    },
  { id: 'permissions', label: 'Permissions', icon: Lock     },
  { id: 'settings',    label: 'Settings',    icon: Settings },
]

export default function Teams() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [createOpen, setCreateOpen]   = useState(false)
  const [inviteOpen, setInviteOpen]   = useState(false)
  const [selectedOrg, setSelectedOrg] = useState<OrgOut | null>(null)
  const [panelTab, setPanelTab]       = useState<PanelTab>('members')
  const [orgForm, setOrgForm]         = useState<OrgCreate>({ name: '', slug: '' })
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole]   = useState<string>('developer')
  const [formError, setFormError]     = useState('')

  const { data: orgs = [], isLoading: orgsLoading } = useQuery({
    queryKey: ['orgs'],
    queryFn: () => orgsApi.list().then(r => r.data),
  })

  const { data: members = [], isLoading: membersLoading } = useQuery({
    queryKey: ['org-members', selectedOrg?.id],
    queryFn: () => selectedOrg ? orgsApi.listMembers(selectedOrg.id).then(r => r.data) : [],
    enabled: !!selectedOrg,
  })

  const createOrg = useMutation({
    mutationFn: () => orgsApi.create(orgForm),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['orgs'] })
      setCreateOpen(false)
      setOrgForm({ name: '', slug: '' })
      setSelectedOrg(res.data)
      toast('Organization created!', 'success')
    },
    onError: (e: any) => {
      setFormError(e.response?.data?.detail || 'Failed to create')
    },
  })

  const inviteMember = useMutation({
    mutationFn: () => orgsApi.inviteMember(selectedOrg!.id, inviteEmail, inviteRole),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-members', selectedOrg?.id] })
      setInviteOpen(false)
      setInviteEmail('')
      toast('Invite sent!', 'success')
    },
    onError: (e: any) => {
      setFormError(e.response?.data?.detail || 'Failed to invite')
    },
  })

  function handleOrgSelect(org: OrgOut) {
    setSelectedOrg(org)
    setPanelTab('members')
  }

  return (
    <div className="p-6 space-y-6">
      <Header
        title="Teams & Organizations"
        action={{ label: 'New Organization', onClick: () => { setFormError(''); setCreateOpen(true) } }}
      />

      <div className="flex gap-6 min-h-[600px]">
        {/* ── Left sidebar: org list ── */}
        <aside className="w-72 flex-shrink-0">
          <div className="glass-card p-4 space-y-2 h-full">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-primary-400" />Organizations
              </h2>
              <button
                onClick={() => { setFormError(''); setCreateOpen(true) }}
                className="icon-button w-7 h-7 rounded-lg"
                title="New organization"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {orgsLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : orgs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-slate-500">
                <Building2 className="w-10 h-10 mb-2 opacity-30" />
                <p className="text-xs text-center">No organizations yet.</p>
                <button onClick={() => setCreateOpen(true)} className="mt-3 btn-primary text-xs py-1.5 px-3">
                  Create One
                </button>
              </div>
            ) : (
              orgs.map(org => (
                <button
                  key={org.id}
                  onClick={() => handleOrgSelect(org)}
                  className={`w-full text-left p-3 rounded-xl border transition-all ${
                    selectedOrg?.id === org.id
                      ? 'border-primary-500 bg-primary-500/10'
                      : 'border-slate-700/50 hover:border-slate-600 hover:bg-slate-700/30'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <OrgAvatar name={org.name} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{org.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-slate-500">/{org.slug}</span>
                        <span className="text-xs text-slate-600">·</span>
                        <span className="text-xs text-slate-500 capitalize">{org.plan}</span>
                      </div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        {/* ── Main panel ── */}
        <div className="flex-1 glass-card p-5 flex flex-col">
          {!selectedOrg ? (
            <div className="flex flex-col items-center justify-center flex-1 text-slate-500">
              <Users className="w-14 h-14 mb-3 opacity-20" />
              <p className="font-medium">No organization selected</p>
              <p className="text-sm mt-1">Choose one from the left to manage it</p>
            </div>
          ) : (
            <div className="flex flex-col flex-1 gap-5">
              {/* Org header */}
              <div className="flex items-center gap-4 pb-4 border-b border-slate-700/50">
                <OrgAvatar name={selectedOrg.name} size="md" />
                <div>
                  <h2 className="font-semibold text-white text-lg">{selectedOrg.name}</h2>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-slate-500">/{selectedOrg.slug}</span>
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-primary-500/15 text-primary-300 capitalize">
                      {selectedOrg.plan}
                    </span>
                    <span className="text-xs text-slate-500">{members.length} members</span>
                  </div>
                </div>
              </div>

              {/* Tab pills */}
              <div className="flex items-center gap-1 p-1 bg-slate-800/50 rounded-lg w-fit border border-slate-700/50">
                {PANEL_TABS.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setPanelTab(id)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                      panelTab === id ? 'bg-primary-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />{label}
                  </button>
                ))}
              </div>

              {/* Panel content */}
              <div className="flex-1">
                {panelTab === 'members' && (
                  <MembersPanel
                    org={selectedOrg}
                    members={members}
                    membersLoading={membersLoading}
                    onInvite={() => { setFormError(''); setInviteOpen(true) }}
                  />
                )}
                {panelTab === 'permissions' && <PermissionsPanel />}
                {panelTab === 'settings' && (
                  <SettingsPanel
                    org={selectedOrg}
                    onDeleted={() => setSelectedOrg(null)}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Create Org Modal ── */}
      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="New Organization">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Organization Name</label>
            <input
              className="input-field"
              placeholder="Acme Inc."
              value={orgForm.name}
              onChange={e =>
                setOrgForm(f => ({
                  ...f,
                  name: e.target.value,
                  slug: f.slug || e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
                }))
              }
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Slug</label>
            <input
              className="input-field"
              placeholder="acme-inc"
              value={orgForm.slug}
              onChange={e => setOrgForm(f => ({ ...f, slug: e.target.value.toLowerCase() }))}
            />
            <p className="text-xs text-slate-500 mt-1">Lowercase letters, numbers, hyphens only</p>
          </div>
          {formError && <p className="text-sm text-red-400">{formError}</p>}
          <div className="flex gap-3 pt-1">
            <button
              onClick={() => createOrg.mutate()}
              disabled={createOrg.isPending || !orgForm.name.trim()}
              className="btn-primary flex-1"
            >
              {createOrg.isPending ? 'Creating...' : 'Create Organization'}
            </button>
            <button onClick={() => setCreateOpen(false)} className="btn-secondary px-5">Cancel</button>
          </div>
        </div>
      </Modal>

      {/* ── Invite Modal ── */}
      <Modal
        isOpen={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title={`Invite to ${selectedOrg?.name}`}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Email Address</label>
            <input
              type="email"
              className="input-field"
              placeholder="colleague@company.com"
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Role</label>
            <select
              className="input-field"
              value={inviteRole}
              onChange={e => setInviteRole(e.target.value)}
            >
              {ORDERED_ROLES.filter(r => r !== 'owner').map(r => (
                <option key={r} value={r}>{ROLE_META[r].label}</option>
              ))}
            </select>

            {/* Role description preview */}
            <div className={`mt-2 p-3 rounded-lg text-xs border ${ROLE_META[inviteRole as Role]?.border ?? ''} ${ROLE_META[inviteRole as Role]?.bg ?? ''}`}>
              <p className={`font-medium ${ROLE_META[inviteRole as Role]?.color ?? 'text-slate-400'}`}>
                {ROLE_META[inviteRole as Role]?.label} can:
              </p>
              <ul className="mt-1 space-y-0.5 text-slate-400">
                {ROLE_PERMISSIONS[inviteRole as Role]?.map(p => (
                  <li key={p} className="flex items-center gap-1.5">
                    <Check className="w-3 h-3 text-green-400" />
                    {PERMISSIONS.find(x => x.key === p)?.label}
                  </li>
                ))}
                {ROLE_PERMISSIONS[inviteRole as Role]?.length === 0 && (
                  <li className="text-slate-500">View monitors (read-only)</li>
                )}
              </ul>
            </div>
          </div>
          {formError && <p className="text-sm text-red-400">{formError}</p>}
          <div className="flex gap-3 pt-1">
            <button
              onClick={() => inviteMember.mutate()}
              disabled={inviteMember.isPending || !inviteEmail.trim()}
              className="btn-primary flex-1"
            >
              {inviteMember.isPending ? 'Inviting...' : 'Send Invite'}
            </button>
            <button onClick={() => setInviteOpen(false)} className="btn-secondary px-5">Cancel</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
