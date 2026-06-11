import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { FrpcInstance, ConnectionConfig, InstanceStatus, PortMapping, ServiceStatus, LogEntry } from '../../shared/types.js';
import { DockerAdapter } from './adapters/dockerAdapter.js';
import { SSHAdapter } from './adapters/sshAdapter.js';
import { LocalAdapter } from './adapters/localAdapter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '../../data');
const INSTANCES_FILE = path.join(DATA_DIR, 'instances.json');

interface ConnectionAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getStatus(): Promise<ServiceStatus>;
  startService(): Promise<void>;
  stopService(): Promise<void>;
  restartService(): Promise<void>;
  getMappings(): Promise<PortMapping[]>;
  addMapping(mapping: Omit<PortMapping, 'status'>): Promise<void>;
  updateMapping(id: string, mapping: Partial<Omit<PortMapping, 'id' | 'status'>>): Promise<void>;
  deleteMapping(id: string): Promise<void>;
  getConfig(): Promise<string>;
  writeConfig(content: string): Promise<void>;
  getLogs(maxLines: number): Promise<LogEntry[]>;
  getDockerContainers?(): Promise<{ name: string; image: string; status: string }[]>;
}

export class InstanceManager {
  private instances: Map<string, FrpcInstance> = new Map();
  private adapters: Map<string, ConnectionAdapter> = new Map();
  private statusCache: Map<string, InstanceStatus> = new Map();

  constructor() {
    this.ensureDataDir();
    this.loadInstances();
  }

  private ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  private loadInstances() {
    if (fs.existsSync(INSTANCES_FILE)) {
      const data = JSON.parse(fs.readFileSync(INSTANCES_FILE, 'utf-8'));
      data.forEach((instance: FrpcInstance) => {
        this.instances.set(instance.id, instance);
      });
    }
  }

  private saveInstances() {
    const data = Array.from(this.instances.values());
    fs.writeFileSync(INSTANCES_FILE, JSON.stringify(data, null, 2));
  }

  private createAdapter(instance: FrpcInstance): ConnectionAdapter {
    switch (instance.connectionType) {
      case 'local_docker':
      case 'remote_docker':
        return new DockerAdapter(instance.config);
      case 'remote_ssh':
        return new SSHAdapter(instance.config);
      case 'local_binary':
        return new LocalAdapter(instance.config);
      default:
        throw new Error('Unsupported connection type');
    }
  }

  getAllInstances(): FrpcInstance[] {
    return Array.from(this.instances.values());
  }

  getInstance(id: string): FrpcInstance | undefined {
    return this.instances.get(id);
  }

  createInstance(instance: Omit<FrpcInstance, 'id' | 'createdAt'>): FrpcInstance {
    const id = `inst_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newInstance: FrpcInstance = {
      ...instance,
      id,
      createdAt: Date.now()
    };
    this.instances.set(id, newInstance);
    this.saveInstances();
    return newInstance;
  }

  updateInstance(id: string, update: Partial<Omit<FrpcInstance, 'id' | 'createdAt'>>): FrpcInstance | null {
    const instance = this.instances.get(id);
    if (!instance) return null;
    const updated = { ...instance, ...update };
    this.instances.set(id, updated);
    this.saveInstances();
    // 清理旧的适配器
    this.adapters.delete(id);
    return updated;
  }

  deleteInstance(id: string): boolean {
    if (!this.instances.has(id)) return false;
    this.instances.delete(id);
    this.adapters.delete(id);
    this.statusCache.delete(id);
    this.saveInstances();
    return true;
  }

  async getInstanceStatus(instanceId: string, timeoutMs: number = 8000): Promise<InstanceStatus> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      return {
        instanceId,
        status: 'error',
        error: 'Instance not found',
        lastUpdateAt: Date.now()
      };
    }

    // 如果有缓存且时间较短，直接返回避免频繁执行耗时命令
    const cached = this.statusCache.get(instanceId);
    if (cached && (Date.now() - cached.lastUpdateAt) < 3000) {
      return cached;
    }

    const timeoutPromise = new Promise<InstanceStatus>((_, reject) =>
      setTimeout(() => reject(new Error('Request timeout')), timeoutMs)
    );

    try {
      const adapter = this.getAdapter(instanceId);
      const status = await Promise.race([
        (async () => {
          const serviceStatus = await adapter.getStatus();
          const mappings = await adapter.getMappings();
          return { serviceStatus, mappings };
        })(),
        timeoutPromise
      ]);

      const result: InstanceStatus = {
        instanceId,
        status: 'connected' as const,
        serviceStatus: status.serviceStatus,
        mappings: status.mappings,
        lastUpdateAt: Date.now()
      };

      instance.lastConnectedAt = Date.now();
      this.saveInstances();
      this.statusCache.set(instanceId, result);
      return result;
    } catch (error) {
      // 超时或失败时，尝试返回缓存的状态（如果有）
      if (cached) {
        return cached;
      }
      const result: InstanceStatus = {
        instanceId,
        status: 'error' as const,
        error: (error as Error).message,
        lastUpdateAt: Date.now()
      };
      this.statusCache.set(instanceId, result);
      return result;
    }
  }

  getAllStatuses(): Promise<InstanceStatus[]> {
    const ids = Array.from(this.instances.keys());
    return Promise.all(
      ids.map(id =>
        this.getInstanceStatus(id, 8000).catch(err => ({
          instanceId: id,
          status: 'error' as const,
          error: err.message,
          lastUpdateAt: Date.now()
        }))
      )
    );
  }

  private getAdapter(instanceId: string): ConnectionAdapter {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error('Instance not found');
    }
    if (!this.adapters.has(instanceId)) {
      this.adapters.set(instanceId, this.createAdapter(instance));
    }
    return this.adapters.get(instanceId)!;
  }

  // 代理方法
  async startService(instanceId: string): Promise<void> {
    return this.getAdapter(instanceId).startService();
  }

  async stopService(instanceId: string): Promise<void> {
    return this.getAdapter(instanceId).stopService();
  }

  async restartService(instanceId: string): Promise<void> {
    return this.getAdapter(instanceId).restartService();
  }

  async getMappings(instanceId: string): Promise<PortMapping[]> {
    return this.getAdapter(instanceId).getMappings();
  }

  async addMapping(instanceId: string, mapping: Omit<PortMapping, 'status'>): Promise<void> {
    return this.getAdapter(instanceId).addMapping(mapping);
  }

  async updateMapping(instanceId: string, id: string, mapping: Partial<Omit<PortMapping, 'id' | 'status'>>): Promise<void> {
    return this.getAdapter(instanceId).updateMapping(id, mapping);
  }

  async deleteMapping(instanceId: string, id: string): Promise<void> {
    return this.getAdapter(instanceId).deleteMapping(id);
  }

  async getConfig(instanceId: string): Promise<string> {
    return this.getAdapter(instanceId).getConfig();
  }

  async writeConfig(instanceId: string, content: string): Promise<void> {
    return this.getAdapter(instanceId).writeConfig(content);
  }

  async getLogs(instanceId: string, maxLines: number = 100): Promise<LogEntry[]> {
    return this.getAdapter(instanceId).getLogs(maxLines);
  }

  async getDockerContainers(instanceId: string): Promise<{ name: string; image: string; status: string }[]> {
    const adapter = this.getAdapter(instanceId);
    if (adapter.getDockerContainers) {
      return adapter.getDockerContainers();
    }
    return [];
  }
}