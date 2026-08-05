import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const LOG_DIR = join(__dirname, '../../logs');

if (!existsSync(LOG_DIR)) {
  mkdirSync(LOG_DIR, { recursive: true });
}

const logStream = createWriteStream(join(LOG_DIR, 'app.log'), { flags: 'a' });
const errorStream = createWriteStream(join(LOG_DIR, 'error.log'), { flags: 'a' });

function formatLog(level: string, message: string, meta?: Record<string, unknown>): string {
  const timestamp = new Date().toISOString();
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
  return `[${timestamp}] [${level}] ${message}${metaStr}\n`;
}

export const logger = {
  info: (message: string, meta?: Record<string, unknown>) => {
    const line = formatLog('INFO', message, meta);
    console.log(line.trim());
    logStream.write(line);
  },
  warn: (message: string, meta?: Record<string, unknown>) => {
    const line = formatLog('WARN', message, meta);
    console.warn(line.trim());
    logStream.write(line);
  },
  error: (message: string, meta?: Record<string, unknown>) => {
    const line = formatLog('ERROR', message, meta);
    console.error(line.trim());
    logStream.write(line);
    errorStream.write(line);
  },
  debug: (message: string, meta?: Record<string, unknown>) => {
    if (process.env.NODE_ENV !== 'production') {
      const line = formatLog('DEBUG', message, meta);
      console.debug(line.trim());
      logStream.write(line);
    }
  },
};
