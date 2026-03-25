import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fieldsApi, sensorsApi, itemsApi, sensorFeatureTypesApi, deviceCommandsApi } from '../api'
import type { Item, Field, SensorOut, SensorReadingOut, SensorFeatureType, DeviceCommandOut } from '../api'
import AppHeader from '../components/AppHeader'
import BottomNav from '../components/BottomNav'

const FEATURE_TO_METRIC: Record<number, string | null> = {
  1: null,           // camera
  2: 'gate_supply',  // 給水ゲート
  3: 'gate_drain',   // 排水ゲート
  4: 'temperature',  // 温度センサ
  5: 'humidity',     // 湿度センサ
  6: 'soil_moisture',// 土壌水分センサ
  7: 'water_temp',   // 水温センサ
  8: 'water_level',  // 水位センサ
}

const STATUS_LABEL: Record<string, string> = { growing: '栽培中', finished: '終了' }
const STATUS_COLOR: Record<string, string> = { growing: '#2d7a4f', finished: '#888' }

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}

function formatGateValue(metric: string, value: number): string {
  if (metric === 'gate_supply' || metric === 'gate_drain') {
    return value === 0 ? 'CLOSE' : 'OPEN'
  }
  return String(value)
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

  const recentItems = [...items]
    .filter(item => item.latest_work_log)
    .sort((a, b) => new Date(b.latest_work_log!.worked_at).getTime() - new Date(a.latest_work_log!.worked_at).getTime())
    .slice(0, 5)

  return (
    <div style={pageStyle}>
      <AppHeader />
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', paddingBottom: 72 }}>

        <div style={sectionLabelStyle}>センサー概要</div>

        {/* 圃場切り替えピル */}
        {fields.length > 1 && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 10, overflowX: 'auto', paddingBottom: 2 }}>
            {fields.map(f => (
              <div key={f.id} onClick={() => setSelectedFieldId(f.id)}
                style={f.id === activeFieldId ? activePillStyle : pillStyle}>
                {f.name}
              </div>
            ))}
          </div>
        )}

        {activeFieldId && <FieldSensorBlock fieldId={activeFieldId} />}

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

function FieldSensorBlock({ fieldId }: { fieldId: number }) {
  const [selectedSensorId, setSelectedSensorId] = useState<number | null>(null)

  const { data: sensors = [] } = useQuery<SensorOut[]>({
    queryKey: ['sensors-home', fieldId],
    queryFn: () => sensorsApi.list(fieldId).then(r => r.data),
  })

  const { data: featureTypes = [] } = useQuery<SensorFeatureType[]>({
    queryKey: ['sensor-feature-types'],
    queryFn: () => sensorFeatureTypesApi.list().then(r => r.data),
  })

  // アクティブでshow_on_homeがあるセンサー
  const activeSensors = sensors
    .filter(s => s.active && (s.show_on_home ?? []).length > 0)
    .sort((a, b) => a.id - b.id)

  // 選択されているセンサー（デフォルトは最初のセンサー）
  const activeSensorId = selectedSensorId ?? activeSensors[0]?.id ?? null
  const activeSensor = activeSensors.find(s => s.id === activeSensorId) ?? null

  if (activeSensors.length === 0) {
    const defaultLabels = ['水位', '水温', '気温', '地中水分']
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 16, opacity: 0.4 }}>
        {defaultLabels.map(label => (
          <div key={label} style={{ background: '#fff', border: '1px solid #eee', borderRadius: 8, padding: '8px 6px' }}>
            <div style={{ fontSize: 10, color: '#999', marginBottom: 3 }}>{label}</div>
            <div style={{ fontSize: 16, fontWeight: 500, color: '#bbb' }}>--</div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <>
      {/* センサー切り替えボタン（複数ある場合のみ表示） */}
      {activeSensors.length > 1 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 10, overflowX: 'auto', paddingBottom: 2 }}>
          {activeSensors.map(s => (
            <div key={s.id} onClick={() => setSelectedSensorId(s.id)}
              style={s.id === activeSensorId ? activePillStyle : pillStyle}>
              {s.name}
            </div>
          ))}
        </div>
      )}

      {activeSensor && <SensorReadingsGrid sensor={activeSensor} featureTypes={featureTypes} />}
    </>
  )
}

