# frpc-panel

FRP 客户端 (frpc) 的 Web 管理面板，支持多实例管理。

## 功能特性

- **多实例管理**: 支持本地 Docker、本地二进制、远程 SSH、远程 Docker 四种连接方式
- **远程自动发现**: 配置 SSH 服务器后自动识别其上的 frpc Docker 容器、启动参数和配置挂载路径
- **端口映射管理**: 可视化添加、编辑、删除 frpc 端口映射配置
- **服务控制**: 启动、停止、重启 frpc 服务
- **实时监控**: 服务状态和 Docker 容器日志实时查看
- **安全修改配置**: 支持读取和修改容器配置，写入前自动生成 `.frpc-panel.bak` 备份
- **安全配置**: JWT 认证、密码加密、请求验证
- **日志系统**: 分级日志记录，便于问题排查

## 快速开始

### Docker 部署（推荐）

1. 克隆项目
```bash
git clone <your-repo> frpc-panel
cd frpc-panel
```

2. 配置环境变量
```bash
cp .env.example .env
# 编辑 .env 文件，设置 ADMIN_PASSWORD
```

3. 启动服务
```bash
docker-compose up -d
```

4. 访问面板
打开浏览器访问 `http://your-server-ip:3001`，使用设置的密码登录。

### 环境变量

| 变量名 | 必填 | 说明 |
|--------|------|------|
| `ADMIN_PASSWORD` | 是 | 管理员登录密码 |
| `JWT_SECRET` | 否 | JWT 签名密钥（留空则自动生成） |
| `ENCRYPTION_KEY` | 否 | 敏感数据加密密钥（建议设置） |
| `PORT` | 否 | 服务端口，默认 3001 |
| `NODE_ENV` | 否 | 运行环境，默认 production |

### PM2 部署

```bash
# 安装依赖
npm ci --omit=dev

# 构建前端
npm run build

# 配置环境变量
cp .env.example .env
# 编辑 .env 文件

# 使用 PM2 启动
pm2 start ecosystem.config.json
```

## 开发

```bash
# 安装依赖
npm install

# 同时启动前端和后端开发服务器
npm run dev

# 单独启动前端
npm run client:dev

# 单独启动后端
npm run server:dev
```

## 管理远程服务器上的 frpc 容器

1. 在“实例管理”中选择“远程服务器（SSH 自动探测）”。
2. 填写服务器地址、SSH 用户以及私钥路径或密码；容器名称和配置路径可以留空。
3. 保存后，面板会扫描容器名称、镜像和启动命令中包含 `frpc` 的 Docker 容器，并自动选择第一个结果。
4. 如果服务器上有多个 frpc 容器，可在实例详情的“frpc 容器”区域切换目标容器。
5. 在详情页读取或修改配置、启停或重启容器、查看容器日志。

SSH 用户需要有执行 `docker ps/inspect/start/stop/restart/logs/exec` 的权限，并需要对宿主机上的配置挂载文件具有读写权限。

## 项目结构

```
.
├── api/                    # 后端 API
│   ├── middleware/         # 中间件（认证等）
│   ├── routes/            # API 路由
│   ├── services/          # 业务逻辑
│   │   └── adapters/      # 连接适配器（Docker/SSH/本地）
│   └── utils/             # 工具函数（日志、加密）
├── src/                   # 前端代码
│   ├── components/        # 组件
│   ├── pages/            # 页面
│   ├── lib/              # API 客户端
│   └── store/            # 状态管理
├── shared/               # 共享类型定义
├── data/                 # 数据持久化目录
├── logs/                 # 日志目录
└── docker-compose.yml    # Docker 部署配置
```

## 安全说明

1. **认证**: 面板使用 JWT Bearer Token 认证，所有 API 路由（除登录外）都需要认证
2. **密码存储**: 管理员密码使用 bcrypt 哈希存储，SSH 密码使用 AES-256-GCM 加密存储
3. **命令安全**: Docker 命令参数经过严格验证和转义，防止命令注入
4. **输入验证**: 所有 API 请求都经过输入验证

## 日志

日志文件位于 `logs/` 目录：
- `app.log` - 应用日志（所有级别）
- `error.log` - 错误日志

日志级别：DEBUG、INFO、WARN、ERROR

生产环境默认只记录 INFO 及以上级别，开发环境记录 DEBUG 及以上。

## 常见问题

### Q: 忘记管理员密码？
A: 修改 `.env` 文件中的 `ADMIN_PASSWORD`，然后重启服务：
```bash
docker-compose restart
# 或
pm2 restart frpc-panel
```

### Q: 面板找不到 frpc 容器？
A:
1. 确认容器正在运行：`docker ps`
2. 确认 Docker socket 正确挂载（仅 Docker 部署面板时）
3. 在系统设置中手动输入容器名称

### Q: 如何查看日志？
A:
```bash
# Docker 方式
docker-compose logs -f

# 或直接查看日志文件
tail -f logs/app.log
```

### Q: 修改配置后不生效？
A:
1. 确认已保存配置
2. 在面板中重启 frpc 服务
3. 或手动重启 frpc 容器

## License

MIT
