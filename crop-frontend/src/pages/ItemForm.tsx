import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { itemsApi, fieldsApi } from '../api'

export default function ItemForm() {
  const { id } = useParams<{ id: string }>()
  const isEdit = !!id && id !== 'new' && !isNaN(Number(id))
  const itemId = isEdit ? Number(id) : null
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [name, setName] = useState('')
  const [variety, setVariety] = useState('')
  const [fieldId, setFieldId] = useState<number | undefined>()
  const [plantedAt, setPlantedAt] = useState('')
  const [status, setStatus] = useState<'growing' | 'finished'>('growing')

  const { data: fields = [] } = useQuery({ queryKey: ['fields'], queryFn: () => fieldsApi.list().then(r => r.data) })
  const { data: item } = useQuery({
    queryKey: ['item', itemId], enabled: !!itemId,
    queryFn: () => itemsApi.get(itemId!).then(r => r.data),
  })

  useEffect(() => {
    if (item) {
      setName(item.name); setVariety(item.variety ?? '')
      setFieldId(item.field_id ?? undefined); setPlantedAt(item.planted_at ?? '')
      setStatus(item.status)
    }
  }, [item])

  const mutation = useMutation({
    mutationFn: () => {
      const data = { name, variety: variety || undefined, field_id: fieldId, planted_at: plantedAt || undefined, status }
      return isEdit ? itemsApi.update(itemId!, data) : itemsApi.create(data)
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['items'] })
      navigate(isEdit ? `/items/${itemId}` : `/items/${res.data.id}`)
    },
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: '#f5f5f0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: '#fff', borderBottom: '1px solid #eee' }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#444' }}>←</button>
        <div style={{ fontWeight: 700, fontSize: 16 }}>{isEdit ? '作物を編集' : '作物を追加'}</div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        <div style={{ background: '#fff', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={labelStyle}>作物名 *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="例: トマト" style={inputStyle} required />
          </div>
          <div>
            <label style={labelStyle}>品種</label>
            <input value={variety} onChange={e => setVariety(e.target.value)} placeholder="例: 桃太郎" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>圃場</label>
            <select value={fieldId ?? ''} onChange={e => setFieldId(e.target.value ? Number(e.target.value) : undefined)} style={inputStyle}>
              <option value="">未設定</option>
              {fields.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>定植日</label>
            <input type="date" value={plantedAt} onChange={e => setPlantedAt(e.target.value)} style={inputStyle} />
          </div>
          {isEdit && (
            <div>
              <label style={labelStyle}>ステータス</label>
              <select value={status} onChange={e => setStatus(e.target.value as any)} style={inputStyle}>
                <option value="growing">栽培中</option>
                <option value="finished">終了</option>
              </select>
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: '12px 16px', background: '#fff', borderTop: '1px solid #eee' }}>
        <button onClick={() => mutation.mutate()} disabled={!name || mutation.isPending}
          style={{ display: 'block', width: '100%', padding: '14px', background: name ? '#2d7a4f' : '#ccc', color: '#fff', border: 'none', borderRadius: 10, fontSize: 16, fontWeight: 600, cursor: name ? 'pointer' : 'not-allowed' }}>
          {mutation.isPending ? '保存中...' : '保存する'}
        </button>
        {mutation.isError && <p style={{ color: '#c0392b', fontSize: 13, marginTop: 8, textAlign: 'center' }}>保存に失敗しました</p>}
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, color: '#444', fontWeight: 600, marginBottom: 6 }
const inputStyle: React.CSSProperties = { display: 'block', width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 15, boxSizing: 'border-box' }