function SensorReadingsGrid({ 
  sensor, 
  featureTypes 
}: { 
  sensor: SensorOut
  featureTypes: SensorFeatureType[] 
}) {
  const [commandModal, setCommandModal] = useState<{ sensorId: number; label: string; currentValue: number } | null>(null)
  const [cancelModal, setCancelModal] = useState<{ sensorId: number; commandId: number; label: string } | null>(null)

  // sensor_feature_typesのID順にソートされたメトリック
  const metricToFeatureId: Record<string, number> = {}
  for (const [featureId, metric] of Object.entries(FEATURE_TO_METRIC)) {
    if (metric) {
      metricToFeatureId[metric] = parseInt(featureId)
    }
  }

  const targetMetrics = (sensor.show_on_home ?? [])
    .map(id => FEATURE_TO_METRIC[id])
    .filter((m): m is string => m !== null)
    .sort((a, b) => metricToFeatureId[a] - metricToFeatureId[b])

  const { data: readings = [] } = useQuery<SensorReadingOut[]>({
    queryKey: ['sensor-readings-home', sensor.id],
    queryFn: () => sensorsApi.readings(sensor.id, undefined, 200).then(r => r.data),
  })

  const latestByMetric: Record<string, { value: number; unit?: string }> = {}
  for (const r of readings) {
    if (!latestByMetric[r.metric]) {
      latestByMetric[r.metric] = { value: r.value, unit: r.unit ?? undefined }
    }
  }

  const featureTypeByKey = Object.fromEntries(featureTypes.map(ft => [ft.key, ft]))

  const handleGateClick = (label: string, value: number) => {
    setCommandModal({ sensorId: sensor.id, label, currentValue: value })
  }

  const handleCancelClick = (label: string, commandId: number) => {
    setCancelModal({ sensorId: sensor.id, commandId, label })
  }

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 16 }}>
        {targetMetrics.map(m => {
          const featureType = featureTypeByKey[m]
          if (!featureType) return null
          const data = latestByMetric[m]
          
          if (data) {
            const vMin = featureType.value_min ?? 0
            const vMax = featureType.value_max ?? 100
            const pct = (data.value - vMin) / (vMax - vMin) * 100
            const unit = data.unit ?? featureType.unit ?? ''
            return (
              <SensorCard
                key={m}
                sensorId={sensor.id}
                metric={m}
                label={featureType.label}
                value={data.value}
                unit={unit}
                color={featureType.color ?? '#888'}
                pct={pct}
                onCommandClick={handleGateClick}
                onCancelClick={handleCancelClick}
              />
            )
          }
          
          // データがない場合 - ゲートも含めて非クリック可能
          return <SensorCardEmpty key={m} label={featureType.label} color={featureType.color ?? '#888'} />
        })}
      </div>
      {commandModal && (
        <GateCommandModal
          sensorId={commandModal.sensorId}
          label={commandModal.label}
          currentValue={commandModal.currentValue}
          onClose={() => setCommandModal(null)}
        />
      )}
      {cancelModal && (
        <CancelCommandModal
          sensorId={cancelModal.sensorId}
          commandId={cancelModal.commandId}
          label={cancelModal.label}
          onClose={() => setCancelModal(null)}
        />
      )}
    </>
  )
}

function SensorCard({
  sensorId,
  metric,
  label,
  value,
  unit,
  color,
  pct,
  onCommandClick,
  onCancelClick
}: {
  sensorId: number
  metric: string
  label: string
  value: number
  unit: string
  color: string
  pct: number
  onCommandClick: (label: string, value: number) => void
  onCancelClick: (label: string, commandId: number) => void
}) {
  const displayValue = formatGateValue(metric, value)
  const isGate = metric === 'gate_supply' || metric === 'gate_drain'

  const { data: commands = [] } = useQuery<DeviceCommandOut[]>({
    queryKey: ['device-commands', sensorId],
    queryFn: () => deviceCommandsApi.list(sensorId, 1).then(r => r.data),
    enabled: isGate,
  })

  const pendingCommand = isGate ? commands.find(c => c.status === 'pending') : null
  const hasPendingCommand = !!pendingCommand

  const cardStyle: React.CSSProperties = {
    background: hasPendingCommand ? '#fff3cd' : '#fff',
    border: hasPendingCommand ? '1px solid #ffc107' : '1px solid #eee',
    borderRadius: 8,
    padding: '8px 6px',
    cursor: isGate ? 'pointer' : 'default',
  }

  const handleClick = () => {
    if (!isGate) return
    
    if (hasPendingCommand && pendingCommand) {
      onCancelClick(label, pendingCommand.id)
    } else {
      onCommandClick(label, value)
    }
  }

  return (
    <div style={cardStyle} onClick={handleClick}>
      <div style={{ fontSize: 10, color: '#999', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 3 }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
        {label}
      </div>
      <div style={{ fontSize: 16, fontWeight: 500, color: '#1a1a1a', lineHeight: 1.2 }}>
        {displayValue}{!isGate && <span style={{ fontSize: 10, fontWeight: 400, color: '#999' }}>{unit}</span>}
      </div>
      {hasPendingCommand && (
        <div style={{ fontSize: 9, color: '#ff8800', marginTop: 2 }}>命令送信中...</div>
      )}
      {!isGate && (
        <div style={{ height: 3, background: '#eee', borderRadius: 2, marginTop: 5, overflow: 'hidden' }}>
          <div style={{ height: '100%', borderRadius: 2, background: color, width: `${Math.min(100, Math.max(0, pct))}%` }} />
        </div>
      )}
    </div>
  )
}

function SensorCardEmpty({ label, color }: { label: string; color: string }) {
  const cardStyle: React.CSSProperties = {
    background: '#fff',
    border: '1px solid #eee',
    borderRadius: 8,
    padding: '8px 6px',
    opacity: 0.4,
  }

  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 10, color: '#999', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 3 }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
        {label}
      </div>
      <div style={{ fontSize: 16, fontWeight: 500, color: '#bbb', lineHeight: 1.2 }}>--</div>
      <div style={{ height: 3, background: '#eee', borderRadius: 2, marginTop: 5 }} />
    </div>
  )
}

