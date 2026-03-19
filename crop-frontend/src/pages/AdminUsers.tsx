import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { usersApi, fieldsApi } from '../api'
import type { User, UserRole, Field } from '../api'
import { useAuth } from '../store'

export default function AdminUsers() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const currentUser = useAuth((s) => s.user)
  const [showForm, setShowForm] = useState(false)
  const [editUser, setEditUser] = useState<User | null>(null)
  const [showFieldModal, setShowFieldModal] = useState<User | null>(null)

  const { data: users = [] } = useQuery({ queryKey: ['users'], queryFn: () => usersApi.list().then(r => r.data) })
  const { data: fields = [] } = useQuery({ queryKey: ['fields'], queryFn: () => fieldsApi.list().then(r => r.data) })

  const deleteMut = useMutation({
    mutationFn: (id: number) => usersApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })

  if (currentUser?.role !== 'admin') {
    return <div style={{ padding: 32, color: '#c0392b' }}>管理者のみアクセスできます</div>
  }

  return (
    <div style={pageStyle}>
      {/* ヘッダー */}
      <div style={headerStyle}>
        <button onClick={() => navigate('/')} style={backBtnStyle}>← 戻る</button>
        <span style={{ fontWeight: 700, fontSize: 16 }}>ユーザー管理</span>
        <button style={addBtnStyle} onClick={() => { setEditUser(null); setShowForm(true) }}>＋ 追加</button>
      </div>

      {/* ユーザー一覧 */}
      <div style={{ padding: '12px 16px', overflowY: 'auto', flex: 1 }}>
        {users.map(user => (
          <div key={user.id} style={cardStyle}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{user.name}</div>
              {user.email && <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{user.email}</div>}
              <span style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 20, marginTop: 4, display: 'inline-block',
                background: user.role === 'admin' ? '#2d7a4f22' : '#88888822',
                color: user.role === 'admin' ? '#2d7a4f' : '#666',
                fontWeight: 600
              }}>{user.role === 'admin' ? '管理者' : 'メンバー'}</span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button style={smallBtnStyle} onClick={() => setShowFieldModal(user)}>圃場</button>
              <button style={smallBtnStyle} onClick={() => { setEditUser(user); setShowForm(true) }}>編集</button>
              {user.id !== currentUser?.id && (
                <button style={{ ...smallBtnStyle, color: '#c0392b', borderColor: '#c0392b' }}
                  onClick={() => { if (confirm(`${user.name}を削除しますか？`)) deleteMut.mutate(user.id) }}>
                  削除
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ユーザー追加/編集フォーム */}
      {showForm && (
        <UserFormModal
          user={editUser}
          onClose={() => setShowForm(false)}
          onSaved={() => { qc.invalidateQueries({ queryKey: ['users'] }); setShowForm(false) }}
        />
      )}

      {/* 圃場紐づけモーダル */}
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

// --- ユーザー追加/編集モーダル ---
function UserFormModal({ user, onClose, onSaved }: { user: User | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(user?.name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<UserRole>(user?.role ?? 'member')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      if (user) {
        await usersApi.update(user.id, { name, email: email || undefined, role })
      } else {
        await usersApi.create({ name, email: email || undefined, password, role })
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
          {user ? 'ユーザー編集' : 'ユーザー追加'}
        </h3>
        {error && <p style={{ color: '#c0392b', fontSize: 13, marginBottom: 10 }}>{error}</p>}
        <form onSubmit={submit}>
          <label style={labelStyle}>ユーザー名 <span style={{ color: '#c0392b' }}>*</span></label>
          <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} required />

          <label style={{ ...labelStyle, marginTop: 12 }}>メールアドレス</label>
          <input style={inputStyle} type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="password reset用（任意）" />

          {!user && (
            <>
              <label style={{ ...labelStyle, marginTop: 12 }}>パスワード <span style={{ color: '#c0392b' }}>*</span></label>
              <input style={inputStyle} type="password" value={password} onChange={e => setPassword(e.target.value)}
                required minLength={6} placeholder="6文字以上" />
            </>
          )}

          <label style={{ ...labelStyle, marginTop: 12 }}>権限</label>
          <select style={inputStyle} value={role} onChange={e => setRole(e.target.value as UserRole)}>
            <option value="member">メンバー</option>
            <option value="admin">管理者</option>
          </select>

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
  const { data: allUsers = [] } = useQuery({ queryKey: ['users'], queryFn: () => usersApi.list().then(r => r.data) })

  // バックエンドから圃場ごとのユーザーリストを取得する代わりに、
  // admin は全圃場を見えるので fields から紐づけを管理する
  // ここでは楽観的UIで toggle する
  const [assigned, setAssigned] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(false)

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
        {fields.length === 0 && <p style={{ color: '#aaa', fontSize: 14 }}>圃場が登録されていません</p>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 300, overflowY: 'auto' }}>
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
