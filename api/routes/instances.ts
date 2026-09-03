import { Router, type Request, type Response, type NextFunction } from 'express';
import { InstanceManager } from '../services/instanceManager.js';
import { FrpcInstance, ConnectionType, PortMapping, LogEntry, ConfigFile, ApiResponse, DockerContainerInfo, DockerDiscoveryResult, CreateFrpcContainerInput, InstanceStatus } from '../../shared/types.js';
import { logger } from '../utils/logger.js';

const router = Router();
const instanceManager = new InstanceManager();

// 请求验证中间件
function validateInstanceData(req: Request, res: Response, next: NextFunction): void {
  const { name, connectionType, config } = req.body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    res.status(400).json({ success: false, error: 'Instance name is required' });
    return;
  }

  if (!connectionType || !['local_docker', 'local_binary', 'remote_ssh', 'remote_docker'].includes(connectionType)) {
    res.status(400).json({ success: false, error: 'Valid connectionType is required' });
    return;
  }

  if (!config || typeof config !== 'object') {
    res.status(400).json({ success: false, error: 'Config object is required' });
    return;
  }

  // 根据连接类型验证必填字段
  switch (connectionType) {
    case 'local_docker':
      if (!config.dockerContainerName || typeof config.dockerContainerName !== 'string') {
        res.status(400).json({ success: false, error: 'dockerContainerName is required for local_docker' });
        return;
      }
      break;
    case 'remote_docker':
      if (!config.dockerHost || typeof config.dockerHost !== 'string') {
        res.status(400).json({ success: false, error: 'dockerHost is required for remote_docker' });
        return;
      }
      if (!config.remoteDockerContainerName || typeof config.remoteDockerContainerName !== 'string') {
        res.status(400).json({ success: false, error: 'remoteDockerContainerName is required for remote_docker' });
        return;
      }
      break;
    case 'remote_ssh':
      if (!config.sshHost || typeof config.sshHost !== 'string') {
        res.status(400).json({ success: false, error: 'sshHost is required for remote_ssh' });
        return;
      }
      if (!config.sshUser || typeof config.sshUser !== 'string') {
        res.status(400).json({ success: false, error: 'sshUser is required for remote_ssh' });
        return;
      }
      if (config.remoteDockerContainerName &&
          !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(config.remoteDockerContainerName)) {
        res.status(400).json({ success: false, error: 'Invalid remoteDockerContainerName' });
        return;
      }
      break;
  }

  next();
}

// Get all instances
router.get('/', (req: Request, res: Response, next: NextFunction): void => {
  try {
    const instances = instanceManager.getAllInstances();
    const response: ApiResponse<FrpcInstance[]> = { success: true, data: instances };
    res.json(response);
  } catch (error) {
    logger.error('Failed to get instances', { error: (error as Error).message });
    next(error);
  }
});

// Get status of all instances
router.get('/status', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const forceRefresh = req.query.force === 'true';
    const statuses = await instanceManager.getAllStatuses(forceRefresh);
    const response: ApiResponse<InstanceStatus[]> = { success: true, data: statuses };
    res.json(response);
  } catch (error) {
    logger.error('Failed to get instance statuses', { error: (error as Error).message });
    next(error);
  }
});

// Create a new instance
router.post('/', validateInstanceData, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { name, connectionType, config } = req.body;
    const instance = instanceManager.createInstance({
      name,
      connectionType: connectionType as ConnectionType,
      config
    });
    if (connectionType === 'remote_ssh') {
      try {
        await instanceManager.discoverDockerContainers(instance.id);
      } catch (error) {
        // The server definition is still useful when Docker is unavailable or no
        // frpc container exists yet. Status/detail requests will expose the error.
        logger.warn('Initial frpc container discovery failed', {
          instanceId: instance.id,
          error: (error as Error).message,
        });
      }
    }
    const response: ApiResponse<FrpcInstance> = {
      success: true,
      data: instanceManager.getInstance(instance.id) || instance,
    };
    res.json(response);
  } catch (error) {
    logger.error('Failed to create instance', { error: (error as Error).message });
    next(error);
  }
});

