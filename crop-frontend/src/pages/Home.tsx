import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fieldsApi, sensorsApi, itemsApi } from '../api'
import type { Item, Field, SensorOut, SensorReadingOut } from '../api'
import AppHeader from '../components/AppHeader'
import BottomNav from '../components/BottomNav'

const METRIC_CONFIG: Record<string, { label: string; unit: string; color: string; max: number; min: number }> = {
  water_level:   { label: '\u6c34\u4f4d',    unit: 'cm',  color: '#378ADD', max: 25,  min: 0  },
  water_temp:    { label: '\u6c34\u6e29',    unit: '\u00b0C', color: '#1D9E75', max: 35,  min: 10 },
  air_temp:      { label: '\u6c17\u6e29',    unit: '\u00b0C', color: '#BA7517', max: 40,  min: 0  },
  soil_moisture: { label: '\u5730\u4e2d\u6c34\u5206', unit: '%',   color: '#639922', max: 100, min: 0  },
  ph:            { label: 'pH',      unit: '',    color: '#8e44ad', max: 14,  min: 0  },
  gate_open:     { label: '\u30b2\u30fc\u30c8',  unit: '',    color: '#e67e22', max: 1,   min: 0  },
}

const FEATURE_TO_METRIC: Record<number, string | null> = {
  1: null,
  2: 'gate_open',
  3: 'gate_open',
  4: 'air_temp',
  5: 'soil_moisture',
  6: 'water_temp',
  7: 'water_level',
}

