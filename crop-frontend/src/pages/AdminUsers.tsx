import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { usersApi, fieldsApi, sensorsApi, sensorFeatureTypesApi, generateSensorToken } from '../api'
import type { UserFieldRole, SensorOut } from '../api'
import { useAuth } from '../store'
import AppHeader from '../components/AppHeader'
import BottomNav from '../components/BottomNav'
import { TrashIcon, EditIcon, iconBtnStyle } from '../components/Icons'
import { transmitWifi } from '../lib/ggwave'

type Tab = 'users' | 'fields' | 'sensors'
type DeleteTarget =
  | { type: 'field'; id: number; name: string }
  | { type: 'user'; id: number; name: string; fieldId: number }
  | { type: 'sensor'; id: number; name: string }

type SensorModal =
  | { mode: 'add' }
  | { mode: 'edit'; sensor: SensorOut }
  | { mode: 'wifi'; sensor: SensorOut }

type GateType = 'supply' | 'drain' | null
const GATE_SUPPLY_ID = 2
const GATE_DRAIN_ID  = 3

interface SensorFeatures {
  camera: boolean
  gate: GateType
  tempHumidity: boolean
  soilMoisture: boolean
  waterTemp: boolean
  waterLevel: boolean
}

const defaultFeatures: SensorFeatures = {
  camera: false,
  gate: null,
  tempHumidity: false,
  soilMoisture: false,
  waterTemp: false,
  waterLevel: false,
}

function idsToFeatures(ids: number[]): SensorFeatures {
  return {
    camera:       ids.includes(1),
    gate:         ids.includes(GATE_SUPPLY_ID) ? 'supply'
                : ids.includes(GATE_DRAIN_ID)  ? 'drain'
                : null,
    tempHumidity: ids.includes(4),
    soilMoisture: ids.includes(5),
    waterTemp:    ids.includes(6),
    waterLevel:   ids.includes(7),
  }
}

function featuresToIds(f: SensorFeatures): number[] {
  const ids: number[] = []
  if (f.camera)            ids.push(1)
  if (f.gate === 'supply') ids.push(GATE_SUPPLY_ID)
  if (f.gate === 'drain')  ids.push(GATE_DRAIN_ID)
  if (f.tempHumidity)      ids.push(4)
  if (f.soilMoisture)      ids.push(5)
  if (f.waterTemp)         ids.push(6)
  if (f.waterLevel)        ids.push(7)
  return ids
}

const ROLE_LABEL: Record<UserFieldRole, string> = {
  owner: 'オーナー',
  manager: 'マネージャー',
  member: 'メンバー',
}

const ROLE_COLOR: Record<UserFieldRole, string> = {
  owner: '#2d7a4f',
  manager: '#1a5fa8',
  member: '#888888',
}

function canDelete(myRole: UserFieldRole | undefined, targetRole: UserFieldRole | undefined): boolean {
  if (!myRole) return false
  if (myRole === 'owner') return true
  if (myRole === 'manager') return targetRole !== 'owner'
  return false
}

function canChangeRole(myRole: UserFieldRole | undefined, targetRole: UserFieldRole | undefined): boolean {
  if (!myRole) return false
  if (myRole === 'owner') return targetRole !== 'owner'
  if (myRole === 'manager') return targetRole !== 'owner'
  return false
}

