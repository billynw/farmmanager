import axios from 'axios'

export const api = axios.create({ baseURL: '/api/v1' })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

// --- Types ---
export type UserFieldRole = 'owner' | 'manager' | 'member'
export type ItemStatus = 'growing' | 'finished'

export interface User {
  id: number
  name: string
  email?: string
  is_owner_of_any: boolean
  field_role?: UserFieldRole
}

export interface Field {
  id: number
  name: string
  area?: number
  location_note?: string
  my_role?: UserFieldRole
}

export interface FieldInviteItem {
  field_id: number
  field_role: UserFieldRole
}

export interface WorkType { id: number; name: string; color: string }

export interface WorkLogSimple {
  id: number
  worked_at: string
  memo?: string
  work_type?: WorkType
}

export interface Item {
  id: number; name: string; variety?: string
  field_id?: number; planted_at?: string; status: ItemStatus
  field?: Field
  latest_work_log?: WorkLogSimple
}

export interface AgroInput {
  id: number; product_name: string
  quantity?: string; dilution?: string; unit?: string
}

export interface Photo { id: number; file_path: string; taken_at?: string }

export interface WorkLog {
  id: number; item_id: number; worked_at: string; memo?: string
  work_type?: WorkType; user?: User
  agro_inputs: AgroInput[]; photos: Photo[]
}

export interface Harvest {
  id: number; item_id: number; harvested_at: string
  quantity?: number; unit?: string; shipped: boolean; memo?: string
}

// --- Sensor Types ---
export interface SensorLatestReading {
  metric: string
  value: number
  unit?: string
  recorded_at: string
}

export interface SensorWithLatest {
  id: number
  name: string
  active: boolean
  latest: SensorLatestReading[]
}

export interface FieldSensorSummary {
  field_id: number
  field_name: string
  sensors: SensorWithLatest[]
}

export interface SensorOut {
  id: number
  field_id: number
  name: string
  active: boolean
}

export interface SensorReadingOut {
  id: number
  sensor_id: number
  metric: string
  value: number
  unit?: string
  recorded_at: string
}

export interface SensorPhotoOut {
  id: number
  sensor_id: number
  file_path: string
  taken_at: string
}

// --- API calls ---
export const authApi = {
  login: (email: string, password: string) =>
    api.post<{ access_token: string }>('/auth/login', { email, password }),
  me: () => api.get<User>('/auth/me'),
  register: (name: string, email: string) =>
    api.post('/auth/register', { name, email }),
  verifyEmail: (token: string, password: string) =>
    api.post<{ access_token: string }>('/auth/verify-email', { token, password }),
  acceptInvite: (token: string, password: string) =>
    api.post<{ access_token: string }>('/auth/accept-invite', { token, password }),
  requestPasswordReset: (email: string) =>
    api.post('/auth/password-reset/request', { email }),
  confirmPasswordReset: (token: string, new_password: string) =>
    api.post('/auth/password-reset/confirm', { token, new_password }),
}

export const usersApi = {
  list: (field_id: number) => api.get<User[]>('/users', { params: { field_id } }),
  invite: (data: { name: string; email: string; fields: FieldInviteItem[] }) =>
    api.post<User>('/users', data),
  update: (id: number, data: { name?: string; email?: string }) =>
    api.put<User>(`/users/${id}`, data),
  updateFieldRole: (user_id: number, field_id: number, field_role: UserFieldRole) =>
    api.patch(`/users/${user_id}/field-role`, null, { params: { field_id, field_role } }),
  removeFromField: (user_id: number, field_id: number) =>
    api.delete(`/users/${user_id}`, { params: { field_id } }),
  assignField: (field_id: number, user_id: number, field_role: UserFieldRole = 'member') =>
    api.post(`/fields/${field_id}/users/${user_id}`, null, { params: { field_role } }),
  removeField: (field_id: number, user_id: number) =>
    api.delete(`/fields/${field_id}/users/${user_id}`),
}

