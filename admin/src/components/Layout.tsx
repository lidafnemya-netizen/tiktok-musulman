import { NavLink, Outlet } from 'react-router-dom';
import {
  LayoutDashboard, Users, Film, Flag, MessageSquare,
  LogOut, Activity, ChevronRight, ListTodo, MessageCircle, Settings,
} from 'lucide-react';
import { useAuth } from '../stores/auth';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';

const nav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/users', label: 'Users', icon: Users },
  { to: '/posts', label: 'Posts', icon: Film },
  { to: '/comments', label: 'Comments', icon: MessageCircle },
  { to: '/reports', label: 'Reports', icon: Flag },
  { to: '/tickets', label: 'Support', icon: MessageSquare },
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/roadmap', label: 'Roadmap', icon: ListTodo },
];

export function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="flex h-screen overflow-hidden bg-[#080808]">
      {/* Sidebar */}
      <aside className="w-60 shrink-0 flex flex-col border-r border-white/[0.06] bg-[#0a0a0a]">
        {/* Logo */}
        <div className="p-5 border-b border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/25">
              <Activity size={14} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white leading-none">TM Admin</p>
              <p className="text-xs text-gray-600 mt-0.5">Dashboard</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150',
                  isActive
                    ? 'bg-indigo-500/15 text-indigo-300 shadow-sm'
                    : 'text-gray-500 hover:text-gray-200 hover:bg-white/[0.05]',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={15} className={isActive ? 'text-indigo-400' : 'text-gray-600 group-hover:text-gray-400'} />
                  <span className="flex-1">{label}</span>
                  {isActive && <ChevronRight size={12} className="text-indigo-500/60" />}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* User footer */}
        <div className="p-3 border-t border-white/[0.06]">
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
              {user?.display_name?.[0]?.toUpperCase() ?? 'A'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-300 truncate">{user?.display_name}</p>
              <p className="text-xs text-gray-600 truncate">{user?.role}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={logout}
              className="shrink-0 h-7 w-7 text-gray-600 hover:text-red-400"
              title="Sign out"
            >
              <LogOut size={13} />
            </Button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        <div className="animate-fade-in">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
