import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { ArrowLeft } from 'lucide-react';
import { z } from 'zod';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Separator } from '@/components/ui/separator';
import { api } from '@/lib/api';
import { queryClient } from '@/lib/queryClient';

const formSchema = z.object({
  customerName: z.string().min(1),
  customerEmail: z.string().email().optional().or(z.literal('')),
  facilityName: z.string().min(1),
  facilityAddress: z.string().optional(),
  facilityNotes: z.string().optional(),
  contractNumber: z.string().min(1),
  reviewFrequency: z.enum(['monthly', 'biannual', 'quadannual', 'custom']),
  startDate: z.string().min(1),
  assignedTechnicianId: z.string().optional(),
  valueWithoutVat: z.number().optional(),
  valueWithoutVatPerYear: z.number().optional(),
  smbPath: z.string().optional(),
  contactName: z.string().optional(),
  phone: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

export default function FacilityFormPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isEdit = id && id !== 'new';

  const { data: technicians } = useQuery({
    queryKey: ['users-technicians'],
    queryFn: () => api.get<Array<{ id: string; name: string; role: string }>>('/users'),
  });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      reviewFrequency: 'monthly',
      startDate: new Date().toISOString().slice(0, 10),
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const [customer] = await Promise.all([
        api.post<{ id: string }>('/customers', {
          name: data.customerName,
          email: data.customerEmail || null,
          contactName: data.contactName || null,
          phone: data.phone || null,
        }),
      ]);

      const facility = await api.post<{ id: string }>('/facilities', {
        customerId: customer.id,
        name: data.facilityName,
        address: data.facilityAddress || null,
        notes: data.facilityNotes || null,
      });

      await api.post('/contracts', {
        facilityId: facility.id,
        customerId: customer.id,
        contractNumber: data.contractNumber,
        reviewFrequency: data.reviewFrequency,
        startDate: data.startDate,
        assignedTechnicianId: data.assignedTechnicianId || null,
        valueWithoutVat: data.valueWithoutVat || null,
        valueWithoutVatPerYear: data.valueWithoutVatPerYear || null,
        smbPath: data.smbPath || null,
        customerEmail: data.customerEmail || null,
      });

      return facility;
    },
    onSuccess: (facility) => {
      toast.success(t('common.save'));
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      navigate(`/facilities/${facility.id}`);
    },
  });

  const technicianOptions = (technicians ?? []).filter((u) => u.role === 'technician' || u.role === 'admin');

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold">{isEdit ? t('facility.editFacility') : t('facility.addFacility')}</h1>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit((d) => createMutation.mutate(d))} className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">{t('facility.basicInfo')}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="customerName" render={({ field }) => (
                  <FormItem><FormLabel>{t('contracts.customer')}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="customerEmail" render={({ field }) => (
                  <FormItem><FormLabel>{t('common.email')}</FormLabel><FormControl><Input type="email" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="contactName" render={({ field }) => (
                  <FormItem><FormLabel>Contact Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="phone" render={({ field }) => (
                  <FormItem><FormLabel>{t('common.phone')}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <Separator />
              <FormField control={form.control} name="facilityName" render={({ field }) => (
                <FormItem><FormLabel>{t('contracts.facility')}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="facilityAddress" render={({ field }) => (
                <FormItem><FormLabel>{t('common.address')}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="facilityNotes" render={({ field }) => (
                <FormItem><FormLabel>{t('common.notes')}</FormLabel><FormControl><Textarea rows={3} {...field} /></FormControl><FormMessage /></FormItem>
              )} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">{t('facility.contractInfo')}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="contractNumber" render={({ field }) => (
                  <FormItem><FormLabel>{t('contracts.contractNumber')}</FormLabel><FormControl><Input placeholder="371-2005" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="startDate" render={({ field }) => (
                  <FormItem><FormLabel>{t('contracts.startDate')}</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="reviewFrequency" render={({ field }) => (
                  <FormItem><FormLabel>{t('contracts.frequency')}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        {(['monthly', 'biannual', 'quadannual', 'custom'] as const).map((f) => (
                          <SelectItem key={f} value={f}>{t(`frequency.${f}`)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="assignedTechnicianId" render={({ field }) => (
                  <FormItem><FormLabel>{t('contracts.technician')}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ?? ''}>
                      <FormControl><SelectTrigger><SelectValue placeholder="—" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {technicianOptions.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
                <FormField control={form.control} name="valueWithoutVat" render={({ field }) => (
                  <FormItem><FormLabel>{t('contracts.valueExclVat')}</FormLabel><FormControl><Input type="number" step="0.01" {...field} onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="valueWithoutVatPerYear" render={({ field }) => (
                  <FormItem><FormLabel>{t('contracts.valueExclVatYear')}</FormLabel><FormControl><Input type="number" step="0.01" {...field} onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">{t('facility.smbPath')}</CardTitle></CardHeader>
            <CardContent>
              <FormField control={form.control} name="smbPath" render={({ field }) => (
                <FormItem><FormLabel>Custom SMB Path Override</FormLabel><FormControl><Input placeholder="optional/custom/path" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
            </CardContent>
          </Card>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => navigate(-1)}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={createMutation.isPending}>{t('common.save')}</Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
