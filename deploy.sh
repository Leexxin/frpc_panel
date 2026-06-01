#!/bin/bash

echo "====================================="
echo "  frpc-panel 部署脚本"
echo "====================================="
echo ""

# 检查是否有 docker-compose
if ! command -v docker-compose &> /dev/null && ! command -v docker compose &> /dev/null
then
    echo "❌ Docker Compose 未安装"
    echo "请先安装 Docker 和 Docker Compose"
    exit 1
fi

echo "✅ Docker Compose 已找到"

# 检查 frpc.toml
if [ ! -f "./frpc.toml" ]; then
    echo ""
    echo "⚠️  未找到 frpc.toml 文件"
    read -p "是否要创建示例配置？(y/n): " create_example
    
    if [ "$create_example" = "y" ]; then
        cat > ./frpc.toml << 'EOF'
serverAddr = "your-frpc-server.com"
serverPort = 7000

[[proxies]]
name = "ssh"
type = "tcp"
localIP = "127.0.0.1"
localPort = 22
remotePort = 6000
EOF
        echo "✅ 已创建示例 frpc.toml，请编辑后继续"
        echo ""
    fi
fi

echo ""
echo "开始构建和启动..."

# 使用 docker-compose 或 docker compose
if command -v docker-compose &> /dev/null; then
    docker-compose up -d --build
else
    docker compose up -d --build
fi

echo ""
echo "====================================="
echo "  🎉 部署完成！"
echo "====================================="
echo ""
echo "访问地址: http://$(hostname -I | awk '{print $1}'):3001"
echo ""
echo "常用命令："
echo "  查看日志: docker-compose logs -f"
echo "  停止服务: docker-compose down"
echo "  重启服务: docker-compose restart"
echo ""
