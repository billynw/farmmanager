import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fieldsApi } from '../api'

export default function FieldForm() {
  const { id } = useParams<{ id: string }>()
  const isEdit = !!id && id !== 'new' && !isNaN(Number(id))
  const fieldId = isEdit ? Number(id) : null
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [name, setName] = useState('')
  const [area, setArea] = useState('')
  const [locationNote, setLocationNote] = useState('')

  const { data: field } = useQuery({
    queryKey: ['field', fieldId],
    enabled: !!fieldId,
    queryFn: () => fieldsApi.get(fieldId!).then(r => r.data),
  })

  useEffect(() => {
    if (field) {
      setName(field.name)
      setArea(field.area?.toString() ?? '')
      setLocationNote(field.location_note ?? '')
    }
  }, [field])

  const mutation = useMutation({
    mutationFn: () => {
      const data = { name, area: area ? parseFloat(area) : undefined, location_note: locationNote || undefined }
      return isEdit ? fieldsApi.update(fieldId!, data) : fieldsApi.create(data)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fields'] })
      navigate('/admin/users')
    },
    onError: (err: any) => alert(err.response?.data?.detail ?? '保存に失敗しました'),
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: '#f5f5f0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: '#fff', borderBottom: '1px solid #eee' }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#444' }}>←</button>
        <div style={{ fontWeight: 700, fontSize: 16 }}>{isEdit ? '圃場を編集' : '圃場を追加'}</div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        <div style={{ background: '#fff', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={labelStyle}>圃場名 *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="例：北圃" style={inputStyle} required />
          </div>
          <div>
            <label style={labelStyle}>面積（アール）</label>
            <input type="number" step="0.01" min="0" value={area} onChange={e => setArea(e.target.value)} placeholder="例：10.5" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>場所メモ</label>
            <input value={locationNote} onChange={e => setLocationNote(e.target.value)} placeholder="例：山田町3丁目" style={inputStyle} />
          </div>
        </div>
      </div>

      <div style={{ padding: '12px 16px', background: '#fff', borderTop: '1px solid #eee' }}>
        <button
          onClick={() => mutation.mutate()}
          disabled={!name || mutation.isPending}
          style={{ display: 'block', width: '100%', padding: '14px', background: name ? '#2d7a4f' : '#ccc', color: '#fff', border: 'none', borderRadius: 10, fontSize: 16, fontWeight: 600, cursor: name ? 'pointer' : 'not-allowed' }}
        >
          {mutation.isPending ? '保存中...' : '保存する'}
        </button>
        {mutation.isError && <p style={{ color: '#c0392b', fontSize: 13, marginTop: 8, textAlign: 'center' }}>保存に失敗しました</p>}
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, color: '#444', fontWeight: 600, marginBottom: 6 }
const inputStyle: React.CSSProperties = { display: 'block', width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 15, boxSizing: 'border-box' }
