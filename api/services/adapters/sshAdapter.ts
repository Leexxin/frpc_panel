import { Client, ClientChannel, type Channel } from 'ssh2';
import { ConnectionConfig, DockerContainerInfo, LogEntry, PortMapping, ServiceStatus } from '../../../shared/types.js';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../../utils/logger.js';

const CONFIG_CANDIDATES = [
  '/etc/frp/frpc.toml', '/etc/frp/frpc.ini', '/frpc/frpc.toml', '/app/frpc.toml',
  '/frpc.toml', '/root/frpc.toml', '/home/frpc/frpc.toml', '/root/frp/frpc.toml',
];

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function validContainerName(value: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(value);
}

interface DockerInspect {
  Name?: string;
  Path?: string;
  Args?: string[];
  Config?: { Image?: string; Cmd?: string[]; Entrypoint?: string[] | string };
  State?: { Running?: boolean; Status?: string; StartedAt?: string };
  Mounts?: Array<{ Source?: string; Destination?: string }>;
}

interface ResolvedContainer extends DockerContainerInfo { running: boolean }

export class SSHAdapter {
  private client: Client | null = null;
  private connected = false;
  private detectedContainer?: ResolvedContainer;

  constructor(private config: ConnectionConfig) {}

  async connect(): Promise<void> {
    if (this.connected && this.client) return;
    const { sshHost, sshPort, sshUser, sshKeyPath, sshPassword } = this.config;
    if (!sshHost || !sshUser) throw new Error('SSH host and user are required');
    return new Promise((resolve, reject) => {
      const client = new Client();
      client.once('ready', () => { this.connected = true; this.client = client; resolve(); });
      client.once('error', (error) => reject(new Error(`SSH connection failed: ${error.message}`)));
      client.on('close', () => { this.connected = false; this.client = null; });
      const options: Record<string, unknown> = {
        host: sshHost, port: sshPort || 22, username: sshUser, readyTimeout: 10000,
      };
      if (sshKeyPath) {
        const keyPath = sshKeyPath.replace(/^~/, process.env.HOME || '');
        if (!fs.existsSync(keyPath)) throw new Error(`SSH private key not found: ${sshKeyPath}`);
        options.privateKey = fs.readFileSync(keyPath, 'utf8');
      }
      if (sshPassword) options.password = sshPassword;
      client.connect(options);
    });
  }

  async disconnect(): Promise<void> {
    this.client?.end();
    this.client = null;
    this.connected = false;
  }

  private async execCommand(command: string, timeoutMs = 30000): Promise<string> {
    if (!this.connected || !this.client) await this.connect();
    return new Promise((resolve, reject) => {
      if (!this.client) return reject(new Error('SSH client not available'));
      const timer = setTimeout(() => reject(new Error('SSH command timed out')), timeoutMs);
      this.client.exec(command, (error: Error | undefined, channel?: ClientChannel | Channel) => {
        if (error || !channel) {
          clearTimeout(timer);
          reject(new Error(`SSH exec failed: ${error?.message || 'channel not available'}`));
          return;
        }
        let stdout = '';
        let stderr = '';
        channel.on('data', (data: Buffer | string) => { stdout += data.toString(); });
        channel.stderr.on('data', (data: Buffer | string) => { stderr += data.toString(); });
        channel.on('close', (code: number | null) => {
          clearTimeout(timer);
          if (code === 0 || code === null) resolve(stdout);
          else reject(new Error(stderr.trim() || `Remote command exited with code ${code}`));
        });
        channel.on('error', (err: Error) => { clearTimeout(timer); reject(err); });
      });
    });
  }

  private deriveConfigPaths(inspect: DockerInspect): { configPath?: string; hostConfigPath?: string } {
    const entrypoint = Array.isArray(inspect.Config?.Entrypoint)
      ? inspect.Config.Entrypoint : inspect.Config?.Entrypoint ? [inspect.Config.Entrypoint] : [];
    const args = [inspect.Path, ...entrypoint, ...(inspect.Config?.Cmd || []), ...(inspect.Args || [])]
      .filter((item): item is string => Boolean(item));
    let configPath: string | undefined;
    args.forEach((arg, index) => {
      if ((arg === '-c' || arg === '--config') && args[index + 1]) configPath = args[index + 1];
      if (arg.startsWith('--config=')) configPath = arg.slice(9);
      if (arg.startsWith('-c=')) configPath = arg.slice(3);
    });
    const mounts = inspect.Mounts || [];
    if (!configPath) {
      configPath = mounts.find((mount) => /\/frpc\.(toml|ini|ya?ml|json)$/i.test(mount.Destination || ''))?.Destination;
    }
    if (!configPath && mounts.some((mount) => mount.Destination === '/etc/frp')) configPath = '/etc/frp/frpc.toml';
    let hostConfigPath: string | undefined;
    if (configPath) {
      const mount = mounts.find((item) => item.Source && item.Destination &&
        (configPath === item.Destination || configPath!.startsWith(`${item.Destination!.replace(/\/$/, '')}/`)));
      if (mount?.Source && mount.Destination) {
        hostConfigPath = configPath === mount.Destination
          ? mount.Source : path.posix.join(mount.Source, configPath.slice(mount.Destination.length));
      }
    }
    return { configPath, hostConfigPath };
  }

