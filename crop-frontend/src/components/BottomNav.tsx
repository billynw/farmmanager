import { useNavigate, useLocation } from 'react-router-dom'

export default function BottomNav() {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  const isHome    = pathname === '/'
  const isItems   = pathname === '/items' || pathname.startsWith('/items/')
  const isSensors = pathname === '/sensors'

  return (
    <div style={navStyle}>
      <button style={isHome    ? activeItemStyle : itemStyle} onClick={() => navigate('/')}>
        <NavIcon type="home" active={isHome} />
        <span>ホーム</span>
      </button>
      <button style={isItems   ? activeItemStyle : itemStyle} onClick={() => navigate('/items')}>
        <NavIcon type="items" active={isItems} />
        <span>作物一覧</span>
      </button>
      <button style={isSensors ? activeItemStyle : itemStyle} onClick={() => navigate('/sensors')}>
        <NavIcon type="sensors" active={isSensors} />
        <span>センサー</span>
      </button>
    </div>
  )
}

function NavIcon({ type, active }: { type: 'home' | 'items' | 'sensors'; active: boolean }) {
  const color = active ? '#2d7a4f' : '#bbb'
  if (type === 'home') return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M3 9.5L10 3l7 6.5V17a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" stroke={color} strokeWidth="1.5" fill="none"/>
      <path d="M7 18v-6h6v6" stroke={color} strokeWidth="1.5" fill="none"/>
    </svg>
  )
  if (type === 'items') return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="3" y="3" width="6" height="6" rx="1" stroke={color} strokeWidth="1.5" fill="none"/>
      <rect x="11" y="3" width="6" height="6" rx="1" stroke={color} strokeWidth="1.5" fill="none"/>
      <rect x="3" y="11" width="6" height="6" rx="1" stroke={color} strokeWidth="1.5" fill="none"/>
      <rect x="11" y="11" width="6" height="6" rx="1" stroke={color} strokeWidth="1.5" fill="none"/>
    </svg>
  )
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="3" stroke={color} strokeWidth="1.5" fill="none"/>
      <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.93 4.93l1.41 1.41M13.66 13.66l1.41 1.41M4.93 15.07l1.41-1.41M13.66 6.34l1.41-1.41" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

const navStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: 0, left: 0, right: 0,
  display: 'flex',
  background: '#fff',
  borderTop: '1px solid #eee',
  paddingBottom: 'env(safe-area-inset-bottom)',
  zIndex: 100,
}
const itemStyle: React.CSSProperties = {
  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
  gap: 2, padding: '8px 0', background: 'none', border: 'none',
  fontSize: 10, color: '#bbb', cursor: 'pointer',
}
const activeItemStyle: React.CSSProperties = {
  ...itemStyle, color: '#2d7a4f',
}
