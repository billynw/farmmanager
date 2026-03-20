import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { itemsApi, workLogsApi } from '../api'
import type { WorkLog } from '../api'
import AppHeader from '../components/AppHeader'
import BottomNav from '../components/BottomNav'
import { TrashIcon, EditIcon, iconBtnStyle } from '../components/Icons'

export default function ItemDetail() {
  const { id } = useParams<{ id: string }>()
  const itemId = Number(id)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [modalImage, setModalImage] = useState<string | null>(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)

  const { data: item } = useQuery({ queryKey: ['item', itemId], queryFn: () => itemsApi.get(itemId).then(r => r.data) })
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['work-logs', itemId],
    queryFn: () => workLogsApi.list({ item_id: itemId, limit: 100 }).then(r => r.data),
  })

  const deleteLog = useMutation({
    mutationFn: workLogsApi.delete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['work-logs', itemId] }),
  })

  const deleteItem = useMutation({
    mutationFn: itemsApi.delete,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['items'] })
      navigate('/items')
    },
  })

  if (!item) return <div style={{ padding: 24, color: '#888' }}>読み込み中...</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: '#f5f5f0' }}>
      <AppHeader
        backTo="/items"
        title={item.name}
        subtitle={[
          item.variety,
          item.field?.name ?? '圃場未設定',
          item.planted_at ? `定植 ${item.planted_at}` : undefined,
        ].filter(Boolean).join(' · ')}
        actions={
          <>
            <button onClick={() => navigate(`/items/${itemId}/edit`)} style={iconBtnStyle} title="編集">
              <EditIcon size={18} color="#555" />
            </button>
            <button onClick={() => setShowDeleteModal(true)} style={iconBtnStyle} title="削除">
              <TrashIcon size={18} />
            </button>
          </>
        }
      />

      <div style={{ display: 'flex', background: '#fff', borderBottom: '1px solid #eee' }}>
        <div style={activeTabStyle}>作業記録</div>
        <div style={tabStyle} onClick={() => navigate(`/items/${itemId}/harvests`)}>収穫記録</div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', paddingBottom: 136 }}>
        {isLoading && <p style={{ color: '#888', textAlign: 'center', marginTop: 30 }}>読み込み中...</p>}
        {!isLoading && logs.length === 0 && <p style={{ color: '#aaa', textAlign: 'center', marginTop: 30 }}>作業記録がありません</p>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {logs.map(log => (
            <LogCard
              key={log.id}
              log={log}
              onDelete={() => { if (confirm('この記録を削除しますか？')) deleteLog.mutate(log.id) }}
              onImageClick={setModalImage}
              onEdit={() => navigate(`/items/${itemId}/log/${log.id}/edit`)}
            />
          ))}
        </div>
      </div>

      <div style={{ position: 'fixed', bottom: 56, left: 0, right: 0, padding: '12px 16px', background: '#fff', borderTop: '1px solid #eee', zIndex: 50 }}>
        <button style={addBtnStyle} onClick={() => navigate(`/items/${itemId}/log/new`)}>
          ＋ 作業を記録する
        </button>
      </div>

      {modalImage && (
        <div style={modalOverlayStyle} onClick={() => setModalImage(null)}>
          <div style={modalContentStyle} onClick={e => e.stopPropagation()}>
            <img src={modalImage} alt="" style={modalImageStyle} />
            <button style={modalCloseStyle} onClick={() => setModalImage(null)}>×</button>
          </div>
        </div>
      )}

      {showDeleteModal && (
        <div style={modalOverlayStyle} onClick={() => setShowDeleteModal(false)}>
          <div style={deleteModalStyle} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 600 }}>作物を削除</h3>
            <p style={{ margin: '0 0 20px', fontSize: 14, color: '#666', lineHeight: 1.6 }}>
              「{item.name}」を削除しますか？<br />
              <strong style={{ color: '#d32f2f' }}>この作物に紐づくすべての作業記録と収穫記録も削除されます。</strong>
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={{ flex: 1, padding: '12px', border: '1px solid #ddd', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 14 }}
                onClick={() => setShowDeleteModal(false)}>キャンセル</button>
              <button style={{ flex: 1, padding: '12px', border: 'none', borderRadius: 8, background: '#d32f2f', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}
                onClick={() => deleteItem.mutate(itemId)}>削除する</button>
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  )
}

function LogCard({ log, onDelete, onImageClick, onEdit }: {
  log: WorkLog
  onDelete: () => void
  onImageClick: (url: string) => void
  onEdit: () => void
}) {
  const dt = new Date(log.worked_at)
  const dateStr = `${dt.getFullYear()}/${dt.getMonth()+1}/${dt.getDate()} ${dt.getHours()}:${String(dt.getMinutes()).padStart(2,'0')}`
  const color = log.work_type?.color ?? '#888'

  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: '12px 14px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', borderLeft: `4px solid ${color}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1 }}>
          {log.work_type && (
            <span style={{ fontSize: 12, background: color + '22', color, padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>
              {log.work_type.name}
            </span>
          )}
          <span style={{ fontSize: 12, color: '#999' }}>{dateStr}</span>
        </div>
        <div style={{ display: 'flex', gap: 2 }}>
          <button onClick={onEdit} style={iconBtnStyle} title="編集">
            <EditIcon size={17} />
          </button>
          <button onClick={onDelete} style={iconBtnStyle} title="削除">
            <TrashIcon size={17} />
          </button>
        </div>
      </div>
      {log.memo && <p style={{ margin: '8px 0 0', fontSize: 14, color: '#333', lineHeight: 1.5 }}>{log.memo}</p>}
      {log.agro_inputs.length > 0 && (
        <div style={{ marginTop: 8, padding: '6px 10px', background: '#fff8f0', borderRadius: 6, fontSize: 12, color: '#b36b00' }}>
          🧪 {log.agro_inputs.map(a => `${a.product_name}${a.quantity ? ` ${a.quantity}${a.unit ?? ''}` : ''}`).join(' / ')}
        </div>
      )}
      {log.photos.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          {log.photos.map(p => (
            <img key={p.id} src={p.file_path} alt=""
              style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 6, cursor: 'pointer' }}
              onClick={() => onImageClick(p.file_path)}
            />
          ))}
        </div>
      )}
      {log.user && <div style={{ fontSize: 11, color: '#bbb', marginTop: 6 }}>記録: {log.user.name}</div>}
    </div>
  )
}

const tabStyle: React.CSSProperties = { flex: 1, textAlign: 'center', padding: '10px', fontSize: 14, color: '#888', cursor: 'pointer' }
const activeTabStyle: React.CSSProperties = { ...tabStyle, color: '#2d7a4f', borderBottom: '2px solid #2d7a4f', fontWeight: 600 }
const addBtnStyle: React.CSSProperties = { display: 'block', width: '100%', padding: '14px', background: '#2d7a4f', color: '#fff', border: 'none', borderRadius: 10, fontSize: 16, fontWeight: 600, cursor: 'pointer' }
const modalOverlayStyle: React.CSSProperties = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }
const modalContentStyle: React.CSSProperties = { position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }
const modalImageStyle: React.CSSProperties = { maxWidth: '100%', maxHeight: '90vh', objectFit: 'contain', borderRadius: 8 }
const modalCloseStyle: React.CSSProperties = { position: 'absolute', top: -40, right: 0, background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', fontSize: 32, width: 40, height: 40, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }
const deleteModalStyle: React.CSSProperties = { background: '#fff', borderRadius: 12, padding: 24, maxWidth: 400, width: '90%' }
