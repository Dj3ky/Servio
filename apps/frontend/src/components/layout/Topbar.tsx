import { Menu, Sun, Moon, LogOut, Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { NotificationCenter } from './NotificationCenter';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/lib/api';

interface TopbarProps {
  onMenuClick: () => void;
  darkMode: boolean;
  onToggleDark: () => void;
}

export function Topbar({ onMenuClick, darkMode, onToggleDark }: TopbarProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user, clearAuth } = useAuthStore();

  const logoutMutation = useMutation({
    mutationFn: () => api.post('/auth/logout'),
    onSettled: () => {
      clearAuth();
      navigate('/login');
    },
  });

  const toggleLanguage = () => {
    const newLang = i18n.language === 'sl' ? 'en' : 'sl';
    i18n.changeLanguage(newLang);
  };

  return (
    <header className="flex h-16 items-center justify-between border-b bg-background px-4 lg:px-6">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenuClick}>
        <Menu className="h-5 w-5" />
      </Button>

      <div className="flex-1" />

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={toggleLanguage} title={i18n.language === 'sl' ? 'Switch to English' : 'Preklopi na slovenščino'}>
          <Globe className="h-4 w-4" />
        </Button>

        <Button variant="ghost" size="icon" onClick={onToggleDark}>
          {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>

        <NotificationCenter />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-2 text-sm">
              <span className="hidden md:inline">{user?.name}</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                {user?.name?.charAt(0).toUpperCase()}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <div className="px-2 py-1.5 text-sm text-muted-foreground">{user?.email}</div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => logoutMutation.mutate()}>
              <LogOut className="mr-2 h-4 w-4" />
              {t('auth.logout')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
