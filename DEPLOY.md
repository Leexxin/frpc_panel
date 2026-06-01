# frpc-panel 部署指南

## 🚀 推荐：Docker 部署（最简单）

### 前置要求

- Docker 和 Docker Compose 已安装
- 服务器上已运行您的 frpc 容器

### 快速开始

1. **上传项目到服务器**
```bash
# 克隆或上传项目文件到服务器
cd /opt
git clone <your-repo> frpc-panel
cd frpc-panel
```

2. **启动面板**
```bash
# 使用 Docker Compose 构建并启动
docker-compose up -d --build
```

3. **访问面板**
打开浏览器访问：`http://your-server-ip:3001`

4. **初始配置**
- 进入「系统设置」页面
- 选择「Docker 部署」
- 在下拉框中选择您的 frpc 容器，或点击「自动检测」
- 保存设置

### 常用 Docker 命令

```bash
# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down

# 重启服务
docker-compose restart

# 更新并重新构建
git pull
docker-compose up -d --build
```

---

## 📦 方案二：PM2 + Nginx 部署

### 前置要求

- Node.js 20+
- PM2 (`npm install -g pm2`)
- Nginx

### 步骤

1. **上传项目文件**
```bash
cd /opt/frpc-panel
```

2. **安装依赖**
```bash
npm ci --omit=dev
```

3. **构建前端**
```bash
npm run build
```

4. **配置环境变量（可选）**
```bash
cp .env.example .env
# 编辑 .env 文件
```

5. **使用 PM2 启动**
```bash
pm2 start ecosystem.config.json
pm2 save
pm2 startup
```

6. **配置 Nginx**
创建 `/etc/nginx/sites-available/frpc-panel`：
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

启用配置：
```bash
sudo ln -s /etc/nginx/sites-available/frpc-panel /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

7. **（可选）配置 SSL（使用 Let's Encrypt）**
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

### PM2 常用命令

```bash
# 查看状态
pm2 status

# 查看日志
pm2 logs frpc-panel

# 重启
pm2 restart frpc-panel

# 停止
pm2 stop frpc-panel
```

---

## ⚙️ 系统设置说明

### Docker 部署模式（推荐）

如果您的 frpc 是用 Docker 部署的：

1. 在「系统设置」中选择「Docker 部署」
2. 点击「刷新容器」查看所有可用容器
3. 从下拉列表中选择您的 frpc 容器
4. 点击「保存设置」
5. 面板会自动：
   - 从容器中读取 frpc 配置
   - 控制容器的启动和停止
   - 获取容器的运行日志

### 二进制部署模式

如果您的 frpc 是直接运行的二进制文件：

1. 在「系统设置」中选择「二进制部署」
2. 填写 frpc 可执行文件路径（或留空自动检测）
3. 填写配置文件路径
4. 点击「保存设置」

---

## 🔧 关键文件说明

### 项目根目录的 frpc.toml

**重要：如果您使用 Docker 部署面板，这个文件不需要！**

面板会直接从您的 frpc 容器中读取配置文件，所以不需要手动复制配置到项目目录。

- **Docker 模式**：面板通过 Docker 命令从容器中读写配置
- **二进制模式**：面板从配置路径读取 frpc.toml

### Docker Compose 配置

- `/var/run/docker.sock`：挂载用于访问宿主机的 Docker 守护进程
- `./data`：持久化面板的配置文件

---

## 🔐 安全建议

1. **不要将面板直接暴露在公网**
   - 使用 VPN 或内网访问
   - 或配置 Nginx 带密码认证（见下方）

2. **使用 HTTPS**
   - 配置 Let's Encrypt 证书
   - 强制 HTTPS 访问

3. **限制 IP 访问**
   - 配置防火墙只允许特定 IP 访问 3001 端口
   - 或在 Nginx 中配置白名单

### Nginx 密码认证配置

创建密码文件：
```bash
sudo apt install apache2-utils
sudo htpasswd -c /etc/nginx/.htpasswd admin
```

更新 Nginx 配置：
```nginx
server {
    listen 80;
    server_name your-domain.com;

    auth_basic "Restricted Access";
    auth_basic_user_file /etc/nginx/.htpasswd;

    location / {
        proxy_pass http://localhost:3001;
        # ... 其他配置
    }
}
```

---

## 📊 监控和维护

### 查看应用状态

```bash
# Docker 方式
docker ps

# PM2 方式
pm2 status
```

### 查看日志

```bash
# Docker 方式
docker-compose logs -f

# PM2 方式
pm2 logs frpc-panel
```

### 更新应用

```bash
# 1. 拉取最新代码
git pull

# Docker 方式
docker-compose up -d --build

# PM2 方式
npm run build
pm2 restart frpc-panel
```

---

## ❓ 常见问题

### Q: 面板找不到我的 frpc 容器？

A: 
1. 确认容器正在运行：`docker ps`
2. 确认 Docker socket 正确挂载（仅 Docker 部署面板时）
3. 在系统设置中手动输入容器名称
4. 点击「自动检测」尝试发现

### Q: 修改配置后不生效？

A: 
1. 确认已保存配置
2. 在面板中重启 frpc 服务
3. 或手动重启您的 frpc 容器

### Q: Docker 部署的面板没有权限访问宿主机容器？

A: 
1. 确认 `/var/run/docker.sock` 已正确挂载
2. 检查权限：容器需要访问 socket 的权限
3. 可能需要调整文件权限或使用 root 用户运行（不推荐）

### Q: 如何备份配置？

A: 
- Docker 方式：备份 `./data` 目录
- PM2 方式：备份面板配置和您的 frpc.toml