const STATUS_LABEL: Record<string, string> = { growing: '\u6d3b\u57f9\u4e2d', finished: '\u7d42\u4e86' }
const STATUS_COLOR: Record<string, string> = { growing: '#2d7a4f', finished: '#888' }

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function Home() {
  const navigate = useNavigate()

  const { data: fields = [] } = useQuery<Field[]>({
    queryKey: ['fields'],
    queryFn: () => fieldsApi.list().then(r => r.data),
  })
  const { data: items = [], isLoading: itemsLoading } = useQuery<Item[]>({
    queryKey: ['items', 'home'],
    queryFn: () => itemsApi.list({ status: 'growing' }).then(r => r.data),
  })

  const recentItems = [...items]
    .filter(item => item.latest_work_log)
    .sort((a, b) => new Date(b.latest_work_log!.worked_at).getTime() - new Date(a.latest_work_log!.worked_at).getTime())
    .slice(0, 5)

  return (
    <div style={pageStyle}>
      <AppHeader />
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', paddingBottom: 72 }}>

        <div style={sectionLabelStyle}>\u30bb\u30f3\u30b5\u30fc\u6982\u8981</div>

        {/* 圃場ごとにセンサーブロックを表示 */}
        {fields.map(field => (
          <FieldSensorBlock key={field.id} field={field} />
        ))}

        <div style={{ height: 1, background: '#eee', margin: '12px 0' }} />

        <div style={sectionLabelStyle}>\u6700\u8fd1\u306e\u4f5c\u696d</div>
        {itemsLoading && <p style={{ color: '#aaa', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>\u8aad\u307f\u8fbc\u307f\u4e2d...</p>}
        {!itemsLoading && recentItems.length === 0 && (
          <p style={{ color: '#aaa', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>\u4f5c\u696d\u8a18\u9332\u304c\u3042\u308a\u307e\u305b\u3093</p>
        )}
        {recentItems.map((item: Item) => (
          <div key={item.id} onClick={() => navigate(`/items/${item.id}`)} style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
              <div style={{ fontWeight: 500, fontSize: 16, color: '#1a1a1a' }}>{item.name}</div>
              <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, background: STATUS_COLOR[item.status] + '22', color: STATUS_COLOR[item.status] }}>
                {STATUS_LABEL[item.status]}
              </span>
            </div>
            {item.variety && <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>{item.variety}</div>}
            {item.field && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#888', marginBottom: 6 }}>
                <div style={{ width: 8, height: 8, background: '#f5a623', borderRadius: '50%' }} />
                {item.field.name}
              </div>
            )}
            {item.latest_work_log && (
              <div style={{ fontSize: 12, color: '#888' }}>
                <span style={{ color: '#bbb' }}>{formatDate(item.latest_work_log.worked_at)}</span>
                {item.latest_work_log.work_type && (
                  <span style={{ marginLeft: 6, color: item.latest_work_log.work_type.color, fontWeight: 500 }}>
                    {item.latest_work_log.work_type.name}
                  </span>
                )}
                {item.latest_work_log.memo && (
                  <span style={{ marginLeft: 6, color: '#aaa' }}>
                    {item.latest_work_log.memo.length > 20 ? item.latest_work_log.memo.substring(0, 20) + '...' : item.latest_work_log.memo}
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
        <div style={{ textAlign: 'center', fontSize: 13, color: '#2d7a4f', padding: 8, cursor: 'pointer' }}
          onClick={() => navigate('/items')}>
          \u4f5c\u7269\u4e00\u89a7\u3092\u3059\u3079\u3066\u898b\u308b \u2192
        </div>
      </div>
      <BottomNav />
    </div>
  )
}

/** 圃場1つ分のセンサーブロック */
function FieldSensorBlock({ field }: { field: Field }) {
  const { data: sensors = [] } = useQuery<SensorOut[]>({
    queryKey: ['sensors-home', field.id],
    queryFn: () => sensorsApi.list(field.id).then(r => r.data),
  })

  const activeSensor = (() => {
    const active = sensors.filter(s => s.active)
    const withHome = active.filter(s => (s.show_on_home ?? []).length > 0)
    if (withHome.length > 0) return withHome.sort((a, b) => a.id - b.id)[0]
    return active.sort((a, b) => a.id - b.id)[0] ?? null
  })()

  const showOnHomeIds: number[] = activeSensor?.show_on_home ?? []
  const targetMetrics: string[] = showOnHomeIds.length > 0
    ? [...new Set(showOnHomeIds.map(id => FEATURE_TO_METRIC[id]).filter((m): m is string => m !== null))]
    : []

  const useFallback = !!activeSensor && showOnHomeIds.length === 0

  return (
    <div style={{ marginBottom: 12 }}>
      {/* 圃場名 */}
      <div style={{ fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 6 }}>
        {field.name}
      </div>
      {useFallback ? (
        <FallbackSensorGrid fieldId={field.id} />
      ) : targetMetrics.length > 0 ? (
        <SensorReadingsGrid sensorId={activeSensor!.id} targetMetrics={targetMetrics} />
      ) : (
        <EmptySensorGrid />
      )}
    </div>
  )
}

/** show_on_home 設定済み: readings を取得して表示 */
function SensorReadingsGrid({ sensorId, targetMetrics }: { sensorId: number; targetMetrics: string[] }) {
  const { data: readings = [] } = useQuery<SensorReadingOut[]>({
    queryKey: ['sensor-readings-home', sensorId],
    queryFn: () => sensorsApi.readings(sensorId, undefined, 200).then(r => r.data),
  })

  const latestByMetric: Record<string, { value: number; unit?: string }> = {}
  for (const r of readings) {
    if (!latestByMetric[r.metric]) {
      latestByMetric[r.metric] = { value: r.value, unit: r.unit ?? undefined }
    }
  }
  const displayReadings = targetMetrics
    .filter(m => latestByMetric[m] !== undefined)
    .map(m => ({ metric: m, ...latestByMetric[m] }))

  if (displayReadings.length === 0) return <EmptySensorGrid />

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 4 }}>
      {displayReadings.map(r => {
        const cfg = METRIC_CONFIG[r.metric]
        if (!cfg) return null
        const pct = (r.value - cfg.min) / (cfg.max - cfg.min) * 100
        return <SensorCard key={r.metric} label={cfg.label} value={r.value} unit={r.unit ?? cfg.unit} color={cfg.color} pct={pct} />
      })}
    </div>
  )
}

/** show_on_home 未設定: sensor_summary にフォールバック */
function FallbackSensorGrid({ fieldId }: { fieldId: number }) {
  const { data: sensorSummary } = useQuery({
    queryKey: ['sensor-summary', fieldId],
    queryFn: () => fieldsApi.sensorSummary(fieldId).then(r => r.data),
  })
  const readings = sensorSummary?.sensors[0]?.latest ?? []
  if (readings.length === 0) return <EmptySensorGrid />
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 4 }}>
      {readings.map(r => {
        const cfg = METRIC_CONFIG[r.metric]
        if (!cfg) return null
        const pct = (r.value - cfg.min) / (cfg.max - cfg.min) * 100
        return <SensorCard key={r.metric} label={cfg.label} value={r.value} unit={r.unit ?? cfg.unit} color={cfg.color} pct={pct} />
      })}
    </div>
  )
}

function EmptySensorGrid() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 4, opacity: 0.4 }}>
      {['\u6c34\u4f4d', '\u6c34\u6e29', '\u6c17\u6e29', '\u5730\u4e2d\u6c34\u5206'].map(label => (
        <div key={label} style={{ background: '#fff', border: '1px solid #eee', borderRadius: 8, padding: '8px 6px' }}>
          <div style={{ fontSize: 10, color: '#999', marginBottom: 3 }}>{label}</div>
          <div style={{ fontSize: 16, fontWeight: 500, color: '#bbb' }}>--</div>
        </div>
      ))}
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
const sectionLabelStyle: React.CSSProperties = { fontSize: 12, color: '#999', marginBottom: 8, marginTop: 4 }
const cardStyle: React.CSSProperties = { background: '#fff', borderRadius: 10, padding: '14px 16px', marginBottom: 8, cursor: 'pointer', border: '1px solid #eee' }
