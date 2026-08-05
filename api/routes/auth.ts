import { Router, type Request, type Response } from 'express';
import { verifyPassword, generateToken, initAdminPassword, setCachedPasswordHash } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';
import bcrypt from 'bcryptjs';

const router = Router();

// 初始化管理员密码
initAdminPassword().catch(err => {
  logger.error('Failed to initialize admin password', { error: err.message });
});

/**
 * 用户登录
 * POST /api/auth/login
 */
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { password } = req.body;

    if (!password || typeof password !== 'string') {
      res.status(400).json({
        success: false,
        error: 'Password is required',
      });
      return;
    }

    const isValid = await verifyPassword(password);

    if (!isValid) {
      logger.warn('Login attempt failed: invalid password', {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      });
      res.status(401).json({
        success: false,
        error: 'Invalid password',
      });
      return;
    }

    const token = generateToken();

    logger.info('Admin logged in successfully', { ip: req.ip });

    res.json({
      success: true,
      data: { token },
    });
  } catch (error) {
    logger.error('Login error', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * 验证 Token 是否有效
 * GET /api/auth/verify
 */
router.get('/verify', async (req: Request, res: Response): Promise<void> => {
  // 由 authMiddleware 处理验证，如果到达这里说明验证通过
  res.json({
    success: true,
    data: { valid: true },
  });
});

/**
 * 修改密码
 * POST /api/auth/change-password
 */
router.post('/change-password', async (req: Request, res: Response): Promise<void> => {
  try {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      res.status(400).json({
        success: false,
        error: 'Old password and new password are required',
      });
      return;
    }

    if (newPassword.length < 6) {
      res.status(400).json({
        success: false,
        error: 'New password must be at least 6 characters',
      });
      return;
    }

    const isValid = await verifyPassword(oldPassword);

    if (!isValid) {
      res.status(401).json({
        success: false,
        error: 'Invalid old password',
      });
      return;
    }

    // 更新密码哈希
    const newHash = await bcrypt.hash(newPassword, 12);
    setCachedPasswordHash(newHash);

    // 生成新 token
    const token = generateToken();

    logger.info('Admin password changed successfully');

    res.json({
      success: true,
      data: { token },
    });
  } catch (error) {
    logger.error('Change password error', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

export default router;
