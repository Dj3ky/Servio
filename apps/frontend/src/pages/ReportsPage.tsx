import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuthStore } from '@/stores/authStore';
import { getMonthName } from '@/lib/utils';

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i);

async function downloadReport(url: string, filename: string) {
  const token = JSON.parse(localStorage.getItem('servio-auth') ?? '{}')?.state?.token;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error('Download failed');
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function ReportsPage() {
  const { t, i18n } = useTranslation();
  const [year, setYear] = useState(CURRENT_YEAR);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [loading, setLoading] = useState<string | null>(null);

  const handleDownload = async (format: 'pdf' | 'xlsx') => {
    setLoading(format);
    try {
      const url = `/api/reports/monthly/${format}?year=${year}&month=${month}`;
      const filename = `report_${year}_${String(month).padStart(2, '0')}.${format}`;
      await downloadReport(url, filename);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('reports.title')}</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('reports.monthly')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-4 flex-wrap">
            <div className="space-y-1">
              <label className="text-sm font-medium">{t('reports.year')}</label>
              <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">{t('reports.month')}</label>
              <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m) => <SelectItem key={m} value={String(m)}>{getMonthName(m, i18n.language === 'sl' ? 'sl-SI' : 'en-US')}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" disabled={loading === 'pdf'} onClick={() => handleDownload('pdf')}>
                <FileText className="mr-2 h-4 w-4" />
                {loading === 'pdf' ? t('common.loading') : t('reports.exportPdf')}
              </Button>
              <Button variant="outline" disabled={loading === 'xlsx'} onClick={() => handleDownload('xlsx')}>
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                {loading === 'xlsx' ? t('common.loading') : t('reports.exportXlsx')}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
