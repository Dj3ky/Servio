import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { ArrowLeft, Building2, FileText, HardDrive } from 'lucide-react';
import { z } from 'zod';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { queryClient } from '@/lib/queryClient';

const MONTH_NUMS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

function monthAbbr(month: number, lang: string) {
  return new Intl.DateTimeFormat(lang, { month: 'short' }).format(new Date(2024, month - 1, 1));
}

const Req = () => <span className="text-destructive ml-0.5">*</span>;

const formSchema = z.object({
  customerName: z.string().min(1),
  customerEmail: z.string().email().optional().or(z.literal('')),
  facilityName: z.string().min(1),
  facilityAddress: z.string().optional(),
  facilityNotes: z.string().optional(),
  contractNumber: z.string().min(1),
  reviewFrequency: z.enum(['monthly', 'biannual', 'quadannual', 'custom']),
  invoiceDelivery: z.enum(['email', 'post', 'e_invoice']),
  customMonths: z.array(z.number().int().min(1).max(12)).optional(),
  startDate: z.string().min(1),
  valueWithoutVat: z.number().optional(),
  valueWithoutVatPerYear: z.number().optional(),
  smbPath: z.string().optional(),
  contactName: z.string().optional(),
  phone: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface FacilityEditData {
  id: string;
  name: string;
  address: string | null;
  notes: string | null;
  customer: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    contactName: string | null;
  };
  contracts: Array<{
    id: string;
    contractNumber: string;
    reviewFrequency: string;
    customMonths: number[] | null;
    startDate: string;
    assignedTechnicianId: string | null;
    valueWithoutVat: number | string | null;
    valueWithoutVatPerYear: number | string | null;
    smbPath: string | null;
    customerEmail: string | null;
    isActive: boolean;
  }>;
}

function toNumber(v: number | string | null | undefined): number | undefined {
  if (v == null || v === '') return undefined;
  const n = parseFloat(String(v));
  return isNaN(n) ? undefined : n;
}

export default function FacilityFormPage() {
  const { id } = useParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const isEdit = !!id;

  const { data: facilityData, isLoading: loadingEdit } = useQuery({
    queryKey: ['facility-edit', id],
    queryFn: () => api.get<FacilityEditData>(`/facilities/${id}`),
    enabled: isEdit,
  });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      reviewFrequency: 'monthly',
      invoiceDelivery: 'email' as const,
      customMonths: [],
      startDate: new Date().toISOString().slice(0, 10),
    },
  });

  useEffect(() => {
    if (!facilityData) return;
    const contract = facilityData.contracts.find((c) => c.isActive) ?? facilityData.contracts[0];
    form.reset({
      customerName: facilityData.customer.name,
      customerEmail: facilityData.customer.email ?? '',
      contactName: facilityData.customer.contactName ?? '',
      phone: facilityData.customer.phone ?? '',
      facilityName: facilityData.name,
      facilityAddress: facilityData.address ?? '',
      facilityNotes: facilityData.notes ?? '',
      contractNumber: contract?.contractNumber ?? '',
      reviewFrequency: (contract?.reviewFrequency as FormData['reviewFrequency']) ?? 'monthly',
      invoiceDelivery: ((contract as any)?.invoiceDelivery as FormData['invoiceDelivery']) ?? 'email',
      customMonths: contract?.customMonths ?? [],
      startDate: contract?.startDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
      valueWithoutVat: toNumber(contract?.valueWithoutVat),
      valueWithoutVatPerYear: toNumber(contract?.valueWithoutVatPerYear),
      smbPath: contract?.smbPath ?? '',
    });
  }, [facilityData]);

  const reviewFrequency = form.watch('reviewFrequency');
  const customMonths = form.watch('customMonths') ?? [];

  function toggleMonth(month: number) {
    const current = form.getValues('customMonths') ?? [];
    const next = current.includes(month)
      ? current.filter((m) => m !== month)
      : [...current, month].sort((a, b) => a - b);
    form.setValue('customMonths', next, { shouldValidate: true });
  }

  const createMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const customer = await api.post<{ id: string }>('/customers', {
        name: data.customerName,
        email: data.customerEmail || undefined,
        contactName: data.contactName || undefined,
        phone: data.phone || undefined,
      });

      const facility = await api.post<{ id: string }>('/facilities', {
        customerId: customer.id,
        name: data.facilityName,
        address: data.facilityAddress || undefined,
        notes: data.facilityNotes || undefined,
      });

      await api.post('/contracts', {
        facilityId: facility.id,
        customerId: customer.id,
        contractNumber: data.contractNumber,
        reviewFrequency: data.reviewFrequency,
        invoiceDelivery: data.invoiceDelivery,
        customMonths: data.reviewFrequency === 'custom' ? (data.customMonths ?? []) : undefined,
        startDate: data.startDate,
        valueWithoutVat: data.valueWithoutVat ?? undefined,
        valueWithoutVatPerYear: data.valueWithoutVatPerYear ?? undefined,
        smbPath: data.smbPath || undefined,
        customerEmail: data.customerEmail || undefined,
      });

      return facility;
    },
    onSuccess: (facility) => {
      toast.success(t('common.save'));
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      navigate(`/facilities/${facility.id}`);
    },
    onError: () => toast.error(t('errors.validation')),
  });

  const updateMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const contract = facilityData!.contracts.find((c) => c.isActive) ?? facilityData!.contracts[0];

      await Promise.all([
        api.patch(`/customers/${facilityData!.customer.id}`, {
          name: data.customerName,
          email: data.customerEmail || undefined,
          contactName: data.contactName || undefined,
          phone: data.phone || undefined,
        }),
        api.patch(`/facilities/${id}`, {
          name: data.facilityName,
          address: data.facilityAddress || undefined,
          notes: data.facilityNotes || undefined,
        }),
      ]);

      if (contract) {
        await api.patch(`/contracts/${contract.id}`, {
          contractNumber: data.contractNumber,
          reviewFrequency: data.reviewFrequency,
          invoiceDelivery: data.invoiceDelivery,
          customMonths: data.reviewFrequency === 'custom' ? (data.customMonths ?? []) : undefined,
          startDate: data.startDate,
          valueWithoutVat: data.valueWithoutVat ?? undefined,
          valueWithoutVatPerYear: data.valueWithoutVatPerYear ?? undefined,
          smbPath: data.smbPath || undefined,
          customerEmail: data.customerEmail || undefined,
        });
      }
    },
    onSuccess: () => {
      toast.success(t('common.save'));
      queryClient.invalidateQueries({ queryKey: ['facility', id] });
      queryClient.invalidateQueries({ queryKey: ['facility-edit', id] });
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      navigate(`/facilities/${id}`);
    },
    onError: () => toast.error(t('errors.validation')),
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  if (isEdit && loadingEdit) {
    return (
      <div className="space-y-4 max-w-3xl">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">
            {isEdit ? t('facility.editFacility') : t('facility.addFacility')}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t('facility.required')}</p>
        </div>
      </div>

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit((d) => isEdit ? updateMutation.mutate(d) : createMutation.mutate(d))}
          className="space-y-6"
        >
          {/* ── Section 1: Basic Info ── */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">{t('facility.basicInfo')}</CardTitle>
              </div>
              <CardDescription>{t('facility.basicInfoDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="customerName" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('contracts.customer')}<Req /></FormLabel>
                    <FormControl>
                      <Input placeholder="Acme d.o.o." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="customerEmail" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('common.email')}</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="info@example.com" {...field} />
                    </FormControl>
                    <FormDescription>{t('facility.customerEmailHint')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="contactName" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contact Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Janez Novak" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="phone" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('common.phone')}</FormLabel>
                    <FormControl>
                      <Input placeholder="+386 41 123 456" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <Separator />

              <FormField control={form.control} name="facilityName" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('contracts.facility')}<Req /></FormLabel>
                  <FormControl>
                    <Input placeholder="Objekt Ljubljana — Dunajska" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="facilityAddress" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('common.address')}</FormLabel>
                  <FormControl>
                    <Input placeholder="Dunajska cesta 1, 1000 Ljubljana" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="facilityNotes" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('common.notes')}</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={3}
                      placeholder="Additional notes about the facility, access codes, special instructions…"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </CardContent>
          </Card>

          {/* ── Section 2: Contract Details ── */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">{t('facility.contractInfo')}</CardTitle>
              </div>
              <CardDescription>{t('facility.contractInfoDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="contractNumber" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('contracts.contractNumber')}<Req /></FormLabel>
                    <FormControl>
                      <Input placeholder="371-2025" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="startDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('contracts.startDate')}<Req /></FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="reviewFrequency" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('contracts.frequency')}<Req /></FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        {(['monthly', 'biannual', 'quadannual', 'custom'] as const).map((f) => (
                          <SelectItem key={f} value={f}>{t(`frequency.${f}`)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {reviewFrequency === 'biannual' && (
                      <FormDescription>
                        {[1, 7].map((m) => new Intl.DateTimeFormat(i18n.language, { month: 'long' }).format(new Date(2024, m - 1, 1))).join(', ')}
                      </FormDescription>
                    )}
                    {reviewFrequency === 'quadannual' && (
                      <FormDescription>
                        {[1, 4, 7, 10].map((m) => new Intl.DateTimeFormat(i18n.language, { month: 'long' }).format(new Date(2024, m - 1, 1))).join(', ')}
                      </FormDescription>
                    )}
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="invoiceDelivery" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('contracts.invoiceDelivery')}<Req /></FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        {(['email', 'post', 'e_invoice'] as const).map((d) => (
                          <SelectItem key={d} value={d}>{t(`invoiceDelivery.${d}`)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="valueWithoutVat" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('contracts.valueExclVat')}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={field.value ?? ''}
                        onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                      />
                    </FormControl>
                    <FormDescription>{t('facility.valueHint')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="valueWithoutVatPerYear" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('contracts.valueExclVatYear')}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={field.value ?? ''}
                        onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                      />
                    </FormControl>
                    <FormDescription>{t('facility.valueYearHint')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              {reviewFrequency === 'custom' && (
                <div className="space-y-2">
                  <FormLabel>{t('frequency.custom')}</FormLabel>
                  <p className="text-sm text-muted-foreground">{t('facility.customMonthsHint')}</p>
                  <div className="grid grid-cols-6 gap-2">
                    {MONTH_NUMS.map((m) => {
                      const selected = customMonths.includes(m);
                      return (
                        <button
                          key={m}
                          type="button"
                          onClick={() => toggleMonth(m)}
                          className={`rounded border px-2 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                            selected
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-background text-foreground border-border hover:bg-muted'
                          }`}
                        >
                          {monthAbbr(m, i18n.language)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Section 3: SMB Path ── */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <HardDrive className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">{t('facility.smbPath')}</CardTitle>
              </div>
              <CardDescription>{t('facility.smbPathDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <FormField control={form.control} name="smbPath" render={({ field }) => (
                <FormItem>
                  <FormLabel>Custom SMB Path Override</FormLabel>
                  <FormControl>
                    <Input placeholder="Stranke/Acme/Ljubljana" {...field} />
                  </FormControl>
                  <FormDescription>{t('facility.smbPathHint')}</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />
            </CardContent>
          </Card>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => navigate(-1)}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={isPending}>{t('common.save')}</Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
