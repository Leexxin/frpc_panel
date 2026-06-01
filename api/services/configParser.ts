import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { exec } from 'child_process'
import { promisify } from 'util'
import { PortMapping } from '../../shared/types.js'

const execAsync = promisify(exec)

// for esm mode
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const DEFAULT_CONFIG_PATH = path.join(__dirname, '../../frpc.toml')

export class ConfigParser {
  private configPath: string
  private dockerContainerName: string | null = null
  private deploymentType: 'binary' | 'docker' = 'binary'

  constructor(configPath?: string) {
    this.configPath = configPath || DEFAULT_CONFIG_PATH
    this.ensureConfigExists()
  }

  setDeploymentType(type: 'binary' | 'docker') {
    this.deploymentType = type
  }

  setDockerContainerName(name: string) {
    this.dockerContainerName = name
  }

  setConfigPath(path: string) {
    this.configPath = path
  }

  private async execDockerCmd(cmd: string): Promise<string> {
    if (!this.dockerContainerName) {
      throw new Error('Docker container name not set')
    }
    const { stdout } = await execAsync(`docker ${cmd}`)
    return stdout
  }

  private async readFromDocker(): Promise<string> {
    try {
      // 尝试从容器中读取配置文件
      // 先尝试常见路径
      const possiblePaths = [
        '/etc/frpc/frpc.toml',
        '/frpc/frpc.toml',
        '/app/frpc.toml',
        './frpc.toml'
      ]

      for (const containerPath of possiblePaths) {
        try {
          const stdout = await this.execDockerCmd(
            `cp ${this.dockerContainerName}:${containerPath} /tmp/frpc-panel-config.toml 2>/dev/null && cat /tmp/frpc-panel-config.toml`
          )
          if (stdout && stdout.trim()) {
            return stdout
          }
        } catch (e) {
          continue
        }
      }

      // 如果找不到，尝试 inspect 容器获取挂载信息
      const inspect = await this.execDockerCmd(`inspect ${this.dockerContainerName}`)
      const containerInfo = JSON.parse(inspect)
      
      for (const mount of containerInfo[0].Mounts || []) {
        if (mount.Destination && (mount.Destination.includes('frpc') || mount.Destination.includes('toml'))) {
          try {
            const stdout = await this.execDockerCmd(
              `cp ${this.dockerContainerName}:${mount.Destination}/frpc.toml /tmp/frpc-panel-config.toml 2>/dev/null && cat /tmp/frpc-panel-config.toml`
            )
            if (stdout && stdout.trim()) {
              return stdout
            }
          } catch (e) {
            continue
          }
        }
      }

      throw new Error('Could not find frpc config in container')
    } catch (error) {
      throw new Error(`Failed to read config from container: ${(error as Error).message}`)
    }
  }

  private async writeToDocker(content: string): Promise<void> {
    try {
      // 先读取找出配置文件位置
      const tempFile = '/tmp/frpc-panel-config.toml'
      fs.writeFileSync(tempFile, content)
      
      // 尝试写入常见路径
      const possiblePaths = [
        '/etc/frpc/frpc.toml',
        '/frpc/frpc.toml',
        '/app/frpc.toml'
      ]

      for (const containerPath of possiblePaths) {
        try {
          await this.execDockerCmd(`cp ${tempFile} ${this.dockerContainerName}:${containerPath}`)
          console.log(`Config written to ${containerPath}`)
          return
        } catch (e) {
          continue
        }
      }

      throw new Error('Could not write config to container')
    } catch (error) {
      throw new Error(`Failed to write config to container: ${(error as Error).message}`)
    }
  }

  private ensureConfigExists(): void {
    if (this.deploymentType === 'binary' && !fs.existsSync(this.configPath)) {
      const defaultConfig = `[common]
serverAddr = "your-frpc-server.com"
serverPort = 7000

`
      fs.writeFileSync(this.configPath, defaultConfig, 'utf-8')
    }
  }

  getConfigPath(): string {
    return this.configPath
  }

  async readConfig(): Promise<string> {
    if (this.deploymentType === 'docker') {
      return await this.readFromDocker()
    }
    return fs.readFileSync(this.configPath, 'utf-8')
  }

  async writeConfig(content: string): Promise<void> {
    if (this.deploymentType === 'docker') {
      await this.writeToDocker(content)
    } else {
      fs.writeFileSync(this.configPath, content, 'utf-8')
    }
  }

