import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { itemsApi, harvestsApi } from '../api'
import type { Harvest } from '../api'
import AppHeader from '../components/AppHeader'
import BottomNav from '../components/BottomNav'
import { TrashIcon, EditIcon, iconBtnStyle } from '../components/Icons'

export default function Harvests() {
  const { id } = useParams<{ id: string }>()
  const itemId = Number(id)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null)

  const { data: item } = useQuery({
    queryKey: ['item', itemId],
    queryFn: () => itemsApi.get(itemId).then(r => r.data),
  })
  const { data: harvests = [], isLoading } = useQuery({
    queryKey: ['harvests', itemId],
    queryFn: () => harvestsApi.list({ item_id: itemId }).then(r => r.data),
  })

  const deleteMut = useMutation({
    mutationFn: harvestsApi.delete,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['harvests', itemId] }); setDeleteTargetId(null) },
  })

  const totals = harvests.reduce<Record<string, number>>((acc, h) => {
    if (h.quantity != null) {
      const u = h.unit ?? '?'
      acc[u] = (acc[u] ?? 0) + h.quantity
    }
    return acc
  }, {})

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: '#f5f5f0' }}>
      <AppHeader
        backTo={`/items/${itemId}`}
        title={item?.name ?? '...'}
        subtitle={[item?.variety, item?.field?.name ?? '圃場未設定'].filter(Boolean).join(' · ')}
      />

      <div style={{ display: 'flex', background: '#fff', borderBottom: '1px solid #eee' }}>
        <div style={tabStyle} onClick={() => navigate(`/items/${itemId}`)}>作業記録</div>
        <div style={activeTabStyle}>収穫記録</div>
      </div>

      {Object.keys(totals).length > 0 && (
        <div style={{ margin: '12px 16px 0', padding: '10px 14px', background: '#e8f5ee', borderRadius: 10, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: '#2d7a4f', fontWeight: 600 }}>🌾 合計収穫量</span>
          {Object.entries(totals).map(([unit, total]) => (
            <span key={unit} style={{ fontSize: 14, color: '#1a5c38', fontWeight: 700 }}>
              {total % 1 === 0 ? total : total.toFixed(2)} {unit}
            </span>
          ))}
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', paddingBottom: 136 }}>
        {isLoading && <p style={{ color: '#888', textAlign: 'center', marginTop: 30 }}>読み込み中...</p>}
        {!isLoading && harvests.length === 0 && (
          <p style={{ color: '#aaa', textAlign: 'center', marginTop: 40 }}>収穫記録がありません</p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {harvests.map(h => (
            <HarvestCard key={h.id} harvest={h}
              onEdit={() => navigate(`/items/${itemId}/harvests/${h.id}/edit`)}
              onDelete={() => setDeleteTargetId(h.id)}
            />
          ))}
        </div>
      </div>

      <div style={{ position: 'fixed', bottom: 56, left: 0, right: 0, padding: '12px 16px', zIndex: 50 }}>
        <button style={addBtnStyle} onClick={() => navigate(`/items/${itemId}/harvests/new`)}>＋ 収穫を記録する</button>
      </div>

      {deleteTargetId !== null && (
        <div style={overlayStyle} onClick={() => setDeleteTargetId(null)}>
          <div style={deleteModalStyle} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700 }}>収穫記録を削除</h3>
            <p style={{ margin: '0 0 20px', fontSize: 14, color: '#666', lineHeight: 1.6 }}>この収穫記録を削除しますか？</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={cancelBtnStyle} onClick={() => setDeleteTargetId(null)}>キャンセル</button>
              <button style={deleteBtnStyle} onClick={() => deleteMut.mutate(deleteTargetId)}>削除する</button>
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  )
}

function HarvestCard({ harvest: h, onEdit, onDelete }: { harvest: Harvest; onEdit: () => void; onDelete: () => void }) {
  const d = new Date(h.harvested_at + 'T00:00:00')
  const dateStr = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: '12px 14px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', borderLeft: '4px solid #2d7a4f' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', flex: 1 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#1a1a1a' }}>{dateStr}</span>
          {h.quantity != null && (
            <span style={{ fontSize: 15, fontWeight: 700, color: '#2d7a4f' }}>
              {h.quantity % 1 === 0 ? h.quantity : Number(h.quantity).toFixed(2)} {h.unit ?? ''}
            </span>
          )}
          {h.shipped && (
            <span style={{ fontSize: 11, background: '#fff3e0', color: '#e65100', padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>出荷済</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
          <button onClick={onEdit} style={iconBtnStyle} title="編集"><EditIcon size={17} /></button>
          <button onClick={onDelete} style={iconBtnStyle} title="削除"><TrashIcon size={17} /></button>
        </div>
      </div>
      {h.memo && <p style={{ margin: '8px 0 0', fontSize: 14, color: '#555', lineHeight: 1.5 }}>{h.memo}</p>}
    </div>
  )
}

const tabStyle: React.CSSProperties = { flex: 1, textAlign: 'center', padding: '10px', fontSize: 14, color: '#888', cursor: 'pointer' }
const activeTabStyle: React.CSSProperties = { ...tabStyle, color: '#2d7a4f', borderBottom: '2px solid #2d7a4f', fontWeight: 600 }
const addBtnStyle: React.CSSProperties = { display: 'block', width: '100%', padding: '14px', background: '#2d7a4f', color: '#fff', border: 'none', borderRadius: 10, fontSize: 16, fontWeight: 600, cursor: 'pointer' }
const overlayStyle: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }
const deleteModalStyle: React.CSSProperties = { background: '#fff', borderRadius: 12, padding: 24, width: '100%', maxWidth: 400 }
const cancelBtnStyle: React.CSSProperties = { flex: 1, padding: '12px', border: '1px solid #ddd', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 14 }
const deleteBtnStyle: React.CSSProperties = { flex: 1, padding: '12px', border: 'none', borderRadius: 8, background: '#d32f2f', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600 }
