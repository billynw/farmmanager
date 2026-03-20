import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fieldsApi } from '../api'
import AppHeader from '../components/AppHeader'
import BottomNav from '../components/BottomNav'

export default function FieldForm() {
  const { id } = useParams<{ id: string }>()
  const isEdit = !!id && !isNaN(Number(id))
  const fieldId = isEdit ? Number(id) : null
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [name, setName] = useState('')
  const [area, setArea] = useState('')
  const [locationNote, setLocationNote] = useState('')

  const { data: fields = [] } = useQuery({
    queryKey: ['fields'],
    queryFn: () => fieldsApi.list().then(r => r.data),
    enabled: isEdit,
  })

  useEffect(() => {
    if (isEdit && fields.length > 0) {
      const field = fields.find(f => f.id === fieldId)
      if (field) {
        setName(field.name)
        setArea(field.area?.toString() ?? '')
        setLocationNote(field.location_note ?? '')
      }
    }
  }, [fields, fieldId, isEdit])

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
      <AppHeader
        backTo="/admin/users"
        title={isEdit ? '圃場を編集' : '圃場を追加'}
      />

      <div style={{ flex: 1, overflowY: 'auto', padding: 16, paddingBottom: 'calc(80px + 56px + env(safe-area-inset-bottom))' }}>
        <div style={{ background: '#fff', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={labelStyle}>圃場名 *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="例：北圃" style={inputStyle} />
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

      <div style={saveBtnBarStyle}>
        <button
          onClick={() => mutation.mutate()}
          disabled={!name || mutation.isPending}
          style={{ display: 'block', width: '100%', padding: '14px', background: name ? '#2d7a4f' : '#ccc', color: '#fff', border: 'none', borderRadius: 10, fontSize: 16, fontWeight: 600, cursor: name ? 'pointer' : 'not-allowed' }}
        >
          {mutation.isPending ? '保存中...' : '保存する'}
        </button>
        {mutation.isError && <p style={{ color: '#c0392b', fontSize: 13, marginTop: 8, textAlign: 'center' }}>保存に失敗しました</p>}
      </div>

      <BottomNav />
    </div>
  )
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, color: '#444', fontWeight: 600, marginBottom: 6 }
const inputStyle: React.CSSProperties = { display: 'block', width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 15, boxSizing: 'border-box' }
const saveBtnBarStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: 'calc(56px + env(safe-area-inset-bottom))',
  left: 0, right: 0,
  padding: '12px 16px',
  zIndex: 99,
}
