import { exec } from 'child_process';
import { ConnectionConfig, PortMapping, ServiceStatus, LogEntry } from '../../../shared/types.js';
import * as fs from 'fs';

// 带超时和 stderr 捕获的 exec 封装
function execWithTimeout(cmd: string, timeoutMs: number = 10000): Promise<string> {
  return new Promise((resolve, reject) => {
    let killed = false;
    const child = exec(cmd, { timeout: timeoutMs }, (error, stdout, stderr) => {
      clearTimeout(killTimer);
      if (error) {
        const stderrMsg = stderr ? `\nstderr: ${stderr.trim()}` : '';
        error.message = `${error.message}${stderrMsg}`;
        reject(error);
        return;
      }
      if (stderr) {
        console.warn(`[docker stderr] ${stderr.trim()}`);
      }
      resolve(stdout);
    });
    const killTimer = setTimeout(() => {
      if (!killed) {
        killed = true;
        try { child.kill(); } catch (e) { /* ignore */ }
      }
    }, timeoutMs + 1000);
  });
}

export class DockerAdapter {
  private config: ConnectionConfig;
  private dockerHost?: string;
  private containerName: string;

  constructor(config: ConnectionConfig) {
    this.config = config;
    this.dockerHost = config.dockerHost;
    this.containerName = config.dockerContainerName || config.remoteDockerContainerName || '';
    if (!this.containerName) {
      throw new Error('Docker container name is required');
    }
  }

  private buildDockerCmd(cmd: string): string {
    if (this.dockerHost) {
      return `docker -H ${this.dockerHost} ${cmd}`;
    }
    return `docker ${cmd}`;
  }

  async connect(): Promise<void> {
    await this.execDockerCmd(`version`);
  }

  async disconnect(): Promise<void> {
    // Docker API is stateless, no need to disconnect
  }

  private async execDockerCmd(cmd: string): Promise<string> {
    return execWithTimeout(this.buildDockerCmd(cmd), 10000);
  }

  async getStatus(): Promise<ServiceStatus> {
    try {
      const inspectRunning = await this.execDockerCmd(
        `inspect ${this.containerName} --format "{{.State.Running}}"`
      );
      const running = inspectRunning.trim() === 'true';
      let uptime: number | undefined;
      if (running) {
        try {
          const startedAtStr = await this.execDockerCmd(
            `inspect ${this.containerName} --format "{{.State.StartedAt}}"`
          );
          const startedAt = new Date(startedAtStr.trim());
          uptime = Date.now() - startedAt.getTime();
        } catch (e) {
          // ignore error
        }
      }
      return {
        running,
        uptime,
        version: '0.52.3',
        deploymentType: 'docker'
      };
    } catch (error) {
      return {
        running: false,
        version: '0.52.3',
        deploymentType: 'docker'
      };
    }
  }

  async startService(): Promise<void> {
    await this.execDockerCmd(`start ${this.containerName}`);
  }

  async stopService(): Promise<void> {
    await this.execDockerCmd(`stop ${this.containerName}`);
  }

  async restartService(): Promise<void> {
    await this.execDockerCmd(`restart ${this.containerName}`);
  }

  private async readConfig(): Promise<string> {
    const possiblePaths = [
      '/etc/frp/frpc.toml',
      '/etc/frpc/frpc.toml',
      '/frpc/frpc.toml',
      '/app/frpc.toml',
      './frpc.toml',
      '/frpc.toml',
      '/root/frpc.toml',
      '/home/frpc/frpc.toml',
      '/root/frp/frpc.toml'
    ];
    
    const errors: string[] = [];
    
    for (const containerPath of possiblePaths) {
      try {
        const stdout = await this.execDockerCmd(
          `exec ${this.containerName} cat ${containerPath}`
        );
        if (stdout && stdout.trim()) {
          console.log(`Found config at ${containerPath} for container ${this.containerName}`);
          return stdout;
        }
      } catch (e: any) {
        errors.push(`Path ${containerPath}: ${e.message || 'exec failed'}`);
      }
    }
    
    console.warn(`Could not find config file in container ${this.containerName}. Tried paths: ${possiblePaths.join(', ')}. Errors: ${errors.join('; ')}`);
    
    // 尝试检查容器是否存在以及状态
    try {
      const inspectOutput = await this.execDockerCmd(`inspect ${this.containerName}`);
      console.log(`Container inspect output for ${this.containerName}:`, inspectOutput);
    } catch (e: any) {
      console.error(`Failed to inspect container ${this.containerName}:`, e.message);
    }
    
    return '';
  }



