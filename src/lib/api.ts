import { PortMapping, ConfigFile, ApiResponse, LogEntry, FrpcInstance, ConnectionType, ConnectionConfig, InstanceStatus } from '../../shared/types'

const API_BASE = '/api'

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  })

  const data: ApiResponse<T> = await response.json()

  if (!data.success) {
    throw new Error(data.error || 'Request failed')
  }

  return data.data as T
}

export const api = {
  // 实例管理 API
  getInstances: () => request<FrpcInstance[]>('/instances'),
  getInstancesStatus: () => request<InstanceStatus[]>('/instances/status'),
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
  getInstanceStatus: (instanceId: string) => request<InstanceStatus>(`/instances/${instanceId}/status`),
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
