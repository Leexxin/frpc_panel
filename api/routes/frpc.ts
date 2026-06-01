import { Router, type Request, type Response } from 'express'
import { ConfigParser } from '../services/configParser.js'
import { ProcessManager } from '../services/processManager.js'
import { PortMapping, ServiceStatus, ConfigFile, ApiResponse, FrpcConfig, LogEntry } from '../../shared/types.js'
import { execSync } from 'child_process'

const router = Router()
const configParser = new ConfigParser()
const processManager = new ProcessManager(configParser.getConfigPath())

// 同步配置到 configParser
function syncConfigToParser() {
  const config = processManager.getPanelConfig()
  configParser.setDeploymentType(config.deploymentType)
  if (config.dockerContainerName) {
    configParser.setDockerContainerName(config.dockerContainerName)
  }
  if (config.configPath) {
    configParser.setConfigPath(config.configPath)
  }
}

router.get('/status', (req: Request, res: Response): void => {
  try {
    const config = processManager.getPanelConfig()
    const status: ServiceStatus = {
      running: processManager.isRunning(),
      uptime: processManager.getUptime() || undefined,
      version: '0.52.3',
      deploymentType: config.deploymentType
    }
    const response: ApiResponse<ServiceStatus> = { success: true, data: status }
    res.json(response)
  } catch (error) {
    const response: ApiResponse<never> = { success: false, error: (error as Error).message }
    res.status(500).json(response)
  }
})

router.post('/service/start', async (req: Request, res: Response): Promise<void> => {
  try {
    syncConfigToParser()
    await processManager.start()
    const response: ApiResponse<{ message: string }> = { success: true, data: { message: 'frpc started successfully' } }
    res.json(response)
  } catch (error) {
    const response: ApiResponse<never> = { success: false, error: (error as Error).message }
    res.status(500).json(response)
  }
})

router.post('/service/stop', async (req: Request, res: Response): Promise<void> => {
  try {
    syncConfigToParser()
    await processManager.stop()
    const response: ApiResponse<{ message: string }> = { success: true, data: { message: 'frpc stopped successfully' } }
    res.json(response)
  } catch (error) {
    const response: ApiResponse<never> = { success: false, error: (error as Error).message }
    res.status(500).json(response)
  }
})

router.post('/service/restart', async (req: Request, res: Response): Promise<void> => {
  try {
    syncConfigToParser()
    await processManager.restart()
    const response: ApiResponse<{ message: string }> = { success: true, data: { message: 'frpc restarted successfully' } }
    res.json(response)
  } catch (error) {
    const response: ApiResponse<never> = { success: false, error: (error as Error).message }
    res.status(500).json(response)
  }
})

router.get('/config/panel', (req: Request, res: Response): void => {
  try {
    const config = processManager.getPanelConfig()
    const response: ApiResponse<FrpcConfig> = { success: true, data: config }
    res.json(response)
  } catch (error) {
    const response: ApiResponse<never> = { success: false, error: (error as Error).message }
    res.status(500).json(response)
  }
})

router.put('/config/panel', (req: Request, res: Response): void => {
  try {
    const config = req.body
    processManager.setPanelConfig(config)
    syncConfigToParser()
    const response: ApiResponse<{ message: string }> = { success: true, data: { message: 'Panel config saved successfully' } }
    res.json(response)
  } catch (error) {
    const response: ApiResponse<never> = { success: false, error: (error as Error).message }
    res.status(500).json(response)
  }
})

router.post('/config/detect', (req: Request, res: Response): void => {
  try {
    const result = processManager.autoDetect()
    syncConfigToParser()
    const response: ApiResponse<typeof result> = { success: true, data: result }
    res.json(response)
  } catch (error) {
    const response: ApiResponse<never> = { success: false, error: (error as Error).message }
    res.status(500).json(response)
  }
})

// 获取所有可用的 Docker 容器列表
router.get('/docker/containers', (req: Request, res: Response): void => {
  try {
    const output = execSync('docker ps -a --format "{{.Names}}|{{.Image}}|{{.Status}}"', { encoding: 'utf-8' })
    const containers = output.trim().split('\n').filter(line => line).map(line => {
      const [name, image, status] = line.split('|')
      return { name, image, status }
    })
    const response: ApiResponse<typeof containers> = { success: true, data: containers }
    res.json(response)
  } catch (error) {
    const response: ApiResponse<never> = { success: false, error: (error as Error).message }
    res.status(500).json(response)
  }
})

