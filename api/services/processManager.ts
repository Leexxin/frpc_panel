import { spawn, ChildProcess, exec, execSync } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'
import { LogEntry } from '../../shared/types.js'

// for esm mode
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const CONFIG_FILE = path.join(__dirname, '../../data/frpc-panel-config.json')

interface PanelConfig {
  frpcPath?: string
  configPath?: string
  deploymentType: 'binary' | 'docker'
  dockerContainerName?: string
}

export class ProcessManager {
  private frpcProcess: ChildProcess | null = null
  private startTime: number | null = null
  private logs: LogEntry[] = []
  private panelConfig: PanelConfig

  constructor(private defaultConfigPath: string) {
    this.panelConfig = this.loadPanelConfig()
    this.ensureDataDir()
  }

  private ensureDataDir() {
    const dataDir = path.dirname(CONFIG_FILE)
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true })
    }
  }

  private loadPanelConfig(): PanelConfig {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        const content = fs.readFileSync(CONFIG_FILE, 'utf-8')
        return JSON.parse(content)
      }
    } catch (error) {
      console.error('Failed to load panel config:', error)
    }
    return {
      deploymentType: 'docker', // 默认改为 docker，因为用户是 docker 部署
      configPath: this.defaultConfigPath
    }
  }

  private savePanelConfig(): void {
    try {
      this.ensureDataDir()
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(this.panelConfig, null, 2))
    } catch (error) {
      console.error('Failed to save panel config:', error)
    }
  }

  getPanelConfig() {
    return {
      ...this.panelConfig,
      autoDetected: !this.panelConfig.frpcPath && !this.panelConfig.dockerContainerName
    }
  }

  setPanelConfig(config: Partial<PanelConfig>): void {
    this.panelConfig = {
      ...this.panelConfig,
      ...config
    }
    this.savePanelConfig()
  }

  private detectFrpcPath(): string | null {
    const possiblePaths = [
      'frpc',
      '/usr/local/bin/frpc',
      '/usr/bin/frpc',
      '/opt/frpc/frpc',
      path.join(__dirname, '../../frpc'),
      path.join(__dirname, '../../bin/frpc')
    ]

    for (const binPath of possiblePaths) {
      try {
        if (binPath === 'frpc') {
          execSync('which frpc', { stdio: 'ignore' })
          return 'frpc'
        } else if (fs.existsSync(binPath)) {
          return binPath
        }
      } catch (error) {
        continue
      }
    }

    return null
  }

  private detectDockerContainer(): string | null {
    try {
      const output = execSync('docker ps --format "{{.Names}}"', { encoding: 'utf-8' })
      const containers = output.trim().split('\n').filter(n => n)
      
      for (const container of containers) {
        if (container.toLowerCase().includes('frpc')) {
          return container
        }
      }
      
      // 如果没有找到包含 frpc 的容器，返回第一个容器让用户选
      if (containers.length > 0) {
        return containers[0]
      }
      
      return null
    } catch (error) {
      return null
    }
  }

  autoDetect(): { frpcPath?: string; dockerContainer?: string } {
    const result: { frpcPath?: string; dockerContainer?: string } = {}
    
    if (this.panelConfig.deploymentType === 'binary') {
      const path = this.detectFrpcPath()
      if (path) {
        result.frpcPath = path
        this.panelConfig.frpcPath = path
        this.savePanelConfig()
      }
    } else {
      const container = this.detectDockerContainer()
      if (container) {
        result.dockerContainer = container
        this.panelConfig.dockerContainerName = container
        this.savePanelConfig()
      }
    }
    
    return result
  }

  isRunning(): boolean {
    if (this.panelConfig.deploymentType === 'binary') {
      return this.frpcProcess !== null && !this.frpcProcess.killed
    } else {
      try {
        if (!this.panelConfig.dockerContainerName) return false
        const output = execSync(
          `docker inspect ${this.panelConfig.dockerContainerName} --format "{{.State.Running}}"`, 
          { encoding: 'utf-8' }
        )
        return output.trim() === 'true'
      } catch (error) {
        return false
      }
    }
  }

  getUptime(): number | null {
    if (this.panelConfig.deploymentType === 'binary') {
      if (this.startTime === null) return null
      return Date.now() - this.startTime
    } else {
      try {
        if (!this.panelConfig.dockerContainerName) return null
        const output = execSync(
          `docker inspect ${this.panelConfig.dockerContainerName} --format "{{.State.StartedAt}}"`, 
          { encoding: 'utf-8' }
        )
        const startedAt = new Date(output.trim()).getTime()
        return Date.now() - startedAt
      } catch (error) {
        return null
      }
    }
  }

  getLogs(maxLines: number = 100): LogEntry[] {
    return this.logs.slice(-maxLines)
  }

  clearLogs(): void {
    this.logs = []
  }

  private addLog(level: 'info' | 'warn' | 'error' | 'debug', message: string): void {
    this.logs.push({
      timestamp: Date.now(),
      level,
      message
    })
    // 保留最多 1000 条日志
    if (this.logs.length > 1000) {
      this.logs = this.logs.slice(-1000)
    }
  }

  async start(): Promise<void> {
    if (this.isRunning()) {
      throw new Error('frpc is already running')
    }

    if (this.panelConfig.deploymentType === 'binary') {
      const frpcPath = this.panelConfig.frpcPath || this.detectFrpcPath()
      if (!frpcPath) {
        throw new Error('frpc binary not found, please configure path manually')
      }

      const configPath = this.panelConfig.configPath || this.defaultConfigPath

      return new Promise((resolve, reject) => {
        this.frpcProcess = spawn(frpcPath, ['-c', configPath], {
          detached: false,
          stdio: 'pipe'
        })

        this.frpcProcess.on('spawn', () => {
          this.startTime = Date.now()
          this.addLog('info', 'frpc started successfully')
          resolve()
        })

        this.frpcProcess.on('error', (error) => {
          this.frpcProcess = null
          this.startTime = null
          this.addLog('error', `frpc failed to start: ${error.message}`)
          reject(error)
        })

        this.frpcProcess.on('exit', (code, signal) => {
          this.frpcProcess = null
          this.startTime = null
          this.addLog('info', `frpc exited with code ${code}, signal ${signal}`)
        })

        if (this.frpcProcess.stdout) {
          this.frpcProcess.stdout.on('data', (data) => {
            const message = data.toString()
            this.addLog('info', message)
            console.log(`frpc stdout: ${message}`)
          })
        }

        if (this.frpcProcess.stderr) {
          this.frpcProcess.stderr.on('data', (data) => {
            const message = data.toString()
            this.addLog('error', message)
            console.error(`frpc stderr: ${message}`)
          })
        }
      })
    } else {
      // Docker 模式
      if (!this.panelConfig.dockerContainerName) {
        throw new Error('Docker container name not configured')
      }

      return new Promise((resolve, reject) => {
        exec(`docker start ${this.panelConfig.dockerContainerName}`, (error, stdout, stderr) => {
          if (error) {
            this.addLog('error', `Failed to start docker container: ${error.message}`)
            reject(error)
            return
          }
          if (stderr) {
            this.addLog('warn', `Docker start warning: ${stderr}`)
          }
          this.addLog('info', `Docker container ${this.panelConfig.dockerContainerName} started`)
          resolve()
        })
      })
    }
  }

  async stop(): Promise<void> {
    if (this.panelConfig.deploymentType === 'binary') {
      if (!this.isRunning() || !this.frpcProcess) {
        throw new Error('frpc is not running')
      }

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          if (this.frpcProcess) {
            this.frpcProcess.kill('SIGKILL')
          }
        }, 5000)

        this.frpcProcess!.once('exit', () => {
          clearTimeout(timeout)
          this.frpcProcess = null
          this.startTime = null
          this.addLog('info', 'frpc stopped successfully')
          resolve()
        })

        this.frpcProcess!.kill('SIGTERM')
      })
    } else {
      if (!this.panelConfig.dockerContainerName) {
        throw new Error('Docker container name not configured')
      }

      return new Promise((resolve, reject) => {
        exec(`docker stop ${this.panelConfig.dockerContainerName}`, (error, stdout, stderr) => {
          if (error) {
            this.addLog('error', `Failed to stop docker container: ${error.message}`)
            reject(error)
            return
          }
          if (stderr) {
            this.addLog('warn', `Docker stop warning: ${stderr}`)
          }
          this.addLog('info', `Docker container ${this.panelConfig.dockerContainerName} stopped`)
          resolve()
        })
      })
    }
  }

  async restart(): Promise<void> {
    if (this.isRunning()) {
      await this.stop()
    }
    await this.start()
  }

  async getDockerLogs(maxLines: number = 100): Promise<LogEntry[]> {
    if (this.panelConfig.deploymentType !== 'docker' || !this.panelConfig.dockerContainerName) {
      return this.getLogs(maxLines)
    }

    return new Promise((resolve) => {
      exec(`docker logs --tail ${maxLines} ${this.panelConfig.dockerContainerName}`, (error, stdout, stderr) => {
        const entries: LogEntry[] = []
        const output = stdout + stderr
        
        output.split('\n').filter(line => line.trim()).forEach(line => {
          let level: 'info' | 'warn' | 'error' | 'debug' = 'info'
          const lowerLine = line.toLowerCase()
          if (lowerLine.includes('error')) level = 'error'
          else if (lowerLine.includes('warn')) level = 'warn'
          else if (lowerLine.includes('debug')) level = 'debug'
          
          entries.push({
            timestamp: Date.now(),
            level,
            message: line
          })
        })
        
        resolve(entries)
      })
    })
  }
}
