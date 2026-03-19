
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { itemsApi, workLogsApi } from '../api'
import type { WorkLog } from '../api'

export default function ItemDetail() {
  const { id } = useParams<{ id: string }>()
  const itemId = Number(id)
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data: item } = useQuery({ queryKey: ['item', itemId], queryFn: () => itemsApi.get(itemId).then(r => r.data) })
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['work-logs', itemId],
    queryFn: () => workLogsApi.list({ item_id: itemId, limit: 100 }).then(r => r.data),
  })

  const deleteLog = useMutation({
    mutationFn: workLogsApi.delete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['work-logs', itemId] }),
  })

  if (!item) return <div style={{ padding: 24, color: '#888' }}>読み込み中...</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: '#f5f5f0' }}>
      {/* ヘッダー */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: '#fff', borderBottom: '1px solid #eee' }}>
        <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#444', padding: 0 }}>←</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 18, color: '#1a1a1a' }}>{item.name}</div>
          <div style={{ fontSize: 12, color: '#999' }}>
            {item.variety && `${item.variety} · `}{item.field?.name ?? '圃場未設定'}
            {item.planted_at && ` · 定植 ${item.planted_at}`}
          </div>
        </div>
        <button onClick={() => navigate(`/items/${itemId}/edit`)} style={smallBtnStyle}>編集</button>
      </div>

      {/* タブライン */}
      <div style={{ display: 'flex', background: '#fff', borderBottom: '1px solid #eee' }}>
        <div style={activeTabStyle}>作業ログ</div>
        <div style={tabStyle} onClick={() => navigate(`/items/${itemId}/harvests`)}>収穫記録</div>
      </div>

      {/* ログ一覧 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
        {isLoading && <p style={{ color: '#888', textAlign: 'center', marginTop: 30 }}>読み込み中...</p>}
        {!isLoading && logs.length === 0 && <p style={{ color: '#aaa', textAlign: 'center', marginTop: 30 }}>作業記録がありません</p>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {logs.map(log => (
            <LogCard key={log.id} log={log} onDelete={() => {
              if (confirm('この記録を削除しますか？')) deleteLog.mutate(log.id)
            }} />
          ))}
        </div>
      </div>

      {/* 作業記録ボタン */}
      <div style={{ padding: '12px 16px', background: '#fff', borderTop: '1px solid #eee' }}>
        <button style={addBtnStyle} onClick={() => navigate(`/items/${itemId}/log/new`)}>
          ＋ 作業を記録する
        </button>
      </div>
    </div>
  )
}

function LogCard({ log, onDelete }: { log: WorkLog; onDelete: () => void }) {
  const dt = new Date(log.worked_at)
  const dateStr = `${dt.getFullYear()}/${dt.getMonth()+1}/${dt.getDate()} ${dt.getHours()}:${String(dt.getMinutes()).padStart(2,'0')}`
  const color = log.work_type?.color ?? '#888'

  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: '12px 14px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', borderLeft: `4px solid ${color}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {log.work_type && (
            <span style={{ fontSize: 12, background: color + '22', color, padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>
              {log.work_type.name}
            </span>
          )}
          <span style={{ fontSize: 12, color: '#999' }}>{dateStr}</span>
        </div>
        <button onClick={onDelete} style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer', fontSize: 16 }}>×</button>
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
            <img key={p.id} src={p.file_path} alt="" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 6 }} />
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
const smallBtnStyle: React.CSSProperties = { fontSize: 12, padding: '4px 10px', border: '1px solid #ddd', borderRadius: 6, background: '#fff', cursor: 'pointer', color: '#666' }
