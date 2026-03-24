import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fieldsApi, sensorsApi, itemsApi } from '../api'
import type { Item, Field } from '../api'
import AppHeader from '../components/AppHeader'
import BottomNav from '../components/BottomNav'

const METRIC_CONFIG: Record<string, { label: string; unit: string; color: string; max: number; min: number }> = {
  water_level:   { label: '水位',    unit: 'cm',  color: '#378ADD', max: 25,  min: 0  },
  water_temp:    { label: '水温',    unit: '\u00b0C', color: '#1D9E75', max: 35,  min: 10 },
  air_temp:      { label: '気温',    unit: '\u00b0C', color: '#BA7517', max: 40,  min: 0  },
  soil_moisture: { label: '地中水分', unit: '%',   color: '#639922', max: 100, min: 0  },
  ph:            { label: 'pH',      unit: '',    color: '#8e44ad', max: 14,  min: 0  },
  gate_open:     { label: 'ゲート',  unit: '',    color: '#e67e22', max: 1,   min: 0  },
}

// feature_type id → metric 名のマッピング（ハードコーディング）
// カメラ(1)は計測値なし、給水/排水ゲートは同じ metric
const FEATURE_TO_METRIC: Record<number, string | null> = {
  1: null,           // カメラ（計測値なし）
  2: 'gate_open',    // 給水ゲート
  3: 'gate_open',    // 排水ゲート
  4: 'air_temp',     // 温湿度センサ
  5: 'soil_moisture',// 土壌水分センサ
  6: 'water_temp',   // 水温センサ
  7: 'water_level',  // 水位センサ
}

