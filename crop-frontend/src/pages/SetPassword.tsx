import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { authApi } from '../api'
import { useAuth } from '../store'
import logoImg from '../assets/logo.png'

export default function SetPassword() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const setToken = useAuth((s) => s.setToken)

  useEffect(() => {
    if (!token) setError('無効なリンクです。登録をやり直してください。')
  }, [token])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) { setError('パスワードが一致しません'); return }
    if (password.length < 6) { setError('パスワードは6文字以上で入力してください'); return }
    setLoading(true); setError('')
    try {
      const res = await authApi.verifyEmail(token, password)
      // 登録完了 → そのままログイン状態にする
      setToken(res.data.access_token)
      navigate('/', { replace: true })
    } catch (err: any) {
      setError(err.response?.data?.detail ?? '無効または期限切れのリンクです。登録をやり直してください。')
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
        <p style={{ color: '#1a1a1a', fontWeight: 600, marginBottom: 4, fontSize: 15 }}>パスワードを設定してください</p>
        <p style={{ color: '#666', fontSize: 13, marginBottom: 20 }}>6文字以上で入力してください。</p>
        {error && (
          <div style={{ color: '#c0392b', fontSize: 14, marginBottom: 12 }}>
            <p>{error}</p>
            {!token && (
              <a href="/register" style={{ color: '#2d7a4f', fontSize: 13 }}>新規登録ページへ</a>
            )}
          </div>
        )}
        <form onSubmit={submit}>
          <label style={labelStyle}>パスワード</label>
          <input style={inputStyle} type="password" value={password}
            onChange={e => setPassword(e.target.value)} required minLength={6}
            disabled={!token} />
          <label style={{ ...labelStyle, marginTop: 12 }}>パスワード（確認）</label>
          <input style={inputStyle} type="password" value={confirm}
            onChange={e => setConfirm(e.target.value)} required minLength={6}
            disabled={!token} />
          <button
            style={{ ...btnStyle, marginTop: 20, opacity: (loading || !token) ? 0.6 : 1 }}
            type="submit" disabled={loading || !token}
          >
            {loading ? '登録中...' : '登録を完了する'}
          </button>
        </form>
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
