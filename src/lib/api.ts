import { PortMapping, ConfigFile, ApiResponse, LogEntry, FrpcInstance, ConnectionType, ConnectionConfig, InstanceStatus } from '../../shared/types'

const API_BASE = '/api'

// Token 管理
function getToken(): string | null {
  return localStorage.getItem('frpc-panel-token')
}

function setToken(token: string): void {
  localStorage.setItem('frpc-panel-token', token)
}

function removeToken(): void {
  localStorage.removeItem('frpc-panel-token')
}

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const token = getToken()

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  })

  // 处理认证失败
  if (response.status === 401) {
    removeToken()
    window.location.href = '/login'
    throw new Error('Session expired, please login again')
  }

  const data: ApiResponse<T> = await response.json()

  if (!data.success) {
    throw new Error(data.error || 'Request failed')
  }

  return data.data as T
}

export const auth = {
  login: async (password: string): Promise<{ token: string }> => {
    const result = await request<{ token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    })
    setToken(result.token)
    return result
  },
  verify: async (): Promise<{ valid: boolean }> => {
    return request<{ valid: boolean }>('/auth/verify')
  },
  changePassword: async (oldPassword: string, newPassword: string): Promise<{ token: string }> => {
    const result = await request<{ token: string }>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ oldPassword, newPassword }),
    })
    setToken(result.token)
    return result
  },
  logout: () => {
    removeToken()
    window.location.href = '/login'
  },
  isLoggedIn: (): boolean => {
    return !!getToken()
  },
}

export const api = {
  // 实例管理 API
  getInstances: () => request<FrpcInstance[]>('/instances'),
  getInstancesStatus: (forceRefresh?: boolean) => request<InstanceStatus[]>(`/instances/status${forceRefresh ? '?force=true' : ''}`),
  createInstance: (data: { name: string; connectionType: ConnectionType; config: ConnectionConfig }) =>
    request<FrpcInstance>('/instances', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  updateInstance: (id: string, data: { name: string; connectionType: ConnectionType; config: ConnectionConfig }) =>
    request<FrpcInstance>(`/instances/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),
  deleteInstance: (id: string) => request<{ message: string }>(`/instances/${id}`, { method: 'DELETE' }),

  // 单个实例操作
  getInstanceStatus: (instanceId: string, forceRefresh?: boolean) =>
    request<InstanceStatus>(`/instances/${instanceId}/status${forceRefresh ? '?force=true' : ''}`),
  startInstanceService: (instanceId: string) => request<{ message: string }>(`/instances/${instanceId}/service/start`, { method: 'POST' }),
  stopInstanceService: (instanceId: string) => request<{ message: string }>(`/instances/${instanceId}/service/stop`, { method: 'POST' }),
  restartInstanceService: (instanceId: string) => request<{ message: string }>(`/instances/${instanceId}/service/restart`, { method: 'POST' }),
  getInstanceMappings: (instanceId: string) => request<PortMapping[]>(`/instances/${instanceId}/mappings`),
  getInstanceConfig: (instanceId: string) => request<ConfigFile>(`/instances/${instanceId}/config`),
  getInstanceLogs: (instanceId: string, lines?: number) => request<LogEntry[]>(`/instances/${instanceId}/logs?lines=${lines || 100}`),
  getInstanceDockerContainers: (instanceId: string) => request<{ name: string; image: string; status: string }[]>(`/instances/${instanceId}/docker/containers`),

  // 实例操作
  addInstanceMapping: (instanceId: string, mapping: Omit<PortMapping, 'status'>) => request<{ message: string }>(`/instances/${instanceId}/mappings`, {
    method: 'POST',
    body: JSON.stringify(mapping),
  }),
  updateInstanceMapping: (instanceId: string, mappingId: string, mapping: Partial<Omit<PortMapping, 'id' | 'status'>>) => request<{ message: string }>(`/instances/${instanceId}/mappings/${mappingId}`, {
    method: 'PUT',
    body: JSON.stringify(mapping),
  }),
  deleteInstanceMapping: (instanceId: string, mappingId: string) => request<{ message: string }>(`/instances/${instanceId}/mappings/${mappingId}`, {
    method: 'DELETE',
  }),
  saveInstanceConfig: (instanceId: string, content: string) => request<{ message: string }>(`/instances/${instanceId}/config`, {
    method: 'PUT',
    body: JSON.stringify({ content }),
  }),
}
