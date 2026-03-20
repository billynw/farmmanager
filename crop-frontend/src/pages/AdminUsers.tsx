import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { usersApi, fieldsApi } from '../api'
import type { UserFieldRole } from '../api'
import { useAuth } from '../store'
import AppHeader from '../components/AppHeader'
import BottomNav from '../components/BottomNav'
import { TrashIcon, EditIcon, iconBtnStyle } from '../components/Icons'

type Tab = 'users' | 'fields'
type DeleteTarget =
  | { type: 'field'; id: number; name: string }
  | { type: 'user'; id: number; name: string; fieldId: number }

const ROLE_LABEL: Record<UserFieldRole, string> = {
  owner: 'オーナー',
  manager: 'マネージャー',
  member: 'メンバー',
}

const ROLE_COLOR: Record<UserFieldRole, string> = {
  owner: '#2d7a4f',
  manager: '#1a5fa8',
  member: '#888888',
}

function canDelete(myRole: UserFieldRole | undefined, targetRole: UserFieldRole | undefined): boolean {
  if (!myRole) return false
  if (myRole === 'owner') return true
  if (myRole === 'manager') return targetRole !== 'owner'
  return false
}

function canChangeRole(myRole: UserFieldRole | undefined, targetRole: UserFieldRole | undefined): boolean {
  if (!myRole) return false
  if (myRole === 'owner') return targetRole !== 'owner'
  if (myRole === 'manager') return targetRole !== 'owner'
  return false
}

