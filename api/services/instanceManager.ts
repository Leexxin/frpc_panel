import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { FrpcInstance, ConnectionConfig, InstanceStatus, PortMapping, ServiceStatus, LogEntry, DockerContainerInfo, DockerDiscoveryResult } from '../../shared/types.js';
import { DockerAdapter } from './adapters/dockerAdapter.js';
import { SSHAdapter } from './adapters/sshAdapter.js';
import { LocalAdapter } from './adapters/localAdapter.js';
import { encrypt, decrypt, isEncrypted } from '../utils/crypto.js';
import { logger } from '../utils/logger.js';

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
  getDockerContainers?(): Promise<DockerContainerInfo[]>;
}

export class InstanceManager {
  private instances: Map<string, FrpcInstance> = new Map();
  private adapters: Map<string, ConnectionAdapter> = new Map();
  private statusCache: Map<string, InstanceStatus> = new Map();
  private lastStatusTime: Map<string, number> = new Map();
  private readonly STATUS_CACHE_TTL = 3000; // 3秒缓存
  private readonly FAST_STATUS_CACHE_TTL = 1000; // 快速检测模式1秒缓存

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
      try {
        const data = JSON.parse(fs.readFileSync(INSTANCES_FILE, 'utf-8'));
        data.forEach((instance: FrpcInstance) => {
          // 解密敏感字段
          instance.config = this.decryptSensitiveConfig(instance.config);
          this.instances.set(instance.id, instance);
        });
        logger.info(`Loaded ${data.length} instances from storage`);
      } catch (error) {
        logger.error('Failed to load instances', { error: (error as Error).message });
      }
    }
  }

  private saveInstances() {
    try {
      const data = Array.from(this.instances.values()).map(instance => ({
        ...instance,
        // 加密敏感字段后保存
        config: this.encryptSensitiveConfig(instance.config),
      }));
      fs.writeFileSync(INSTANCES_FILE, JSON.stringify(data, null, 2));
      logger.debug('Instances saved to storage');
    } catch (error) {
      logger.error('Failed to save instances', { error: (error as Error).message });
    }
  }

  /**
   * 加密配置中的敏感字段
   */
  private encryptSensitiveConfig(config: ConnectionConfig): ConnectionConfig {
    const encrypted = { ...config };
    if (config.sshPassword && !isEncrypted(config.sshPassword)) {
      encrypted.sshPassword = encrypt(config.sshPassword);
      logger.debug('SSH password encrypted');
    }
    return encrypted;
  }

  /**
   * 解密配置中的敏感字段
   */
  private decryptSensitiveConfig(config: ConnectionConfig): ConnectionConfig {
    const decrypted = { ...config };
    if (config.sshPassword && isEncrypted(config.sshPassword)) {
      try {
        decrypted.sshPassword = decrypt(config.sshPassword);
      } catch (error) {
        logger.error('Failed to decrypt SSH password', { error: (error as Error).message });
      }
    }
    return decrypted;
  }

  private createAdapter(instance: FrpcInstance): ConnectionAdapter {
    logger.debug(`Creating adapter for instance ${instance.id}, type: ${instance.connectionType}`);

    // 解密配置给适配器使用
    const config = this.decryptSensitiveConfig(instance.config);

    switch (instance.connectionType) {
      case 'local_docker':
      case 'remote_docker':
        return new DockerAdapter(config);
      case 'remote_ssh':
        return new SSHAdapter(config);
      case 'local_binary':
        return new LocalAdapter(config);
      default:
        throw new Error('Unsupported connection type');
    }
  }

  // 清理所有适配器连接（用于进程退出时）
  async disconnectAll(): Promise<void> {
    logger.info('Disconnecting all adapters');
    for (const [id, adapter] of this.adapters.entries()) {
      try {
        await adapter.disconnect();
        logger.debug(`Adapter disconnected for instance ${id}`);
      } catch (e) {
        // ignore disconnect errors
      }
    }
    this.adapters.clear();
  }

  getAllInstances(): FrpcInstance[] {
    return Array.from(this.instances.values()).map(instance => this.toPublicInstance(instance));
  }

  getInstance(id: string): FrpcInstance | undefined {
    const instance = this.instances.get(id);
    return instance ? this.toPublicInstance(instance) : undefined;
  }

  private toPublicInstance(instance: FrpcInstance): FrpcInstance {
    const config = { ...instance.config };
    delete config.sshPassword;
    return { ...instance, config };
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
    logger.info(`Instance created: ${id} (${instance.name})`);
    return newInstance;
  }

  updateInstance(id: string, update: Partial<Omit<FrpcInstance, 'id' | 'createdAt'>>): FrpcInstance | null {
    const instance = this.instances.get(id);
    if (!instance) return null;
    // 清理旧的适配器连接
    const oldAdapter = this.adapters.get(id);
    if (oldAdapter) {
      try {
        oldAdapter.disconnect();
      } catch (e) {
        // ignore disconnect errors
      }
    }
    let nextConfig = update.config;
    if (nextConfig) {
      const passwordWasProvided = Object.prototype.hasOwnProperty.call(nextConfig, 'sshPassword');
      nextConfig = { ...nextConfig };
      if (!passwordWasProvided && instance.config.sshPassword) {
        nextConfig.sshPassword = instance.config.sshPassword;
      } else if (nextConfig.sshPassword === '') {
        delete nextConfig.sshPassword;
      }
    }
    const updated = { ...instance, ...update, ...(nextConfig ? { config: nextConfig } : {}) };
    this.instances.set(id, updated);
    this.saveInstances();
    // 清理旧的适配器
    this.adapters.delete(id);
    logger.info(`Instance updated: ${id}`);
    return this.toPublicInstance(updated);
  }

  deleteInstance(id: string): boolean {
    if (!this.instances.has(id)) return false;
    // 清理适配器连接
    const adapter = this.adapters.get(id);
    if (adapter) {
      try {
        adapter.disconnect();
      } catch (e) {
        // ignore disconnect errors
      }
    }
    this.instances.delete(id);
    this.adapters.delete(id);
    this.statusCache.delete(id);
    this.lastStatusTime.delete(id);
    this.saveInstances();
    logger.info(`Instance deleted: ${id}`);
    return true;
  }

  async getInstanceStatus(instanceId: string, timeoutMs: number = 8000, forceRefresh: boolean = false): Promise<InstanceStatus> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      return {
        instanceId,
        status: 'error',
        error: 'Instance not found',
        lastUpdateAt: Date.now()
      };
    }

    // 检查缓存
    const cached = this.statusCache.get(instanceId);
    const lastTime = this.lastStatusTime.get(instanceId) || 0;
    const cacheAge = Date.now() - lastTime;

    // 如果不是强制刷新，且缓存有效，直接返回
    if (!forceRefresh && cached && cacheAge < this.STATUS_CACHE_TTL) {
      logger.debug(`Returning cached status for ${instanceId}, age: ${cacheAge}ms`);
      return cached;
    }

    // 使用更短的超时进行快速检测
    const actualTimeout = forceRefresh ? timeoutMs : Math.min(timeoutMs, 5000);

    const timeoutPromise = new Promise<never>((_, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Request timeout'));
      }, actualTimeout);
      // 存储 timer 引用以便后续清理
      (timeoutPromise as any)._timer = timer;
    });

    try {
      const adapter = this.getAdapter(instanceId);
      logger.debug(`Fetching fresh status for ${instanceId}`);

      const status = await Promise.race([
        (async () => {
          const serviceStatus = await adapter.getStatus();
          const mappings = await adapter.getMappings();
          return { serviceStatus, mappings };
        })(),
        timeoutPromise
      ]);

      // 清理超时定时器
      if ((timeoutPromise as any)._timer) {
        clearTimeout((timeoutPromise as any)._timer);
      }

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
      this.lastStatusTime.set(instanceId, Date.now());

      logger.debug(`Status updated for ${instanceId}: ${result.status}`);
      return result;
    } catch (error) {
      // 超时或失败时，尝试返回缓存的状态（如果有）
      if ((timeoutPromise as any)._timer) {
        clearTimeout((timeoutPromise as any)._timer);
      }

      if (cached && cacheAge < this.STATUS_CACHE_TTL * 3) {
        logger.warn(`Status fetch failed for ${instanceId}, returning stale cache`, {
          error: (error as Error).message,
          cacheAge: `${cacheAge}ms`,
        });
        return cached;
      }

      const result: InstanceStatus = {
        instanceId,
        status: 'error' as const,
        error: (error as Error).message,
        lastUpdateAt: Date.now()
      };
      this.statusCache.set(instanceId, result);
      this.lastStatusTime.set(instanceId, Date.now());

      logger.error(`Status fetch failed for ${instanceId}`, { error: (error as Error).message });
      return result;
    }
  }

  getAllStatuses(forceRefresh: boolean = false): Promise<InstanceStatus[]> {
    const ids = Array.from(this.instances.keys());
    logger.debug(`Fetching statuses for ${ids.length} instances, forceRefresh=${forceRefresh}`);
    return Promise.all(
      ids.map(id =>
        this.getInstanceStatus(id, 8000, forceRefresh).catch(err => ({
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
    logger.info(`Starting service for instance ${instanceId}`);
    await this.getAdapter(instanceId).startService();
    // 强制刷新状态
    await this.getInstanceStatus(instanceId, 5000, true);
  }

  async stopService(instanceId: string): Promise<void> {
    logger.info(`Stopping service for instance ${instanceId}`);
    await this.getAdapter(instanceId).stopService();
    // 强制刷新状态
    await this.getInstanceStatus(instanceId, 5000, true);
  }

  async restartService(instanceId: string): Promise<void> {
    logger.info(`Restarting service for instance ${instanceId}`);
    await this.getAdapter(instanceId).restartService();
    // 强制刷新状态
    await this.getInstanceStatus(instanceId, 5000, true);
  }

  async getMappings(instanceId: string): Promise<PortMapping[]> {
    return this.getAdapter(instanceId).getMappings();
  }

  async addMapping(instanceId: string, mapping: Omit<PortMapping, 'status'>): Promise<void> {
    logger.info(`Adding mapping to instance ${instanceId}`, { mapping: mapping.name });
    return this.getAdapter(instanceId).addMapping(mapping);
  }

  async updateMapping(instanceId: string, id: string, mapping: Partial<Omit<PortMapping, 'id' | 'status'>>): Promise<void> {
    logger.info(`Updating mapping ${id} in instance ${instanceId}`);
    return this.getAdapter(instanceId).updateMapping(id, mapping);
  }

  async deleteMapping(instanceId: string, id: string): Promise<void> {
    logger.info(`Deleting mapping ${id} from instance ${instanceId}`);
    return this.getAdapter(instanceId).deleteMapping(id);
  }

  async getConfig(instanceId: string): Promise<string> {
    return this.getAdapter(instanceId).getConfig();
  }

  async writeConfig(instanceId: string, content: string): Promise<void> {
    logger.info(`Writing config for instance ${instanceId}`);
    return this.getAdapter(instanceId).writeConfig(content);
  }

  async getLogs(instanceId: string, maxLines: number = 100): Promise<LogEntry[]> {
    return this.getAdapter(instanceId).getLogs(maxLines);
  }

  async getDockerContainers(instanceId: string): Promise<DockerContainerInfo[]> {
    const adapter = this.getAdapter(instanceId);
    if (adapter.getDockerContainers) {
      return adapter.getDockerContainers();
    }
    return [];
  }

  async discoverDockerContainers(instanceId: string, selectedContainerName?: string): Promise<DockerDiscoveryResult> {
    const instance = this.instances.get(instanceId);
    if (!instance) throw new Error('Instance not found');
    if (instance.connectionType !== 'remote_ssh') {
      throw new Error('Docker auto-discovery is only available for remote SSH servers');
    }

    const adapter = this.getAdapter(instanceId);
    if (!adapter.getDockerContainers) throw new Error('This connection does not support Docker discovery');
    const containers = await adapter.getDockerContainers();
    const selection = selectedContainerName || instance.config.remoteDockerContainerName || containers[0]?.name;

    if (selection && !containers.some(container => container.name === selection)) {
      throw new Error(`frpc container not found: ${selection}`);
    }

    if (selection && selection !== instance.config.remoteDockerContainerName) {
      const selected = containers.find(container => container.name === selection);
      instance.config = {
        ...instance.config,
        remoteDockerContainerName: selection,
        remoteConfigPath: selectedContainerName
          ? (selected?.configPath || instance.config.remoteConfigPath)
          : (instance.config.remoteConfigPath || selected?.configPath),
      };
      this.instances.set(instanceId, instance);
      this.saveInstances();
      await adapter.disconnect();
      this.adapters.delete(instanceId);
      this.statusCache.delete(instanceId);
      this.lastStatusTime.delete(instanceId);
      logger.info(`Auto-selected frpc container ${selection} for instance ${instanceId}`);
    }

    return { containers, selectedContainerName: selection };
  }
}
