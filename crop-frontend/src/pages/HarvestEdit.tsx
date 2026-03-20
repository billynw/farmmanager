import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { useEffect } from 'react'
import { itemsApi, harvestsApi } from '../api'
import AppHeader from '../components/AppHeader'
import BottomNav from '../components/BottomNav'

type FormData = {
  harvested_at: string
  quantity: string
  unit: string
  shipped: boolean
  memo: string
}

export default function HarvestEdit() {
  const { id, harvestId } = useParams<{ id: string; harvestId: string }>()
  const itemId = Number(id)
  const harvestIdNum = Number(harvestId)
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data: item } = useQuery({
    queryKey: ['item', itemId],
    queryFn: () => itemsApi.get(itemId).then(r => r.data),
  })
  const { data: harvests = [] } = useQuery({
    queryKey: ['harvests', itemId],
    queryFn: () => harvestsApi.list({ item_id: itemId }).then(r => r.data),
  })
  const harvest = harvests.find(h => h.id === harvestIdNum)

  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm<FormData>({
    defaultValues: { harvested_at: new Date().toISOString().slice(0, 10), unit: 'kg', shipped: false },
  })

  useEffect(() => {
    if (harvest) {
      reset({
        harvested_at: harvest.harvested_at,
        quantity: harvest.quantity != null ? String(harvest.quantity) : '',
        unit: harvest.unit ?? 'kg',
        shipped: harvest.shipped,
        memo: harvest.memo ?? '',
      })
    }
  }, [harvest, reset])

  const updateMut = useMutation({
    mutationFn: (d: FormData) => harvestsApi.update(harvestIdNum, {
      item_id: itemId,
      harvested_at: d.harvested_at,
      quantity: d.quantity ? Number(d.quantity) : undefined,
      unit: d.unit || undefined,
      shipped: d.shipped,
      memo: d.memo || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['harvests', itemId] })
      navigate(`/items/${itemId}/harvests`)
    },
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: '#f5f5f0' }}>
      <AppHeader
        backTo={`/items/${itemId}/harvests`}
        title="収穫記録を編集"
        subtitle={item?.name}
      />

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', paddingBottom: 80 }}>
        <form id="harvest-edit-form" onSubmit={handleSubmit(d => updateMut.mutate(d))} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
                {['kg', 'g', '個', '筱', '束', 'L'].map(u => <option key={u} value={u}>{u}</option>)}
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
        </form>
      </div>

      <div style={{ position: 'fixed', bottom: 56, left: 0, right: 0, padding: '12px 16px', background: '#fff', borderTop: '1px solid #eee', zIndex: 50 }}>
        <button form="harvest-edit-form" type="submit" disabled={isSubmitting}
          style={{ display: 'block', width: '100%', padding: '14px', background: '#2d7a4f', color: '#fff', border: 'none', borderRadius: 10, fontSize: 16, fontWeight: 600, cursor: 'pointer', opacity: isSubmitting ? 0.6 : 1 }}>
          {isSubmitting ? '保存中...' : '更新する'}
        </button>
      </div>

      <BottomNav />
    </div>
  )
}

const labelStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: '#444', fontWeight: 600 }
const inputStyle: React.CSSProperties = { padding: '10px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 15, background: '#fff', outline: 'none' }
