import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { authApi } from '../api'
import logoImg from '../assets/logo.png'

export default function Register() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      await authApi.register(name, email)
      setDone(true)
    } catch (err: any) {
      setError(err.response?.data?.detail ?? '登録に失敗しました。しばらく後に再試行してください。')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f0' }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: '2rem', width: '100%', maxWidth: 360, boxShadow: '0 2px 16px rgba(0,0,0,0.08)' }}>
        <div style={{ marginBottom: 8 }}>
          <img src={logoImg} alt="ロゴ" style={{ height: 40, objectFit: 'contain' }} />
        </div>

        {done ? (
          <div>
            <p style={{ color: '#2d7a4f', fontWeight: 600, marginBottom: 8, fontSize: 15 }}>📧 確認メールを送信しました</p>
            <p style={{ color: '#666', fontSize: 14, marginBottom: 24, lineHeight: 1.6 }}>
              <strong>{email}</strong> に確認メールを送りました。<br />
              メール内のリンクをクリックしてパスワードを設定してください。<br />
              リンクの有効期限は24時間です。
            </p>
            <button style={btnStyle} onClick={() => navigate('/login')}>ログイン画面に戻る</button>
          </div>
        ) : (
          <div>
            <p style={{ color: '#1a1a1a', fontWeight: 600, marginBottom: 4, fontSize: 15 }}>新規アカウント登録</p>
            <p style={{ color: '#666', fontSize: 13, marginBottom: 20 }}>
              ユーザー名とメールアドレスを入力してください。確認メールをお送りします。
            </p>
            {error && <p style={{ color: '#c0392b', fontSize: 14, marginBottom: 12 }}>{error}</p>}
            <form onSubmit={submit}>
              <label style={labelStyle}>ユーザー名 <span style={{ color: '#c0392b' }}>*</span></label>
              <input
                style={inputStyle}
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="例：山田農園"
                required
              />
              <label style={{ ...labelStyle, marginTop: 12 }}>メールアドレス <span style={{ color: '#c0392b' }}>*</span></label>
              <input
                style={inputStyle}
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="example@email.com"
                required
              />
              <button style={{ ...btnStyle, marginTop: 20, opacity: loading ? 0.6 : 1 }} type="submit" disabled={loading}>
                {loading ? '送信中...' : '確認メールを送る'}
              </button>
            </form>
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <Link to="/login" style={{ fontSize: 13, color: '#2d7a4f', textDecoration: 'none' }}>
                すでにアカウントをお持ちの方はこちら
              </Link>
            </div>
          </div>
        )}
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
