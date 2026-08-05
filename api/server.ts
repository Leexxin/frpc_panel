/**
 * local server entry file, for local development
 */
import app from './app.js';
import { logger } from './utils/logger.js';
import { InstanceManager } from './services/instanceManager.js';

/**
 * start server with port
 */
const PORT = process.env.PORT || 3001;

const server = app.listen(PORT, () => {
  console.log(`Server ready on port ${PORT}`);
  logger.info(`Server started on port ${PORT}`, {
    nodeEnv: process.env.NODE_ENV,
    pid: process.pid,
  });
});

// 创建 InstanceManager 实例用于清理
const instanceManager = new InstanceManager();

/**
 * close server
 */
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received, shutting down gracefully');
  server.close(async () => {
    try {
      await instanceManager.disconnectAll();
      logger.info('All adapters disconnected');
    } catch (e) {
      logger.error('Error during disconnect', { error: (e as Error).message });
    }
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT signal received, shutting down gracefully');
  server.close(async () => {
    try {
      await instanceManager.disconnectAll();
      logger.info('All adapters disconnected');
    } catch (e) {
      logger.error('Error during disconnect', { error: (e as Error).message });
    }
    logger.info('Server closed');
    process.exit(0);
  });
});

// 未捕获的异常处理
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', {
    error: error.message,
    stack: error.stack,
  });
  // 给进程一点时间记录日志后退出
  setTimeout(() => process.exit(1), 1000);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', {
    reason: String(reason),
    promise: String(promise),
  });
});

export default app;