// Get a specific instance
router.get('/:id', (req: Request, res: Response, next: NextFunction): void => {
  try {
    const instance = instanceManager.getInstance(req.params.id);
    if (!instance) {
      const response: ApiResponse<never> = {
        success: false,
        error: 'Instance not found'
      };
      res.status(404).json(response);
      return;
    }
    const response: ApiResponse<FrpcInstance> = { success: true, data: instance };
    res.json(response);
  } catch (error) {
    logger.error('Failed to get instance', { error: (error as Error).message, instanceId: req.params.id });
    next(error);
  }
});

// Update an instance
router.put('/:id', validateInstanceData, (req: Request, res: Response, next: NextFunction): void => {
  try {
    const { name, connectionType, config } = req.body;
    const instance = instanceManager.updateInstance(req.params.id, {
      name,
      connectionType: connectionType as ConnectionType,
      config
    });
    if (!instance) {
      const response: ApiResponse<never> = {
        success: false,
        error: 'Instance not found'
      };
      res.status(404).json(response);
      return;
    }
    const response: ApiResponse<FrpcInstance> = { success: true, data: instance };
    res.json(response);
  } catch (error) {
    logger.error('Failed to update instance', { error: (error as Error).message, instanceId: req.params.id });
    next(error);
  }
});

// Delete an instance
router.delete('/:id', (req: Request, res: Response, next: NextFunction): void => {
  try {
    const deleted = instanceManager.deleteInstance(req.params.id);
    if (!deleted) {
      const response: ApiResponse<never> = {
        success: false,
        error: 'Instance not found'
      };
      res.status(404).json(response);
      return;
    }
    const response: ApiResponse<{ message: string }> = {
      success: true,
      data: { message: 'Instance deleted successfully' }
    };
    res.json(response);
  } catch (error) {
    logger.error('Failed to delete instance', { error: (error as Error).message, instanceId: req.params.id });
    next(error);
  }
});

// Instance status operations
router.get('/:id/status', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const forceRefresh = req.query.force === 'true';
    const status = await instanceManager.getInstanceStatus(req.params.id, 8000, forceRefresh);
    const response: ApiResponse<InstanceStatus> = { success: true, data: status };
    res.json(response);
  } catch (error) {
    logger.error('Failed to get instance status', { error: (error as Error).message, instanceId: req.params.id });
    next(error);
  }
});

// Service control
router.post('/:id/service/start', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await instanceManager.startService(req.params.id);
    const response: ApiResponse<{ message: string }> = {
      success: true,
      data: { message: 'Service started' }
    };
    res.json(response);
  } catch (error) {
    logger.error('Failed to start service', { error: (error as Error).message, instanceId: req.params.id });
    next(error);
  }
});

router.post('/:id/service/stop', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await instanceManager.stopService(req.params.id);
    const response: ApiResponse<{ message: string }> = {
      success: true,
      data: { message: 'Service stopped' }
    };
    res.json(response);
  } catch (error) {
    logger.error('Failed to stop service', { error: (error as Error).message, instanceId: req.params.id });
    next(error);
  }
});

router.post('/:id/service/restart', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await instanceManager.restartService(req.params.id);
    const response: ApiResponse<{ message: string }> = {
      success: true,
      data: { message: 'Service restarted' }
    };
    res.json(response);
  } catch (error) {
    logger.error('Failed to restart service', { error: (error as Error).message, instanceId: req.params.id });
    next(error);
  }
});

// Mappings
router.get('/:id/mappings', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const mappings = await instanceManager.getMappings(req.params.id);
    const response: ApiResponse<PortMapping[]> = { success: true, data: mappings };
    res.json(response);
  } catch (error) {
    logger.error('Failed to get mappings', { error: (error as Error).message, instanceId: req.params.id });
    next(error);
  }
});

router.post('/:id/mappings', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { name, protocol, localPort, remotePort, localIp, localIP } = req.body;

    if (!name || !protocol || !localPort) {
      res.status(400).json({ success: false, error: 'name, protocol, and localPort are required' });
      return;
    }

    await instanceManager.addMapping(req.params.id, {
      id: name,
      name,
      protocol: protocol as 'tcp' | 'udp',
      localPort: parseInt(localPort, 10),
      remotePort: remotePort ? parseInt(remotePort, 10) : undefined,
      localIp: localIp || localIP || '127.0.0.1',
    });
    const response: ApiResponse<{ message: string }> = {
      success: true,
      data: { message: 'Mapping added' }
    };
    res.json(response);
  } catch (error) {
    logger.error('Failed to add mapping', { error: (error as Error).message, instanceId: req.params.id });
    next(error);
  }
});

