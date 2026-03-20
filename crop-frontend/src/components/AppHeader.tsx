import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../store'
import logoImg from '../assets/logo.png'

interface AppHeaderProps {
  /** 詳細ページ用の戻るボタン先（指定すると戻るボタンを表示） */
  backTo?: string
  /** 詳細ページ用のタイトル */
  title?: string
  /** 詳細ページ用のサブタイトル */
  subtitle?: string
  /** ヘッダー右側の追加ボタン */
  actions?: React.ReactNode
}

export default function AppHeader({ backTo, title, subtitle, actions }: AppHeaderProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const logout = useAuth((s) => s.logout)
  const user = useAuth((s) => s.user)

  const currentPath = location.pathname
  // backTo がある詳細ページではタブをアクティブにしない
  const isHome    = !backTo && currentPath === '/'
  const isItems   = !backTo && currentPath === '/items'
  const isSensors = !backTo && currentPath === '/sensors'

  return (
    <>
      {/* メインヘッダー */}
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {backTo ? (
            <button onClick={() => navigate(backTo)} style={iconBtnStyle}>←</button>
          ) : (
            <img src={logoImg} alt="ロゴ" style={{ height: 32, objectFit: 'contain' }} />
          )}
          {(title || backTo) && (
            <div>
              {title && <div style={{ fontWeight: 500, fontSize: 16, color: '#1a1a1a' }}>{title}</div>}
              {subtitle && <div style={{ fontSize: 12, color: '#999' }}>{subtitle}</div>}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {actions}
          {!backTo && (
            <>
              <span style={{ fontSize: 13, color: '#666' }}>{user?.name}</span>
              <button
                onClick={() => navigate('/admin/users')}
                style={{ ...smallBtnStyle, color: '#2d7a4f', borderColor: '#2d7a4f' }}
              >管理</button>
              <button onClick={logout} style={smallBtnStyle}>ログアウト</button>
            </>
          )}
        </div>
      </div>

      {/* ナビタブ */}
      <div style={navStyle}>
        <div style={isHome    ? activeTabStyle : tabStyle} onClick={() => navigate('/')}>ホーム</div>
        <div style={isItems   ? activeTabStyle : tabStyle} onClick={() => navigate('/items')}>作物一覧</div>
        <div style={isSensors ? activeTabStyle : tabStyle} onClick={() => navigate('/sensors')}>センサー</div>
      </div>
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
const tabStyle: React.CSSProperties = {
  flex: 1, padding: '10px 0', textAlign: 'center', fontSize: 13,
  color: '#999', borderBottom: '2px solid transparent', cursor: 'pointer',
}
const activeTabStyle: React.CSSProperties = {
  ...tabStyle, color: '#2d7a4f', borderBottom: '2px solid #2d7a4f', fontWeight: 500,
}
const iconBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#444', padding: 0,
}
const smallBtnStyle: React.CSSProperties = {
  fontSize: 12, padding: '4px 10px', border: '1px solid #ddd',
  borderRadius: 6, background: '#fff', cursor: 'pointer', color: '#666',
}
