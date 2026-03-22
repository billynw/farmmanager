import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi } from '../api'
import logoImg from '../assets/norawork.svg'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      await authApi.requestPasswordReset(email)
      setDone(true)
    } catch {
      setError('送信に失敗しました。しばらく後に再試行してください。')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f0' }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: '2rem', width: '100%', maxWidth: 360, boxShadow: '0 2px 16px rgba(0,0,0,0.08)' }}>
        <div style={{ marginBottom: 16 }}>
          <img src={logoImg} alt="ロゴ" style={{ height: 56, width: 188, objectFit: 'contain' }} />
        </div>

        {done ? (
          <div>
            <p style={{ color: '#2d7a4f', fontWeight: 600, marginBottom: 8 }}>📧 メールを送信しました</p>
            <p style={{ color: '#666', fontSize: 14, marginBottom: 24 }}>
              登録されているメールアドレスにパスワードリセット用のリンクを送信しました。メールをご確認ください。
            </p>
            <button style={btnStyle} onClick={() => navigate('/login')}>ログインに戻る</button>
          </div>
        ) : (
          <div>
            <p style={{ color: '#1a1a1a', fontWeight: 600, marginBottom: 4 }}>パスワードをお忘れですか？</p>
            <p style={{ color: '#666', fontSize: 13, marginBottom: 20 }}>
              登録済みのメールアドレスを入力してください。パスワードリセット用のリンクを送信します。
            </p>
            {error && <p style={{ color: '#c0392b', fontSize: 14, marginBottom: 12 }}>{error}</p>}
            <form onSubmit={submit}>
              <label style={labelStyle}>メールアドレス</label>
              <input
                style={inputStyle}
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="example@email.com"
                required
              />
              <button style={{ ...btnStyle, marginTop: 20, opacity: loading ? 0.6 : 1 }} type="submit" disabled={loading}>
                {loading ? '送信中...' : 'リセットリンクを送信'}
              </button>
            </form>
            <button style={backBtnStyle} onClick={() => navigate('/login')}>ログインに戻る</button>
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
const backBtnStyle: React.CSSProperties = {
  display: 'block', width: '100%', padding: '10px', background: 'transparent',
  color: '#888', border: 'none', fontSize: 14, cursor: 'pointer', marginTop: 12,
}
