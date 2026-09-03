export interface PortMapping {
  id: string;
  name: string;
  localPort: number;
  remotePort?: number;
  protocol: 'tcp' | 'udp';
  localIp?: string;
  status: 'active' | 'inactive';
  type?: string;
  localIP?: string;
}

export interface ServiceStatus {
  running: boolean;
  uptime?: number;
  version?: string;
  deploymentType: 'binary' | 'docker' | 'ssh';
  containerName?: string;
  configPath?: string;
}

export interface ConfigFile {
  path: string;
  content: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface FrpcConfig {
  frpcPath?: string;
  configPath?: string;
  deploymentType: 'binary' | 'docker' | 'ssh';
  dockerContainerName?: string;
  sshHost?: string;
  sshPort?: number;
  sshUser?: string;
  sshKeyPath?: string;
  autoDetected: boolean;
}

export interface LogEntry {
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
}

// 多实例管理相关

export type ConnectionType = 'local_docker' | 'local_binary' | 'remote_ssh' | 'remote_docker';

export interface FrpcInstance {
  id: string;
  name: string;
  connectionType: ConnectionType;
  config: ConnectionConfig;
  createdAt: number;
  lastConnectedAt?: number;
}

export interface ConnectionConfig {
  // Docker 相关
  dockerContainerName?: string;
  dockerHost?: string; // 远程 Docker API 地址
  
  // 本地二进制相关
  frpcPath?: string;
  configPath?: string;
  
  // SSH 相关
  sshHost?: string;
  sshPort?: number;
  sshUser?: string;
  sshKeyPath?: string;
  sshPassword?: string;
  remoteFrpcPath?: string;
  remoteConfigPath?: string;
  remoteDockerContainerName?: string;
}

export interface DockerContainerInfo {
  name: string;
  image: string;
  status: string;
  state?: string;
  configPath?: string;
  hostConfigPath?: string;
}

export interface DockerDiscoveryResult {
  containers: DockerContainerInfo[];
  selectedContainerName?: string;
}

export interface InstanceStatus {
  instanceId: string;
  status: 'connected' | 'disconnected' | 'error';
  serviceStatus?: ServiceStatus;
  mappings?: PortMapping[];
  error?: string;
  lastUpdateAt: number;
}
