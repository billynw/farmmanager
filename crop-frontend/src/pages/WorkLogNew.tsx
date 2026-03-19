import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { workTypesApi, workLogsApi, itemsApi } from '../api'

interface AgroRow { product_name: string; quantity: string; dilution: string; unit: string }

export default function WorkLogNew() {
  const { id } = useParams<{ id: string }>()
  const itemId = Number(id)
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [workTypeId, setWorkTypeId] = useState<number | undefined>()
  const [workedAt, setWorkedAt] = useState(() => new Date().toISOString().slice(0, 16))
  const [memo, setMemo] = useState('')
  const [showAgro, setShowAgro] = useState(false)
  const [agroRows, setAgroRows] = useState<AgroRow[]>([{ product_name: '', quantity: '', dilution: '', unit: 'L' }])
  const [photos, setPhotos] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])

  const { data: item } = useQuery({ queryKey: ['item', itemId], queryFn: () => itemsApi.get(itemId).then(r => r.data) })
  const { data: workTypes = [] } = useQuery({ queryKey: ['work-types'], queryFn: () => workTypesApi.list().then(r => r.data) })

  const mutation = useMutation({
    mutationFn: async () => {
      const log = await workLogsApi.create({
        item_id: itemId,
        work_type_id: workTypeId,
        worked_at: new Date(workedAt).toISOString(),
        memo: memo || undefined,
        agro_inputs: showAgro ? agroRows.filter(r => r.product_name).map(r => ({
          product_name: r.product_name, quantity: r.quantity || undefined,
          dilution: r.dilution || undefined, unit: r.unit || undefined,
        })) : [],
      })
      for (const file of photos) {
        await workLogsApi.uploadPhoto(log.data.id, file)
      }
      return log.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['work-logs', itemId] })
      navigate(`/items/${itemId}`)
    },
  })

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    setPhotos(prev => [...prev, ...files])
    files.forEach(f => {
      const reader = new FileReader()
      reader.onload = ev => setPreviews(prev => [...prev, ev.target?.result as string])
      reader.readAsDataURL(f)
    })
  }

  const updateAgro = (i: number, key: keyof AgroRow, val: string) => {
    setAgroRows(rows => rows.map((r, idx) => idx === i ? { ...r, [key]: val } : r))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: '#f5f5f0' }}>
      {/* ヘッダー */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: '#fff', borderBottom: '1px solid #eee' }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#444' }}>←</button>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>作業を記録</div>
          <div style={{ fontSize: 12, color: '#999' }}>{item?.name}</div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {/* 作業種別 */}
        <label style={labelStyle}>作業の種類</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
          {workTypes.map(wt => (
            <button key={wt.id} onClick={() => setWorkTypeId(wt.id === workTypeId ? undefined : wt.id)}
              style={{
                padding: '8px 14px', borderRadius: 20, border: `2px solid ${workTypeId === wt.id ? wt.color : '#ddd'}`,
                background: workTypeId === wt.id ? wt.color + '22' : '#fff',
                color: workTypeId === wt.id ? wt.color : '#555',
                fontWeight: workTypeId === wt.id ? 700 : 400, fontSize: 14, cursor: 'pointer',
              }}>
              {wt.name}
            </button>
          ))}
        </div>

        {/* 日時 */}
        <label style={labelStyle}>日時</label>
        <input type="datetime-local" value={workedAt} onChange={e => setWorkedAt(e.target.value)} style={{ ...inputStyle, marginBottom: 20 }} />

        {/* メモ */}
        <label style={labelStyle}>メモ（任意）</label>
        <textarea value={memo} onChange={e => setMemo(e.target.value)} rows={3} placeholder="作業内容、気づきなど..."
          style={{ ...inputStyle, resize: 'none', lineHeight: 1.6, marginBottom: 20 }} />

        {/* 写真 */}
        <label style={labelStyle}>写真（任意）</label>
        <label style={{ display: 'block', marginBottom: 20 }}>
          <input type="file" accept="image/*" capture="environment" multiple onChange={handlePhoto} style={{ display: 'none' }} />
          <div style={{ border: '2px dashed #ddd', borderRadius: 10, padding: '16px', textAlign: 'center', color: '#aaa', cursor: 'pointer', fontSize: 14 }}>
            📷 タップして撮影・選択
          </div>
        </label>
        {previews.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
            {previews.map((src, i) => <img key={i} src={src} alt="" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8 }} />)}
          </div>
        )}

        {/* 農薬・肥料 */}
        <button onClick={() => setShowAgro(!showAgro)}
          style={{ width: '100%', padding: '12px', border: '1px solid #ddd', borderRadius: 8, background: showAgro ? '#fff8f0' : '#fff', color: '#b36b00', fontSize: 14, cursor: 'pointer', marginBottom: showAgro ? 12 : 20 }}>
          🧪 農薬・肥料を記録する {showAgro ? '▲' : '▼'}
        </button>

        {showAgro && (
          <div style={{ marginBottom: 20 }}>
            {agroRows.map((row, i) => (
              <div key={i} style={{ background: '#fff', borderRadius: 10, padding: 12, marginBottom: 8, border: '1px solid #fde8c8' }}>
                <input placeholder="製品名 *" value={row.product_name} onChange={e => updateAgro(i, 'product_name', e.target.value)} style={{ ...inputStyle, marginBottom: 6 }} />
                <div style={{ display: 'flex', gap: 6 }}>
                  <input placeholder="使用量" value={row.quantity} onChange={e => updateAgro(i, 'quantity', e.target.value)} style={{ ...inputStyle, flex: 1 }} />
                  <select value={row.unit} onChange={e => updateAgro(i, 'unit', e.target.value)} style={{ ...inputStyle, width: 70 }}>
                    {['L', 'mL', 'kg', 'g'].map(u => <option key={u}>{u}</option>)}
                  </select>
                </div>
                <input placeholder="希釈倍率（例: 500倍）" value={row.dilution} onChange={e => updateAgro(i, 'dilution', e.target.value)} style={{ ...inputStyle, marginTop: 6 }} />
              </div>
            ))}
            <button onClick={() => setAgroRows(r => [...r, { product_name: '', quantity: '', dilution: '', unit: 'L' }])}
              style={{ width: '100%', padding: '8px', border: '1px dashed #fdb', borderRadius: 8, background: '#fff', color: '#b36b00', fontSize: 13, cursor: 'pointer' }}>
              ＋ 追加
            </button>
          </div>
        )}
      </div>

      {/* 保存ボタン */}
      <div style={{ padding: '12px 16px', background: '#fff', borderTop: '1px solid #eee' }}>
        <button onClick={() => mutation.mutate()} disabled={mutation.isPending}
          style={{ display: 'block', width: '100%', padding: '14px', background: '#2d7a4f', color: '#fff', border: 'none', borderRadius: 10, fontSize: 16, fontWeight: 600, cursor: 'pointer', opacity: mutation.isPending ? 0.6 : 1 }}>
          {mutation.isPending ? '保存中...' : '保存する'}
        </button>
        {mutation.isError && <p style={{ color: '#c0392b', fontSize: 13, marginTop: 8, textAlign: 'center' }}>保存に失敗しました</p>}
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, color: '#444', fontWeight: 600, marginBottom: 8 }
const inputStyle: React.CSSProperties = { display: 'block', width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 15, boxSizing: 'border-box', background: '#fff' }
