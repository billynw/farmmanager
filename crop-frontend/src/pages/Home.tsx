import { useNavigate } from 'react-router-dom'
import { useAuth } from '../store'
import logoImg from '../assets/logo.png'

// ── サンプルデータ（後でAPIに差し替え） ──────────────────────────
const SAMPLE_FIELDS = [
  { id: 1, name: '第1圃場', hasAlert: false },
  { id: 2, name: '第2圃場', hasAlert: true },
  { id: 3, name: '第3圃場', hasAlert: false },
  { id: 4, name: '第4圃場', hasAlert: false },
]

const SAMPLE_SENSORS: Record<number, { waterLevel: number; waterTemp: number; airTemp: number; soilMoisture: number }> = {
  1: { waterLevel: 18.4, waterTemp: 22.1, airTemp: 19.8, soilMoisture: 68 },
  2: { waterLevel: 8.2,  waterTemp: 20.5, airTemp: 19.8, soilMoisture: 71 },
  3: { waterLevel: 16.0, waterTemp: 21.8, airTemp: 19.8, soilMoisture: 65 },
  4: { waterLevel: 17.5, waterTemp: 22.0, airTemp: 19.8, soilMoisture: 70 },
}

const SAMPLE_ALERTS = [
  { fieldName: '第2圃場', message: '水位低下 — 8.2cm（目標15cm以上）給水を確認してください' },
]

const SAMPLE_RECENT_ITEMS = [
  { id: 1, name: 'じゃがいも', variety: 'きたかむい（男爵）', field: { name: '野菜畑' }, status: 'growing', latest_work_log: { worked_at: '2026-03-19T13:20:00', work_type: { name: '播種', color: '#2d7a4f' }, memo: '芽出し！' } },
  { id: 2, name: 'ぶどう',     variety: 'ピノ・ノワール',     field: { name: 'ブドウ畑' }, status: 'growing', latest_work_log: { worked_at: '2026-03-15T23:16:00', work_type: { name: 'その他', color: '#e67e22' }, memo: '硫黄石灰溶液' } },
  { id: 3, name: 'ブドウ',     variety: 'ベリーA',           field: { name: 'ブドウ畑' }, status: 'growing', latest_work_log: { worked_at: '2026-03-16T10:09:00', work_type: { name: '定植',   color: '#8e44ad' }, memo: '仮植え' } },
]
// ────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = { growing: '栽培中', finished: '終了' }
const STATUS_COLOR: Record<string, string> = { growing: '#2d7a4f', finished: '#888' }

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function Home() {
  const navigate = useNavigate()
  const logout = useAuth((s) => s.logout)
  const user = useAuth((s) => s.user)

  const selectedField = SAMPLE_FIELDS[0]
  const sensors = SAMPLE_SENSORS[selectedField.id]

  return (
    <div style={pageStyle}>
      {/* ヘッダー */}
      <div style={headerStyle}>
        <img src={logoImg} alt="ロゴ" style={{ height: 32, objectFit: 'contain' }} />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: '#666' }}>{user?.name}</span>
          <button onClick={() => navigate('/admin/users')} style={{ ...smallBtnStyle, color: '#2d7a4f', borderColor: '#2d7a4f' }}>管理</button>
          <button onClick={logout} style={smallBtnStyle}>ログアウト</button>
        </div>
      </div>

      {/* ナビタブ */}
      <div style={{ display: 'flex', background: '#fff', borderBottom: '1px solid #eee' }}>
        <div style={{ ...tabStyle, color: '#2d7a4f', borderBottom: '2px solid #2d7a4f', fontWeight: 500 }}>ホーム</div>
        <div style={tabStyle} onClick={() => navigate('/items')}>作物一覧</div>
        <div style={tabStyle} onClick={() => navigate('/sensors')}>センサー</div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>

        {/* アラート */}
        {SAMPLE_ALERTS.map((alert, i) => (
          <div key={i} style={alertStyle}>
            <div style={{ width: 8, height: 8, background: '#f5a623', borderRadius: '50%', marginTop: 4, flexShrink: 0 }} />
            <div style={{ fontSize: 13, color: '#7a4a00' }}>
              <strong>{alert.fieldName}</strong> {alert.message}
            </div>
          </div>
        ))}

        {/* センサー概要 */}
        <div style={sectionLabelStyle}>センサー概要</div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10, overflowX: 'auto', paddingBottom: 2 }}>
          {SAMPLE_FIELDS.map(f => (
            <div key={f.id} style={f.id === selectedField.id ? activePillStyle : f.hasAlert ? warnPillStyle : pillStyle}>
              {f.name}{f.hasAlert ? ' ⚠' : ''}
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 16 }}>
          <SensorCard label="水位" value={sensors.waterLevel} unit="cm" color="#378ADD" pct={sensors.waterLevel / 25 * 100} />
          <SensorCard label="水温" value={sensors.waterTemp}  unit="°C" color="#1D9E75" pct={(sensors.waterTemp - 10) / 25 * 100} />
          <SensorCard label="気温" value={sensors.airTemp}    unit="°C" color="#BA7517" pct={sensors.airTemp / 40 * 100} />
          <SensorCard label="地中水分" value={sensors.soilMoisture} unit="%" color="#639922" pct={sensors.soilMoisture} />
        </div>

        <div style={{ height: 1, background: '#eee', margin: '12px 0' }} />

        {/* 最近の作業 */}
        <div style={sectionLabelStyle}>最近の作業</div>
        {SAMPLE_RECENT_ITEMS.map(item => (
          <div key={item.id} onClick={() => navigate(`/items/${item.id}`)} style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
              <div style={{ fontWeight: 500, fontSize: 16, color: '#1a1a1a' }}>{item.name}</div>
              <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, background: STATUS_COLOR[item.status] + '22', color: STATUS_COLOR[item.status] }}>
                {STATUS_LABEL[item.status]}
              </span>
            </div>
            {item.variety && <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>{item.variety}</div>}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#888', marginBottom: 6 }}>
              <div style={{ width: 8, height: 8, background: '#f5a623', borderRadius: '50%' }} />
              {item.field.name}
            </div>
            {item.latest_work_log && (
              <div style={{ fontSize: 12, color: '#888' }}>
                <span style={{ color: '#bbb' }}>{formatDate(item.latest_work_log.worked_at)}</span>
                <span style={{ marginLeft: 6, color: item.latest_work_log.work_type.color, fontWeight: 500 }}>
                  {item.latest_work_log.work_type.name}
                </span>
                {item.latest_work_log.memo && (
                  <span style={{ marginLeft: 6, color: '#aaa' }}>{item.latest_work_log.memo}</span>
                )}
              </div>
            )}
          </div>
        ))}

        <div style={{ textAlign: 'center', fontSize: 13, color: '#2d7a4f', padding: 8, cursor: 'pointer' }}
          onClick={() => navigate('/items')}>
          作物一覧をすべて見る →
        </div>
      </div>
    </div>
  )
}

