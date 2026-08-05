import { type Request, type Response, type NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { logger } from '../utils/logger.js';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'frpc-panel-jwt-secret-change-in-production';
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || '';

// 用于内存中存储密码哈希（首次运行时设置）
let cachedPasswordHash: string | null = null;

export interface AuthRequest extends Request {
  user?: { id: string; role: string };
}

/**
 * 初始化管理员密码
 * 从环境变量 ADMIN_PASSWORD 获取明文密码并哈希存储
 */
export async function initAdminPassword(): Promise<void> {
  const plainPassword = process.env.ADMIN_PASSWORD;

  if (cachedPasswordHash) {
    return;
  }

  if (ADMIN_PASSWORD_HASH) {
    // 如果环境变量已提供哈希值，直接使用
    cachedPasswordHash = ADMIN_PASSWORD_HASH;
    logger.info('Admin password loaded from ADMIN_PASSWORD_HASH');
    return;
  }

  if (plainPassword) {
    cachedPasswordHash = await bcrypt.hash(plainPassword, 12);
    logger.info('Admin password initialized from ADMIN_PASSWORD');
    return;
  }

  // 如果没有设置密码，生成一个随机密码并打印警告
  const randomPassword = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  cachedPasswordHash = await bcrypt.hash(randomPassword, 12);
  logger.warn('No ADMIN_PASSWORD set! A random password has been generated. Check logs to find it.', {
    randomPassword,
    hint: 'Set ADMIN_PASSWORD in .env file to configure a permanent password',
  });
}

/**
 * 验证管理员密码
 */
export async function verifyPassword(plainPassword: string): Promise<boolean> {
  if (!cachedPasswordHash) {
    await initAdminPassword();
  }
  return bcrypt.compare(plainPassword, cachedPasswordHash!);
}

/**
 * 生成 JWT Token
 */
export function generateToken(): string {
  return jwt.sign(
    { id: 'admin', role: 'admin' },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

/**
 * 设置新的密码哈希（用于修改密码）
 */
export function setCachedPasswordHash(hash: string): void {
  cachedPasswordHash = hash;
}

/**
 * JWT 认证中间件
 */
export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Unauthorized: Missing token' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; role: string };
    req.user = decoded;
    next();
  } catch (error) {
    logger.warn('JWT verification failed', { error: (error as Error).message });
    res.status(401).json({ success: false, error: 'Unauthorized: Invalid token' });
  }
}

/**
 * 可选认证中间件（用于某些不需要强制登录但支持识别用户的场景）
 */
export function optionalAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { id: string; role: string };
      req.user = decoded;
    } catch {
      // 忽略验证失败，继续作为未认证用户
    }
  }

  next();
}
