import { spawn, ChildProcess, execSync } from 'child_process';
import { ConnectionConfig, PortMapping, ServiceStatus, LogEntry } from '../../../shared/types.js';
import * as fs from 'fs';
import * as path from 'path';

export class LocalAdapter {
  private config: ConnectionConfig;
  private frpcProcess: ChildProcess | null = null;
  private startTime: number | null = null;
  private logBuffer: LogEntry[] = [];

  constructor(config: ConnectionConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    // No connection needed for local
  }

  async disconnect(): Promise<void> {
    if (this.frpcProcess && !this.frpcProcess.killed) {
      this.frpcProcess.kill();
      this.frpcProcess = null;
    }
  }

  async getStatus(): Promise<ServiceStatus> {
    return {
      running: this.frpcProcess !== null && !this.frpcProcess.killed,
      uptime: this.startTime ? Date.now() - this.startTime : undefined,
      version: '0.52.3',
      deploymentType: 'binary'
    };
  }

  async startService(): Promise<void> {
    const frpcPath = this.config.frpcPath || 'frpc';
    const configPath = this.config.configPath || path.join(process.cwd(), 'frpc.toml');

    if (this.frpcProcess && !this.frpcProcess.killed) {
      throw new Error('Service is already running');
    }

    return new Promise((resolve, reject) => {
      const child = spawn(frpcPath, ['-c', configPath], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      child.on('error', (err) => {
        this.frpcProcess = null;
        this.startTime = null;
        reject(new Error(`Failed to start frpc: ${err.message}`));
      });

      child.on('exit', (code) => {
        this.frpcProcess = null;
        this.startTime = null;
        this.logBuffer.push({
          timestamp: Date.now(),
          level: 'info',
          message: `frpc process exited with code ${code}`
        });
      });

      child.stdout?.on('data', (data) => {
        const lines = data.toString().split('\n').filter(Boolean);
        lines.forEach((line: string) => {
          this.logBuffer.push({
            timestamp: Date.now(),
            level: line.toLowerCase().includes('error') ? 'error' : 'info',
            message: line
          });
        });
        // 限制日志数量
        if (this.logBuffer.length > 1000) {
          this.logBuffer = this.logBuffer.slice(-500);
        }
      });

      child.stderr?.on('data', (data) => {
        const lines = data.toString().split('\n').filter(Boolean);
        lines.forEach((line: string) => {
          this.logBuffer.push({
            timestamp: Date.now(),
            level: line.toLowerCase().includes('error') ? 'error' : 'warn',
            message: line
          });
        });
      });

      // 等待一小段时间检查进程是否启动成功
      setTimeout(() => {
        if (child.killed) {
          reject(new Error('Process exited immediately'));
          return;
        }
        this.frpcProcess = child;
        this.startTime = Date.now();
        this.logBuffer.push({
          timestamp: Date.now(),
          level: 'info',
          message: `frpc started (PID: ${child.pid})`
        });
        resolve();
      }, 500);
    });
  }

  async stopService(): Promise<void> {
    if (!this.frpcProcess || this.frpcProcess.killed) {
      throw new Error('Service is not running');
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        if (this.frpcProcess && !this.frpcProcess.killed) {
          this.frpcProcess.kill('SIGKILL');
        }
      }, 5000);

      this.frpcProcess!.once('exit', () => {
        clearTimeout(timeout);
        this.frpcProcess = null;
        this.startTime = null;
        this.logBuffer.push({
          timestamp: Date.now(),
          level: 'info',
          message: 'frpc stopped'
        });
        resolve();
      });

      this.frpcProcess!.kill('SIGTERM');
    });
  }

  async restartService(): Promise<void> {
    await this.stopService();
    // 等待进程完全退出
    await new Promise(resolve => setTimeout(resolve, 1000));
    await this.startService();
  }

  async getConfig(): Promise<string> {
    const configPath = this.config.configPath || path.join(process.cwd(), 'frpc.toml');
    if (fs.existsSync(configPath)) {
      return fs.readFileSync(configPath, 'utf-8');
    }
    throw new Error('Config file not found');
  }

  async writeConfig(content: string): Promise<void> {
    const configPath = this.config.configPath || path.join(process.cwd(), 'frpc.toml');
    fs.writeFileSync(configPath, content, 'utf-8');
  }

  async parseMappings(): Promise<PortMapping[]> {
    // Parse mappings from config
    return [];
  }

  async getMappings(): Promise<PortMapping[]> {
    return [];
  }

  async addMapping(mapping: Omit<PortMapping, 'status'>): Promise<void> {
  }

  async updateMapping(id: string, mapping: Partial<Omit<PortMapping, 'id' | 'status'>>): Promise<void> {
  }

  async deleteMapping(id: string): Promise<void> {
  }

  async getLogs(maxLines: number): Promise<LogEntry[]> {
    return [];
  }
}
