import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Globe, Sun, Moon, Eye, EyeOff } from 'lucide-react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useSettingsStore } from '@/stores/settingsStore';
import { api, ApiError } from '@/lib/api';

const formSchema = z.object({
  password: z.string().min(8, { message: 'errors.password_too_short' }),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'auth.passwordsNoMatch',
  path: ['confirmPassword'],
});

type FormValues = z.infer<typeof formSchema>;

export default function ResetPasswordPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { settings } = useSettingsStore();
  const [darkMode, setDarkMode] = useState(() => document.documentElement.classList.contains('dark'));
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const token = searchParams.get('token') ?? '';

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  const mutation = useMutation({
    mutationFn: (data: FormValues) =>
      api.post('/auth/reset-password', { token, password: data.password }),
    onSuccess: () => {
      navigate('/login', { state: { resetSuccess: true }, replace: true });
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

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 space-y-4">
            <Alert variant="destructive">
              <AlertDescription>{t('errors.invalid_reset_token')}</AlertDescription>
            </Alert>
            <Button variant="outline" className="w-full" asChild>
              <Link to="/login">{t('auth.backToLogin')}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

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
          <CardTitle className="text-2xl">{t('auth.resetPasswordTitle')}</CardTitle>
          <CardDescription>{t('auth.resetPasswordDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit((data) => { setError(null); mutation.mutate(data); })}
              className="space-y-4"
            >
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('auth.newPassword')}</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input type={showPassword ? 'text' : 'password'} autoComplete="new-password" {...field} />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-0 top-0 h-10 w-10"
                          onClick={() => setShowPassword((s) => !s)}
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('auth.confirmPassword')}</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input type={showConfirm ? 'text' : 'password'} autoComplete="new-password" {...field} />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-0 top-0 h-10 w-10"
                          onClick={() => setShowConfirm((s) => !s)}
                        >
                          {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={mutation.isPending}>
                {mutation.isPending ? t('common.loading') : t('auth.resetPassword')}
              </Button>
              <Button variant="ghost" className="w-full" asChild>
                <Link to="/login">{t('auth.backToLogin')}</Link>
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
