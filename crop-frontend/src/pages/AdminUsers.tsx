import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { usersApi, fieldsApi } from '../api'
import type { UserFieldRole, Field, FieldInviteItem } from '../api'
import { useAuth } from '../store'

type Tab = 'users' | 'fields'

const ROLE_LABEL: Record<UserFieldRole, string> = {
  owner: 'オーナー',
  manager: 'マネージャー',
  member: 'メンバー',
}

const ROLE_COLOR: Record<UserFieldRole, string> = {
  owner: '#2d7a4f',
  manager: '#1a5fa8',
  member: '#888',
}

// managerはoownerを削除できない
function canDelete(myRole: UserFieldRole | undefined, targetRole: UserFieldRole | undefined): boolean {
  if (!myRole) return false
  if (myRole === 'owner') return true
  if (myRole === 'manager') return targetRole !== 'owner'
  return false
}

export default function AdminUsers() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const currentUser = useAuth((s) => s.user)
  const [tab, setTab] = useState<Tab>('fields')
  const [selectedFieldId, setSelectedFieldId] = useState<number | null>(null)
  const [showUserForm, setShowUserForm] = useState(false)
  const [showFieldForm, setShowFieldForm] = useState(false)
  const [editField, setEditField] = useState<Field | null>(null)

  const { data: fields = [] } = useQuery({ queryKey: ['fields'], queryFn: () => fieldsApi.list().then(r => r.data) })
  const manageableFields = fields.filter(f => f.my_role === 'owner' || f.my_role === 'manager')

  // 選択中の圃場での自分のロール
  const myRoleInSelectedField = manageableFields.find(f => f.id === selectedFieldId)?.my_role

  const { data: fieldUsers = [], refetch: refetchUsers } = useQuery({
    queryKey: ['fieldUsers', selectedFieldId],
    queryFn: () => selectedFieldId ? usersApi.list(selectedFieldId).then(r => r.data) : Promise.resolve([]),
    enabled: !!selectedFieldId,
  })

  const deleteFieldMut = useMutation({
    mutationFn: (id: number) => fieldsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fields'] }),
    onError: (err: any) => alert(err.response?.data?.detail ?? '削除に失敗しました'),
  })

  useEffect(() => {
    if (manageableFields.length > 0 && !selectedFieldId) {
      setSelectedFieldId(manageableFields[0].id)
    }
  }, [manageableFields.length])

  return (
    <div style={pageStyle}>
      <div style={headerStyle}>
        <button onClick={() => navigate('/')} style={backBtnStyle}>← 戻る</button>
        <span style={{ fontWeight: 700, fontSize: 16 }}>管理メニュー</span>
        <button style={addBtnStyle} onClick={() => {
          if (tab === 'users') setShowUserForm(true)
          else { setEditField(null); setShowFieldForm(true) }
        }}>＋ 追加</button>
      </div>

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
        <div style={{ padding: '12px 16px', overflowY: 'auto', flex: 1 }}>
          {fields.length === 0 && (
            <p style={{ color: '#aaa', textAlign: 'center', marginTop: 40 }}>圃場が登録されていません。「＋追加」から圃場を作成してください。</p>
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
                <div style={{ display: 'flex', gap: 6 }}>
                  <button style={smallBtnStyle} onClick={() => { setEditField(field); setShowFieldForm(true) }}>編集</button>
                  <button style={{ ...smallBtnStyle, color: '#c0392b', borderColor: '#c0392b' }}
                    onClick={() => { if (confirm(`「${field.name}」を削除しますか？`)) deleteFieldMut.mutate(field.id) }}>削除</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'users' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
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
                  {manageableFields.map(f => <option key={f.id} value={f.id}>{f.name}（{ROLE_LABEL[f.my_role!]}）</option>)}
                </select>
              </div>
              <div style={{ padding: '12px 16px', overflowY: 'auto', flex: 1 }}>
                {fieldUsers.map(user => {
                  const showDelete = user.id !== currentUser?.id && canDelete(myRoleInSelectedField, user.field_role)
                  return (
                    <div key={user.id} style={cardStyle}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontWeight: 600, fontSize: 15 }}>{user.name}</span>
                          {user.field_role && (
                            <span style={{
                              fontSize: 11, padding: '1px 7px', borderRadius: 20,
                              background: ROLE_COLOR[user.field_role] + '22',
                              color: ROLE_COLOR[user.field_role], fontWeight: 600,
                            }}>{ROLE_LABEL[user.field_role]}</span>
                          )}
                        </div>
                        {user.email && <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{user.email}</div>}
                      </div>
                      {showDelete && (
                        <button
                          style={{ ...smallBtnStyle, color: '#c0392b', borderColor: '#c0392b' }}
                          onClick={() => {
                            if (selectedFieldId && confirm(`${user.name}をこの圃場から削除しますか？`))
                              usersApi.removeFromField(user.id, selectedFieldId).then(() => refetchUsers())
                          }}
                        >削除</button>
                      )}
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

      {showUserForm && (
        <UserInviteModal
          manageableFields={manageableFields}
          onClose={() => setShowUserForm(false)}
          onSaved={() => { refetchUsers(); setShowUserForm(false) }}
        />
      )}

      {showFieldForm && (
        <FieldFormModal
          field={editField}
          onClose={() => setShowFieldForm(false)}
          onSaved={() => { qc.invalidateQueries({ queryKey: ['fields'] }); setShowFieldForm(false) }}
        />
      )}
    </div>
  )
}

function UserInviteModal({ manageableFields, onClose, onSaved }: {
  manageableFields: Field[]
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [fieldSelections, setFieldSelections] = useState<Record<number, { checked: boolean; role: UserFieldRole }>>(
    Object.fromEntries(manageableFields.map(f => [f.id, { checked: false, role: 'member' as UserFieldRole }]))
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const allChecked = manageableFields.every(f => fieldSelections[f.id]?.checked)
  const someChecked = manageableFields.some(f => fieldSelections[f.id]?.checked)

  const toggleAll = () => {
    const next = !allChecked
    setFieldSelections(prev => {
      const updated = { ...prev }
      manageableFields.forEach(f => { updated[f.id] = { ...updated[f.id], checked: next } })
      return updated
    })
  }

  const toggleField = (fieldId: number) => {
    setFieldSelections(prev => ({
      ...prev,
      [fieldId]: { ...prev[fieldId], checked: !prev[fieldId].checked }
    }))
  }

  const setRole = (fieldId: number, role: UserFieldRole) => {
    setFieldSelections(prev => ({
      ...prev,
      [fieldId]: { ...prev[fieldId], role }
    }))
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const selectedFields: FieldInviteItem[] = manageableFields
      .filter(f => fieldSelections[f.id]?.checked)
      .map(f => ({ field_id: f.id, field_role: fieldSelections[f.id].role }))
    if (selectedFields.length === 0) { setError('圃場を少なくとも1つ選択してください'); return }
    setLoading(true); setError('')
    try {
      await usersApi.invite({ name, email, fields: selectedFields })
      setDone(true)
    } catch (err: any) {
      setError(err.response?.data?.detail ?? '保存に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div style={overlayStyle} onClick={onClose}>
        <div style={modalStyle} onClick={e => e.stopPropagation()}>
          <p style={{ color: '#2d7a4f', fontWeight: 600, marginBottom: 8 }}>📧 招待しました</p>
          <p style={{ color: '#666', fontSize: 14, marginBottom: 20, lineHeight: 1.6 }}>
            登録済みの場合は即座に圃場に追加されました。<br />
            未登録の場合は <strong>{email}</strong> に招待メールを送りました。
          </p>
          <button style={btnStyle} onClick={onSaved}>閉じる</button>
        </div>
      </div>
    )
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700 }}>ユーザーを招待</h3>
        <p style={{ color: '#888', fontSize: 13, marginBottom: 16 }}>
          登録済みの場合は即座に追加、未登録の場合は招待メールを送信します。
        </p>
        {error && <p style={{ color: '#c0392b', fontSize: 13, marginBottom: 10 }}>{error}</p>}
        <form onSubmit={submit}>
          <label style={labelStyle}>ユーザー名 <span style={{ color: '#c0392b' }}>*</span></label>
          <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} required />
          <label style={{ ...labelStyle, marginTop: 12 }}>メールアドレス <span style={{ color: '#c0392b' }}>*</span></label>
          <input style={inputStyle} type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="example@email.com" />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, marginBottom: 6 }}>
            <label style={labelStyle}>圃場と権限 <span style={{ color: '#c0392b' }}>*</span></label>
            <button type="button" style={smallBtnStyle} onClick={toggleAll}>
              {allChecked ? 'すべて解除' : 'すべて選択'}
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto', marginBottom: 4 }}>
            {manageableFields.map(field => {
              const sel = fieldSelections[field.id]
              return (
                <div key={field.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px',
                  border: `1px solid ${sel.checked ? '#2d7a4f' : '#eee'}`,
                  borderRadius: 8,
                  background: sel.checked ? '#f0faf4' : '#fff',
                }}>
                  <input type="checkbox" checked={sel.checked} onChange={() => toggleField(field.id)}
                    style={{ width: 18, height: 18, cursor: 'pointer', flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 14, fontWeight: 500, color: sel.checked ? '#1a1a1a' : '#888' }}>
                      {field.name}
                    </span>
                    {field.my_role && (
                      <span style={{ fontSize: 11, marginLeft: 6, color: ROLE_COLOR[field.my_role] }}>
                        ({ROLE_LABEL[field.my_role]})
                      </span>
                    )}
                  </div>
                  <select
                    value={sel.role}
                    onChange={e => setRole(field.id, e.target.value as UserFieldRole)}
                    disabled={!sel.checked}
                    style={{
                      fontSize: 12, padding: '3px 6px', borderRadius: 6,
                      border: '1px solid #ddd', background: '#fff',
                      opacity: sel.checked ? 1 : 0.4,
                    }}
                  >
                    <option value="member">メンバー</option>
                    <option value="manager">マネージャー</option>
                    <option value="owner">オーナー</option>
                  </select>
                </div>
              )
            })}
          </div>

          {!someChecked && (
            <p style={{ fontSize: 12, color: '#c0392b', marginBottom: 8 }}>圃場を少なくとも1つ選択してください</p>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button type="button" style={{ ...btnStyle, background: '#eee', color: '#444' }} onClick={onClose}>キャンセル</button>
            <button type="submit" style={{ ...btnStyle, opacity: loading ? 0.6 : 1 }} disabled={loading}>
              {loading ? '送信中...' : '招待する'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function FieldFormModal({ field, onClose, onSaved }: { field: Field | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(field?.name ?? '')
  const [area, setArea] = useState(field?.area?.toString() ?? '')
  const [locationNote, setLocationNote] = useState(field?.location_note ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      const data = { name, area: area ? parseFloat(area) : undefined, location_note: locationNote || undefined }
      if (field) await fieldsApi.update(field.id, data)
      else await fieldsApi.create(data)
      onSaved()
    } catch (err: any) {
      setError(err.response?.data?.detail ?? '保存に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>{field ? '圃場編集' : '圃場追加'}</h3>
        {error && <p style={{ color: '#c0392b', fontSize: 13, marginBottom: 10 }}>{error}</p>}
        <form onSubmit={submit}>
          <label style={labelStyle}>圃場名 <span style={{ color: '#c0392b' }}>*</span></label>
          <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} required placeholder="例：北圃" />
          <label style={{ ...labelStyle, marginTop: 12 }}>面積（アール）</label>
          <input style={inputStyle} type="number" step="0.01" min="0" value={area} onChange={e => setArea(e.target.value)} placeholder="例：10.5" />
          <label style={{ ...labelStyle, marginTop: 12 }}>場所メモ</label>
          <input style={inputStyle} value={locationNote} onChange={e => setLocationNote(e.target.value)} placeholder="例：山田町3丁目" />
          <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
            <button type="button" style={{ ...btnStyle, background: '#eee', color: '#444' }} onClick={onClose}>キャンセル</button>
            <button type="submit" style={{ ...btnStyle, opacity: loading ? 0.6 : 1 }} disabled={loading}>
              {loading ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const pageStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', height: '100dvh', background: '#f5f5f0' }
const headerStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', background: '#fff', borderBottom: '1px solid #eee' }
const cardStyle: React.CSSProperties = { background: '#fff', borderRadius: 12, padding: '12px 16px', marginBottom: 8, display: 'flex', alignItems: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }
const overlayStyle: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }
const modalStyle: React.CSSProperties = { background: '#fff', width: '100%', borderRadius: '16px 16px 0 0', padding: '20px 16px 32px' }
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, color: '#444', marginBottom: 4 }
const inputStyle: React.CSSProperties = { display: 'block', width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 15, boxSizing: 'border-box' }
const btnStyle: React.CSSProperties = { flex: 1, padding: '12px', background: '#2d7a4f', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer' }
const backBtnStyle: React.CSSProperties = { background: 'none', border: 'none', fontSize: 14, color: '#2d7a4f', cursor: 'pointer', fontWeight: 600 }
const addBtnStyle: React.CSSProperties = { fontSize: 13, padding: '6px 14px', background: '#2d7a4f', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }
const smallBtnStyle: React.CSSProperties = { fontSize: 12, padding: '4px 10px', border: '1px solid #ddd', borderRadius: 6, background: '#fff', cursor: 'pointer', color: '#666' }
