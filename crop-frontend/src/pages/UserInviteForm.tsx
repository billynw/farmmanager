import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { usersApi, fieldsApi } from '../api'
import type { UserFieldRole, FieldInviteItem } from '../api'
import AppHeader from '../components/AppHeader'
import BottomNav from '../components/BottomNav'

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

export default function UserInviteForm() {
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [fieldSelections, setFieldSelections] = useState<Record<number, { checked: boolean; role: UserFieldRole }>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const { data: fields = [] } = useQuery({
    queryKey: ['fields'],
    queryFn: () => fieldsApi.list().then(r => r.data),
  })
  const manageableFields = fields.filter(f => f.my_role === 'owner' || f.my_role === 'manager')

  useState(() => {
    if (manageableFields.length > 0 && Object.keys(fieldSelections).length === 0) {
      setFieldSelections(
        Object.fromEntries(manageableFields.map(f => [f.id, { checked: false, role: 'member' as UserFieldRole }]))
      )
    }
  })

  const sel = (id: number) => fieldSelections[id] ?? { checked: false, role: 'member' as UserFieldRole }
  const allChecked = manageableFields.length > 0 && manageableFields.every(f => sel(f.id).checked)
  const someChecked = manageableFields.some(f => sel(f.id).checked)

  const toggleAll = () => {
    const next = !allChecked
    setFieldSelections(prev => {
      const updated = { ...prev }
      manageableFields.forEach(f => { updated[f.id] = { ...updated[f.id], checked: next } })
      return updated
    })
  }

  const toggleField = (fieldId: number) => {
    setFieldSelections(prev => ({ ...prev, [fieldId]: { ...sel(fieldId), checked: !sel(fieldId).checked } }))
  }

  const toggleRole = (fieldId: number) => {
    setFieldSelections(prev => ({ ...prev, [fieldId]: { ...sel(fieldId), role: sel(fieldId).role === 'manager' ? 'member' : 'manager' } }))
  }

  const submit = async () => {
    setError('')
    const selectedFields: FieldInviteItem[] = manageableFields
      .filter(f => sel(f.id).checked)
      .map(f => ({ field_id: f.id, field_role: sel(f.id).role }))
    if (!name) { setError('ユーザー名を入力してください'); return }
    if (!email) { setError('メールアドレスを入力してください'); return }
    if (selectedFields.length === 0) { setError('圃場を少なくとも1つ選択してください'); return }
    setLoading(true)
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
      <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: '#f5f5f0' }}>
        <AppHeader backTo="/admin/users" title="ユーザーを招待" />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, textAlign: 'center', width: '100%' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📧</div>
            <p style={{ color: '#2d7a4f', fontWeight: 700, fontSize: 17, marginBottom: 8 }}>招待しました</p>
            <p style={{ color: '#666', fontSize: 14, lineHeight: 1.7, marginBottom: 24 }}>
              登録済みの場合は即座に圃場に追加されました。<br />
              未登録の場合は <strong>{email}</strong> に招待メールを送りました。
            </p>
            <button
              onClick={() => navigate('/admin/users')}
              style={{ display: 'block', width: '100%', padding: '14px', background: '#2d7a4f', color: '#fff', border: 'none', borderRadius: 10, fontSize: 16, fontWeight: 600, cursor: 'pointer' }}
            >
              管理画面に戻る
            </button>
          </div>
        </div>
        <BottomNav />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: '#f5f5f0' }}>
      <AppHeader backTo="/admin/users" title="ユーザーを招待" />

      <div style={{ flex: 1, overflowY: 'auto', padding: 16, paddingBottom: 'calc(80px + 56px + env(safe-area-inset-bottom))' }}>
        <div style={{ background: '#fff', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 12 }}>
          <div>
            <label style={labelStyle}>ユーザー名 <span style={{ color: '#c0392b' }}>*</span></label>
            <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="例：田中 太郎" />
          </div>
          <div>
            <label style={labelStyle}>メールアドレス <span style={{ color: '#c0392b' }}>*</span></label>
            <input style={inputStyle} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="example@email.com" />
          </div>
        </div>

        <div style={{ background: '#fff', borderRadius: 12, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <label style={labelStyle}>圃場と権限 <span style={{ color: '#c0392b' }}>*</span></label>
            <button type="button" style={smallBtnStyle} onClick={toggleAll}>
              {allChecked ? 'すべて解除' : 'すべて選択'}
            </button>
          </div>
          <p style={{ fontSize: 12, color: '#999', marginBottom: 10 }}>権限バッジをタップすると切り替えられます</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {manageableFields.map(field => {
              const s = sel(field.id)
              return (
                <div key={field.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px',
                  border: `1px solid ${s.checked ? '#2d7a4f' : '#eee'}`,
                  borderRadius: 8,
                  background: s.checked ? '#f0faf4' : '#fafafa',
                }}>
                  <input type="checkbox" checked={s.checked} onChange={() => toggleField(field.id)}
                    style={{ width: 18, height: 18, cursor: 'pointer', flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: s.checked ? '#1a1a1a' : '#888' }}>
                    {field.name}
                  </span>
                  <span
                    onClick={() => s.checked && toggleRole(field.id)}
                    style={{
                      fontSize: 11, padding: '3px 9px', borderRadius: 20, fontWeight: 600,
                      background: s.checked ? ROLE_COLOR[s.role] + '22' : '#eee',
                      color: s.checked ? ROLE_COLOR[s.role] : '#bbb',
                      border: s.checked ? `1px solid ${ROLE_COLOR[s.role]}55` : '1px solid transparent',
                      cursor: s.checked ? 'pointer' : 'default',
                    }}
                  >
                    {ROLE_LABEL[s.role]}
                  </span>
                </div>
              )
            })}
          </div>
          {manageableFields.length === 0 && (
            <p style={{ color: '#aaa', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>招待できる圃場がありません</p>
          )}
        </div>

        {error && <p style={{ color: '#c0392b', fontSize: 13, marginTop: 12, textAlign: 'center' }}>{error}</p>}
      </div>

      <div style={saveBtnBarStyle}>
        <button
          onClick={submit}
          disabled={!name || !email || !someChecked || loading}
          style={{ display: 'block', width: '100%', padding: '14px', background: (name && email && someChecked) ? '#2d7a4f' : '#ccc', color: '#fff', border: 'none', borderRadius: 10, fontSize: 16, fontWeight: 600, cursor: (name && email && someChecked) ? 'pointer' : 'not-allowed' }}
        >
          {loading ? '送信中...' : '招待する'}
        </button>
      </div>

      <BottomNav />
    </div>
  )
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, color: '#444', fontWeight: 600, marginBottom: 6 }
const inputStyle: React.CSSProperties = { display: 'block', width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 15, boxSizing: 'border-box' }
const smallBtnStyle: React.CSSProperties = { fontSize: 12, padding: '4px 10px', border: '1px solid #ddd', borderRadius: 6, background: '#fff', cursor: 'pointer', color: '#666' }
const saveBtnBarStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: 'calc(56px + env(safe-area-inset-bottom))',
  left: 0, right: 0,
  padding: '12px 16px',
  zIndex: 99,
}