function GateCommandModal({
  sensorId,
  label,
  currentValue,
  onClose
}: {
  sensorId: number
  label: string
  currentValue: number
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const currentState = currentValue === 0 ? 'CLOSE' : 'OPEN'

  const sendCommand = useMutation({
    mutationFn: (command: string) => deviceCommandsApi.send(sensorId, command),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device-commands', sensorId] })
      onClose()
    },
  })

  return (
    <div style={modalOverlayStyle} onClick={onClose}>
      <div style={modalContentStyle} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 16, color: '#1a1a1a' }}>{label}制御</div>
        <div style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>
          現在の状態: <span style={{ fontWeight: 600, color: '#1a1a1a' }}>{currentState}</span>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {currentState === 'CLOSE' && (
            <button
              style={commandButtonStyle}
              onClick={() => sendCommand.mutate('OPEN')}
              disabled={sendCommand.isPending}
            >
              OPEN
            </button>
          )}
          {currentState === 'OPEN' && (
            <button
              style={commandButtonStyle}
              onClick={() => sendCommand.mutate('CLOSE')}
              disabled={sendCommand.isPending}
            >
              CLOSE
            </button>
          )}
        </div>
        <button style={cancelButtonStyle} onClick={onClose}>キャンセル</button>
      </div>
    </div>
  )
}

function CancelCommandModal({
  sensorId,
  commandId,
  label,
  onClose
}: {
  sensorId: number
  commandId: number
  label: string
  onClose: () => void
}) {
  const queryClient = useQueryClient()

  const cancelCommand = useMutation({
    mutationFn: () => deviceCommandsApi.cancel(commandId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device-commands', sensorId] })
      onClose()
    },
  })

  return (
    <div style={modalOverlayStyle} onClick={onClose}>
      <div style={modalContentStyle} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 16, color: '#1a1a1a' }}>{label}命令キャンセル</div>
        <div style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>
          送信中の命令をキャンセルしますか？
        </div>
        <button
          style={{ ...commandButtonStyle, background: '#dc3545' }}
          onClick={() => cancelCommand.mutate()}
          disabled={cancelCommand.isPending}
        >
          キャンセル
        </button>
        <button style={cancelButtonStyle} onClick={onClose}>戻る</button>
      </div>
    </div>
  )
}

const pageStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', height: '100dvh', background: '#f5f5f0' }
const sectionLabelStyle: React.CSSProperties = { fontSize: 12, color: '#999', marginBottom: 8, marginTop: 4 }
const cardStyle: React.CSSProperties = { background: '#fff', borderRadius: 10, padding: '14px 16px', marginBottom: 8, cursor: 'pointer', border: '1px solid #eee' }
const pillStyle: React.CSSProperties = { padding: '5px 12px', borderRadius: 20, border: '1px solid #ddd', background: '#fff', fontSize: 12, color: '#666', whiteSpace: 'nowrap', cursor: 'pointer', flexShrink: 0 }
const activePillStyle: React.CSSProperties = { ...pillStyle, background: '#2d7a4f', borderColor: '#2d7a4f', color: '#fff' }

const modalOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(0,0,0,0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
}

const modalContentStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: 12,
  padding: 24,
  maxWidth: 300,
  width: '90%',
}

const commandButtonStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 20px',
  background: '#2d7a4f',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
}

const cancelButtonStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px',
  background: '#f0f0f0',
  color: '#666',
  border: 'none',
  borderRadius: 8,
  fontSize: 13,
  marginTop: 12,
  cursor: 'pointer',
}
