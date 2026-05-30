import { useState, useRef, useEffect, useCallback } from 'react';
import { Menu, Sun, Moon, LogOut, Globe, Search, Building2, Users, FileText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { NotificationCenter } from './NotificationCenter';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/lib/api';
import { useDebounce } from '@/hooks/useDebounce';

interface SearchResults {
  customers: Array<{ id: string; name: string; email: string | null }>;
  facilities: Array<{ id: string; name: string; customerName: string }>;
  contracts: Array<{ id: string; contractNumber: string; facilityId: string; facilityName: string; customerName: string; isActive: boolean }>;
}

interface TopbarProps {
  onMenuClick: () => void;
  darkMode: boolean;
  onToggleDark: () => void;
}

export function Topbar({ onMenuClick, darkMode, onToggleDark }: TopbarProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user, clearAuth } = useAuthStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debouncedQuery = useDebounce(searchQuery, 250);

  const logoutMutation = useMutation({
    mutationFn: () => api.post('/auth/logout'),
    onSettled: () => {
      clearAuth();
      navigate('/login');
    },
  });

  const { data: searchResults } = useQuery({
    queryKey: ['search', debouncedQuery],
    queryFn: () => api.get<SearchResults>(`/search?q=${encodeURIComponent(debouncedQuery)}`),
    enabled: debouncedQuery.length >= 2,
    staleTime: 10000,
  });

  const hasResults = searchResults && (
    searchResults.customers.length > 0 ||
    searchResults.facilities.length > 0 ||
    searchResults.contracts.length > 0
  );

  const showDropdown = searchOpen && debouncedQuery.length >= 2;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleResultClick = useCallback((path: string) => {
    navigate(path);
    setSearchQuery('');
    setSearchOpen(false);
  }, [navigate]);

  const toggleLanguage = () => {
    const newLang = i18n.language === 'sl' ? 'en' : 'sl';
    i18n.changeLanguage(newLang);
  };

  return (
    <header className="flex h-16 items-center justify-between border-b bg-background px-4 lg:px-6 gap-4">
      <Button variant="ghost" size="icon" className="lg:hidden shrink-0" onClick={onMenuClick}>
        <Menu className="h-5 w-5" />
      </Button>

      {/* Global search */}
      <div ref={searchRef} className="relative flex-1 max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          ref={inputRef}
          placeholder={t('common.search')}
          className="pl-9 h-9 text-sm"
          value={searchQuery}
          onChange={(e) => { setSearchQuery(e.target.value); setSearchOpen(true); }}
          onFocus={() => setSearchOpen(true)}
        />
        {showDropdown && (
          <div className="absolute top-full mt-1 left-0 right-0 z-50 rounded-lg border bg-popover shadow-lg overflow-hidden">
            {!hasResults ? (
              <div className="px-4 py-3 text-sm text-muted-foreground">{t('common.noData')}</div>
            ) : (
              <div className="py-1 max-h-80 overflow-y-auto">
                {(searchResults?.facilities.length ?? 0) > 0 && (
                  <>
                    <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Building2 className="h-3 w-3" />{t('contracts.facility')}
                    </div>
                    {searchResults!.facilities.map((f) => (
                      <button
                        key={f.id}
                        className="w-full px-3 py-2 text-left hover:bg-accent transition-colors flex flex-col"
                        onClick={() => handleResultClick(`/facilities/${f.id}`)}
                      >
                        <span className="text-sm font-medium">{f.name}</span>
                        <span className="text-xs text-muted-foreground">{f.customerName}</span>
                      </button>
                    ))}
                  </>
                )}
                {(searchResults?.contracts.length ?? 0) > 0 && (
                  <>
                    {(searchResults?.facilities.length ?? 0) > 0 && <div className="border-t my-1" />}
                    <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <FileText className="h-3 w-3" />{t('nav.contracts')}
                    </div>
                    {searchResults!.contracts.map((c) => (
                      <button
                        key={c.id}
                        className="w-full px-3 py-2 text-left hover:bg-accent transition-colors flex flex-col"
                        onClick={() => handleResultClick(`/facilities/${c.facilityId}`)}
                      >
                        <span className="text-sm font-medium font-mono">{c.contractNumber}</span>
                        <span className="text-xs text-muted-foreground">{c.customerName} · {c.facilityName}</span>
                      </button>
                    ))}
                  </>
                )}
                {(searchResults?.customers.length ?? 0) > 0 && (
                  <>
                    {((searchResults?.facilities.length ?? 0) > 0 || (searchResults?.contracts.length ?? 0) > 0) && <div className="border-t my-1" />}
                    <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Users className="h-3 w-3" />{t('contracts.customer')}
                    </div>
                    {searchResults!.customers.map((c) => (
                      <button
                        key={c.id}
                        className="w-full px-3 py-2 text-left hover:bg-accent transition-colors flex flex-col"
                        onClick={() => handleResultClick(`/contracts?customer=${encodeURIComponent(c.name)}`)}
                      >
                        <span className="text-sm font-medium">{c.name}</span>
                        {c.email && <span className="text-xs text-muted-foreground">{c.email}</span>}
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
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
