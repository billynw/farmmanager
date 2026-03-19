import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { authApi } from '../api'
import logoImg from '../assets/logo.png'

export default function ResetPassword() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    if (!token) {
      setError('無効なリンクです。パスワードリセットをやり直してください。')
    }
  }, [token])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) { setError('パスワードが一致しません'); return }
    if (password.length < 6) { setError('パスワードは6文字以上で入力してください'); return }
    setLoading(true); setError('')
    try {
      await authApi.confirmPasswordReset(token, password)
      setDone(true)
    } catch {
      setError('無効または期限切れのリンクです。パスワードリセットをやり直してください。')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f0' }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: '2rem', width: '100%', maxWidth: 360, boxShadow: '0 2px 16px rgba(0,0,0,0.08)' }}>
        <div style={{ marginBottom: 16 }}>
          <img src={logoImg} alt="ロゴ" style={{ height: 40, objectFit: 'contain' }} />
        </div>

        {done ? (
          <div>
            <p style={{ color: '#2d7a4f', fontWeight: 600, marginBottom: 8 }}>✅ パスワードを変更しました</p>
            <p style={{ color: '#666', fontSize: 14, marginBottom: 24 }}>新しいパスワードでログインしてください。</p>
            <button style={btnStyle} onClick={() => navigate('/login')}>ログインへ</button>
          </div>
        ) : (
          <div>
            <p style={{ color: '#1a1a1a', fontWeight: 600, marginBottom: 4 }}>新しいパスワードを設定</p>
            <p style={{ color: '#666', fontSize: 13, marginBottom: 20 }}>6文字以上で入力してください。</p>
            {error && <p style={{ color: '#c0392b', fontSize: 14, marginBottom: 12 }}>{error}</p>}
            <form onSubmit={submit}>
              <label style={labelStyle}>新しいパスワード</label>
              <input style={inputStyle} type="password" value={password}
                onChange={e => setPassword(e.target.value)} required minLength={6} />
              <label style={{ ...labelStyle, marginTop: 12 }}>パスワード（確認）</label>
              <input style={inputStyle} type="password" value={confirm}
                onChange={e => setConfirm(e.target.value)} required minLength={6} />
              <button style={{ ...btnStyle, marginTop: 20, opacity: loading ? 0.6 : 1 }} type="submit" disabled={loading || !token}>
                {loading ? '変更中...' : 'パスワードを変更する'}
              </button>
            </form>
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
