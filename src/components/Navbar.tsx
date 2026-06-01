import { Link, useLocation } from 'react-router-dom'
import { Activity, Server, Settings, FileText, Cog } from 'lucide-react'

export function Navbar() {
  const location = useLocation()

  const navItems = [
    { path: '/', label: '仪表盘', icon: Activity },
    { path: '/mappings', label: '端口映射', icon: Server },
    { path: '/config', label: '配置文件', icon: FileText },
    { path: '/logs', label: '服务日志', icon: Settings },
    { path: '/settings', label: '系统设置', icon: Cog },
  ]

  return (
    <nav className="bg-gradient-to-r from-blue-900 to-cyan-700 text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center">
            <h1 className="text-xl font-bold">frpc 管理面板</h1>
          </div>
          <div className="flex space-x-4">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = location.pathname === item.path
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : 'text-white/80 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4 mr-2" />
                  {item.label}
                </Link>
              )
            })}
          </div>
        </div>
      </div>
    </nav>
  )
}