export const fieldsApi = {
  list: () => api.get<Field[]>('/fields'),
  create: (data: Omit<Field, 'id' | 'my_role'>) => api.post<Field>('/fields', data),
  update: (id: number, data: Omit<Field, 'id' | 'my_role'>) => api.put<Field>(`/fields/${id}`, data),
  delete: (id: number) => api.delete(`/fields/${id}`),
  sensorSummary: (field_id: number) =>
    api.get<FieldSensorSummary>(`/fields/${field_id}/sensor-summary`),
}

export const workTypesApi = {
  list: () => api.get<WorkType[]>('/work-types'),
}

export const itemsApi = {
  list: (params?: { field_id?: number; status?: string }) =>
    api.get<Item[]>('/items', { params }),
  get: (id: number) => api.get<Item>(`/items/${id}`),
  create: (data: Omit<Item, 'id' | 'field' | 'latest_work_log'>) => api.post<Item>('/items', data),
  update: (id: number, data: Omit<Item, 'id' | 'field' | 'latest_work_log'>) => api.put<Item>(`/items/${id}`, data),
  delete: (id: number) => api.delete(`/items/${id}`),
}

export const sensorsApi = {
  list: (field_id?: number) => api.get<SensorOut[]>('/sensors', { params: { field_id } }),
  readings: (sensor_id: number, metric?: string, limit = 24) =>
    api.get<SensorReadingOut[]>(`/sensors/${sensor_id}/readings`, { params: { metric, limit } }),
  photos: (sensor_id: number, limit = 24) =>
    api.get<SensorPhotoOut[]>(`/sensors/${sensor_id}/photos`, { params: { limit } }),
}

export const workLogsApi = {
  list: (params?: { item_id?: number; limit?: number; offset?: number }) =>
    api.get<WorkLog[]>('/work-logs', { params }),
  get: (id: number) => api.get<WorkLog>(`/work-logs/${id}`),
  create: (data: {
    item_id: number; work_type_id?: number; worked_at?: string
    memo?: string; agro_inputs?: Omit<AgroInput, 'id'>[]
  }) => api.post<WorkLog>('/work-logs', data),
  update: (id: number, data: {
    item_id: number; work_type_id?: number; worked_at?: string
    memo?: string; agro_inputs?: Omit<AgroInput, 'id'>[]
  }) => api.put<WorkLog>(`/work-logs/${id}`, data),
  uploadPhoto: (log_id: number, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api.post<Photo>(`/work-logs/${log_id}/photos`, form)
  },
  deletePhoto: (log_id: number, photo_id: number) => api.delete(`/work-logs/${log_id}/photos/${photo_id}`),
  delete: (id: number) => api.delete(`/work-logs/${id}`),
}

export const harvestsApi = {
  list: (params?: { item_id?: number }) => api.get<Harvest[]>('/harvests', { params }),
  create: (data: Omit<Harvest, 'id'>) => api.post<Harvest>('/harvests', data),
  update: (id: number, data: Omit<Harvest, 'id'>) => api.put<Harvest>(`/harvests/${id}`, data),
  delete: (id: number) => api.delete(`/harvests/${id}`),
}

export const exportApi = {
  workLogsCsv: (params?: { from?: string; to?: string; item_id?: number }) => {
    const q = new URLSearchParams()
    if (params?.from) q.set('from', params.from)
    if (params?.to) q.set('to', params.to)
    if (params?.item_id) q.set('item_id', String(params.item_id))
    const token = localStorage.getItem('token')
    return fetch(`/api/v1/export/work-logs?${q}`, { headers: { Authorization: `Bearer ${token}` } })
  },
  harvestsCsv: (params?: { from?: string; to?: string; item_id?: number }) => {
    const q = new URLSearchParams()
    if (params?.from) q.set('from', params.from)
    if (params?.to) q.set('to', params.to)
    if (params?.item_id) q.set('item_id', String(params.item_id))
    const token = localStorage.getItem('token')
    return fetch(`/api/v1/export/harvests?${q}`, { headers: { Authorization: `Bearer ${token}` } })
  },
}
