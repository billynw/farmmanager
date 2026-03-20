import { useNavigate, useLocation } from 'react-router-dom'
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
  const location = useLocation()
  const logout = useAuth((s) => s.logout)
  const user = useAuth((s) => s.user)

  const currentPath = location.pathname
  const isHome    = currentPath === '/'
  const isItems   = currentPath === '/items'
  const isSensors = currentPath === '/sensors'

  return (
    <>
      {/* 1行目: 常にロゴ + ユーザー名・管理・ログアウト */}
      <div style={headerStyle}>
        <img src={logoImg} alt="ロゴ" style={{ height: 32, objectFit: 'contain' }} />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: '#666' }}>{user?.name}</span>
          <button onClick={() => navigate('/admin/users')} style={{ ...smallBtnStyle, color: '#2d7a4f', borderColor: '#2d7a4f' }}>管理</button>
          <button onClick={logout} style={smallBtnStyle}>ログアウト</button>
        </div>
      </div>

      {/* 2行目: ナビタブ */}
      <div style={navStyle}>
        <div style={isHome    ? activeTabStyle : tabStyle} onClick={() => navigate('/')}>ホーム</div>
        <div style={isItems   ? activeTabStyle : tabStyle} onClick={() => navigate('/items')}>作物一覧</div>
        <div style={isSensors ? activeTabStyle : tabStyle} onClick={() => navigate('/sensors')}>センサー</div>
      </div>

      {/* 3行目: 詳細ページのみ — 戻るボタン + タイトル + アクションボタン */}
      {backTo && (
        <div style={subHeaderStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
            <button onClick={() => navigate(backTo)} style={iconBtnStyle}>←</button>
            <div style={{ minWidth: 0 }}>
              {title && <div style={{ fontWeight: 500, fontSize: 16, color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>}
              {subtitle && <div style={{ fontSize: 12, color: '#999', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitle}</div>}
            </div>
          </div>
          {actions && (
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>{actions}</div>
          )}
        </div>
      )}
    </>
  )
}

const headerStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  padding: '12px 16px', background: '#fff', borderBottom: '1px solid #eee',
}
const navStyle: React.CSSProperties = {
  display: 'flex', background: '#fff', borderBottom: '1px solid #eee',
}
const subHeaderStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '10px 16px', background: '#fff', borderBottom: '1px solid #eee',
}
const tabStyle: React.CSSProperties = {
  flex: 1, padding: '10px 0', textAlign: 'center', fontSize: 13,
  color: '#999', borderBottom: '2px solid transparent', cursor: 'pointer',
}
const activeTabStyle: React.CSSProperties = {
  ...tabStyle, color: '#2d7a4f', borderBottom: '2px solid #2d7a4f', fontWeight: 500,
}
const iconBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#444', padding: 0, flexShrink: 0,
}
const smallBtnStyle: React.CSSProperties = {
  fontSize: 12, padding: '4px 10px', border: '1px solid #ddd',
  borderRadius: 6, background: '#fff', cursor: 'pointer', color: '#666',
}