router.put('/:id/mappings/:mappingId', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await instanceManager.updateMapping(req.params.id, req.params.mappingId, req.body);
    const response: ApiResponse<{ message: string }> = {
      success: true,
      data: { message: 'Mapping updated' }
    };
    res.json(response);
  } catch (error) {
    logger.error('Failed to update mapping', { error: (error as Error).message, instanceId: req.params.id, mappingId: req.params.mappingId });
    next(error);
  }
});

router.delete('/:id/mappings/:mappingId', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await instanceManager.deleteMapping(req.params.id, req.params.mappingId);
    const response: ApiResponse<{ message: string }> = {
      success: true,
      data: { message: 'Mapping deleted' }
    };
    res.json(response);
  } catch (error) {
    logger.error('Failed to delete mapping', { error: (error as Error).message, instanceId: req.params.id, mappingId: req.params.mappingId });
    next(error);
  }
});

// Config
router.get('/:id/config', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const content = await instanceManager.getConfig(req.params.id);
    const config: ConfigFile = {
      path: '',
      content
    };
    const response: ApiResponse<ConfigFile> = { success: true, data: config };
    res.json(response);
  } catch (error) {
    logger.error('Failed to get config', { error: (error as Error).message, instanceId: req.params.id });
    next(error);
  }
});

router.put('/:id/config', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { content } = req.body;
    if (content === undefined) {
      res.status(400).json({ success: false, error: 'content is required' });
      return;
    }
    await instanceManager.writeConfig(req.params.id, content);
    const response: ApiResponse<{ message: string }> = {
      success: true,
      data: { message: 'Config saved' }
    };
    res.json(response);
  } catch (error) {
    logger.error('Failed to write config', { error: (error as Error).message, instanceId: req.params.id });
    next(error);
  }
});

// Logs
router.get('/:id/logs', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const maxLines = parseInt(req.query.lines as string) || 100;
    const logs = await instanceManager.getLogs(req.params.id, maxLines);
    const response: ApiResponse<LogEntry[]> = { success: true, data: logs };
    res.json(response);
  } catch (error) {
    logger.error('Failed to get logs', { error: (error as Error).message, instanceId: req.params.id });
    next(error);
  }
});

// Docker containers
router.get('/:id/docker/containers', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const containers = await instanceManager.getDockerContainers(req.params.id);
    const response: ApiResponse<DockerContainerInfo[]> = { success: true, data: containers };
    res.json(response);
  } catch (error) {
    logger.error('Failed to get docker containers', { error: (error as Error).message, instanceId: req.params.id });
    next(error);
  }
});

router.post('/:id/docker/containers', async (req: Request, res: Response): Promise<void> => {
  try {
    const input = req.body as Partial<CreateFrpcContainerInput>;
    if (!input.name || !input.image || !input.serverAddr || !input.hostConfigPath || !input.containerConfigPath) {
      res.status(400).json({ success: false, error: 'name, image, serverAddr, hostConfigPath and containerConfigPath are required' });
      return;
    }
    const container = await instanceManager.createDockerContainer(req.params.id, {
      name: input.name,
      image: input.image,
      serverAddr: input.serverAddr,
      serverPort: Number(input.serverPort || 7000),
      authToken: input.authToken,
      hostConfigPath: input.hostConfigPath,
      containerConfigPath: input.containerConfigPath,
      restartPolicy: input.restartPolicy || 'unless-stopped',
    });
    const response: ApiResponse<DockerContainerInfo> = { success: true, data: container };
    res.status(201).json(response);
  } catch (error) {
    const message = (error as Error).message;
    logger.error('Failed to create frpc Docker container', { error: message, instanceId: req.params.id });
    res.status(400).json({ success: false, error: message });
  }
});

router.post('/:id/docker/discover', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const selectedContainerName = req.body?.containerName;
    if (selectedContainerName !== undefined && typeof selectedContainerName !== 'string') {
      res.status(400).json({ success: false, error: 'containerName must be a string' });
      return;
    }
    const result = await instanceManager.discoverDockerContainers(req.params.id, selectedContainerName);
    const response: ApiResponse<DockerDiscoveryResult> = { success: true, data: result };
    res.json(response);
  } catch (error) {
    logger.error('Failed to discover Docker containers', { error: (error as Error).message, instanceId: req.params.id });
    next(error);
  }
});

export default router;
