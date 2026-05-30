import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Plus, Key, UserX, UserCheck, Search, SlidersHorizontal, Users, Activity, Pencil } from 'lucide-react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getSortedRowModel,
  getFilteredRowModel,
  type SortingState,
  type VisibilityState,
  type ColumnFiltersState,
} from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { createUserSchema, updateUserSchema } from '@servio/shared';
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
  lastLoginAt: string | null;
  actionCount: number;
}

const resetPasswordSchema = z.object({ password: z.string().min(8) });

const editUserFormSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  role: z.enum(['admin', 'manager', 'accountant', 'technician']),
  languagePreference: z.enum(['sl', 'en']),
});

const columnHelper = createColumnHelper<UserRow>();

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300',
  manager: 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300',
  accountant: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
  technician: 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300',
};

export default function UsersPage() {
  const { t } = useTranslation();
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState<UserRow | null>(null);
  const [resetOpen, setResetOpen] = useState<UserRow | null>(null);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<UserRow[]>('/users'),
  });

  const createForm = useForm({
    resolver: zodResolver(createUserSchema),
    defaultValues: { email: '', name: '', password: '', role: 'technician' as const, languagePreference: 'sl' as const },
  });

  const editForm = useForm<z.infer<typeof editUserFormSchema>>({
    resolver: zodResolver(editUserFormSchema),
    defaultValues: { email: '', name: '', role: 'technician', languagePreference: 'sl' },
  });

  const resetForm = useForm({ resolver: zodResolver(resetPasswordSchema), defaultValues: { password: '' } });

  const createMutation = useMutation({
    mutationFn: (data: z.infer<typeof createUserSchema>) => api.post('/users', data),
    onSuccess: () => {
      toast.success(t('common.save'));
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setCreateOpen(false);
      createForm.reset();
    },
  });

  const editMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: z.infer<typeof updateUserSchema> }) =>
      api.patch(`/users/${id}`, data),
    onSuccess: () => {
      toast.success(t('common.save'));
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setEditOpen(null);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => api.patch(`/users/${id}`, { isActive }),
    onSuccess: () => { toast.success(t('common.save')); queryClient.invalidateQueries({ queryKey: ['users'] }); },
  });

  const resetMutation = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) => api.post(`/users/${id}/reset-password`, { password }),
    onSuccess: () => { toast.success(t('common.save')); setResetOpen(null); resetForm.reset(); },
  });

  const columns = useMemo(() => [
    columnHelper.accessor('name', {
      id: 'name',
      header: t('common.name'),
      cell: (info) => (
        <div className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
            {info.getValue().charAt(0).toUpperCase()}
          </div>
          <span className="font-medium">{info.getValue()}</span>
        </div>
      ),
    }),
    columnHelper.accessor('email', {
      id: 'email',
      header: t('common.email'),
      cell: (info) => <span className="text-muted-foreground">{info.getValue()}</span>,
    }),
    columnHelper.accessor('role', {
      id: 'role',
      header: t('users.role'),
      cell: (info) => (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[info.getValue()] ?? 'bg-muted text-muted-foreground'}`}>
          {t(`users.roles.${info.getValue()}` as any)}
        </span>
      ),
    }),
    columnHelper.accessor('languagePreference', {
      id: 'language',
      header: t('users.language'),
      cell: (info) => <span className="text-sm font-mono uppercase">{info.getValue()}</span>,
    }),
    columnHelper.accessor('isActive', {
      id: 'status',
      header: t('common.status'),
      cell: (info) => (
        <Badge variant={info.getValue() ? 'success' : 'secondary'}>
          {info.getValue() ? t('common.active') : t('common.inactive')}
        </Badge>
      ),
    }),
    columnHelper.accessor('lastLoginAt', {
      id: 'lastLogin',
      header: t('users.lastLogin'),
      cell: (info) => {
        const v = info.getValue();
        return v
          ? <span className="text-xs text-muted-foreground">{new Date(v).toLocaleDateString()}</span>
          : <span className="text-xs text-muted-foreground/40">—</span>;
      },
    }),
    columnHelper.accessor('actionCount', {
      id: 'actionCount',
      header: () => (
        <span className="flex items-center gap-1">
          <Activity className="h-3.5 w-3.5" />{t('users.actions')}
        </span>
      ),
      cell: (info) => (
        <span className="text-xs font-mono text-muted-foreground">{info.getValue()}</span>
      ),
    }),
    columnHelper.display({
      id: 'actions',
      header: '',
      enableHiding: false,
      cell: ({ row }) => (
        <TooltipProvider>
          <div className="flex gap-1 justify-end">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0"
                  onClick={() => {
                    editForm.reset({
                      email: row.original.email,
                      name: row.original.name,
                      role: row.original.role as z.infer<typeof editUserFormSchema>['role'],
                      languagePreference: row.original.languagePreference as z.infer<typeof editUserFormSchema>['languagePreference'],
                    });
                    setEditOpen(row.original);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('users.editUser')}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setResetOpen(row.original)}>
                  <Key className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('users.resetPassword')}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className={`h-8 w-8 p-0 ${row.original.isActive ? 'text-destructive hover:text-destructive' : 'text-green-600 hover:text-green-600'}`}
                  onClick={() => toggleMutation.mutate({ id: row.original.id, isActive: !row.original.isActive })}
                >
                  {row.original.isActive ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{row.original.isActive ? t('users.deactivate') : t('users.activate')}</TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      ),
    }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [t]);

  const table = useReactTable({
    data: data ?? [],
    columns,
    state: { sorting, columnVisibility, columnFilters, globalFilter },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const activeCount = (data ?? []).filter((u) => u.isActive).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('users.title')}</h1>
          {data && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {activeCount} {t('common.active').toLowerCase()} · {data.length} {t('common.total').toLowerCase()}
            </p>
          )}
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t('users.addUser')}
        </Button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t('common.search')}
            className="pl-9"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="ml-auto">
              <SlidersHorizontal className="h-4 w-4 mr-2" />
              {t('common.columns')}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuLabel className="text-xs text-muted-foreground">{t('common.toggleColumns')}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {table.getAllColumns()
              .filter((col) => col.getCanHide())
              .map((col) => (
                <DropdownMenuCheckboxItem
                  key={col.id}
                  checked={col.getIsVisible()}
                  onCheckedChange={(val) => col.toggleVisibility(!!val)}
                >
                  {col.columnDef.header as string}
                </DropdownMenuCheckboxItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Table */}
      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="bg-muted/30 hover:bg-muted/30">
                {hg.headers.map((h) => (
                  <TableHead key={h.id}>
                    {flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <TableRow key={i}>
                  {[...Array(6)].map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}
                </TableRow>
              ))
            ) : table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center py-16 text-muted-foreground">
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  {t('common.noData')}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} className={!row.original.isActive ? 'opacity-60' : ''}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create user dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('users.addUser')}</DialogTitle></DialogHeader>
          <Form {...createForm}>
            <form onSubmit={createForm.handleSubmit((d) => createMutation.mutate(d))} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={createForm.control} name="name" render={({ field }) => (
                  <FormItem><FormLabel>{t('common.name')}</FormLabel><FormControl><Input placeholder="Janez Novak" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={createForm.control} name="email" render={({ field }) => (
                  <FormItem><FormLabel>{t('common.email')}</FormLabel><FormControl><Input type="email" placeholder="janez@example.com" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <FormField control={createForm.control} name="password" render={({ field }) => (
                <FormItem><FormLabel>{t('auth.password')}</FormLabel><FormControl><Input type="password" placeholder="Min. 8 characters" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <div className="grid grid-cols-2 gap-4">
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
                <FormField control={createForm.control} name="languagePreference" render={({ field }) => (
                  <FormItem><FormLabel>{t('users.language')}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="sl">Slovenščina</SelectItem>
                        <SelectItem value="en">English</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <DialogFooter>
                <Button variant="outline" type="button" onClick={() => setCreateOpen(false)}>{t('common.cancel')}</Button>
                <Button type="submit" disabled={createMutation.isPending}>{t('common.create')}</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Edit user dialog */}
      <Dialog open={!!editOpen} onOpenChange={(open) => { if (!open) setEditOpen(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('users.editUser')}</DialogTitle>
          </DialogHeader>
          <Form {...editForm}>
            <form
              onSubmit={editForm.handleSubmit((d) => editOpen && editMutation.mutate({ id: editOpen.id, data: d }))}
              className="space-y-4"
            >
              <div className="grid grid-cols-2 gap-4">
                <FormField control={editForm.control} name="name" render={({ field }) => (
                  <FormItem><FormLabel>{t('common.name')}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={editForm.control} name="email" render={({ field }) => (
                  <FormItem><FormLabel>{t('common.email')}</FormLabel><FormControl><Input type="email" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField control={editForm.control} name="role" render={({ field }) => (
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
                <FormField control={editForm.control} name="languagePreference" render={({ field }) => (
                  <FormItem><FormLabel>{t('users.language')}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="sl">Slovenščina</SelectItem>
                        <SelectItem value="en">English</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <DialogFooter>
                <Button variant="outline" type="button" onClick={() => setEditOpen(null)}>{t('common.cancel')}</Button>
                <Button type="submit" disabled={editMutation.isPending}>{t('common.save')}</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Reset password dialog */}
      <Dialog open={!!resetOpen} onOpenChange={() => setResetOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('users.resetPassword')}</DialogTitle>
            {resetOpen && <p className="text-sm text-muted-foreground">{resetOpen.name} · {resetOpen.email}</p>}
          </DialogHeader>
          <Form {...resetForm}>
            <form
              onSubmit={resetForm.handleSubmit((d) => resetOpen && resetMutation.mutate({ id: resetOpen.id, password: d.password }))}
              className="space-y-4"
            >
              <FormField control={resetForm.control} name="password" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('auth.password')}</FormLabel>
                  <FormControl><Input type="password" placeholder="Min. 8 characters" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
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
