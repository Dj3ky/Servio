import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Globe, Sun, Moon } from 'lucide-react';
import { forgotPasswordSchema, type ForgotPasswordRequest } from '@servio/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useSettingsStore } from '@/stores/settingsStore';
import { api } from '@/lib/api';

export default function ForgotPasswordPage() {
  const { t, i18n } = useTranslation();
  const { settings } = useSettingsStore();
  const [darkMode, setDarkMode] = useState(() => document.documentElement.classList.contains('dark'));
  const [sent, setSent] = useState(false);

  const form = useForm<ForgotPasswordRequest>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const mutation = useMutation({
    mutationFn: (data: ForgotPasswordRequest) => api.post('/auth/forgot-password', data),
    onSuccess: () => setSent(true),
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
          <CardTitle className="text-2xl">{t('auth.forgotPasswordTitle')}</CardTitle>
          <CardDescription>{t('auth.forgotPasswordDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="space-y-4">
              <Alert>
                <AlertDescription>{t('auth.forgotPasswordSuccess')}</AlertDescription>
              </Alert>
              <Button variant="outline" className="w-full" asChild>
                <Link to="/login">{t('auth.backToLogin')}</Link>
              </Button>
            </div>
          ) : (
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit((data) => mutation.mutate(data))}
                className="space-y-4"
              >
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
                <Button type="submit" className="w-full" disabled={mutation.isPending}>
                  {mutation.isPending ? t('common.loading') : t('auth.sendResetLink')}
                </Button>
                <Button variant="ghost" className="w-full" asChild>
                  <Link to="/login">{t('auth.backToLogin')}</Link>
                </Button>
              </form>
            </Form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
