import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileSpreadsheet, FileText } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  const [monthlyLoading, setMonthlyLoading] = useState<string | null>(null);

  const [yearlyYear, setYearlyYear] = useState(CURRENT_YEAR);
  const [yearlyLoading, setYearlyLoading] = useState<string | null>(null);

  const handleMonthlyDownload = async (format: 'pdf' | 'xlsx') => {
    setMonthlyLoading(format);
    try {
      const url = `/api/reports/monthly/${format}?year=${year}&month=${month}`;
      const filename = `report_${year}_${String(month).padStart(2, '0')}.${format}`;
      await downloadReport(url, filename);
    } catch (err) {
      console.error(err);
    } finally {
      setMonthlyLoading(null);
    }
  };

  const handleYearlyDownload = async (format: 'pdf' | 'xlsx') => {
    setYearlyLoading(format);
    try {
      const url = `/api/reports/yearly/${format}?year=${yearlyYear}`;
      const filename = `report_${yearlyYear}.${format}`;
      await downloadReport(url, filename);
    } catch (err) {
      console.error(err);
    } finally {
      setYearlyLoading(null);
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
                <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">{t('reports.month')}</label>
              <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m) => (
                    <SelectItem key={m} value={String(m)}>
                      {getMonthName(m, i18n.language === 'sl' ? 'sl-SI' : 'en-US')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" disabled={monthlyLoading === 'pdf'} onClick={() => handleMonthlyDownload('pdf')}>
                <FileText className="mr-2 h-4 w-4" />
                {monthlyLoading === 'pdf' ? t('common.loading') : t('reports.exportPdf')}
              </Button>
              <Button variant="outline" disabled={monthlyLoading === 'xlsx'} onClick={() => handleMonthlyDownload('xlsx')}>
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                {monthlyLoading === 'xlsx' ? t('common.loading') : t('reports.exportXlsx')}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('reports.yearly')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-4 flex-wrap">
            <div className="space-y-1">
              <label className="text-sm font-medium">{t('reports.year')}</label>
              <Select value={String(yearlyYear)} onValueChange={(v) => setYearlyYear(Number(v))}>
                <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" disabled={yearlyLoading === 'pdf'} onClick={() => handleYearlyDownload('pdf')}>
                <FileText className="mr-2 h-4 w-4" />
                {yearlyLoading === 'pdf' ? t('common.loading') : t('reports.exportPdf')}
              </Button>
              <Button variant="outline" disabled={yearlyLoading === 'xlsx'} onClick={() => handleYearlyDownload('xlsx')}>
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                {yearlyLoading === 'xlsx' ? t('common.loading') : t('reports.exportXlsx')}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