export default function AdminUsers() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const currentUser = useAuth((s) => s.user)
  const [tab, setTab] = useState<Tab>('fields')

  const [selectedFieldId, setSelectedFieldId] = useState<number | null>(null)
  const [togglingUserId, setTogglingUserId] = useState<number | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)

  const [sensorFieldId, setSensorFieldId] = useState<number | null>(null)  // null = 全て
  const [sensorModal, setSensorModal] = useState<SensorModal | null>(null)
  const [sensorForm, setSensorForm] = useState({
    name: '', active: true, field_id: 0,
    features: defaultFeatures,
    show_on_home: [] as number[],
  })
  const [wifiForm, setWifiForm] = useState({ ssid: '', password: '' })
  const [showWifiPassword, setShowWifiPassword] = useState(false)
  const [sensorSubmitting, setSensorSubmitting] = useState(false)
  const [wifiStatus, setWifiStatus] = useState('')

  const { data: fields = [] } = useQuery({ queryKey: ['fields'], queryFn: () => fieldsApi.list().then(r => r.data) })
  const manageableFields = fields.filter(f => f.my_role === 'owner' || f.my_role === 'manager')
  const myRoleInSelectedField = manageableFields.find(f => f.id === selectedFieldId)?.my_role

  const { data: fieldUsers = [], refetch: refetchUsers } = useQuery({
    queryKey: ['fieldUsers', selectedFieldId],
    queryFn: () => selectedFieldId ? usersApi.list(selectedFieldId).then(r => r.data) : Promise.resolve([]),
    enabled: !!selectedFieldId,
  })

  // sensorFieldId=null のとき「全て」= field_id 未指定で全センサー取得
  const { data: sensors = [], refetch: refetchSensors } = useQuery({
    queryKey: ['sensors', sensorFieldId],
    queryFn: () => sensorsApi.list(sensorFieldId ?? undefined).then(r => r.data),
  })

  const { data: featureTypes = [] } = useQuery({
    queryKey: ['sensorFeatureTypes'],
    queryFn: () => sensorFeatureTypesApi.list().then(r => r.data),
  })

  useEffect(() => {
    if (manageableFields.length > 0 && !selectedFieldId)
      setSelectedFieldId(manageableFields[0].id)
  }, [manageableFields.length])

  // センサータブはデフォルト null（全て）のまま — 自動選択しない

  const deleteFieldMut = useMutation({
    mutationFn: (id: number) => fieldsApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['fields'] }); setDeleteTarget(null) },
    onError: (err: any) => alert(err.response?.data?.detail ?? '削除に失敗しました'),
  })

  const deleteUserMut = useMutation({
    mutationFn: ({ userId, fieldId }: { userId: number; fieldId: number }) =>
      usersApi.removeFromField(userId, fieldId),
    onSuccess: () => { refetchUsers(); setDeleteTarget(null) },
    onError: (err: any) => alert(err.response?.data?.detail ?? '削除に失敗しました'),
  })

  const deleteSensorMut = useMutation({
    mutationFn: (id: number) => sensorsApi.delete(id),
    onSuccess: () => { refetchSensors(); setDeleteTarget(null) },
    onError: (err: any) => alert(err.response?.data?.detail ?? '削除に失敗しました'),
  })

  const handleConfirmDelete = () => {
    if (!deleteTarget) return
    if (deleteTarget.type === 'field') deleteFieldMut.mutate(deleteTarget.id)
    if (deleteTarget.type === 'user') deleteUserMut.mutate({ userId: deleteTarget.id, fieldId: (deleteTarget as any).fieldId })
    if (deleteTarget.type === 'sensor') deleteSensorMut.mutate(deleteTarget.id)
  }

  const handleRoleToggle = async (userId: number, currentRole: UserFieldRole) => {
    if (!selectedFieldId || togglingUserId === userId) return
    const newRole: UserFieldRole = currentRole === 'manager' ? 'member' : 'manager'
    setTogglingUserId(userId)
    try {
      await usersApi.updateFieldRole(userId, selectedFieldId, newRole)
      refetchUsers()
    } catch (err: any) {
      alert(err.response?.data?.detail ?? '権限変更に失敗しました')
      refetchUsers()
    } finally {
      setTogglingUserId(null)
    }
  }

  const openAddSensor = () => {
    setSensorForm({
      name: '', active: true,
      field_id: sensorFieldId ?? manageableFields[0]?.id ?? 0,
      features: defaultFeatures,
      show_on_home: [],
    })
    setSensorModal({ mode: 'add' })
  }

  const openEditSensor = (sensor: SensorOut) => {
    setSensorForm({
      name: sensor.name,
      active: sensor.active,
      field_id: sensor.field_id,
      features: idsToFeatures(sensor.features ?? []),
      show_on_home: sensor.show_on_home ?? [],
    })
    setSensorModal({ mode: 'edit', sensor })
  }

  const openWifiSensor = (sensor: SensorOut) => {
    setWifiForm({ ssid: '', password: '' })
    setWifiStatus('')
    setShowWifiPassword(false)
    setSensorModal({ mode: 'wifi', sensor })
  }

  const handleSensorSubmit = async () => {
    if (!sensorForm.name.trim() || !sensorForm.field_id) return
    setSensorSubmitting(true)
    try {
      const featureIds = featuresToIds(sensorForm.features)
      const showOnHome = sensorForm.show_on_home.filter(id => featureIds.includes(id))
      if (sensorModal?.mode === 'add') {
        const token = generateSensorToken()
        await sensorsApi.create({
          field_id: sensorForm.field_id,
          name: sensorForm.name.trim(),
          active: sensorForm.active,
          token,
          features: featureIds,
          show_on_home: showOnHome,
        })
      } else if (sensorModal?.mode === 'edit') {
        await sensorsApi.update((sensorModal as any).sensor.id, {
          name: sensorForm.name.trim(),
          active: sensorForm.active,
          field_id: sensorForm.field_id,
          features: featureIds,
          show_on_home: showOnHome,
        })
      }
      qc.invalidateQueries({ queryKey: ['sensors'] })
      setSensorModal(null)
    } catch (err: any) {
      alert(err.response?.data?.detail ?? '保存に失敗しました')
    } finally {
      setSensorSubmitting(false)
    }
  }

  const handleWifiTransmit = async () => {
    if (!wifiForm.ssid.trim() || sensorModal?.mode !== 'wifi') return
    const sensor = (sensorModal as { mode: 'wifi'; sensor: SensorOut }).sensor
    setSensorSubmitting(true)
    setWifiStatus('')
    try {
      await transmitWifi(
        'S' + wifiForm.ssid.trim(),
        'P' + wifiForm.password,
        'T' + sensor.token,
        setWifiStatus
      )
    } catch (err: any) {
      setWifiStatus('エラー: ' + (err?.message ?? '送信に失敗しました'))
    } finally {
      setSensorSubmitting(false)
    }
  }

  const handleFeatureChange = (key: keyof Omit<SensorFeatures, 'gate'>, checked: boolean) => {
    setSensorForm(f => ({ ...f, features: { ...f.features, [key]: checked } }))
  }

  const handleGateCheck = (checked: boolean) => {
    setSensorForm(f => ({
      ...f,
      features: { ...f.features, gate: checked ? 'supply' : null },
    }))
  }

  const handleGateLabelClick = () => {
    setSensorForm(f => {
      const current = f.features.gate
      if (current === null) return f
      return {
        ...f,
        features: { ...f.features, gate: current === 'supply' ? 'drain' : 'supply' },
      }
    })
  }

  const handleStarToggle = (featureId: number) => {
    setSensorForm(f => {
      const current = f.show_on_home
      const next = current.includes(featureId)
        ? current.filter(id => id !== featureId)
        : [...current, featureId]
      return { ...f, show_on_home: next }
    })
  }

  const gateFeatureId = sensorForm.features.gate === 'supply' ? GATE_SUPPLY_ID
                      : sensorForm.features.gate === 'drain'  ? GATE_DRAIN_ID
                      : null

  const tabs: { key: Tab; label: string }[] = [
    { key: 'fields', label: '圃場' },
    { key: 'users', label: 'ユーザー' },
    { key: 'sensors', label: 'センサー' },
  ]

  const wifiStatusColor = wifiStatus.startsWith('エラー') ? '#d32f2f'
    : wifiStatus === '送信完了' ? '#2d7a4f'
    : '#f59e0b'

  return (
    <div style={pageStyle}>
      <AppHeader />

      {/* タブバー */}
      <div style={{ display: 'flex', background: '#fff', borderBottom: '1px solid #eee' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            flex: 1, padding: '12px', border: 'none', background: 'none', cursor: 'pointer',
            fontSize: 14, fontWeight: tab === t.key ? 700 : 400,
            color: tab === t.key ? '#2d7a4f' : '#888',
            borderBottom: tab === t.key ? '2px solid #2d7a4f' : '2px solid transparent',
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* 圃場タブ */}
      {tab === 'fields' && (
        <div style={{ padding: '12px 16px', overflowY: 'auto', flex: 1, paddingBottom: 100 }}>
          {fields.length === 0 && (
            <p style={{ color: '#aaa', textAlign: 'center', marginTop: 40 }}>圃場が登録されていません。「＋ 圃場を追加」から圃場を作成してください。</p>
          )}
          {fields.map(field => (
            <div key={field.id} style={cardStyle}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 15 }}>{field.name}</span>
                  {field.my_role && (
                    <span style={{
                      fontSize: 11, padding: '1px 7px', borderRadius: 20,
                      background: ROLE_COLOR[field.my_role] + '22',
                      color: ROLE_COLOR[field.my_role], fontWeight: 600,
                    }}>{ROLE_LABEL[field.my_role]}</span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                  {field.area ? `${field.area}a` : ''}{field.area && field.location_note ? '　' : ''}{field.location_note ?? ''}
                </div>
              </div>
              {field.my_role === 'owner' && (
                <div style={{ display: 'flex', gap: 2 }}>
                  <button style={iconBtnStyle} title="編集" onClick={() => navigate(`/admin/fields/${field.id}/edit`)}>
                    <EditIcon size={17} color="#555" />
                  </button>
                  <button style={iconBtnStyle} title="削除"
                    onClick={() => setDeleteTarget({ type: 'field', id: field.id, name: field.name })}>
                    <TrashIcon size={17} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ユーザータブ */}
      {tab === 'users' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', paddingBottom: 100 }}>
          {manageableFields.length === 0 ? (
            <p style={{ color: '#aaa', textAlign: 'center', marginTop: 40, padding: '0 16px' }}>
              圃場を作成するか、manager以上の圃場に属するとユーザーを招待できます。
            </p>
          ) : (
            <>
              <div style={{ padding: '8px 16px', background: '#fff', borderBottom: '1px solid #eee' }}>
                <select
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #ddd', fontSize: 16 }}
                  value={selectedFieldId ?? ''}
                  onChange={e => setSelectedFieldId(Number(e.target.value))}
                >
                  {manageableFields.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
              <div style={{ padding: '12px 16px', overflowY: 'auto', flex: 1 }}>
                {fieldUsers.map(user => {
                  const isSelf = user.id === currentUser?.id
                  const showDelete = !isSelf && canDelete(myRoleInSelectedField, user.field_role)
                  const toggleable = !isSelf && canChangeRole(myRoleInSelectedField, user.field_role)
                  const isToggling = togglingUserId === user.id
                  return (
                    <div key={user.id} style={cardStyle}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 15 }}>{user.name}</div>
                        {user.email && <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{user.email}</div>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {user.field_role && (
                          <span
                            onClick={() => toggleable && !isToggling && handleRoleToggle(user.id, user.field_role!)}
                            style={{
                              fontSize: 11, padding: '3px 9px', borderRadius: 20, fontWeight: 600,
                              background: ROLE_COLOR[user.field_role] + '22',
                              color: ROLE_COLOR[user.field_role],
                              cursor: toggleable ? 'pointer' : 'default',
                              opacity: isToggling ? 0.5 : 1,
                              border: toggleable ? `1px solid ${ROLE_COLOR[user.field_role]}55` : `1px solid ${ROLE_COLOR[user.field_role]}33`,
                            }}
                          >
                            {isToggling ? '…' : ROLE_LABEL[user.field_role]}
                          </span>
                        )}
                        {showDelete ? (
                          <button style={iconBtnStyle} title="圃場から削除"
                            onClick={() => selectedFieldId && setDeleteTarget({ type: 'user', id: user.id, name: user.name, fieldId: selectedFieldId })}>
                            <TrashIcon size={17} />
                          </button>
                        ) : (
                          <div style={{ width: 32, flexShrink: 0 }} />
                        )}
                      </div>
                    </div>
                  )
                })}
                {fieldUsers.length === 0 && (
                  <p style={{ color: '#aaa', textAlign: 'center', marginTop: 40 }}>ユーザーがいません</p>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* センサータブ */}
      {tab === 'sensors' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', paddingBottom: 100 }}>
          {manageableFields.length === 0 ? (
            <p style={{ color: '#aaa', textAlign: 'center', marginTop: 40, padding: '0 16px' }}>
              圃場を作成するか、manager以上の圃場に属するとセンサーを管理できます。
            </p>
          ) : (
            <>
              <div style={{ padding: '8px 16px', background: '#fff', borderBottom: '1px solid #eee' }}>
                <select
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #ddd', fontSize: 16 }}
                  value={sensorFieldId ?? ''}
                  onChange={e => setSensorFieldId(e.target.value === '' ? null : Number(e.target.value))}
                >
                  <option value="">全て</option>
                  {manageableFields.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
              <div style={{ padding: '12px 16px', overflowY: 'auto', flex: 1 }}>
                {sensors.length === 0 && (
                  <p style={{ color: '#aaa', textAlign: 'center', marginTop: 40 }}>センサーが登録されていません。</p>
                )}
                {sensors.map(sensor => (
                  <div key={sensor.id} style={cardStyle}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600, fontSize: 15 }}>{sensor.name}</span>
                        <span style={{
                          fontSize: 11, padding: '1px 7px', borderRadius: 20, fontWeight: 600,
                          background: sensor.active ? '#2d7a4f22' : '#88888822',
                          color: sensor.active ? '#2d7a4f' : '#888',
                        }}>
                          {sensor.active ? '有効' : '無効'}
                        </span>
                      </div>
                      {(sensor.features ?? []).length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                          {(sensor.features ?? []).map(fid => {
                            const ft = featureTypes.find(f => f.id === fid)
                            const onHome = (sensor.show_on_home ?? []).includes(fid)
                            return ft ? (
                              <span key={fid} style={{
                                ...featureTagStyle,
                                background: onHome ? '#2d7a4f22' : '#eee',
                                color: onHome ? '#2d7a4f' : '#999',
                                border: onHome ? '1px solid #2d7a4f33' : '1px solid #ddd',
                              }}>
                                {onHome ? '★ ' : '☆ '}{ft.label}
                              </span>
                            ) : null
                          })}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 2 }}>
                      <button style={iconBtnStyle} title="WIFI設定" onClick={() => openWifiSensor(sensor)}>
                        <WifiIcon size={17} />
                      </button>
                      <button style={iconBtnStyle} title="編集" onClick={() => openEditSensor(sensor)}>
                        <EditIcon size={17} color="#555" />
                      </button>
                      <button style={iconBtnStyle} title="削除"
                        onClick={() => setDeleteTarget({ type: 'sensor', id: sensor.id, name: sensor.name })}>
                        <TrashIcon size={17} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* 削除確認モーダル */}
      {deleteTarget && (
        <div style={overlayStyle} onClick={() => setDeleteTarget(null)}>
          <div style={modalStyle} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700 }}>
              {deleteTarget.type === 'field' ? '圃場を削除' : deleteTarget.type === 'user' ? 'ユーザーを削除' : 'センサーを削除'}
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: 14, color: '#666', lineHeight: 1.6 }}>
              {deleteTarget.type === 'field'
                ? `「${deleteTarget.name}」を削除しますか？`
                : deleteTarget.type === 'user'
                ? `${deleteTarget.name}をこの圃場から削除しますか？`
                : `「${deleteTarget.name}」を削除しますか？`}
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={cancelBtnStyle} onClick={() => setDeleteTarget(null)}>キャンセル</button>
              <button style={deleteBtnStyle} onClick={handleConfirmDelete}>削除する</button>
            </div>
          </div>
        </div>
      )}

      {/* センサー追加・編集モーダル */}
      {(sensorModal?.mode === 'add' || sensorModal?.mode === 'edit') && (
        <div style={overlayStyle} onClick={() => setSensorModal(null)}>
          <div style={{ ...modalStyle, maxHeight: '90dvh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>
              {sensorModal.mode === 'add' ? 'センサーを追加' : 'センサーを編集'}
            </h3>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>圃場</label>
              <select
                style={{ ...inputStyle, appearance: 'auto' }}
                value={sensorForm.field_id}
                onChange={e => setSensorForm(f => ({ ...f, field_id: Number(e.target.value) }))}
              >
                {manageableFields.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>センサー名</label>
              <input
                style={inputStyle}
                value={sensorForm.name}
                onChange={e => setSensorForm(f => ({ ...f, name: e.target.value }))}
                placeholder="例：水位センサー"
                autoFocus
              />
            </div>

            <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
              <label style={{ fontSize: 14, color: '#333' }}>有効</label>
              <input
                type="checkbox"
                checked={sensorForm.active}
                onChange={e => setSensorForm(f => ({ ...f, active: e.target.checked }))}
                style={{ width: 18, height: 18, accentColor: '#2d7a4f' }}
              />
            </div>

            {/* センサーの機能 ── ★でホーム表示を機能ごとに選択 */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 10 }}>
                <label style={labelStyle}>センサーの機能</label>
                <span style={{ fontSize: 11, color: '#aaa' }}>★ = ホームに表示</span>
              </div>
              <div style={featureBoxStyle}>

                <FeatureRow
                  label="カメラ"
                  checked={sensorForm.features.camera}
                  onCheck={v => handleFeatureChange('camera', v)}
                  starred={sensorForm.show_on_home.includes(1)}
                  onStar={() => handleStarToggle(1)}
                />

                {/* 給水/排水ゲート */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
                  <input
                    type="checkbox"
                    checked={sensorForm.features.gate !== null}
                    onChange={e => handleGateCheck(e.target.checked)}
                    style={{ width: 18, height: 18, accentColor: '#2d7a4f', flexShrink: 0 }}
                  />
                  <span
                    onClick={handleGateLabelClick}
                    style={{
                      flex: 1, fontSize: 14,
                      color: sensorForm.features.gate !== null ? '#2d7a4f' : '#333',
                      fontWeight: sensorForm.features.gate !== null ? 600 : 400,
                      cursor: sensorForm.features.gate !== null ? 'pointer' : 'default',
                      userSelect: 'none',
                      borderBottom: sensorForm.features.gate !== null ? '1px dashed #2d7a4f' : 'none',
                      paddingBottom: 1,
                    }}
                  >
                    {sensorForm.features.gate === 'drain' ? '排水ゲート' : '給水ゲート'}
                    {sensorForm.features.gate !== null && (
                      <span style={{ fontSize: 11, color: '#aaa', marginLeft: 6, fontWeight: 400 }}>（タップで切替）</span>
                    )}
                  </span>
                  {gateFeatureId !== null && (
                    <span
                      onClick={() => handleStarToggle(gateFeatureId)}
                      style={{
                        fontSize: 16, cursor: 'pointer', userSelect: 'none', lineHeight: 1,
                        color: sensorForm.show_on_home.includes(gateFeatureId) ? '#f59e0b' : '#ccc',
                      }}
                    >★</span>
                  )}
                </div>

                <FeatureRow
                  label="温湿度センサ"
                  checked={sensorForm.features.tempHumidity}
                  onCheck={v => handleFeatureChange('tempHumidity', v)}
                  starred={sensorForm.show_on_home.includes(4)}
                  onStar={() => handleStarToggle(4)}
                />
                <FeatureRow
                  label="土壌水分センサ"
                  checked={sensorForm.features.soilMoisture}
                  onCheck={v => handleFeatureChange('soilMoisture', v)}
                  starred={sensorForm.show_on_home.includes(5)}
                  onStar={() => handleStarToggle(5)}
                />
                <FeatureRow
                  label="水温センサ"
                  checked={sensorForm.features.waterTemp}
                  onCheck={v => handleFeatureChange('waterTemp', v)}
                  starred={sensorForm.show_on_home.includes(6)}
                  onStar={() => handleStarToggle(6)}
                />
                <FeatureRow
                  label="水位センサ"
                  checked={sensorForm.features.waterLevel}
                  onCheck={v => handleFeatureChange('waterLevel', v)}
                  starred={sensorForm.show_on_home.includes(7)}
                  onStar={() => handleStarToggle(7)}
                />

              </div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button style={cancelBtnStyle} onClick={() => setSensorModal(null)}>キャンセル</button>
              <button
                style={saveBtnStyle}
                onClick={handleSensorSubmit}
                disabled={sensorSubmitting || !sensorForm.name.trim() || !sensorForm.field_id}
              >
                {sensorSubmitting ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WIFI設定モーダル */}
      {sensorModal?.mode === 'wifi' && (
        <div style={overlayStyle} onClick={() => !sensorSubmitting && setSensorModal(null)}>
          <div style={modalStyle} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700 }}>WIFI設定</h3>
            <p style={{ fontSize: 12, color: '#999', marginBottom: 16 }}>{(sensorModal as any).sensor.name}</p>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>SSID（ネットワーク名）</label>
              <input
                style={inputStyle}
                value={wifiForm.ssid}
                onChange={e => setWifiForm(f => ({ ...f, ssid: e.target.value }))}
                placeholder="最大15文字"
                maxLength={15}
                disabled={sensorSubmitting}
                autoFocus
              />
              <div style={{ fontSize: 11, color: wifiForm.ssid.length >= 15 ? '#d32f2f' : '#bbb', textAlign: 'right', marginTop: 3 }}>
                {wifiForm.ssid.length}/15
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>パスワード</label>
              <div style={{ position: 'relative' }}>
                <input
                  style={{ ...inputStyle, paddingRight: 40 }}
                  type={showWifiPassword ? 'text' : 'password'}
                  value={wifiForm.password}
                  onChange={e => setWifiForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="最大15文字"
                  maxLength={15}
                  disabled={sensorSubmitting}
                />
                <button
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center' }}
                  onClick={() => setShowWifiPassword(v => !v)}
                  tabIndex={-1}
                >
                  {showWifiPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
              <div style={{ fontSize: 11, color: wifiForm.password.length >= 15 ? '#d32f2f' : '#bbb', textAlign: 'right', marginTop: 3 }}>
                {wifiForm.password.length}/15
              </div>
            </div>

            {wifiStatus !== '' && (
              <div style={{
                marginBottom: 16, padding: '10px 14px', borderRadius: 8,
                background: wifiStatusColor + '18',
                border: `1px solid ${wifiStatusColor}44`,
                fontSize: 13, color: wifiStatusColor, fontWeight: 500,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                {sensorSubmitting && (
                  <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', border: `2px solid ${wifiStatusColor}`, borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
                )}
                {wifiStatus}
              </div>
            )}

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

            <div style={{ display: 'flex', gap: 8 }}>
              <button style={cancelBtnStyle} onClick={() => setSensorModal(null)} disabled={sensorSubmitting}>キャンセル</button>
              <button
                style={{ ...saveBtnStyle, opacity: (sensorSubmitting || !wifiForm.ssid.trim()) ? 0.6 : 1 }}
                onClick={handleWifiTransmit}
                disabled={sensorSubmitting || !wifiForm.ssid.trim()}
              >
                {sensorSubmitting ? '送信中…' : wifiStatus === '送信完了' ? '再送信' : '音声で送信'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FABボタン */}
      {tab !== 'sensors' || manageableFields.length > 0 ? (
        <button style={fabStyle} onClick={() => {
          if (tab === 'users') navigate('/admin/users/invite')
          else if (tab === 'fields') navigate('/admin/fields/new')
          else openAddSensor()
        }}>
          {tab === 'users' ? '＋ ユーザーを追加' : tab === 'fields' ? '＋ 圃場を追加' : '＋ センサーを追加'}
        </button>
      ) : null}

      <BottomNav />
    </div>
  )
}

// ─── 小コンポーネント ───────────────────────────────────────────

function FeatureRow({
  label, checked, onCheck, starred, onStar,
}: {
  label: string
  checked: boolean
  onCheck: (v: boolean) => void
  starred: boolean
  onStar: () => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onCheck(e.target.checked)}
        style={{ width: 18, height: 18, accentColor: '#2d7a4f', flexShrink: 0 }}
      />
      <span style={{ flex: 1, fontSize: 14, color: '#333' }}>{label}</span>
      <span
        onClick={onStar}
        style={{
          fontSize: 16, cursor: 'pointer', userSelect: 'none', lineHeight: 1,
          color: starred ? '#f59e0b' : '#ccc',
        }}
      >★</span>
    </div>
  )
}

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <path d="M1 10s3.5-7 9-7 9 7 9 7-3.5 7-9 7-9-7-9-7z" stroke="#999" strokeWidth="1.5" fill="none"/>
      <circle cx="10" cy="10" r="3" stroke="#999" strokeWidth="1.5" fill="none"/>
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <path d="M1 10s3.5-7 9-7 9 7 9 7-3.5 7-9 7-9-7-9-7z" stroke="#999" strokeWidth="1.5" fill="none"/>
      <circle cx="10" cy="10" r="3" stroke="#999" strokeWidth="1.5" fill="none"/>
      <line x1="3" y1="3" x2="17" y2="17" stroke="#999" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

function WifiIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <path d="M2.5 7.5a10.5 10.5 0 0115 0" stroke="#555" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
      <path d="M5 10.5a7 7 0 0110 0" stroke="#555" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
      <path d="M7.5 13.5a3.5 3.5 0 015 0" stroke="#555" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
      <circle cx="10" cy="16.5" r="1" fill="#555"/>
    </svg>
  )
}

const pageStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', height: '100dvh', background: '#f5f5f0' }
const cardStyle: React.CSSProperties = { background: '#fff', borderRadius: 12, padding: '12px 16px', marginBottom: 8, display: 'flex', alignItems: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }
const overlayStyle: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }
const modalStyle: React.CSSProperties = { background: '#fff', borderRadius: 12, padding: 24, width: '100%', maxWidth: 400 }
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, color: '#555', marginBottom: 0, fontWeight: 500 }
const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 16, boxSizing: 'border-box' }
const cancelBtnStyle: React.CSSProperties = { flex: 1, padding: '12px', border: '1px solid #ddd', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 14 }
const deleteBtnStyle: React.CSSProperties = { flex: 1, padding: '12px', border: 'none', borderRadius: 8, background: '#d32f2f', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600 }
const saveBtnStyle: React.CSSProperties = { flex: 1, padding: '12px', border: 'none', borderRadius: 8, background: '#2d7a4f', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600 }
const featureBoxStyle: React.CSSProperties = { background: '#f8f9fa', borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8, border: '1px solid #eee' }
const featureTagStyle: React.CSSProperties = { fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 600 }
const fabStyle: React.CSSProperties = {
  position: 'fixed', bottom: 64, left: '50%', transform: 'translateX(-50%)',
  background: '#2d7a4f', color: '#fff', border: 'none', borderRadius: 10,
  padding: '14px 28px', fontSize: 16, fontWeight: 600, cursor: 'pointer',
  boxShadow: '0 4px 16px rgba(45,122,79,0.35)', whiteSpace: 'nowrap', zIndex: 50,
  width: '90%',
}