function SensorCard({ label, value, unit, color, pct }: { label: string; value: number; unit: string; color: string; pct: number }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 8, padding: '8px 6px' }}>
      <div style={{ fontSize: 10, color: '#999', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 3 }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
        {label}
      </div>
      <div style={{ fontSize: 16, fontWeight: 500, color: '#1a1a1a', lineHeight: 1.2 }}>
        {value}<span style={{ fontSize: 10, fontWeight: 400, color: '#999' }}>{unit}</span>
      </div>
      <div style={{ height: 3, background: '#eee', borderRadius: 2, marginTop: 5, overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 2, background: color, width: `${Math.min(100, Math.max(0, pct))}%` }} />
      </div>
    </div>
  )
}

const pageStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', height: '100dvh', background: '#f5f5f0' }
const headerStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', background: '#fff', borderBottom: '1px solid #eee' }
const tabStyle: React.CSSProperties = { flex: 1, padding: '10px 0', textAlign: 'center', fontSize: 13, color: '#999', borderBottom: '2px solid transparent', cursor: 'pointer' }
const sectionLabelStyle: React.CSSProperties = { fontSize: 12, color: '#999', marginBottom: 8, marginTop: 4 }
const cardStyle: React.CSSProperties = { background: '#fff', borderRadius: 10, padding: '14px 16px', marginBottom: 8, cursor: 'pointer', border: '1px solid #eee' }
const alertStyle: React.CSSProperties = { background: '#fff8ec', border: '1px solid #f5a623', borderRadius: 8, padding: '10px 12px', marginBottom: 12, display: 'flex', alignItems: 'flex-start', gap: 8 }
const pillStyle: React.CSSProperties = { padding: '5px 12px', borderRadius: 20, border: '1px solid #ddd', background: '#fff', fontSize: 12, color: '#666', whiteSpace: 'nowrap', cursor: 'pointer', flexShrink: 0 }
const activePillStyle: React.CSSProperties = { ...pillStyle, background: '#2d7a4f', borderColor: '#2d7a4f', color: '#fff' }
const warnPillStyle: React.CSSProperties = { ...pillStyle, borderColor: '#f5a623', color: '#7a4a00', background: '#fff8ec' }
const smallBtnStyle: React.CSSProperties = { fontSize: 12, padding: '4px 10px', border: '1px solid #ddd', borderRadius: 6, background: '#fff', cursor: 'pointer', color: '#666' }
