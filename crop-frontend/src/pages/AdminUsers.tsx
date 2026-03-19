import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { usersApi, fieldsApi } from '../api'
import type { User, UserRole, Field } from '../api'
import { useAuth } from '../store'

type Tab = 'users' | 'fields'

export default function AdminUsers() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const currentUser = useAuth((s) => s.user)
  const [tab, setTab] = useState<Tab>('users')

  const [showUserForm, setShowUserForm] = useState(false)
  const [editUser, setEditUser] = useState<User | null>(null)
  const [showFieldModal, setShowFieldModal] = useState<User | null>(null)
  const [showFieldForm, setShowFieldForm] = useState(false)
  const [editField, setEditField] = useState<Field | null>(null)

  const { data: users = [] } = useQuery({ queryKey: ['users'], queryFn: () => usersApi.list().then(r => r.data) })
  const { data: fields = [] } = useQuery({ queryKey: ['fields'], queryFn: () => fieldsApi.list().then(r => r.data) })

  const deleteUserMut = useMutation({
    mutationFn: (id: number) => usersApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })
  const deleteFieldMut = useMutation({
    mutationFn: (id: number) => fieldsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fields'] }),
    onError: (err: any) => alert(err.response?.data?.detail ?? '削除に失敗しました'),
  })

  if (currentUser?.role !== 'admin') {
    return <div style={{ padding: 32, color: '#c0392b' }}>管理者のみアクセスできます</div>
  }

  return (
    <div style={pageStyle}>
      <div style={headerStyle}>
        <button onClick={() => navigate('/')} style={backBtnStyle}>← 戻る</button>
        <span style={{ fontWeight: 700, fontSize: 16 }}>管理メニュー</span>
        <button style={addBtnStyle} onClick={() => {
          if (tab === 'users') { setEditUser(null); setShowUserForm(true) }
          else { setEditField(null); setShowFieldForm(true) }
        }}>＋ 追加</button>
      </div>

      <div style={{ display: 'flex', background: '#fff', borderBottom: '1px solid #eee' }}>
        {(['users', 'fields'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, padding: '12px', border: 'none', background: 'none', cursor: 'pointer',
            fontSize: 14, fontWeight: tab === t ? 700 : 400,
            color: tab === t ? '#2d7a4f' : '#888',
            borderBottom: tab === t ? '2px solid #2d7a4f' : '2px solid transparent',
          }}>
            {t === 'users' ? 'ユーザー' : '圃場'}
          </button>
        ))}
      </div>

      {tab === 'users' && (
        <div style={{ padding: '12px 16px', overflowY: 'auto', flex: 1 }}>
          {users.map(user => (
            <div key={user.id} style={cardStyle}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{user.name}</div>
                {user.email && <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{user.email}</div>}
                <span style={{
                  fontSize: 11, padding: '2px 8px', borderRadius: 20, marginTop: 4, display: 'inline-block',
                  background: user.role === 'admin' ? '#2d7a4f22' : '#88888822',
                  color: user.role === 'admin' ? '#2d7a4f' : '#666', fontWeight: 600,
                }}>{user.role === 'admin' ? '管理者' : 'メンバー'}</span>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button style={smallBtnStyle} onClick={() => setShowFieldModal(user)}>圃場</button>
                <button style={smallBtnStyle} onClick={() => { setEditUser(user); setShowUserForm(true) }}>編集</button>
                {user.id !== currentUser?.id && (
                  <button style={{ ...smallBtnStyle, color: '#c0392b', borderColor: '#c0392b' }}
                    onClick={() => { if (confirm(`${user.name}を削除しますか？`)) deleteUserMut.mutate(user.id) }}>
                    削除
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'fields' && (
        <div style={{ padding: '12px 16px', overflowY: 'auto', flex: 1 }}>
          {fields.length === 0 && (
            <p style={{ color: '#aaa', textAlign: 'center', marginTop: 40 }}>圃場が登録されていません</p>
          )}
          {fields.map(field => (
            <div key={field.id} style={cardStyle}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{field.name}</div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                  {field.area ? `${field.area}a` : ''}
                  {field.area && field.location_note ? '　' : ''}
                  {field.location_note ?? ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button style={smallBtnStyle} onClick={() => { setEditField(field); setShowFieldForm(true) }}>編集</button>
                <button style={{ ...smallBtnStyle, color: '#c0392b', borderColor: '#c0392b' }}
                  onClick={() => { if (confirm(`「${field.name}」を削除しますか？`)) deleteFieldMut.mutate(field.id) }}>
                  削除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showUserForm && (
        <UserFormModal
          user={editUser}
          onClose={() => setShowUserForm(false)}
          onSaved={() => { qc.invalidateQueries({ queryKey: ['users'] }); setShowUserForm(false) }}
        />
      )}

      {showFieldForm && (
        <FieldFormModal
          field={editField}
          onClose={() => setShowFieldForm(false)}
          onSaved={() => { qc.invalidateQueries({ queryKey: ['fields'] }); setShowFieldForm(false) }}
        />
      )}

      {showFieldModal && (
        <FieldAssignModal
          user={showFieldModal}
          fields={fields}
          onClose={() => setShowFieldModal(null)}
        />
      )}
    </div>
  )
}

// --- ユーザー招待/編集モーダル ---
function UserFormModal({ user, onClose, onSaved }: { user: User | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(user?.name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [role, setRole] = useState<UserRole>(user?.role ?? 'member')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [invited, setInvited] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      if (user) {
        await usersApi.update(user.id, { name, email: email || undefined, role })
        onSaved()
      } else {
        await usersApi.invite({ name, email, role })
        setInvited(true)
      }
    } catch (err: any) {
      setError(err.response?.data?.detail ?? '保存に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  if (invited) {
    return (
      <div style={overlayStyle} onClick={onClose}>
        <div style={modalStyle} onClick={e => e.stopPropagation()}>
          <p style={{ color: '#2d7a4f', fontWeight: 600, marginBottom: 8 }}>📧 招待メールを送信しました</p>
          <p style={{ color: '#666', fontSize: 14, marginBottom: 20, lineHeight: 1.6 }}>
            <strong>{email}</strong> にパスワード設定リンクを送りました。<br />
            ユーザーがリンクを踏んで登録を完了すると一覧に表示されます。
          </p>
          <button style={btnStyle} onClick={onSaved}>閉じる</button>
        </div>
      </div>
    )
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700 }}>
          {user ? 'ユーザー編集' : 'ユーザー招待'}
        </h3>
        {!user && (
          <p style={{ color: '#888', fontSize: 13, marginBottom: 16 }}>
            メールアドレスにパスワード設定用のリンクを送ります。
          </p>
        )}
        {error && <p style={{ color: '#c0392b', fontSize: 13, marginBottom: 10 }}>{error}</p>}
        <form onSubmit={submit}>
          <label style={labelStyle}>ユーザー名 <span style={{ color: '#c0392b' }}>*</span></label>
          <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} required />
          <label style={{ ...labelStyle, marginTop: 12 }}>
            メールアドレス {!user && <span style={{ color: '#c0392b' }}>*</span>}
          </label>
          <input
            style={inputStyle}
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required={!user}
            placeholder={user ? '変更する場合のみ入力' : 'example@email.com'}
          />
          <label style={{ ...labelStyle, marginTop: 12 }}>権限</label>
          <select style={inputStyle} value={role} onChange={e => setRole(e.target.value as UserRole)}>
            <option value="member">メンバー</option>
            <option value="admin">管理者</option>
          </select>
          <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
            <button type="button" style={{ ...btnStyle, background: '#eee', color: '#444' }} onClick={onClose}>キャンセル</button>
            <button type="submit" style={{ ...btnStyle, opacity: loading ? 0.6 : 1 }} disabled={loading}>
              {loading ? '送信中...' : user ? '保存' : '招待メールを送る'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// --- 圃場追加/編集モーダル ---
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
      const data = {
        name,
        area: area ? parseFloat(area) : undefined,
        location_note: locationNote || undefined,
      }
      if (field) {
        await fieldsApi.update(field.id, data)
      } else {
        await fieldsApi.create(data)
      }
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
        <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>
          {field ? '圃場編集' : '圃場追加'}
        </h3>
        {error && <p style={{ color: '#c0392b', fontSize: 13, marginBottom: 10 }}>{error}</p>}
        <form onSubmit={submit}>
          <label style={labelStyle}>圃場名 <span style={{ color: '#c0392b' }}>*</span></label>
          <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} required placeholder="例：北圃" />
          <label style={{ ...labelStyle, marginTop: 12 }}>面積（アール）</label>
          <input style={inputStyle} type="number" step="0.01" min="0" value={area}
            onChange={e => setArea(e.target.value)} placeholder="例：10.5" />
          <label style={{ ...labelStyle, marginTop: 12 }}>場所メモ</label>
          <input style={inputStyle} value={locationNote} onChange={e => setLocationNote(e.target.value)}
            placeholder="例：山田町3丁目" />
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

// --- 圃場紐づけモーダル ---
function FieldAssignModal({ user, fields, onClose }: { user: User; fields: Field[]; onClose: () => void }) {
  const qc = useQueryClient()
  const [assigned, setAssigned] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(false)
  const [initializing, setInitializing] = useState(true)

  useEffect(() => {
    usersApi.getFields(user.id)
      .then(r => setAssigned(new Set(r.data.map(f => f.id))))
      .finally(() => setInitializing(false))
  }, [user.id])

  const toggle = async (field: Field) => {
    setLoading(true)
    try {
      if (assigned.has(field.id)) {
        await usersApi.removeField(field.id, user.id)
        setAssigned(prev => { const s = new Set(prev); s.delete(field.id); return s })
      } else {
        await usersApi.assignField(field.id, user.id)
        setAssigned(prev => new Set([...prev, field.id]))
      }
      qc.invalidateQueries({ queryKey: ['fields'] })
    } catch {
      alert('操作に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700 }}>圃場の紐づけ</h3>
        <p style={{ color: '#666', fontSize: 13, marginBottom: 16 }}>{user.name} がアクセスできる圃場を選択</p>
        {initializing ? (
          <p style={{ color: '#aaa', fontSize: 14, textAlign: 'center', padding: '20px 0' }}>読み込み中...</p>
        ) : (
          <>
            {fields.length === 0 && <p style={{ color: '#aaa', fontSize: 14 }}>圃場が登録されていません</p>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 280, overflowY: 'auto' }}>
              {fields.map(field => (
                <div key={field.id} style={{ display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 12px', border: '1px solid #eee', borderRadius: 8,
                  background: assigned.has(field.id) ? '#f0faf4' : '#fff' }}>
                  <input type="checkbox" checked={assigned.has(field.id)}
                    onChange={() => toggle(field)} disabled={loading}
                    style={{ width: 18, height: 18, cursor: 'pointer' }} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{field.name}</div>
                    {field.area && <div style={{ fontSize: 12, color: '#888' }}>{field.area}a</div>}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        <button style={{ ...btnStyle, marginTop: 16, background: '#eee', color: '#444' }} onClick={onClose}>閉じる</button>
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