const STATUS_LABEL: Record<string, string> = { growing: '栽培中', finished: '終了' }
const STATUS_COLOR: Record<string, string> = { growing: '#2d7a4f', finished: '#888' }

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function Home() {
  const navigate = useNavigate()
  const [selectedFieldId, setSelectedFieldId] = useState<number | null>(null)

  const { data: fields = [] } = useQuery<Field[]>({
    queryKey: ['fields'],
    queryFn: () => fieldsApi.list().then(r => r.data),
  })
  const { data: items = [], isLoading: itemsLoading } = useQuery<Item[]>({
    queryKey: ['items', 'home'],
    queryFn: () => itemsApi.list({ status: 'growing' }).then(r => r.data),
  })

  const activeFieldId = selectedFieldId ?? fields[0]?.id ?? null
  useEffect(() => {
    if (!selectedFieldId && fields.length > 0) setSelectedFieldId(fields[0].id)
  }, [fields, selectedFieldId])

  // 選択圃場のセンサー一覧を取得（show_on_home の情報を使うため直接取得）
  const { data: sensors = [] } = useQuery({
    queryKey: ['sensors-home', activeFieldId],
    queryFn: () => sensorsApi.list(activeFieldId!).then(r => r.data),
    enabled: !!activeFieldId,
  })

  // show_on_home が設定されているセンサーを優先、なければ最小IDの有効センサー
  const activeSensor = (() => {
    const active = sensors.filter(s => s.active)
    const withHome = active.filter(s => (s.show_on_home ?? []).length > 0)
    if (withHome.length > 0) return withHome.sort((a, b) => a.id - b.id)[0]
    return active.sort((a, b) => a.id - b.id)[0] ?? null
  })()

  // show_on_home のfeature IDから表示すべき metric を決定
  const showOnHomeIds: number[] = activeSensor?.show_on_home ?? []
  const targetMetrics: string[] = showOnHomeIds.length > 0
    ? [...new Set(showOnHomeIds.map(id => FEATURE_TO_METRIC[id]).filter((m): m is string => m !== null))]
    : []  // show_on_home 未設定なら何も表示しない（従来の sensor_summary は使わない）

  // センサーの最新計測値を取得
  const { data: readings = [] } = useQuery({
    queryKey: ['sensor-readings-home', activeSensor?.id],
    queryFn: () => sensorsApi.readings(activeSensor!.id, undefined, 200).then(r => r.data),
    enabled: !!activeSensor,
  })

  // metric ごとに最新値だけ抽出し、targetMetrics の順で並べる
  const latestByMetric: Record<string, { value: number; unit?: string }> = {}
  for (const r of readings) {
    if (!latestByMetric[r.metric]) {
      latestByMetric[r.metric] = { value: r.value, unit: r.unit ?? undefined }
    }
  }
  const displayReadings = targetMetrics
    .filter(m => latestByMetric[m] !== undefined)
    .map(m => ({ metric: m, ...latestByMetric[m] }))

  const recentItems = [...items]
    .filter(item => item.latest_work_log)
    .sort((a, b) => new Date(b.latest_work_log!.worked_at).getTime() - new Date(a.latest_work_log!.worked_at).getTime())
    .slice(0, 5)

  // show_on_home 未設定かつセンサーあり → 従来表示（全metric）にフォールバック
  const useFallback = !!activeSensor && showOnHomeIds.length === 0

  return (
    <div style={pageStyle}>
      <AppHeader />
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', paddingBottom: 72 }}>

        <div style={sectionLabelStyle}>センサー概要</div>
        {fields.length > 0 && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 10, overflowX: 'auto', paddingBottom: 2 }}>
            {fields.map(f => (
              <div key={f.id} onClick={() => setSelectedFieldId(f.id)}
                style={f.id === activeFieldId ? activePillStyle : pillStyle}>
                {f.name}
              </div>
            ))}
          </div>
        )}

        {useFallback ? (
          // show_on_home 未設定 → 従来どおり sensor_summary から全metric表示
          <FallbackSensorGrid fieldId={activeFieldId} />
        ) : displayReadings.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 16 }}>
            {displayReadings.map(r => {
              const cfg = METRIC_CONFIG[r.metric]
              if (!cfg) return null
              const pct = (r.value - cfg.min) / (cfg.max - cfg.min) * 100
              return <SensorCard key={r.metric} label={cfg.label} value={r.value} unit={r.unit ?? cfg.unit} color={cfg.color} pct={pct} />
            })}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 16, opacity: 0.4 }}>
            {['水位', '水温', '気温', '地中水分'].map(label => (
              <div key={label} style={{ background: '#fff', border: '1px solid #eee', borderRadius: 8, padding: '8px 6px' }}>
                <div style={{ fontSize: 10, color: '#999', marginBottom: 3 }}>{label}</div>
                <div style={{ fontSize: 16, fontWeight: 500, color: '#bbb' }}>--</div>
              </div>
            ))}
          </div>
        )}

        <div style={{ height: 1, background: '#eee', margin: '12px 0' }} />

        <div style={sectionLabelStyle}>最近の作業</div>
        {itemsLoading && <p style={{ color: '#aaa', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>読み込み中...</p>}
        {!itemsLoading && recentItems.length === 0 && (
          <p style={{ color: '#aaa', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>作業記録がありません</p>
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
          作物一覧をすべて見る →
        </div>
      </div>
      <BottomNav />
    </div>
  )
}

/** show_on_home 未設定時のフォールバック: 従来の sensor_summary を使う */
function FallbackSensorGrid({ fieldId }: { fieldId: number | null }) {
  const { data: sensorSummary } = useQuery({
    queryKey: ['sensor-summary', fieldId],
    queryFn: () => fieldsApi.sensorSummary(fieldId!).then(r => r.data),
    enabled: !!fieldId,
  })
  const readings = sensorSummary?.sensors[0]?.latest ?? []
  if (readings.length === 0) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 16, opacity: 0.4 }}>
        {['水位', '水温', '気温', '地中水分'].map(label => (
          <div key={label} style={{ background: '#fff', border: '1px solid #eee', borderRadius: 8, padding: '8px 6px' }}>
            <div style={{ fontSize: 10, color: '#999', marginBottom: 3 }}>{label}</div>
            <div style={{ fontSize: 16, fontWeight: 500, color: '#bbb' }}>--</div>
          </div>
        ))}
      </div>
    )
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 16 }}>
      {readings.map(r => {
        const cfg = METRIC_CONFIG[r.metric]
        if (!cfg) return null
        const pct = (r.value - cfg.min) / (cfg.max - cfg.min) * 100
        return <SensorCard key={r.metric} label={cfg.label} value={r.value} unit={r.unit ?? cfg.unit} color={cfg.color} pct={pct} />
      })}
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
const pillStyle: React.CSSProperties = { padding: '5px 12px', borderRadius: 20, border: '1px solid #ddd', background: '#fff', fontSize: 12, color: '#666', whiteSpace: 'nowrap', cursor: 'pointer', flexShrink: 0 }
const activePillStyle: React.CSSProperties = { ...pillStyle, background: '#2d7a4f', borderColor: '#2d7a4f', color: '#fff' }
