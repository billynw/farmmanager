import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { itemsApi, fieldsApi, exportApi } from '../api'
import type { Item } from '../api'
import { useAuth } from '../store'

const STATUS_LABEL: Record<string, string> = { growing: '栽培中', finished: '終了' }
const STATUS_COLOR: Record<string, string> = { growing: '#2d7a4f', finished: '#888' }

async function downloadCsv(fetchFn: () => Promise<Response>, filename: string) {
  const res = await fetchFn()
  if (!res.ok) { alert('ダウンロードに失敗しました'); return }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

export default function ItemList() {
  const [fieldFilter, setFieldFilter] = useState<number | undefined>()
  const [statusFilter, setStatusFilter] = useState<string>('growing')
  const [showExport, setShowExport] = useState(false)
  const [exportFrom, setExportFrom] = useState('')
  const [exportTo, setExportTo] = useState('')
  const navigate = useNavigate()
  const logout = useAuth((s) => s.logout)
  const user = useAuth((s) => s.user)

  const { data: fields = [] } = useQuery({ queryKey: ['fields'], queryFn: () => fieldsApi.list().then(r => r.data) })
  const { data: items = [], isLoading } = useQuery({
    queryKey: ['items', fieldFilter, statusFilter],
    queryFn: () => itemsApi.list({ field_id: fieldFilter, status: statusFilter || undefined }).then(r => r.data),
  })

  return (
    <div style={pageStyle}>
      {/* ヘッダー */}
      <div style={headerStyle}>
        <span style={{ fontSize: 20, fontWeight: 700, color: '#1a1a1a' }}>🌱 CropWorks</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: '#666' }}>{user?.name}</span>
          <button onClick={() => setShowExport(true)} style={{ ...smallBtnStyle, color: '#2d7a4f', borderColor: '#2d7a4f' }}>CSV</button>
          <button onClick={logout} style={smallBtnStyle}>ログアウト</button>
        </div>
      </div>

      {/* フィルター */}
      <div style={{ display: 'flex', gap: 8, padding: '12px 16px', background: '#fff', borderBottom: '1px solid #eee' }}>
        <select style={selectStyle} value={fieldFilter ?? ''} onChange={e => setFieldFilter(e.target.value ? Number(e.target.value) : undefined)}>
          <option value="">全圃場</option>
          {fields.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <select style={selectStyle} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">全ステータス</option>
          <option value="growing">栽培中</option>
          <option value="finished">終了</option>
        </select>
      </div>

      {/* 作物リスト */}
      <div style={{ padding: '12px 16px', flex: 1, overflowY: 'auto' }}>
        {isLoading && <p style={{ color: '#888', textAlign: 'center', marginTop: 40 }}>読み込み中...</p>}
        {!isLoading && items.length === 0 && (
          <p style={{ color: '#aaa', textAlign: 'center', marginTop: 40 }}>作物が登録されていません</p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map(item => <ItemCard key={item.id} item={item} onClick={() => navigate(`/items/${item.id}`)} />)}
        </div>
      </div>

      {/* CSV エクスポートモーダル */}
      {showExport && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}
          onClick={() => setShowExport(false)}>
          <div style={{ background: '#fff', width: '100%', borderRadius: '16px 16px 0 0', padding: '20px 16px 32px' }}
            onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>CSV エクスポート</h3>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <label style={{ flex: 1, fontSize: 13, color: '#555', display: 'flex', flexDirection: 'column', gap: 4 }}>
                開始日
                <input type="date" value={exportFrom} onChange={e => setExportFrom(e.target.value)}
                  style={{ padding: '10px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 15 }} />
              </label>
              <label style={{ flex: 1, fontSize: 13, color: '#555', display: 'flex', flexDirection: 'column', gap: 4 }}>
                終了日
                <input type="date" value={exportTo} onChange={e => setExportTo(e.target.value)}
                  style={{ padding: '10px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 15 }} />
              </label>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button style={{ padding: '13px', background: '#2d7a4f', color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}
                onClick={() => downloadCsv(
                  () => exportApi.workLogsCsv({ from: exportFrom || undefined, to: exportTo || undefined }),
                  `work_logs_${exportFrom || 'all'}.csv`
                )}>
                📋 作業ログをダウンロード
              </button>
              <button style={{ padding: '13px', background: '#1a5c38', color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}
                onClick={() => downloadCsv(
                  () => exportApi.harvestsCsv({ from: exportFrom || undefined, to: exportTo || undefined }),
                  `harvests_${exportFrom || 'all'}.csv`
                )}>
                🌾 収穫記録をダウンロード
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FAB: 作物追加 */}
      <button style={fabStyle} onClick={() => navigate('/items/new')}>＋ 作物を追加</button>
    </div>
  )
}

function ItemCard({ item, onClick }: { item: Item; onClick: () => void }) {
  return (
    <div onClick={onClick} style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 16, color: '#1a1a1a' }}>{item.name}</div>
          {item.variety && <div style={{ fontSize: 13, color: '#666', marginTop: 2 }}>{item.variety}</div>}
          {item.field && <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>📍 {item.field.name}</div>}
        </div>
        <span style={{ fontSize: 12, background: STATUS_COLOR[item.status] + '22', color: STATUS_COLOR[item.status], padding: '3px 8px', borderRadius: 20, fontWeight: 600 }}>
          {STATUS_LABEL[item.status]}
        </span>
      </div>
      {item.planted_at && (
        <div style={{ fontSize: 12, color: '#aaa', marginTop: 8 }}>定植: {item.planted_at}</div>
      )}
    </div>
  )
}

const pageStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', height: '100dvh', background: '#f5f5f0', position: 'relative' }
const headerStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', background: '#fff', borderBottom: '1px solid #eee' }
const cardStyle: React.CSSProperties = { background: '#fff', borderRadius: 12, padding: '14px 16px', cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }
const selectStyle: React.CSSProperties = { flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14, background: '#fff' }
const fabStyle: React.CSSProperties = {
  position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
  background: '#2d7a4f', color: '#fff', border: 'none', borderRadius: 50,
  padding: '14px 28px', fontSize: 16, fontWeight: 600, cursor: 'pointer',
  boxShadow: '0 4px 16px rgba(45,122,79,0.35)', whiteSpace: 'nowrap',
}
const smallBtnStyle: React.CSSProperties = { fontSize: 12, padding: '4px 10px', border: '1px solid #ddd', borderRadius: 6, background: '#fff', cursor: 'pointer', color: '#666' }
