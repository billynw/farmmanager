import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { itemsApi, harvestsApi } from '../api'
import type { Harvest } from '../api'
import AppHeader from '../components/AppHeader'
import BottomNav from '../components/BottomNav'
import { TrashIcon, EditIcon, iconBtnStyle } from '../components/Icons'

type FormData = {
  harvested_at: string
  quantity: string
  unit: string
  shipped: boolean
  memo: string
}

export default function Harvests() {
  const { id } = useParams<{ id: string }>()
  const itemId = Number(id)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [editTarget, setEditTarget] = useState<Harvest | null>(null)
  const [showForm, setShowForm] = useState(false)

  const { data: item } = useQuery({
    queryKey: ['item', itemId],
    queryFn: () => itemsApi.get(itemId).then(r => r.data),
  })
  const { data: harvests = [], isLoading } = useQuery({
    queryKey: ['harvests', itemId],
    queryFn: () => harvestsApi.list({ item_id: itemId }).then(r => r.data),
  })

  const { register, handleSubmit, reset, setValue, formState: { isSubmitting } } = useForm<FormData>({
    defaultValues: { harvested_at: new Date().toISOString().slice(0, 10), unit: 'kg', shipped: false },
  })

  const createMut = useMutation({
    mutationFn: (d: FormData) => harvestsApi.create({
      item_id: itemId,
      harvested_at: d.harvested_at,
      quantity: d.quantity ? Number(d.quantity) : undefined,
      unit: d.unit || undefined,
      shipped: d.shipped,
      memo: d.memo || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['harvests', itemId] })
      reset({ harvested_at: new Date().toISOString().slice(0, 10), unit: 'kg', shipped: false, memo: '', quantity: '' })
      setShowForm(false)
    },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, d }: { id: number; d: FormData }) => harvestsApi.update(id, {
      item_id: itemId,
      harvested_at: d.harvested_at,
      quantity: d.quantity ? Number(d.quantity) : undefined,
      unit: d.unit || undefined,
      shipped: d.shipped,
      memo: d.memo || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['harvests', itemId] })
      setEditTarget(null)
      setShowForm(false)
      reset({ harvested_at: new Date().toISOString().slice(0, 10), unit: 'kg', shipped: false, memo: '', quantity: '' })
    },
  })

  const deleteMut = useMutation({
    mutationFn: harvestsApi.delete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['harvests', itemId] }),
  })

  const openNew = () => {
    setEditTarget(null)
    reset({ harvested_at: new Date().toISOString().slice(0, 10), unit: 'kg', shipped: false, memo: '', quantity: '' })
    setShowForm(true)
  }

  const openEdit = (h: Harvest) => {
    setEditTarget(h)
    setValue('harvested_at', h.harvested_at)
    setValue('quantity', h.quantity != null ? String(h.quantity) : '')
    setValue('unit', h.unit ?? 'kg')
    setValue('shipped', h.shipped)
    setValue('memo', h.memo ?? '')
    setShowForm(true)
  }

  const onSubmit = (d: FormData) => {
    if (editTarget) updateMut.mutate({ id: editTarget.id, d })
    else createMut.mutate(d)
  }

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
        <div style={tabStyle} onClick={() => navigate(`/items/${itemId}`)}>作業ログ</div>
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
              onEdit={() => openEdit(h)}
              onDelete={() => { if (confirm('この収穫記録を削除しますか？')) deleteMut.mutate(h.id) }}
            />
          ))}
        </div>
      </div>

      {showForm && (
        <div style={overlayStyle} onClick={() => setShowForm(false)}>
          <div style={drawerStyle} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                {editTarget ? '収穫記録を編集' : '収穫を記録する'}
              </h3>
              <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#444', padding: 0 }}>×</button>
            </div>
            <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={labelStyle}>
                収穫日 <span style={{ color: '#e53' }}>*</span>
                <input type="date" {...register('harvested_at', { required: true })} style={inputStyle} />
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <label style={{ ...labelStyle, flex: 2 }}>
                  収穫量
                  <input type="number" step="0.01" min="0" placeholder="0.00" {...register('quantity')} style={inputStyle} />
                </label>
                <label style={{ ...labelStyle, flex: 1 }}>
                  単位
                  <select {...register('unit')} style={inputStyle}>
                    {['kg', 'g', '個', '筱', '束', 'L'].map(u => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#333', cursor: 'pointer' }}>
                <input type="checkbox" {...register('shipped')} style={{ width: 18, height: 18, accentColor: '#2d7a4f' }} />
                出荷済み
              </label>
              <label style={labelStyle}>
                メモ
                <textarea rows={3} placeholder="品質・天気など" {...register('memo')}
                  style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
              </label>
              <button type="submit" disabled={isSubmitting} style={submitBtnStyle}>
                {isSubmitting ? '保存中...' : editTarget ? '更新する' : '記録する'}
              </button>
            </form>
          </div>
        </div>
      )}

      <div style={{ position: 'fixed', bottom: 56, left: 0, right: 0, padding: '12px 16px', background: '#fff', borderTop: '1px solid #eee', zIndex: 50 }}>
        <button style={addBtnStyle} onClick={openNew}>＋ 収穫を記録する</button>
      </div>

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
          <button onClick={onEdit} style={iconBtnStyle} title="編集">
            <EditIcon size={17} />
          </button>
          <button onClick={onDelete} style={iconBtnStyle} title="削除">
            <TrashIcon size={17} />
          </button>
        </div>
      </div>
      {h.memo && <p style={{ margin: '8px 0 0', fontSize: 14, color: '#555', lineHeight: 1.5 }}>{h.memo}</p>}
    </div>
  )
}

const tabStyle: React.CSSProperties = { flex: 1, textAlign: 'center', padding: '10px', fontSize: 14, color: '#888', cursor: 'pointer' }
const activeTabStyle: React.CSSProperties = { ...tabStyle, color: '#2d7a4f', borderBottom: '2px solid #2d7a4f', fontWeight: 600 }
const labelStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: '#555', fontWeight: 500 }
const inputStyle: React.CSSProperties = { padding: '10px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 15, background: '#fafafa', outline: 'none' }
const addBtnStyle: React.CSSProperties = { display: 'block', width: '100%', padding: '14px', background: '#2d7a4f', color: '#fff', border: 'none', borderRadius: 10, fontSize: 16, fontWeight: 600, cursor: 'pointer' }
const submitBtnStyle: React.CSSProperties = { ...addBtnStyle, marginTop: 4 }
const overlayStyle: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }
const drawerStyle: React.CSSProperties = { background: '#fff', width: '100%', borderRadius: '16px 16px 0 0', padding: '20px 16px 32px', maxHeight: '90dvh', overflowY: 'auto' }
