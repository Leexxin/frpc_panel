
export interface PortMapping {
  id: string;
  name: string;
  localPort: number;
  remotePort?: number;
  protocol: 'tcp' | 'udp';
  localIp?: string;
  status: 'active' | 'inactive';
  // 扩展字段支持完整frpc配置
  type?: string;
  localIP?: string;
}

export interface ServiceStatus {
  running: boolean;
  uptime?: number;
  version?: string;
  deploymentType: 'binary' | 'docker';
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
  deploymentType: 'binary' | 'docker';
  dockerContainerName?: string;
  autoDetected: boolean;
}

export interface LogEntry {
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
}
