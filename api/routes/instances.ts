import { Router, type Request, type Response } from 'express';
import { InstanceManager } from '../services/instanceManager.js';
import { FrpcInstance, ConnectionType, PortMapping, ServiceStatus, LogEntry, ConfigFile, ApiResponse } from '../../shared/types.js';

const router = Router();
const instanceManager = new InstanceManager();

// Get all instances
router.get('/', (req: Request, res: Response): void => {
  try {
    const instances = instanceManager.getAllInstances();
    const response: ApiResponse<FrpcInstance[]> = { success: true, data: instances };
    res.json(response);
  } catch (error) {
    const response: ApiResponse<never> = { 
      success: false, 
      error: (error as Error).message 
    };
    res.status(500).json(response);
  }
});

// Get status of all instances
router.get('/status', async (req: Request, res: Response): Promise<void> => {
  try {
    const statuses = await instanceManager.getAllStatuses();
    const response: ApiResponse<any[]> = { success: true, data: statuses };
    res.json(response);
  } catch (error) {
    const response: ApiResponse<never> = { 
      success: false, 
      error: (error as Error).message 
    };
    res.status(500).json(response);
  }
});

// Create a new instance
router.post('/', (req: Request, res: Response): void => {
  try {
    const { name, connectionType, config } = req.body;
    const instance = instanceManager.createInstance({ 
      name, 
      connectionType: connectionType as ConnectionType, 
      config 
    });
    const response: ApiResponse<FrpcInstance> = { success: true, data: instance };
    res.json(response);
  } catch (error) {
    const response: ApiResponse<never> = { 
      success: false, 
      error: (error as Error).message 
    };
    res.status(500).json(response);
  }
});

// Get a specific instance
router.get('/:id', (req: Request, res: Response): void => {
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
    const response: ApiResponse<never> = { 
      success: false, 
      error: (error as Error).message 
    };
    res.status(500).json(response);
  }
});

// Update an instance
router.put('/:id', (req: Request, res: Response): void => {
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
    const response: ApiResponse<never> = { 
      success: false, 
      error: (error as Error).message 
    };
    res.status(500).json(response);
  }
});

// Delete an instance
router.delete('/:id', (req: Request, res: Response): void => {
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
    const response: ApiResponse<never> = { 
      success: false, 
      error: (error as Error).message 
    };
    res.status(500).json(response);
  }
});

// Instance status operations
router.get('/:id/status', async (req: Request, res: Response): Promise<void> => {
  try {
    const status = await instanceManager.getInstanceStatus(req.params.id);
    const response: ApiResponse<any> = { success: true, data: status };
    res.json(response);
  } catch (error) {
    const response: ApiResponse<never> = { 
      success: false, 
      error: (error as Error).message 
    };
    res.status(500).json(response);
  }
});

// Service control
router.post('/:id/service/start', async (req: Request, res: Response): Promise<void> => {
  try {
    await instanceManager.startService(req.params.id);
    const response: ApiResponse<{ message: string }> = { 
      success: true, 
      data: { message: 'Service started' } 
    };
    res.json(response);
  } catch (error) {
    const response: ApiResponse<never> = { 
      success: false, 
      error: (error as Error).message 
    };
    res.status(500).json(response);
  }
});

router.post('/:id/service/stop', async (req: Request, res: Response): Promise<void> => {
  try {
    await instanceManager.stopService(req.params.id);
    const response: ApiResponse<{ message: string }> = { 
      success: true, 
      data: { message: 'Service stopped' } 
    };
    res.json(response);
  } catch (error) {
    const response: ApiResponse<never> = { 
      success: false, 
      error: (error as Error).message 
    };
    res.status(500).json(response);
  }
});

router.post('/:id/service/restart', async (req: Request, res: Response): Promise<void> => {
  try {
    await instanceManager.restartService(req.params.id);
    const response: ApiResponse<{ message: string }> = { 
      success: true, 
      data: { message: 'Service restarted' } 
    };
    res.json(response);
  } catch (error) {
    const response: ApiResponse<never> = { 
      success: false, 
      error: (error as Error).message 
    };
    res.status(500).json(response);
  }
});

