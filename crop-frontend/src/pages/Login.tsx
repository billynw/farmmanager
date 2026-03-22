import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../store'
import logoImg from '../assets/norawork.svg'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const login = useAuth((s) => s.login)
  const navigate = useNavigate()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      await login(email, password)
      navigate('/')
    } catch {
      setError('メールアドレスまたはパスワードが違います')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f0' }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: '2rem', width: '100%', maxWidth: 360, boxShadow: '0 2px 16px rgba(0,0,0,0.08)' }}>
        <div style={{ marginBottom: 8 }}>
          <img src={logoImg} alt="ロゴ" style={{ height: 40, width: 134, objectFit: 'contain' }} />
        </div>
        <p style={{ color: '#666', marginBottom: 24, fontSize: 14 }}>農作物管理システム</p>
        {error && <p style={{ color: '#c0392b', fontSize: 14, marginBottom: 12 }}>{error}</p>}
        <form onSubmit={submit}>
          <label style={labelStyle}>メールアドレス</label>
          <input
            style={inputStyle}
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          <label style={{ ...labelStyle, marginTop: 12 }}>パスワード</label>
          <input
            style={inputStyle}
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          <button style={{ ...btnStyle, marginTop: 20, opacity: loading ? 0.6 : 1 }} type="submit" disabled={loading}>
            {loading ? 'ログイン中...' : 'ログイン'}
          </button>
        </form>
        <div style={{ textAlign: 'center', marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Link to="/forgot-password" style={{ fontSize: 13, color: '#888', textDecoration: 'none' }}>
            パスワードをお忘れですか？
          </Link>
          <Link to="/register" style={{ fontSize: 13, color: '#2d7a4f', textDecoration: 'none', fontWeight: 600 }}>
            新規アカウント登録
          </Link>
        </div>
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, color: '#444', marginBottom: 4 }
const inputStyle: React.CSSProperties = {
  display: 'block', width: '100%', padding: '10px 12px', border: '1px solid #ddd',
  borderRadius: 8, fontSize: 16, boxSizing: 'border-box', outline: 'none',
}
const btnStyle: React.CSSProperties = {
  display: 'block', width: '100%', padding: '12px', background: '#2d7a4f',
  color: '#fff', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 600, cursor: 'pointer',
}