  private async parseMappings(): Promise<PortMapping[]> {
    const content = await this.readConfig();
    const mappings: PortMapping[] = [];

    // 如果配置为空，直接返回空数组
    if (!content || !content.trim()) {
      return mappings;
    }

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
        currentMapping = {
          status: 'inactive' as const
        };
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
      status: status.running ? 'active' : 'inactive' as const
    }));
  }

  async addMapping(mapping: Omit<PortMapping, 'status'>): Promise<void> {
    let content = await this.readConfig();
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
    let content = await this.readConfig();
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
    let content = await this.readConfig();
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
        // Check next lines to see if this is the target
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
    return this.readConfig();
  }

  async writeConfig(content: string): Promise<void> {
    const tempFileName = `frpc-panel-tmp-${Date.now()}`;
    const possiblePaths = [
      '/etc/frp/frpc.toml',
      '/etc/frpc/frpc.toml',
      '/frpc/frpc.toml',
      '/app/frpc.toml',
      './frpc.toml',
      '/frpc.toml',
      '/root/frpc.toml',
      '/home/frpc/frpc.toml',
      '/root/frp/frpc.toml'
    ];
    
    for (const containerPath of possiblePaths) {
      try {
        // 对于远程 Docker，我们需要通过 stdin 写入，或者分两步处理
        // 先将内容保存到临时文件（用于本地，或者如果是远程则需要不同的方法）
        // 更好的方法是直接使用 docker exec 写入或者通过管道
        if (this.dockerHost) {
          // 远程 Docker 的情况，使用 exec 写入
          // 使用 printf 或 cat 来写入内容
          const escapedContent = content.replace(/'/g, "'\\''");
          await this.execDockerCmd(`exec ${this.containerName} sh -c 'printf "%s" '${escapedContent}' > ${containerPath}'`);
          return;
        } else {
          // 本地 Docker 的情况
          const tempFile = `/tmp/${tempFileName}`;
          fs.writeFileSync(tempFile, content);
          await this.execDockerCmd(`cp ${tempFile} ${this.containerName}:${containerPath}`);
          try { fs.unlinkSync(tempFile); } catch (e) { /* ignore */ }
          return;
        }
      } catch (e) {
        continue;
      }
    }
    throw new Error('Could not write config file to container');
  }

  async getLogs(maxLines: number): Promise<LogEntry[]> {
    return new Promise((resolve) => {
      exec(this.buildDockerCmd(`logs --tail ${maxLines} ${this.containerName}`), (error, stdout, stderr) => {
        const entries: LogEntry[] = [];
        const output = stdout + stderr;
        output.split('\n').filter(line => line.trim()).forEach(line => {
          let level: 'info' | 'warn' | 'error' | 'debug' = 'info';
          const lowerLine = line.toLowerCase();
          if (lowerLine.includes('error')) level = 'error';
          else if (lowerLine.includes('warn')) level = 'warn';
          else if (lowerLine.includes('debug')) level = 'debug';
          entries.push({
            timestamp: Date.now(),
            level,
            message: line
          });
        });
        resolve(entries);
      });
    });
  }

  async getDockerContainers(): Promise<{ name: string; image: string; status: string }[]> {
    const stdout = await this.execDockerCmd(`ps -a --format "{{.Names}}|{{.Image}}|{{.Status}}"`);
    return stdout.trim().split('\n').filter(line => line).map(line => {
      const [name, image, status] = line.split('|');
      return { name, image, status };
    });
  }
}