router.get('/logs', async (req: Request, res: Response): Promise<void> => {
  try {
    const maxLines = parseInt(req.query.lines as string) || 100
    const config = processManager.getPanelConfig()
    let logs: LogEntry[]
    
    if (config.deploymentType === 'docker') {
      logs = await processManager.getDockerLogs(maxLines)
    } else {
      logs = processManager.getLogs(maxLines)
    }
    
    const response: ApiResponse<LogEntry[]> = { success: true, data: logs }
    res.json(response)
  } catch (error) {
    const response: ApiResponse<never> = { success: false, error: (error as Error).message }
    res.status(500).json(response)
  }
})

router.delete('/logs', (req: Request, res: Response): void => {
  try {
    processManager.clearLogs()
    const response: ApiResponse<{ message: string }> = { success: true, data: { message: 'Logs cleared successfully' } }
    res.json(response)
  } catch (error) {
    const response: ApiResponse<never> = { success: false, error: (error as Error).message }
    res.status(500).json(response)
  }
})

router.get('/mappings', async (req: Request, res: Response): Promise<void> => {
  try {
    syncConfigToParser()
    const mappings = await configParser.parseMappings()
    const isRunning = processManager.isRunning()
    const mappingsWithStatus = mappings.map(m => ({
      ...m,
      status: (isRunning ? 'active' : 'inactive') as 'active' | 'inactive'
    }))
    const response: ApiResponse<PortMapping[]> = { success: true, data: mappingsWithStatus as PortMapping[] }
    res.json(response)
  } catch (error) {
    const response: ApiResponse<never> = { success: false, error: (error as Error).message }
    res.status(500).json(response)
  }
})

router.post('/mappings', async (req: Request, res: Response): Promise<void> => {
  try {
    syncConfigToParser()
    const mapping: Omit<PortMapping, 'status'> = req.body
    await configParser.addMapping(mapping)
    const response: ApiResponse<{ message: string }> = { success: true, data: { message: 'Mapping added successfully' } }
    res.json(response)
  } catch (error) {
    const response: ApiResponse<never> = { success: false, error: (error as Error).message }
    res.status(500).json(response)
  }
})

router.put('/mappings/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    syncConfigToParser()
    const { id } = req.params
    const mapping = req.body
    await configParser.updateMapping(id, mapping)
    const response: ApiResponse<{ message: string }> = { success: true, data: { message: 'Mapping updated successfully' } }
    res.json(response)
  } catch (error) {
    const response: ApiResponse<never> = { success: false, error: (error as Error).message }
    res.status(500).json(response)
  }
})

router.delete('/mappings/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    syncConfigToParser()
    const { id } = req.params
    await configParser.deleteMapping(id)
    const response: ApiResponse<{ message: string }> = { success: true, data: { message: 'Mapping deleted successfully' } }
    res.json(response)
  } catch (error) {
    const response: ApiResponse<never> = { success: false, error: (error as Error).message }
    res.status(500).json(response)
  }
})

router.get('/config', async (req: Request, res: Response): Promise<void> => {
  try {
    syncConfigToParser()
    const content = await configParser.readConfig()
    const config: ConfigFile = {
      path: configParser.getConfigPath(),
      content
    }
    const response: ApiResponse<ConfigFile> = { success: true, data: config }
    res.json(response)
  } catch (error) {
    const response: ApiResponse<never> = { success: false, error: (error as Error).message }
    res.status(500).json(response)
  }
})

router.put('/config', async (req: Request, res: Response): Promise<void> => {
  try {
    syncConfigToParser()
    const { content } = req.body
    await configParser.writeConfig(content)
    const response: ApiResponse<{ message: string }> = { success: true, data: { message: 'Config saved successfully' } }
    res.json(response)
  } catch (error) {
    const response: ApiResponse<never> = { success: false, error: (error as Error).message }
    res.status(500).json(response)
  }
})

export default router
