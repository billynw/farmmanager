import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fieldsApi, sensorsApi, sensorFeatureTypesApi } from '../api'
import type { Field, SensorOut, SensorReadingOut, SensorPhotoOut, SensorFeatureType } from '../api'
import AppHeader from '../components/AppHeader'
import BottomNav from '../components/BottomNav'

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}

function formatGateValue(metric: string, value: number): string {
  if (metric === 'gate_supply' || metric === 'gate_drain' || metric === 'gate_open') {
    return value === 0 ? 'CLOSE' : 'OPEN'
  }
  return String(value)
}

export default function SensorDetail() {
  const [selectedFieldId, setSelectedFieldId] = useState<number | null>(null)
  const [selectedSensorId, setSelectedSensorId] = useState<number | null>(null)
  const [selectedMetric, setSelectedMetric] = useState<string>('water_level')
  const [selectedPhotoId, setSelectedPhotoId] = useState<number | null>(null)
  const [chartRange, setChartRange] = useState<'24h' | '7d'>('24h')

  const { data: fields = [] } = useQuery<Field[]>({
    queryKey: ['fields'],
    queryFn: () => fieldsApi.list().then(r => r.data),
  })
  
  const { data: featureTypes = [] } = useQuery<SensorFeatureType[]>({
    queryKey: ['sensor-feature-types'],
    queryFn: () => sensorFeatureTypesApi.list().then(r => r.data),
  })
  const featureTypeByKey = Object.fromEntries(featureTypes.map(ft => [ft.key, ft]))
  
  const activeFieldId = selectedFieldId ?? fields[0]?.id ?? null
  useEffect(() => {
    if (!selectedFieldId && fields.length > 0) setSelectedFieldId(fields[0].id)
  }, [fields, selectedFieldId])

  const { data: sensors = [] } = useQuery<SensorOut[]>({
    queryKey: ['sensors', activeFieldId],
    queryFn: () => sensorsApi.list(activeFieldId!).then(r => r.data),
    enabled: !!activeFieldId,
  })
  const activeSensorId = selectedSensorId ?? sensors[0]?.id ?? null
  useEffect(() => {
    if (sensors.length > 0) setSelectedSensorId(sensors[0].id)
  }, [sensors])

  const { data: readings = [] } = useQuery<SensorReadingOut[]>({
    queryKey: ['readings', activeSensorId, selectedMetric, chartRange],
    queryFn: () => sensorsApi.readings(activeSensorId!, selectedMetric, chartRange === '24h' ? 24 : 168).then(r => r.data),
    enabled: !!activeSensorId,
    refetchInterval: 60000, // 1分ごとに自動更新
  })
  const { data: allReadings = [] } = useQuery<SensorReadingOut[]>({
    queryKey: ['readings-all', activeSensorId],
    queryFn: () => sensorsApi.readings(activeSensorId!, undefined, 200).then(r => r.data),
    enabled: !!activeSensorId,
    refetchInterval: 60000, // 1分ごとに自動更新
  })
  const latestByMetric = new Map<string, SensorReadingOut>()
  for (const r of [...allReadings].reverse()) latestByMetric.set(r.metric, r)
  const latestReadings = Array.from(latestByMetric.values())
  const hasData = latestReadings.length > 0

  const { data: photos = [] } = useQuery<SensorPhotoOut[]>({
    queryKey: ['sensor-photos', activeSensorId],
    queryFn: () => sensorsApi.photos(activeSensorId!).then(r => r.data),
    enabled: !!activeSensorId,
    refetchInterval: 60000, // 1分ごとに自動更新
  })
  const activePhoto = photos.find(p => p.id === selectedPhotoId) ?? photos[0] ?? null

  const chartData = [...readings].reverse()
  const W = 320, H = 80, pad = 10
  let chartPath = '', chartArea = '', chartColor = '#378ADD'
  if (chartData.length >= 2) {
    const ft = featureTypeByKey[selectedMetric]
    chartColor = ft?.color ?? '#378ADD'
    const vals = chartData.map(r => r.value)
    const minV = Math.min(...vals) - 1
    const maxV = Math.max(...vals) + 1
    const pts = vals.map((v, i) => {
      const x = pad + (i / (vals.length - 1)) * (W - pad * 2)
      const y = H - pad - ((v - minV) / (maxV - minV)) * (H - pad * 2)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    chartPath = 'M' + pts.join(' L')
    chartArea = chartPath + ` L${(W - pad).toFixed(1)},${(H - pad).toFixed(1)} L${pad},${(H - pad).toFixed(1)} Z`
  }

  // 時間軸ラベルを実際のデータから生成
  let chartLabels: string[] = []
  if (chartData.length >= 2) {
    const firstTime = new Date(chartData[0].recorded_at)
    const lastTime = new Date(chartData[chartData.length - 1].recorded_at)
    
    if (chartRange === '24h') {
      // 24h: 0時、6時、12時、18時、24時の5ポイント
      const labelCount = 5
      chartLabels = Array.from({ length: labelCount }, (_, i) => {
        const t = new Date(firstTime.getTime() + (lastTime.getTime() - firstTime.getTime()) * i / (labelCount - 1))
        return `${t.getHours()}:00`
      })
    } else {
      // 7d: 開始日から終了日まで
      const labelCount = 8
      chartLabels = Array.from({ length: labelCount }, (_, i) => {
        const t = new Date(firstTime.getTime() + (lastTime.getTime() - firstTime.getTime()) * i / (labelCount - 1))
        return `${t.getMonth() + 1}/${t.getDate()}`
      })
    }
  } else {
    // データが少ない場合はデフォルト
    chartLabels = chartRange === '24h'
      ? ['0:00', '6:00', '12:00', '18:00', '24:00']
      : ['7日前', '6日前', '5日前', '4日前', '3日前', '2日前', '昨日', '今日']
  }

  const selectedFeatureType = featureTypeByKey[selectedMetric]

  return (
    <div style={pageStyle}>
      <AppHeader />
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', paddingBottom: 72 }}>

        <div style={sectionLabelStyle}>圃場</div>
        <div style={pillRowStyle}>
          {fields.map(f => (
            <div key={f.id} onClick={() => { setSelectedFieldId(f.id); setSelectedSensorId(null) }}
              style={f.id === activeFieldId ? activePillStyle : pillStyle}>{f.name}</div>
          ))}
        </div>

        {/* センサーがない場合 */}
        {sensors.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: 10, padding: '40px 16px', textAlign: 'center', color: '#bbb', fontSize: 14 }}>
            センサーがありません
          </div>
        ) : (
          <>
            {sensors.length > 1 && (
              <>
                <div style={sectionLabelStyle}>センサー</div>
                <div style={pillRowStyle}>
                  {sensors.map(s => (
                    <div key={s.id} onClick={() => setSelectedSensorId(s.id)}
                      style={s.id === activeSensorId ? activeSensorPillStyle : sensorPillStyle}>{s.name}</div>
                  ))}
                </div>
              </>
            )}

            {/* データがない場合 */}
            {!hasData ? (
              <div style={{ background: '#fff', borderRadius: 10, padding: '40px 16px', textAlign: 'center', color: '#bbb', fontSize: 14 }}>
                センサーデータがありません
              </div>
            ) : (
              <>
                <div style={sectionLabelStyle}>
                  最新センサー値
                  <span style={{ fontSize: 10, color: '#bbb', marginLeft: 6 }}>{formatDate(latestReadings[0].recorded_at)} 更新</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 14 }}>
                  {latestReadings.map(r => {
                    const ft = featureTypeByKey[r.metric]
                    if (!ft) return null
                    const vMin = ft.value_min ?? 0
                    const vMax = ft.value_max ?? 100
                    const pct = Math.min(100, Math.max(0, (r.value - vMin) / (vMax - vMin) * 100))
                    const isSelected = r.metric === selectedMetric
                    const isGate = r.metric === 'gate_supply' || r.metric === 'gate_drain' || r.metric === 'gate_open'
                    const displayValue = formatGateValue(r.metric, r.value)
                    const unit = r.unit ?? ft.unit ?? ''
                    return (
                      <div key={r.metric} onClick={() => setSelectedMetric(r.metric)}
                        style={{ background: '#fff', border: `1.5px solid ${isSelected ? ft.color : '#eee'}`, borderRadius: 8, padding: '8px 6px', cursor: 'pointer' }}>
                        <div style={{ fontSize: 10, color: '#999', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 3 }}>
                          <div style={{ width: 6, height: 6, borderRadius: '50%', background: ft.color ?? '#888', flexShrink: 0 }} />
                          {ft.label}
                        </div>
                        <div style={{ fontSize: 16, fontWeight: 500, color: '#1a1a1a', lineHeight: 1.2 }}>
                          {displayValue}{!isGate && <span style={{ fontSize: 10, fontWeight: 400, color: '#999' }}>{unit}</span>}
                        </div>
                        <div style={{ height: 3, background: '#eee', borderRadius: 2, marginTop: 5, overflow: 'hidden' }}>
                          <div style={{ height: '100%', borderRadius: 2, background: ft.color ?? '#888', width: `${pct}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: '#444' }}>{selectedFeatureType?.label ?? selectedMetric}の推移</div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {(['24h', '7d'] as const).map(r => (
                        <div key={r} onClick={() => setChartRange(r)}
                          style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, cursor: 'pointer', border: `1px solid ${chartRange === r ? '#2d7a4f' : '#ddd'}`, background: chartRange === r ? '#2d7a4f' : '#fff', color: chartRange === r ? '#fff' : '#888' }}>
                          {r === '24h' ? '24h' : '7日'}
                        </div>
                      ))}
                    </div>
                  </div>
                  <svg viewBox={`0 0 ${W} ${H}`} width="100%" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                      <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={chartColor} stopOpacity="0.18" />
                        <stop offset="100%" stopColor={chartColor} stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <line x1={pad} y1={H-pad} x2={W-pad} y2={H-pad} stroke="#eee" strokeWidth="0.5" />
                    {chartArea && <path d={chartArea} fill="url(#cg)" />}
                    {chartPath && <path d={chartPath} stroke={chartColor} strokeWidth="1.5" fill="none" strokeLinejoin="round" strokeLinecap="round" />}
                    {chartData.length === 0 && <text x={W/2} y={H/2} fontSize="10" fill="#ccc" textAnchor="middle">データなし</text>}
                    {chartLabels.map((l, i) => {
                      const x = pad + (i / (chartLabels.length - 1)) * (W - pad * 2)
                      return <text key={l} x={x.toFixed(1)} y={H} fontSize="8" fill="#bbb" textAnchor="middle">{l}</text>
                    })}
                  </svg>
                </div>

                <div style={sectionLabelStyle}>カメラ写真</div>
                {photos.length > 0 ? (
                  <>
                    <div style={{ width: '100%', aspectRatio: '16/9', borderRadius: 10, overflow: 'hidden', position: 'relative', marginBottom: 8 }}>
                      <img src={activePhoto?.file_path} alt="センサー写真"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent, rgba(0,0,0,0.5))', padding: '8px 10px' }}>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.9)' }}>
                          {activePhoto ? formatDate(activePhoto.taken_at) : ''} — {sensors.find(s => s.id === activeSensorId)?.name}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, marginBottom: 16 }}>
                      {photos.map(p => (
                        <div key={p.id} onClick={() => setSelectedPhotoId(p.id)}
                          style={{ width: 72, height: 72, flexShrink: 0, borderRadius: 6, overflow: 'hidden', position: 'relative', cursor: 'pointer', border: `2px solid ${p.id === activePhoto?.id ? '#2d7a4f' : 'transparent'}` }}>
                          <img src={p.file_path} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.45)', fontSize: 8, color: '#fff', padding: '2px 3px', textAlign: 'center' }}>
                            {formatDate(p.taken_at)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div style={{ background: '#fff', borderRadius: 10, padding: '32px 16px', textAlign: 'center', marginBottom: 16 }}>
                    <div style={{ fontSize: 32, opacity: 0.2, marginBottom: 8 }}>📷</div>
                    <div style={{ fontSize: 13, color: '#bbb' }}>写真がありません</div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
      <BottomNav />
    </div>
  )
}

const pageStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', height: '100dvh', background: '#f5f5f0' }
const sectionLabelStyle: React.CSSProperties = { fontSize: 12, color: '#999', marginBottom: 8, marginTop: 4 }
const pillRowStyle: React.CSSProperties = { display: 'flex', gap: 6, marginBottom: 12, overflowX: 'auto', paddingBottom: 2 }
const pillStyle: React.CSSProperties = { padding: '5px 12px', borderRadius: 20, border: '1px solid #ddd', background: '#fff', fontSize: 12, color: '#666', whiteSpace: 'nowrap', cursor: 'pointer', flexShrink: 0 }
const activePillStyle: React.CSSProperties = { ...pillStyle, background: '#2d7a4f', borderColor: '#2d7a4f', color: '#fff' }
const sensorPillStyle: React.CSSProperties = { padding: '4px 10px', borderRadius: 20, border: '1px solid #ddd', background: '#fff', fontSize: 11, color: '#666', whiteSpace: 'nowrap', cursor: 'pointer', flexShrink: 0 }
const activeSensorPillStyle: React.CSSProperties = { ...sensorPillStyle, background: '#e8f5ee', borderColor: '#2d7a4f', color: '#2d7a4f' }