// Mappings
router.get('/:id/mappings', async (req: Request, res: Response): Promise<void> => {
  try {
    const mappings = await instanceManager.getMappings(req.params.id);
    const response: ApiResponse<PortMapping[]> = { success: true, data: mappings };
    res.json(response);
  } catch (error) {
    const response: ApiResponse<never> = { 
      success: false, 
      error: (error as Error).message 
    };
    res.status(500).json(response);
  }
});

router.post('/:id/mappings', async (req: Request, res: Response): Promise<void> => {
  try {
    await instanceManager.addMapping(req.params.id, req.body);
    const response: ApiResponse<{ message: string }> = { 
      success: true, 
      data: { message: 'Mapping added' } 
    };
    res.json(response);
  } catch (error) {
    const response: ApiResponse<never> = { 
      success: false, 
      error: (error as Error).message 
    };
    res.status(500).json(response);
  }
});

router.put('/:id/mappings/:mappingId', async (req: Request, res: Response): Promise<void> => {
  try {
    await instanceManager.updateMapping(req.params.id, req.params.mappingId, req.body);
    const response: ApiResponse<{ message: string }> = { 
      success: true, 
      data: { message: 'Mapping updated' } 
    };
    res.json(response);
  } catch (error) {
    const response: ApiResponse<never> = { 
      success: false, 
      error: (error as Error).message 
    };
    res.status(500).json(response);
  }
});

router.delete('/:id/mappings/:mappingId', async (req: Request, res: Response): Promise<void> => {
  try {
    await instanceManager.deleteMapping(req.params.id, req.params.mappingId);
    const response: ApiResponse<{ message: string }> = { 
      success: true, 
      data: { message: 'Mapping deleted' } 
    };
    res.json(response);
  } catch (error) {
    const response: ApiResponse<never> = { 
      success: false, 
      error: (error as Error).message 
    };
    res.status(500).json(response);
  }
});

// Config
router.get('/:id/config', async (req: Request, res: Response): Promise<void> => {
  try {
    const content = await instanceManager.getConfig(req.params.id);
    const config: ConfigFile = {
      path: '',
      content
    };
    const response: ApiResponse<ConfigFile> = { success: true, data: config };
    res.json(response);
  } catch (error) {
    const response: ApiResponse<never> = { 
      success: false, 
      error: (error as Error).message 
    };
    res.status(500).json(response);
  }
});

router.put('/:id/config', async (req: Request, res: Response): Promise<void> => {
  try {
    await instanceManager.writeConfig(req.params.id, req.body.content);
    const response: ApiResponse<{ message: string }> = { 
      success: true, 
      data: { message: 'Config saved' } 
    };
    res.json(response);
  } catch (error) {
    const response: ApiResponse<never> = { 
      success: false, 
      error: (error as Error).message 
    };
    res.status(500).json(response);
  }
});

// Logs
router.get('/:id/logs', async (req: Request, res: Response): Promise<void> => {
  try {
    const maxLines = parseInt(req.query.lines as string) || 100;
    const logs = await instanceManager.getLogs(req.params.id, maxLines);
    const response: ApiResponse<LogEntry[]> = { success: true, data: logs };
    res.json(response);
  } catch (error) {
    const response: ApiResponse<never> = { 
      success: false, 
      error: (error as Error).message 
    };
    res.status(500).json(response);
  }
});

// Docker containers
router.get('/:id/docker/containers', async (req: Request, res: Response): Promise<void> => {
  try {
    const containers = await instanceManager.getDockerContainers(req.params.id);
    const response: ApiResponse<any[]> = { success: true, data: containers };
    res.json(response);
  } catch (error) {
    const response: ApiResponse<never> = { 
      success: false, 
      error: (error as Error).message 
    };
    res.status(500).json(response);
  }
});

export default router;
