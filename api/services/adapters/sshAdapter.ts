import { Client, ClientChannel, type Channel } from 'ssh2';
import { ConnectionConfig, PortMapping, ServiceStatus, LogEntry } from '../../../shared/types.js';
import * as fs from 'fs';

export class SSHAdapter {
  private config: ConnectionConfig;
  private client: Client | null = null;
  private connected = false;
  private logBuffer: LogEntry[] = [];

  constructor(config: ConnectionConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    const { sshHost, sshPort, sshUser, sshKeyPath, sshPassword } = this.config;
    if (!sshHost || !sshUser) {
      throw new Error('SSH host and user are required');
    }

    return new Promise((resolve, reject) => {
      const client = new Client();
      
      client.on('ready', () => {
        this.connected = true;
        this.client = client;
        resolve();
      });

      client.on('error', (err) => {
        reject(new Error(`SSH connection failed: ${err.message}`));
      });

      client.on('close', () => {
        this.connected = false;
        this.client = null;
      });

      const connectConfig: any = {
        host: sshHost,
        port: sshPort || 22,
        username: sshUser,
        readyTimeout: 10000,
      };

      if (sshKeyPath) {
        const resolvedPath = sshKeyPath.replace(/^~/, process.env.HOME || '');
        if (fs.existsSync(resolvedPath)) {
          connectConfig.privateKey = fs.readFileSync(resolvedPath, 'utf-8');
        }
      }
      
      if (sshPassword) {
        connectConfig.password = sshPassword;
      }

      client.connect(connectConfig);
    });
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      this.client.end();
      this.client = null;
      this.connected = false;
    }
  }

  private async execCommand(command: string): Promise<string> {
    if (!this.connected || !this.client) {
      await this.connect();
    }

    return new Promise((resolve, reject) => {
      if (!this.client) {
        reject(new Error('SSH client not available'));
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error(`SSH command timed out: ${command}`));
      }, 30000);

      this.client.exec(command, (err: Error | undefined, channel?: ClientChannel | Channel) => {
        if (err) {
          clearTimeout(timeout);
          reject(new Error(`SSH exec failed: ${err.message}`));
          return;
        }

        if (!channel) {
          clearTimeout(timeout);
          reject(new Error('SSH channel not available'));
          return;
        }

        let stdout = '';
        let stderr = '';

        channel.on('data', (data: Buffer | string) => {
          stdout += data.toString();
        });

        channel.stderr.on('data', (data: Buffer | string) => {
          stderr += data.toString();
        });

        channel.on('close', (exitCode: number | null) => {
          clearTimeout(timeout);
          if (exitCode !== 0 && exitCode !== null) {
            const errMsg = stderr || `Exit code: ${exitCode}`;
            reject(new Error(`SSH command failed: ${errMsg}`));
          } else {
            resolve(stdout);
          }
        });

        channel.on('error', (channelErr: Error) => {
          clearTimeout(timeout);
          reject(new Error(`SSH channel error: ${channelErr.message}`));
        });
      });
    });
  }

  async getStatus(): Promise<ServiceStatus> {
    try {
      if (!this.connected) {
        await this.connect();
      }

      const remotePath = this.config.remoteFrpcPath || 'frpc';
      const remoteConfigPath = this.config.remoteConfigPath || '/etc/frp/frpc.toml';
      
      // 检查 frpc 进程是否在运行
      const pgrepOutput = await this.execCommand(`pgrep -x ${remotePath.split('/').pop()} || echo "not_running"`);
      const running = pgrepOutput.trim() !== 'not_running' && pgrepOutput.trim().length > 0;

      // 尝试获取版本
      let version = '0.52.3';
      try {
        const versionOutput = await this.execCommand(`${remotePath} --version 2>/dev/null || echo "unknown"`);
        const v = versionOutput.trim();
        if (v !== 'unknown') version = v;
      } catch (e) {
        // version check failed, use default
      }

      return {
        running,
        version,
        deploymentType: 'ssh'
      };
    } catch (error) {
      return {
        running: false,
        version: '0.52.3',
        deploymentType: 'ssh'
      };
    }
  }

  async startService(): Promise<void> {
    const remotePath = this.config.remoteFrpcPath || 'frpc';
    const remoteConfigPath = this.config.remoteConfigPath || '/etc/frp/frpc.toml';
    
    try {
      // 先检查是否已在运行
      const status = await this.getStatus();
      if (status.running) {
        throw new Error('Service is already running');
      }

      await this.execCommand(`nohup ${remotePath} -c ${remoteConfigPath} > /dev/null 2>&1 &`);
      this.logBuffer.push({
        timestamp: Date.now(),
        level: 'info',
        message: `frpc started on remote host ${this.config.sshHost}`
      });
    } catch (error) {
      throw new Error(`Failed to start remote service: ${(error as Error).message}`);
    }
  }

  async stopService(): Promise<void> {
    const remotePath = this.config.remoteFrpcPath || 'frpc';
    const processName = remotePath.split('/').pop() || 'frpc';
    
    try {
      await this.execCommand(`pkill -x ${processName} || true`);
      this.logBuffer.push({
        timestamp: Date.now(),
        level: 'info',
        message: `frpc stopped on remote host ${this.config.sshHost}`
      });
    } catch (error) {
      throw new Error(`Failed to stop remote service: ${(error as Error).message}`);
    }
  }

  async restartService(): Promise<void> {
    await this.stopService();
    await new Promise(resolve => setTimeout(resolve, 2000));
    await this.startService();
  }

  async getMappings(): Promise<PortMapping[]> {
    try {
      const content = await this.getConfig();
      return this.parseMappings(content);
    } catch (error) {
      return [];
    }
  }

  private parseMappings(content: string): PortMapping[] {
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

  async addMapping(mapping: Omit<PortMapping, 'status'>): Promise<void> {
    let content = await this.getConfig();
    const mappingConfig = `
[[proxies]]
name = "${mapping.name}"
type = "${mapping.protocol}"
localIP = "${mapping.localIp || mapping.localIP || '127.0.0.1'}"
localPort = ${mapping.localPort}
${mapping.remotePort ? `remotePort = ${mapping.remotePort}\n` : ''}
`;
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

  async getConfig(): Promise<string> {
    const remoteConfigPath = this.config.remoteConfigPath || '/etc/frp/frpc.toml';
    try {
      const output = await this.execCommand(`cat ${remoteConfigPath} 2>/dev/null || echo ""`);
      return output;
    } catch (error) {
      return '';
    }
  }

  async writeConfig(content: string): Promise<void> {
    const remoteConfigPath = this.config.remoteConfigPath || '/etc/frp/frpc.toml';
    if (!this.connected || !this.client) {
      await this.connect();
    }

    return new Promise((resolve, reject) => {
      if (!this.client) {
        reject(new Error('SSH client not available'));
        return;
      }

      // 使用 sftp 或者通过 echo 写入配置文件
      // 这里使用 sftp 处理更可靠
      this.client.sftp((err, sftp) => {
        if (err) {
          // Fallback to echo command
          this.execCommand(`cat > ${remoteConfigPath} << 'EOF'\n${content}\nEOF`)
            .then(() => resolve())
            .catch(reject);
          return;
        }

        const writeStream = sftp.createWriteStream(remoteConfigPath);
        writeStream.on('close', () => {
          sftp.end();
          resolve();
        });
        writeStream.on('error', (writeErr) => {
          sftp.end();
          reject(new Error(`SFTP write failed: ${writeErr.message}`));
        });
        writeStream.end(content);
      });
    });
  }

  async getLogs(maxLines: number): Promise<LogEntry[]> {
    // 返回内存中的日志（来自服务操作）
    const logs = this.logBuffer.slice(-maxLines);
    
    // 尝试通过 SSH 获取远程 syslog 或直接 journalctl 日志
    try {
      const remotePath = this.config.remoteFrpcPath || 'frpc';
      const processName = remotePath.split('/').pop() || 'frpc';
      const journalOutput = await this.execCommand(`journalctl -u ${processName} --no-pager -n ${maxLines} 2>/dev/null || cat /var/log/${processName}.log 2>/dev/null || echo ""`);
      
      if (journalOutput.trim()) {
        const remoteLogs = journalOutput.split('\n').filter(Boolean).map(line => ({
          timestamp: Date.now(),
          level: line.toLowerCase().includes('error') ? 'error' as const : 'info' as const,
          message: line
        }));
        return [...logs, ...remoteLogs].slice(-maxLines);
      }
    } catch (e) {
      // console log not available, return buffer only
    }

    return logs;
  }
}
