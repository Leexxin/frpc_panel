import { Link, useLocation } from 'react-router-dom'
import { Layers, LogOut } from 'lucide-react'
import { auth } from '../lib/api'

export function Navbar() {
  const location = useLocation()

  const navItems = [
    { path: '/instances', label: '多实例管理', icon: Layers },
  ]

  return (
    <nav className="bg-gradient-to-r from-blue-900 to-cyan-700 text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center">
            <h1 className="text-xl font-bold">frpc 管理面板</h1>
          </div>
          <div className="flex items-center space-x-4">
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
            <button
              onClick={() => auth.logout()}
              className="flex items-center px-3 py-2 rounded-md text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white transition-colors"
              title="退出登录"
            >
              <LogOut className="w-4 h-4 mr-2" />
              退出
            </button>
          </div>
        </div>
      </div>
    </nav>
  )
}
