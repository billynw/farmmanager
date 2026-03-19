import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { usersApi, fieldsApi } from '../api'
import type { UserFieldRole, Field } from '../api'
import { useAuth } from '../store'

type Tab = 'users' | 'fields'

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
  const ownerFields = fields.filter(f => f.my_role === 'owner')

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
    if (ownerFields.length > 0 && !selectedFieldId) {
      setSelectedFieldId(ownerFields[0].id)
    }
  }, [ownerFields.length])

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
                  <span style={{
                    fontSize: 11, padding: '1px 7px', borderRadius: 20,
                    background: field.my_role === 'owner' ? '#2d7a4f22' : '#88888822',
                    color: field.my_role === 'owner' ? '#2d7a4f' : '#666', fontWeight: 600,
                  }}>{field.my_role === 'owner' ? 'オーナー' : 'メンバー'}</span>
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
          {ownerFields.length === 0 ? (
            <p style={{ color: '#aaa', textAlign: 'center', marginTop: 40, padding: '0 16px' }}>
              圃場を作成するとユーザーを招待できます。
            </p>
          ) : (
            <>
              <div style={{ padding: '8px 16px', background: '#fff', borderBottom: '1px solid #eee' }}>
                <select
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14 }}
                  value={selectedFieldId ?? ''}
                  onChange={e => setSelectedFieldId(Number(e.target.value))}
                >
                  {ownerFields.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
              <div style={{ padding: '12px 16px', overflowY: 'auto', flex: 1 }}>
                {fieldUsers.map(user => (
                  <div key={user.id} style={cardStyle}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 15 }}>{user.name}</div>
                      {user.email && <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{user.email}</div>}
                    </div>
                    {user.id !== currentUser?.id && (
                      <button
                        style={{ ...smallBtnStyle, color: '#c0392b', borderColor: '#c0392b' }}
                        onClick={() => {
                          if (selectedFieldId && confirm(`${user.name}をこの圃場から削除しますか？`))
                            usersApi.removeFromField(user.id, selectedFieldId).then(() => refetchUsers())
                        }}
                      >削除</button>
                    )}
                  </div>
                ))}
                {fieldUsers.length === 0 && (
                  <p style={{ color: '#aaa', textAlign: 'center', marginTop: 40 }}>ユーザーがいません</p>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {showUserForm && selectedFieldId && (
        <UserInviteModal
          fieldId={selectedFieldId}
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

function UserInviteModal({ fieldId, onClose, onSaved }: { fieldId: number; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [fieldRole, setFieldRole] = useState<UserFieldRole>('member')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      await usersApi.invite({ name, email, field_id: fieldId, field_role: fieldRole })
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
          登録済みのユーザーは即座に追加、未登録の場合は招待メールを送信します。
        </p>
        {error && <p style={{ color: '#c0392b', fontSize: 13, marginBottom: 10 }}>{error}</p>}
        <form onSubmit={submit}>
          <label style={labelStyle}>ユーザー名 <span style={{ color: '#c0392b' }}>*</span></label>
          <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} required />
          <label style={{ ...labelStyle, marginTop: 12 }}>メールアドレス <span style={{ color: '#c0392b' }}>*</span></label>
          <input style={inputStyle} type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="example@email.com" />
          <label style={{ ...labelStyle, marginTop: 12 }}>圃場での権限</label>
          <select style={inputStyle} value={fieldRole} onChange={e => setFieldRole(e.target.value as UserFieldRole)}>
            <option value="member">メンバー（作業ログのみ）</option>
            <option value="owner">オーナー（管理権限あり）</option>
          </select>
          <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
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