export default function AdminUsers() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const currentUser = useAuth((s) => s.user)
  const [tab, setTab] = useState<Tab>('fields')
  const [selectedFieldId, setSelectedFieldId] = useState<number | null>(null)
  const [togglingUserId, setTogglingUserId] = useState<number | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)

  const { data: fields = [] } = useQuery({ queryKey: ['fields'], queryFn: () => fieldsApi.list().then(r => r.data) })
  const manageableFields = fields.filter(f => f.my_role === 'owner' || f.my_role === 'manager')
  const myRoleInSelectedField = manageableFields.find(f => f.id === selectedFieldId)?.my_role

  const { data: fieldUsers = [], refetch: refetchUsers } = useQuery({
    queryKey: ['fieldUsers', selectedFieldId],
    queryFn: () => selectedFieldId ? usersApi.list(selectedFieldId).then(r => r.data) : Promise.resolve([]),
    enabled: !!selectedFieldId,
  })

  const deleteFieldMut = useMutation({
    mutationFn: (id: number) => fieldsApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['fields'] }); setDeleteTarget(null) },
    onError: (err: any) => alert(err.response?.data?.detail ?? '削除に失敗しました'),
  })

  const deleteUserMut = useMutation({
    mutationFn: ({ userId, fieldId }: { userId: number; fieldId: number }) =>
      usersApi.removeFromField(userId, fieldId),
    onSuccess: () => { refetchUsers(); setDeleteTarget(null) },
    onError: (err: any) => alert(err.response?.data?.detail ?? '削除に失敗しました'),
  })

  useEffect(() => {
    if (manageableFields.length > 0 && !selectedFieldId) {
      setSelectedFieldId(manageableFields[0].id)
    }
  }, [manageableFields.length])

  const handleConfirmDelete = () => {
    if (!deleteTarget) return
    if (deleteTarget.type === 'field') deleteFieldMut.mutate(deleteTarget.id)
    if (deleteTarget.type === 'user') deleteUserMut.mutate({ userId: deleteTarget.id, fieldId: deleteTarget.fieldId })
  }

  const handleRoleToggle = async (userId: number, currentRole: UserFieldRole) => {
    if (!selectedFieldId || togglingUserId === userId) return
    const newRole: UserFieldRole = currentRole === 'manager' ? 'member' : 'manager'
    setTogglingUserId(userId)
    try {
      await usersApi.updateFieldRole(userId, selectedFieldId, newRole)
      refetchUsers()
    } catch (err: any) {
      alert(err.response?.data?.detail ?? '権限変更に失敗しました')
      refetchUsers()
    } finally {
      setTogglingUserId(null)
    }
  }

  return (
    <div style={pageStyle}>
      <AppHeader />

      <div style={{ display: 'flex', background: '#fff', borderBottom: '1px solid #eee' }}>
        {(['fields', 'users'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, padding: '12px', border: 'none', background: 'none', cursor: 'pointer',
            fontSize: 14, fontWeight: tab === t ? 700 : 400,
            color: tab === t ? '#2d7a4f' : '#888',
            borderBottom: tab === t ? '2px solid #2d7a4f' : '2px solid transparent',
          }}>
            {t === 'fields' ? '圃場' : 'ユーザー'}
          </button>
        ))}
      </div>

      {tab === 'fields' && (
        <div style={{ padding: '12px 16px', overflowY: 'auto', flex: 1, paddingBottom: 100 }}>
          {fields.length === 0 && (
            <p style={{ color: '#aaa', textAlign: 'center', marginTop: 40 }}>圃場が登録されていません。「＋ 圃場を追加」から圃場を作成してください。</p>
          )}
          {fields.map(field => (
            <div key={field.id} style={cardStyle}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 15 }}>{field.name}</span>
                  {field.my_role && (
                    <span style={{
                      fontSize: 11, padding: '1px 7px', borderRadius: 20,
                      background: ROLE_COLOR[field.my_role] + '22',
                      color: ROLE_COLOR[field.my_role], fontWeight: 600,
                    }}>{ROLE_LABEL[field.my_role]}</span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                  {field.area ? `${field.area}a` : ''}{field.area && field.location_note ? '　' : ''}{field.location_note ?? ''}
                </div>
              </div>
              {field.my_role === 'owner' && (
                <div style={{ display: 'flex', gap: 2 }}>
                  <button style={iconBtnStyle} title="編集" onClick={() => navigate(`/admin/fields/${field.id}/edit`)}>
                    <EditIcon size={17} color="#555" />
                  </button>
                  <button style={iconBtnStyle} title="削除"
                    onClick={() => setDeleteTarget({ type: 'field', id: field.id, name: field.name })}>
                    <TrashIcon size={17} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'users' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', paddingBottom: 100 }}>
          {manageableFields.length === 0 ? (
            <p style={{ color: '#aaa', textAlign: 'center', marginTop: 40, padding: '0 16px' }}>
              圃場を作成するか、manager以上の圃場に属するとユーザーを招待できます。
            </p>
          ) : (
            <>
              <div style={{ padding: '8px 16px', background: '#fff', borderBottom: '1px solid #eee' }}>
                <select
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14 }}
                  value={selectedFieldId ?? ''}
                  onChange={e => setSelectedFieldId(Number(e.target.value))}
                >
                  {manageableFields.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
              <div style={{ padding: '12px 16px', overflowY: 'auto', flex: 1 }}>
                {fieldUsers.map(user => {
                  const isSelf = user.id === currentUser?.id
                  const showDelete = !isSelf && canDelete(myRoleInSelectedField, user.field_role)
                  const toggleable = !isSelf && canChangeRole(myRoleInSelectedField, user.field_role)
                  const isToggling = togglingUserId === user.id
                  return (
                    <div key={user.id} style={cardStyle}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 15 }}>{user.name}</div>
                        {user.email && <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{user.email}</div>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {user.field_role && (
                          <span
                            onClick={() => toggleable && !isToggling && handleRoleToggle(user.id, user.field_role!)}
                            style={{
                              fontSize: 11, padding: '3px 9px', borderRadius: 20, fontWeight: 600,
                              background: ROLE_COLOR[user.field_role] + '22',
                              color: ROLE_COLOR[user.field_role],
                              cursor: toggleable ? 'pointer' : 'default',
                              opacity: isToggling ? 0.5 : 1,
                              border: toggleable ? `1px solid ${ROLE_COLOR[user.field_role]}55` : `1px solid ${ROLE_COLOR[user.field_role]}33`,
                            }}
                          >
                            {isToggling ? '…' : ROLE_LABEL[user.field_role]}
                          </span>
                        )}
                        {showDelete ? (
                          <button style={iconBtnStyle} title="圃場から削除"
                            onClick={() => selectedFieldId && setDeleteTarget({ type: 'user', id: user.id, name: user.name, fieldId: selectedFieldId })}>
                            <TrashIcon size={17} />
                          </button>
                        ) : (
                          <div style={{ width: 32, flexShrink: 0 }} />
                        )}
                      </div>
                    </div>
                  )
                })}
                {fieldUsers.length === 0 && (
                  <p style={{ color: '#aaa', textAlign: 'center', marginTop: 40 }}>ユーザーがいません</p>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {deleteTarget && (
        <div style={overlayStyle} onClick={() => setDeleteTarget(null)}>
          <div style={deleteModalStyle} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700 }}>
              {deleteTarget.type === 'field' ? '圃場を削除' : 'ユーザーを削除'}
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: 14, color: '#666', lineHeight: 1.6 }}>
              {deleteTarget.type === 'field'
                ? `「${deleteTarget.name}」を削除しますか？`
                : `${deleteTarget.name}をこの圃場から削除しますか？`}
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={cancelBtnStyle} onClick={() => setDeleteTarget(null)}>キャンセル</button>
              <button style={deleteBtnStyle} onClick={handleConfirmDelete}>削除する</button>
            </div>
          </div>
        </div>
      )}

      <button style={fabStyle} onClick={() => {
        if (tab === 'users') navigate('/admin/users/invite')
        else navigate('/admin/fields/new')
      }}>
        {tab === 'users' ? '＋ ユーザーを追加' : '＋ 圃場を追加'}
      </button>

      <BottomNav />
    </div>
  )
}

const pageStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', height: '100dvh', background: '#f5f5f0' }
const cardStyle: React.CSSProperties = { background: '#fff', borderRadius: 12, padding: '12px 16px', marginBottom: 8, display: 'flex', alignItems: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }
const overlayStyle: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }
const deleteModalStyle: React.CSSProperties = { background: '#fff', borderRadius: 12, padding: 24, width: '100%', maxWidth: 400 }
const cancelBtnStyle: React.CSSProperties = { flex: 1, padding: '12px', border: '1px solid #ddd', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 14 }
const deleteBtnStyle: React.CSSProperties = { flex: 1, padding: '12px', border: 'none', borderRadius: 8, background: '#d32f2f', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600 }
const fabStyle: React.CSSProperties = {
  position: 'fixed', bottom: 64, left: '50%', transform: 'translateX(-50%)',
  background: '#2d7a4f', color: '#fff', border: 'none', borderRadius: 10,
  padding: '14px 28px', fontSize: 16, fontWeight: 600, cursor: 'pointer',
  boxShadow: '0 4px 16px rgba(45,122,79,0.35)', whiteSpace: 'nowrap', zIndex: 50,
  width: '90%',
}
