import { exec } from 'child_process';
import { ConnectionConfig, PortMapping, ServiceStatus, LogEntry } from '../../../shared/types.js';
import * as fs from 'fs';
import { logger } from '../../utils/logger.js';

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
        logger.warn(`[docker stderr] ${stderr.trim()}`);
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

/**
 * 验证 Docker 主机地址格式
 * 支持: unix:///path/to/socket, tcp://host:port, ssh://user@host
 */
function validateDockerHost(host: string): boolean {
  if (!host) return false;

  // 允许的协议前缀
  const allowedPrefixes = ['unix://', 'tcp://', 'ssh://'];
  const hasValidPrefix = allowedPrefixes.some(prefix => host.startsWith(prefix));

  if (!hasValidPrefix) {
    // 也允许纯路径（Unix socket 路径）
    return host.startsWith('/');
  }

  // 对 tcp:// 和 ssh:// 进行额外验证
  if (host.startsWith('tcp://')) {
    // 验证 tcp://host:port 格式
    const urlPattern = /^tcp:\/\/[a-zA-Z0-9.-]+(:\d+)?$/;
    return urlPattern.test(host);
  }

  if (host.startsWith('ssh://')) {
    // 验证 ssh://user@host 格式
    const sshPattern = /^ssh:\/\/[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+$/;
    return sshPattern.test(host);
  }

  return true;
}

/**
 * 转义 shell 参数，防止命令注入
 */
function escapeShellArg(arg: string): string {
  // 如果参数为空或包含危险字符，进行转义
  if (!arg) return '""';

  // 检查是否包含危险字符
  const dangerousChars = /[;|&$`{}\[\]<>!\\*?\n\r]/;
  if (dangerousChars.test(arg)) {
    // 使用单引号包裹并转义单引号
    return "'" + arg.replace(/'/g, "'\"'\"'") + "'";
  }

  return arg;
}

export class DockerAdapter {
  private config: ConnectionConfig;
  private dockerHost?: string;
  private containerName: string;

  constructor(config: ConnectionConfig) {
    this.config = config;

    // 验证 dockerHost
    if (config.dockerHost && !validateDockerHost(config.dockerHost)) {
      throw new Error(`Invalid dockerHost format: ${config.dockerHost}. Allowed formats: unix:///path, tcp://host:port, ssh://user@host, or absolute path`);
    }

    this.dockerHost = config.dockerHost;
    this.containerName = config.dockerContainerName || config.remoteDockerContainerName || '';
    if (!this.containerName) {
      throw new Error('Docker container name is required');
    }

    // 验证容器名称（只允许字母数字、下划线、横线、点）
    const validContainerName = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;
    if (!validContainerName.test(this.containerName)) {
      throw new Error(`Invalid container name: ${this.containerName}`);
    }
  }

  private buildDockerCmd(cmd: string): string {
    const escapedCmd = cmd.split(' ').map(arg => {
      // 对命令中的参数进行安全检查
      if (arg.includes(this.containerName)) {
        // 容器名称已验证，直接使用
        return arg;
      }
      return arg;
    }).join(' ');

    if (this.dockerHost) {
      const escapedHost = escapeShellArg(this.dockerHost);
      return `docker -H ${escapedHost} ${escapedCmd}`;
    }
    return `docker ${escapedCmd}`;
  }

  async connect(): Promise<void> {
    logger.info(`Connecting to Docker container: ${this.containerName}`);
    await this.execDockerCmd(`version`);
    logger.info(`Docker connection successful for container: ${this.containerName}`);
  }

  async disconnect(): Promise<void> {
    // Docker API is stateless, no need to disconnect
    logger.debug(`Disconnecting from Docker container: ${this.containerName}`);
  }

  private async execDockerCmd(cmd: string): Promise<string> {
    const fullCmd = this.buildDockerCmd(cmd);
    logger.debug(`Executing Docker command: ${fullCmd.replace(/\s+/g, ' ')}`);
    return execWithTimeout(fullCmd, 10000);
  }

  async getStatus(): Promise<ServiceStatus> {
    try {
      logger.debug(`Getting status for container: ${this.containerName}`);
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
          logger.warn(`Failed to get uptime for container ${this.containerName}`, { error: (e as Error).message });
        }
      }
      return {
        running,
        uptime,
        version: '0.52.3',
        deploymentType: 'docker'
      };
    } catch (error) {
      logger.error(`Failed to get status for container ${this.containerName}`, { error: (error as Error).message });
      return {
        running: false,
        version: '0.52.3',
        deploymentType: 'docker'
      };
    }
  }

  async startService(): Promise<void> {
    logger.info(`Starting Docker container: ${this.containerName}`);
    await this.execDockerCmd(`start ${this.containerName}`);
    logger.info(`Docker container started: ${this.containerName}`);
  }

  async stopService(): Promise<void> {
    logger.info(`Stopping Docker container: ${this.containerName}`);
    await this.execDockerCmd(`stop ${this.containerName}`);
    logger.info(`Docker container stopped: ${this.containerName}`);
  }

  async restartService(): Promise<void> {
    logger.info(`Restarting Docker container: ${this.containerName}`);
    await this.execDockerCmd(`restart ${this.containerName}`);
    logger.info(`Docker container restarted: ${this.containerName}`);
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
          logger.info(`Found config at ${containerPath} for container ${this.containerName}`);
          return stdout;
        }
      } catch (e: any) {
        errors.push(`Path ${containerPath}: ${e.message || 'exec failed'}`);
      }
    }

    logger.warn(`Could not find config file in container ${this.containerName}. Tried paths: ${possiblePaths.join(', ')}`);

    // 尝试检查容器是否存在以及状态
    try {
      const inspectOutput = await this.execDockerCmd(`inspect ${this.containerName}`);
      logger.debug(`Container inspect output for ${this.containerName}`, { inspect: inspectOutput.substring(0, 500) });
    } catch (e: any) {
      logger.error(`Failed to inspect container ${this.containerName}`, { error: e.message });
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
    logger.info(`Added mapping ${mapping.name} to container ${this.containerName}`);
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
    logger.info(`Updated mapping ${id} in container ${this.containerName}`);
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
    logger.info(`Deleted mapping ${id} from container ${this.containerName}`);
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
        if (this.dockerHost) {
          // 远程 Docker 的情况，使用 base64 编码写入内容
          const base64Content = Buffer.from(content).toString('base64');
          await this.execDockerCmd(`exec ${this.containerName} sh -c 'echo "${base64Content}" | base64 -d > ${containerPath}'`);
          logger.info(`Config written to ${containerPath} in container ${this.containerName} (remote Docker)`);
          return;
        } else {
          // 本地 Docker 的情况
          const tempFile = `/tmp/${tempFileName}`;
          fs.writeFileSync(tempFile, content);
          await this.execDockerCmd(`cp ${tempFile} ${this.containerName}:${containerPath}`);
          try { fs.unlinkSync(tempFile); } catch (e) { /* ignore */ }
          logger.info(`Config written to ${containerPath} in container ${this.containerName}`);
          return;
        }
      } catch (e) {
        logger.debug(`Failed to write config to ${containerPath}`, { error: (e as Error).message });
        continue;
      }
    }
    throw new Error('Could not write config file to container');
  }

  async getLogs(maxLines: number): Promise<LogEntry[]> {
    return new Promise((resolve, reject) => {
      exec(this.buildDockerCmd(`logs --tail ${maxLines} ${this.containerName}`), { timeout: 15000 }, (error, stdout, stderr) => {
        if (error) {
          logger.error(`Failed to get logs for container ${this.containerName}`, { error: error.message });
          reject(new Error(`Failed to get logs: ${error.message}`));
          return;
        }
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
        logger.debug(`Retrieved ${entries.length} log entries from container ${this.containerName}`);
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