  private async inspectContainer(name: string): Promise<ResolvedContainer> {
    if (!validContainerName(name)) throw new Error(`Invalid Docker container name: ${name}`);
    const inspect = JSON.parse(await this.execCommand(`docker inspect ${shellEscape(name)}`))[0] as DockerInspect;
    const running = Boolean(inspect.State?.Running);
    return {
      name: (inspect.Name || name).replace(/^\//, ''), image: inspect.Config?.Image || '',
      status: inspect.State?.Status || (running ? 'running' : 'stopped'), state: inspect.State?.Status,
      running, ...this.deriveConfigPaths(inspect),
    };
  }

  async getDockerContainers(): Promise<DockerContainerInfo[]> {
    const format = '{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Command}}';
    const output = await this.execCommand(`docker ps -a --format ${shellEscape(format)}`);
    const candidates = output.split('\n').filter(Boolean).map((line) => {
      const [name, image, status, command = ''] = line.split('\t');
      return { name, image, status, command };
    }).filter(({ name, image, command }) => /frpc/i.test(name) || /frpc/i.test(image) || /(^|[\s/])frpc([\s]|$)/i.test(command));
    if (this.config.remoteDockerContainerName &&
        !candidates.some(({ name }) => name === this.config.remoteDockerContainerName)) {
      candidates.push({ name: this.config.remoteDockerContainerName, image: '', status: '', command: '' });
    }
    return Promise.all(candidates.map(async ({ name, image, status }) => {
      try {
        const container = await this.inspectContainer(name);
        return {
          name: container.name,
          image: container.image,
          status: container.status,
          state: container.state,
          configPath: container.configPath,
          hostConfigPath: container.hostConfigPath,
        };
      } catch (error) {
        logger.warn(`Failed to inspect remote container ${name}`, { error: (error as Error).message });
        return { name, image, status };
      }
    }));
  }

  private async resolveContainer(): Promise<ResolvedContainer | undefined> {
    const configured = this.config.remoteDockerContainerName;
    if (configured) return this.inspectContainer(configured);
    if (this.detectedContainer) return this.inspectContainer(this.detectedContainer.name);
    const containers = await this.getDockerContainers();
    if (!containers.length) return undefined;
    this.detectedContainer = await this.inspectContainer(containers[0].name);
    return this.detectedContainer;
  }

  private async resolveConfig(container: ResolvedContainer): Promise<ResolvedContainer> {
    if (this.config.remoteConfigPath) {
      const inspect = JSON.parse(await this.execCommand(`docker inspect ${shellEscape(container.name)}`))[0] as DockerInspect;
      const derived = this.deriveConfigPaths({
        ...inspect,
        Config: { ...inspect.Config, Cmd: ['-c', this.config.remoteConfigPath] },
      });
      container.configPath = this.config.remoteConfigPath;
      container.hostConfigPath = derived.hostConfigPath;
    }
    if (!container.configPath && container.running) {
      for (const candidate of CONFIG_CANDIDATES) {
        try {
          await this.execCommand(`docker exec ${shellEscape(container.name)} test -f ${shellEscape(candidate)}`);
          container.configPath = candidate;
          break;
        } catch { /* continue */ }
      }
    }
    if (!container.configPath) throw new Error(`Could not locate frpc config in container ${container.name}; set the config path manually`);
    return container;
  }

  async getStatus(): Promise<ServiceStatus> {
    const container = await this.resolveContainer();
    if (container) {
      const current = await this.inspectContainer(container.name);
      let version = current.image;
      if (current.running) {
        try { version = (await this.execCommand(`docker exec ${shellEscape(current.name)} frpc --version`, 10000)).trim() || version; } catch { /* use image */ }
      }
      const inspect = JSON.parse(await this.execCommand(`docker inspect ${shellEscape(current.name)}`))[0] as DockerInspect;
      const startedAt = inspect.State?.StartedAt ? new Date(inspect.State.StartedAt).getTime() : 0;
      return {
        running: current.running, uptime: current.running && startedAt ? Date.now() - startedAt : undefined,
        version, deploymentType: 'docker', containerName: current.name, configPath: current.configPath,
      };
    }
    const processName = (this.config.remoteFrpcPath || 'frpc').split('/').pop() || 'frpc';
    const pids = await this.execCommand(`pgrep -x ${shellEscape(processName)} || true`);
    return { running: Boolean(pids.trim()), deploymentType: 'ssh' };
  }

  async startService(): Promise<void> {
    const container = await this.resolveContainer();
    if (container) return void await this.execCommand(`docker start ${shellEscape(container.name)}`);
    const binary = this.config.remoteFrpcPath || 'frpc';
    const config = this.config.remoteConfigPath || '/etc/frp/frpc.toml';
    await this.execCommand(`nohup ${shellEscape(binary)} -c ${shellEscape(config)} >/dev/null 2>&1 &`);
  }

  async stopService(): Promise<void> {
    const container = await this.resolveContainer();
    if (container) return void await this.execCommand(`docker stop ${shellEscape(container.name)}`, 45000);
    const processName = (this.config.remoteFrpcPath || 'frpc').split('/').pop() || 'frpc';
    await this.execCommand(`pkill -x ${shellEscape(processName)} || true`);
  }

  async restartService(): Promise<void> {
    const container = await this.resolveContainer();
    if (container) return void await this.execCommand(`docker restart ${shellEscape(container.name)}`, 45000);
    await this.stopService();
    await this.startService();
  }

  async getConfig(): Promise<string> {
    const container = await this.resolveContainer();
    if (!container) return this.execCommand(`cat -- ${shellEscape(this.config.remoteConfigPath || '/etc/frp/frpc.toml')}`);
    const resolved = await this.resolveConfig(container);
    if (resolved.hostConfigPath) return this.execCommand(`cat -- ${shellEscape(resolved.hostConfigPath)}`);
    if (!resolved.running) throw new Error(`Container ${resolved.name} is stopped and its config is not bind-mounted`);
    return this.execCommand(`docker exec ${shellEscape(resolved.name)} cat -- ${shellEscape(resolved.configPath!)}`);
  }

  async writeConfig(content: string): Promise<void> {
    const container = await this.resolveContainer();
    const encoded = Buffer.from(content, 'utf8').toString('base64');
    if (!container) {
      const target = this.config.remoteConfigPath || '/etc/frp/frpc.toml';
      await this.writeRemoteFile(target, encoded);
      return;
    }
    const resolved = await this.resolveConfig(container);
    if (resolved.hostConfigPath) return this.writeRemoteFile(resolved.hostConfigPath, encoded);
    if (!resolved.running) throw new Error(`Container ${resolved.name} must be running to update an internal config`);
    const target = resolved.configPath!;
    const script = `cp -- ${shellEscape(target)} ${shellEscape(`${target}.frpc-panel.bak`)} && printf %s ${shellEscape(encoded)} | base64 -d > ${shellEscape(target)}`;
    await this.execCommand(`docker exec ${shellEscape(resolved.name)} sh -c ${shellEscape(script)}`);
  }

  private async writeRemoteFile(target: string, encoded: string): Promise<void> {
    const command = `cp -- ${shellEscape(target)} ${shellEscape(`${target}.frpc-panel.bak`)} && printf %s ${shellEscape(encoded)} | base64 -d > ${shellEscape(target)}`;
    await this.execCommand(command);
  }

  private parseMappings(content: string): PortMapping[] {
    const mappings: PortMapping[] = [];
    let current: Partial<PortMapping> | null = null;
    for (const source of content.split('\n')) {
      const line = source.trim();
      if (line === '[[proxies]]') {
        if (current?.id) mappings.push(current as PortMapping);
        current = { status: 'inactive' };
      } else if (/^\[[^[]+\]$/.test(line)) {
        if (current?.id) mappings.push(current as PortMapping);
        const name = line.slice(1, -1);
        current = name === 'common' ? null : { id: name, name, status: 'inactive' };
      } else if (current && line.includes('=')) {
        const separator = line.indexOf('=');
        const key = line.slice(0, separator).trim();
        const value = line.slice(separator + 1).trim().replace(/^["']|["']$/g, '');
        if (key === 'name') current.id = current.name = value;
        if (key === 'type') current.protocol = value as 'tcp' | 'udp';
        if (key === 'localPort') current.localPort = Number(value);
        if (key === 'remotePort') current.remotePort = Number(value);
        if (key === 'localIP' || key === 'localIp') current.localIP = current.localIp = value;
      }
    }
    if (current?.id) mappings.push(current as PortMapping);
    return mappings;
  }

  async getMappings(): Promise<PortMapping[]> {
    const [content, status] = await Promise.all([this.getConfig(), this.getStatus()]);
    return this.parseMappings(content).map((mapping) => ({ ...mapping, status: status.running ? 'active' : 'inactive' }));
  }

  async addMapping(mapping: Omit<PortMapping, 'status'>): Promise<void> {
    const content = await this.getConfig();
    const block = `\n[[proxies]]\nname = "${mapping.name}"\ntype = "${mapping.protocol}"\nlocalIP = "${mapping.localIp || mapping.localIP || '127.0.0.1'}"\nlocalPort = ${mapping.localPort}\n${mapping.remotePort ? `remotePort = ${mapping.remotePort}\n` : ''}`;
    await this.writeConfig(content.replace(/\s*$/, '\n') + block);
  }

  private findProxyBlock(lines: string[], id: string): { start: number; end: number } | undefined {
    for (let start = 0; start < lines.length; start += 1) {
      const header = lines[start].trim();
      if (header !== '[[proxies]]' && !/^\[[^[]+\]$/.test(header)) continue;
      let end = start + 1;
      while (end < lines.length && !/^\[/.test(lines[end].trim())) end += 1;
      const legacyName = header === '[[proxies]]' ? undefined : header.slice(1, -1);
      const nameLine = lines.slice(start + 1, end).find((line) => /^\s*name\s*=/.test(line));
      const arrayName = nameLine?.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
      if (legacyName === id || arrayName === id) return { start, end };
    }
  }

  async updateMapping(id: string, mapping: Partial<Omit<PortMapping, 'id' | 'status'>>): Promise<void> {
    const lines = (await this.getConfig()).split('\n');
    const block = this.findProxyBlock(lines, id);
    if (!block) throw new Error(`Mapping not found: ${id}`);
    const values: Record<string, string | number | undefined> = {
      name: mapping.name, type: mapping.protocol, localIP: mapping.localIp || mapping.localIP,
      localPort: mapping.localPort, remotePort: mapping.remotePort,
    };
    const seen = new Set<string>();
    for (let i = block.start + 1; i < block.end; i += 1) {
      const match = lines[i].match(/^\s*(name|type|localIP|localIp|localPort|remotePort)\s*=/);
      if (!match) continue;
      const key = match[1] === 'localIp' ? 'localIP' : match[1];
      if (values[key] === undefined) continue;
      const value = values[key];
      lines[i] = typeof value === 'string' ? `${key} = "${value}"` : `${key} = ${value}`;
      seen.add(key);
    }
    const additions = Object.entries(values).filter(([key, value]) => value !== undefined && !seen.has(key))
      .map(([key, value]) => typeof value === 'string' ? `${key} = "${value}"` : `${key} = ${value}`);
    lines.splice(block.end, 0, ...additions);
    await this.writeConfig(lines.join('\n'));
  }

  async deleteMapping(id: string): Promise<void> {
    const lines = (await this.getConfig()).split('\n');
    const block = this.findProxyBlock(lines, id);
    if (!block) throw new Error(`Mapping not found: ${id}`);
    lines.splice(block.start, block.end - block.start);
    await this.writeConfig(lines.join('\n'));
  }

  async getLogs(maxLines: number): Promise<LogEntry[]> {
    const lines = Math.max(1, Math.min(5000, Math.trunc(maxLines)));
    const container = await this.resolveContainer();
    const output = container
      ? await this.execCommand(`docker logs --tail ${lines} ${shellEscape(container.name)} 2>&1`)
      : await this.execCommand(`journalctl -u frpc --no-pager -n ${lines} 2>/dev/null || true`);
    return output.split('\n').filter(Boolean).map((message): LogEntry => {
      const lower = message.toLowerCase();
      const level = lower.includes('error') ? 'error' : lower.includes('warn') ? 'warn' : lower.includes('debug') ? 'debug' : 'info';
      return { timestamp: Date.now(), level, message };
    }).slice(-lines);
  }
}
