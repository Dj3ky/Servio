import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Globe, Sun, Moon, Eye, EyeOff } from 'lucide-react';
import { loginSchema, type LoginRequest } from '@servio/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuthStore } from '@/stores/authStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { api } from '@/lib/api';
import { ApiError } from '@/lib/api';

interface LoginResponse {
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: 'admin' | 'manager' | 'accountant' | 'technician';
    languagePreference: 'sl' | 'en';
  };
}

export default function LoginPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { setAuth, token } = useAuthStore();
  const { settings } = useSettingsStore();
  const [showPassword, setShowPassword] = useState(false);
  const [darkMode, setDarkMode] = useState(() => document.documentElement.classList.contains('dark'));
  const [error, setError] = useState<string | null>(null);

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? '/';

  useEffect(() => {
    if (token) navigate(from, { replace: true });
  }, [token, navigate, from]);

  const form = useForm<LoginRequest>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const loginMutation = useMutation({
    mutationFn: (data: LoginRequest) => api.post<LoginResponse>('/auth/login', data),
    onSuccess: ({ token, user }) => {
      setAuth(token, user);
      i18n.changeLanguage(user.languagePreference);
      navigate(from, { replace: true });
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        setError(t(`errors.${err.code.replace('errors.', '')}` as any));
      } else {
        setError(t('errors.unknown'));
      }
    },
  });

  const toggleDark = () => {
    const next = !darkMode;
    setDarkMode(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('servio-theme', next ? 'dark' : 'light');
  };

  const toggleLanguage = () => {
    i18n.changeLanguage(i18n.language === 'sl' ? 'en' : 'sl');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="absolute right-4 top-4 flex gap-2">
        <Button variant="ghost" size="icon" onClick={toggleLanguage}>
          <Globe className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={toggleDark}>
          {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
      </div>

      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          {settings.logoUrl && (
            <div className="flex justify-center mb-4">
              <img src={settings.logoUrl} alt="logo" className="h-12 object-contain" />
            </div>
          )}
          <CardTitle className="text-2xl">{settings.appName}</CardTitle>
          <CardDescription>{t('auth.welcomeBack')}</CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Form {...form}>
            <form onSubmit={form.handleSubmit((data) => { setError(null); loginMutation.mutate(data); })} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('auth.email')}</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="admin@example.com" autoComplete="email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('auth.password')}</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input type={showPassword ? 'text' : 'password'} autoComplete="current-password" {...field} />
                        <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-10 w-10" onClick={() => setShowPassword((s) => !s)}>
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={loginMutation.isPending}>
                {loginMutation.isPending ? t('common.loading') : t('auth.signIn')}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
