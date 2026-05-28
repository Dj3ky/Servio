import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Plus, Key, UserX, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createUserSchema } from '@servio/shared';
import { api } from '@/lib/api';
import { queryClient } from '@/lib/queryClient';

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: string;
  languagePreference: string;
  isActive: boolean;
  createdAt: string;
}

const resetPasswordSchema = z.object({ password: z.string().min(8) });

export default function UsersPage() {
  const { t } = useTranslation();
  const [createOpen, setCreateOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState<UserRow | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<UserRow[]>('/users'),
  });

  const createForm = useForm({
    resolver: zodResolver(createUserSchema),
    defaultValues: { email: '', name: '', password: '', role: 'technician' as const, languagePreference: 'sl' as const },
  });

  const resetForm = useForm({ resolver: zodResolver(resetPasswordSchema), defaultValues: { password: '' } });

  const createMutation = useMutation({
    mutationFn: (data: z.infer<typeof createUserSchema>) => api.post('/users', data),
    onSuccess: () => { toast.success(t('common.save')); queryClient.invalidateQueries({ queryKey: ['users'] }); setCreateOpen(false); createForm.reset(); },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => api.patch(`/users/${id}`, { isActive }),
    onSuccess: () => { toast.success(t('common.save')); queryClient.invalidateQueries({ queryKey: ['users'] }); },
  });

  const resetMutation = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) => api.post(`/users/${id}/reset-password`, { password }),
    onSuccess: () => { toast.success(t('common.save')); setResetOpen(null); resetForm.reset(); },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('users.title')}</h1>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t('users.addUser')}
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('common.name')}</TableHead>
              <TableHead>{t('common.email')}</TableHead>
              <TableHead>{t('users.role')}</TableHead>
              <TableHead>{t('users.language')}</TableHead>
              <TableHead>{t('common.status')}</TableHead>
              <TableHead>{t('common.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? [...Array(5)].map((_, i) => (
              <TableRow key={i}>{[...Array(6)].map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
            )) : (data ?? []).map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">{user.name}</TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell><Badge variant="secondary">{t(`users.roles.${user.role}` as any)}</Badge></TableCell>
                <TableCell>{user.languagePreference.toUpperCase()}</TableCell>
                <TableCell>
                  <Badge variant={user.isActive ? 'success' : 'secondary'}>
                    {user.isActive ? t('common.active') : t('common.inactive')}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setResetOpen(user)}>
                      <Key className="h-3 w-3" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => toggleMutation.mutate({ id: user.id, isActive: !user.isActive })}>
                      {user.isActive ? <UserX className="h-3 w-3" /> : <UserCheck className="h-3 w-3" />}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('users.addUser')}</DialogTitle></DialogHeader>
          <Form {...createForm}>
            <form onSubmit={createForm.handleSubmit((d) => createMutation.mutate(d))} className="space-y-4">
              <FormField control={createForm.control} name="name" render={({ field }) => (
                <FormItem><FormLabel>{t('common.name')}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={createForm.control} name="email" render={({ field }) => (
                <FormItem><FormLabel>{t('common.email')}</FormLabel><FormControl><Input type="email" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={createForm.control} name="password" render={({ field }) => (
                <FormItem><FormLabel>{t('auth.password')}</FormLabel><FormControl><Input type="password" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={createForm.control} name="role" render={({ field }) => (
                <FormItem><FormLabel>{t('users.role')}</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      {(['admin', 'manager', 'accountant', 'technician'] as const).map((r) => (
                        <SelectItem key={r} value={r}>{t(`users.roles.${r}`)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <DialogFooter>
                <Button variant="outline" type="button" onClick={() => setCreateOpen(false)}>{t('common.cancel')}</Button>
                <Button type="submit" disabled={createMutation.isPending}>{t('common.create')}</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!resetOpen} onOpenChange={() => setResetOpen(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('users.resetPassword')} – {resetOpen?.name}</DialogTitle></DialogHeader>
          <Form {...resetForm}>
            <form onSubmit={resetForm.handleSubmit((d) => resetOpen && resetMutation.mutate({ id: resetOpen.id, password: d.password }))} className="space-y-4">
              <FormField control={resetForm.control} name="password" render={({ field }) => (
                <FormItem><FormLabel>{t('auth.password')}</FormLabel><FormControl><Input type="password" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <DialogFooter>
                <Button variant="outline" type="button" onClick={() => setResetOpen(null)}>{t('common.cancel')}</Button>
                <Button type="submit" disabled={resetMutation.isPending}>{t('common.confirm')}</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
