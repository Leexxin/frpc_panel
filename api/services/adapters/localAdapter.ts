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
    try {
      const content = await this.getConfig();
      return this.parseMappingsFromContent(content);
    } catch (error) {
      return [];
    }
  }

  private parseMappingsFromContent(content: string): PortMapping[] {
    const mappings: PortMapping[] = [];
    if (!content || !content.trim()) return mappings;

    const lines = content.split('\n');
    let currentMapping: Partial<PortMapping> | null = null;
    let inProxiesArray = false;

    for (const line of lines) {
      const trimmedLine = line.trim();

      if (trimmedLine === '[[proxies]]') {
        if (currentMapping && currentMapping.id) {
          mappings.push(currentMapping as PortMapping);
        }
        inProxiesArray = true;
        currentMapping = { status: 'inactive' as const };
      } else if (trimmedLine.startsWith('[') && trimmedLine.endsWith(']') && !trimmedLine.startsWith('[[')) {
        if (currentMapping && currentMapping.id) {
          mappings.push(currentMapping as PortMapping);
        }
        inProxiesArray = false;
        const name = trimmedLine.slice(1, -1);
        if (name !== 'common') {
          currentMapping = {
            id: name,
            name: name,
            status: 'inactive' as const
          };
        }
      } else if (currentMapping && trimmedLine.includes('=')) {
        const [key, value] = trimmedLine.split('=').map(s => s.trim());
        const cleanValue = value.replace(/^["']|["']$/g, '');

        switch (key) {
          case 'name':
            currentMapping.id = cleanValue;
            currentMapping.name = cleanValue;
            break;
          case 'type':
            currentMapping.type = cleanValue;
            currentMapping.protocol = cleanValue as 'tcp' | 'udp';
            break;
          case 'localPort':
            currentMapping.localPort = parseInt(cleanValue, 10);
            break;
          case 'localIP':
          case 'localIp':
            currentMapping.localIP = cleanValue;
            currentMapping.localIp = cleanValue;
            break;
          case 'remotePort':
            currentMapping.remotePort = parseInt(cleanValue, 10);
            break;
        }
      }
    }
    if (currentMapping && currentMapping.id) {
      mappings.push(currentMapping as PortMapping);
    }
    return mappings;
  }

  async getMappings(): Promise<PortMapping[]> {
    const mappings = await this.parseMappings();
    const status = await this.getStatus();
    return mappings.map(m => ({
      ...m,
      status: status.running ? 'active' as const : 'inactive' as const
    }));
  }

  async addMapping(mapping: Omit<PortMapping, 'status'>): Promise<void> {
    let content = await this.getConfig();
    const mappingConfig = `
[[proxies]]
name = "${mapping.name}"
type = "${mapping.protocol}"
localIP = "${mapping.localIp || mapping.localIP || '127.0.0.1'}"
localPort = ${mapping.localPort}
${mapping.remotePort ? `remotePort = ${mapping.remotePort}\n` : ''}`;
    content += mappingConfig;
    await this.writeConfig(content);
  }

  async updateMapping(id: string, mapping: Partial<Omit<PortMapping, 'id' | 'status'>>): Promise<void> {
    let content = await this.getConfig();
    const lines = content.split('\n');
    let inTargetSection = false;
    let inProxiesArray = false;
    let newLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      if (trimmedLine === '[[proxies]]') {
        if (inTargetSection) inTargetSection = false;
        inProxiesArray = true;
        newLines.push(line);
      } else if (trimmedLine.startsWith(`[${id}]`) && !trimmedLine.startsWith('[[')) {
        inTargetSection = true;
        inProxiesArray = false;
        newLines.push(line);
      } else if ((inTargetSection || inProxiesArray) && trimmedLine.startsWith('[') && !trimmedLine.startsWith('[[')) {
        inTargetSection = false;
        newLines.push(line);
      } else if (inTargetSection && trimmedLine.includes('=')) {
        const [key] = trimmedLine.split('=').map(s => s.trim());
        if (key === 'type' && mapping.protocol !== undefined) {
          newLines.push(`type = "${mapping.protocol}"`);
        } else if (key === 'localPort' && mapping.localPort !== undefined) {
          newLines.push(`localPort = ${mapping.localPort}`);
        } else if ((key === 'localIp' || key === 'localIP') && (mapping.localIp !== undefined || mapping.localIP !== undefined)) {
          newLines.push(`localIP = "${mapping.localIp || mapping.localIP}"`);
        } else if (key === 'remotePort' && mapping.remotePort !== undefined) {
          newLines.push(`remotePort = ${mapping.remotePort}`);
        } else {
          newLines.push(line);
        }
      } else if (inProxiesArray && trimmedLine.includes('=')) {
        const [key, value] = trimmedLine.split('=').map(s => s.trim());
        const cleanValue = value.replace(/^["']|["']$/g, '');
        if (key === 'name' && cleanValue === id) {
          inTargetSection = true;
          newLines.push(line);
        } else if (inTargetSection) {
          if (key === 'type' && mapping.protocol !== undefined) {
            newLines.push(`type = "${mapping.protocol}"`);
          } else if (key === 'localPort' && mapping.localPort !== undefined) {
            newLines.push(`localPort = ${mapping.localPort}`);
          } else if ((key === 'localIp' || key === 'localIP') && (mapping.localIp !== undefined || mapping.localIP !== undefined)) {
            newLines.push(`localIP = "${mapping.localIp || mapping.localIP}"`);
          } else if (key === 'remotePort' && mapping.remotePort !== undefined) {
            newLines.push(`remotePort = ${mapping.remotePort}`);
          } else {
            newLines.push(line);
          }
        } else {
          newLines.push(line);
        }
      } else {
        newLines.push(line);
      }
    }
    await this.writeConfig(newLines.join('\n'));
  }

  async deleteMapping(id: string): Promise<void> {
    let content = await this.getConfig();
    const lines = content.split('\n');
    let inTargetSection = false;
    let inProxiesArray = false;
    let skipSection = false;
    let newLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      if (trimmedLine === '[[proxies]]') {
        if (inTargetSection) {
          inTargetSection = false;
          skipSection = false;
        }
        inProxiesArray = true;
        let foundTarget = false;
        for (let j = i + 1; j < lines.length; j++) {
          const nextLine = lines[j].trim();
          if (nextLine === '[[proxies]]' || (nextLine.startsWith('[') && nextLine.endsWith(']'))) {
            break;
          }
          if (nextLine.includes('=')) {
            const [key, value] = nextLine.split('=').map(s => s.trim());
            const cleanValue = value.replace(/^["']|["']$/g, '');
            if (key === 'name' && cleanValue === id) {
              foundTarget = true;
              break;
            }
          }
        }
        if (foundTarget) {
          skipSection = true;
        } else {
          newLines.push(line);
        }
      } else if (trimmedLine.startsWith(`[${id}]`) && !trimmedLine.startsWith('[[')) {
        inTargetSection = true;
        skipSection = true;
      } else if (skipSection && (trimmedLine.startsWith('[') || trimmedLine === '[[proxies]]')) {
        skipSection = false;
        inTargetSection = false;
        inProxiesArray = false;
        newLines.push(line);
      } else if (!skipSection) {
        newLines.push(line);
      }
    }
    await this.writeConfig(newLines.join('\n'));
  }

  async getLogs(maxLines: number): Promise<LogEntry[]> {
    return this.logBuffer.slice(-maxLines);
  }
}
