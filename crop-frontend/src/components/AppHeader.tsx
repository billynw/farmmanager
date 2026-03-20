import { useNavigate } from 'react-router-dom'
import { useAuth } from '../store'
import logoImg from '../assets/logo.png'

interface AppHeaderProps {
  backTo?: string
  title?: string
  subtitle?: string
  actions?: React.ReactNode
}

export default function AppHeader({ backTo, title, subtitle, actions }: AppHeaderProps) {
  const navigate = useNavigate()
  const logout = useAuth((s) => s.logout)
  const user = useAuth((s) => s.user)

  return (
    <>
      {/* ロゴ + ユーザー名・ログアウト（+ トップレベルページのactions） */}
      <div style={headerStyle}>
        <img src={logoImg} alt="ロゴ" style={{ height: 32, objectFit: 'contain' }} />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {!backTo && actions}
          <span style={{ fontSize: 13, color: '#666' }}>{user?.name}</span>
          <button onClick={logout} style={smallBtnStyle}>ログアウト</button>
        </div>
      </div>

      {/* 詳細ページのみ: 戻るボタン + タイトル + アクション */}
      {backTo && (
        <div style={subHeaderStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
            <button onClick={() => navigate(backTo)} style={iconBtnStyle}>←</button>
            <div style={{ minWidth: 0 }}>
              {title && <div style={{ fontWeight: 500, fontSize: 16, color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>}
              {subtitle && <div style={{ fontSize: 12, color: '#999', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitle}</div>}
            </div>
          </div>
          {actions && <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>{actions}</div>}
        </div>
      )}
    </>
  )
}

const headerStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  padding: '12px 16px', background: '#fff', borderBottom: '1px solid #eee',
}
const subHeaderStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '10px 16px', background: '#fff', borderBottom: '1px solid #eee',
}
const iconBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#444', padding: 0, flexShrink: 0,
}
const smallBtnStyle: React.CSSProperties = {
  fontSize: 12, padding: '4px 10px', border: '1px solid #ddd',
  borderRadius: 6, background: '#fff', cursor: 'pointer', color: '#666',
}