  async parseMappings(): Promise<PortMapping[]> {
    const content = await this.readConfig()
    const mappings: PortMapping[] = []

    const lines = content.split('\n')
    let currentMapping: Partial<PortMapping> | null = null
    let inProxiesArray = false

    for (const line of lines) {
      const trimmedLine = line.trim()

      // 支持 [[proxies]] 格式
      if (trimmedLine === '[[proxies]]') {
        if (currentMapping && currentMapping.id) {
          mappings.push(currentMapping as PortMapping)
        }
        inProxiesArray = true
        currentMapping = {
          status: 'inactive' as const
        }
      } 
      // 支持旧的 [name] 格式
      else if (trimmedLine.startsWith('[') && trimmedLine.endsWith(']') && !trimmedLine.startsWith('[[')) {
        if (currentMapping && currentMapping.id) {
          mappings.push(currentMapping as PortMapping)
        }
        inProxiesArray = false
        const name = trimmedLine.slice(1, -1)
        if (name !== 'common') {
          currentMapping = {
            id: name,
            name: name,
            status: 'inactive' as const
          }
        }
      } 
      else if (currentMapping && trimmedLine.includes('=')) {
        const [key, value] = trimmedLine.split('=').map(s => s.trim())
        const cleanValue = value.replace(/^["']|["']$/g, '')
        
        switch (key) {
          case 'name':
            currentMapping.id = cleanValue
            currentMapping.name = cleanValue
            break
          case 'type':
            currentMapping.type = cleanValue
            currentMapping.protocol = cleanValue as 'tcp' | 'udp'
            break
          case 'localPort':
            currentMapping.localPort = parseInt(cleanValue, 10)
            break
          case 'localIP':
          case 'localIp':
            currentMapping.localIP = cleanValue
            currentMapping.localIp = cleanValue
            break
          case 'remotePort':
            currentMapping.remotePort = parseInt(cleanValue, 10)
            break
        }
      }
    }

    if (currentMapping && currentMapping.id) {
      mappings.push(currentMapping as PortMapping)
    }

    return mappings
  }

  async addMapping(mapping: Omit<PortMapping, 'status'>): Promise<void> {
    let content = await this.readConfig()

    const mappingConfig = `
[[proxies]]
name = "${mapping.name}"
type = "${mapping.protocol}"
localIP = "${mapping.localIp || mapping.localIP || '127.0.0.1'}"
localPort = ${mapping.localPort}
${mapping.remotePort ? `remotePort = ${mapping.remotePort}\n` : ''}
`

    content += mappingConfig
    await this.writeConfig(content)
  }

  async updateMapping(id: string, mapping: Partial<Omit<PortMapping, 'id' | 'status'>>): Promise<void> {
    let content = await this.readConfig()

    const lines = content.split('\n')
    let inTargetSection = false
    let inProxiesArray = false
    let newLines: string[] = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const trimmedLine = line.trim()

      if (trimmedLine === '[[proxies]]') {
        if (inTargetSection) {
          inTargetSection = false
        }
        inProxiesArray = true
        newLines.push(line)
      } 
      else if (trimmedLine.startsWith(`[${id}]`) && !trimmedLine.startsWith('[[')) {
        inTargetSection = true
        inProxiesArray = false
        newLines.push(line)
      } 
      else if ((inTargetSection || inProxiesArray) && trimmedLine.startsWith('[') && !trimmedLine.startsWith('[[')) {
        inTargetSection = false
        newLines.push(line)
      } 
      else if (inTargetSection && trimmedLine.includes('=')) {
        const [key] = trimmedLine.split('=').map(s => s.trim())
        if (key === 'type' && mapping.protocol !== undefined) {
          newLines.push(`type = "${mapping.protocol}"`)
        } else if (key === 'localPort' && mapping.localPort !== undefined) {
          newLines.push(`localPort = ${mapping.localPort}`)
        } else if ((key === 'localIp' || key === 'localIP') && (mapping.localIp !== undefined || mapping.localIP !== undefined)) {
          newLines.push(`localIP = "${mapping.localIp || mapping.localIP}"`)
        } else if (key === 'remotePort' && mapping.remotePort !== undefined) {
          newLines.push(`remotePort = ${mapping.remotePort}`)
        } else {
          newLines.push(line)
        }
      } 
      else if (inProxiesArray && trimmedLine.includes('=')) {
        const [key, value] = trimmedLine.split('=').map(s => s.trim())
        const cleanValue = value.replace(/^["']|["']$/g, '')
        
        if (key === 'name' && cleanValue === id) {
          inTargetSection = true
          newLines.push(line)
        } 
        else if (inTargetSection) {
          if (key === 'type' && mapping.protocol !== undefined) {
            newLines.push(`type = "${mapping.protocol}"`)
          } else if (key === 'localPort' && mapping.localPort !== undefined) {
            newLines.push(`localPort = ${mapping.localPort}`)
          } else if ((key === 'localIp' || key === 'localIP') && (mapping.localIp !== undefined || mapping.localIP !== undefined)) {
            newLines.push(`localIP = "${mapping.localIp || mapping.localIP}"`)
          } else if (key === 'remotePort' && mapping.remotePort !== undefined) {
            newLines.push(`remotePort = ${mapping.remotePort}`)
          } else {
            newLines.push(line)
          }
        } 
        else {
          newLines.push(line)
        }
      } 
      else {
        newLines.push(line)
      }
    }

    await this.writeConfig(newLines.join('\n'))
  }

  async deleteMapping(id: string): Promise<void> {
    let content = await this.readConfig()
    const lines = content.split('\n')
    let inTargetSection = false
    let inProxiesArray = false
    let skipSection = false
    let newLines: string[] = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const trimmedLine = line.trim()

      if (trimmedLine === '[[proxies]]') {
        if (inTargetSection) {
          inTargetSection = false
          skipSection = false
        }
        inProxiesArray = true
        // 先不添加，检查下一个 name
        let nextLines = []
        let foundTarget = false
        for (let j = i + 1; j < lines.length; j++) {
          const nextLine = lines[j].trim()
          if (nextLine === '[[proxies]]' || (nextLine.startsWith('[') && nextLine.endsWith(']'))) {
            break
          }
          if (nextLine.includes('=')) {
            const [key, value] = nextLine.split('=').map(s => s.trim())
            const cleanValue = value.replace(/^["']|["']$/g, '')
            if (key === 'name' && cleanValue === id) {
              foundTarget = true
              break
            }
          }
          nextLines.push(lines[j])
        }
        
        if (foundTarget) {
          skipSection = true
        } else {
          newLines.push(line)
        }
      } 
      else if (trimmedLine.startsWith(`[${id}]`) && !trimmedLine.startsWith('[[')) {
        inTargetSection = true
        skipSection = true
      } 
      else if (skipSection && (trimmedLine.startsWith('[') || trimmedLine === '[[proxies]]')) {
        skipSection = false
        inTargetSection = false
        inProxiesArray = false
        newLines.push(line)
      } 
      else if (!skipSection) {
        newLines.push(line)
      }
    }

    await this.writeConfig(newLines.join('\n'))
  }
}
