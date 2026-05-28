import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileSpreadsheet, FileText, Download, CalendarDays, Calendar } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
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
  const locale = i18n.language === 'sl' ? 'sl-SI' : 'en-US';

  const [year, setYear] = useState(CURRENT_YEAR);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [monthlyLoading, setMonthlyLoading] = useState<string | null>(null);

  const [yearlyYear, setYearlyYear] = useState(CURRENT_YEAR);
  const [yearlyLoading, setYearlyLoading] = useState<string | null>(null);

  const handleMonthlyDownload = async (format: 'pdf' | 'xlsx') => {
    setMonthlyLoading(format);
    try {
      await downloadReport(
        `/api/reports/monthly/${format}?year=${year}&month=${month}`,
        `report_${year}_${String(month).padStart(2, '0')}.${format}`,
      );
    } catch (err) {
      console.error(err);
    } finally {
      setMonthlyLoading(null);
    }
  };

  const handleYearlyDownload = async (format: 'pdf' | 'xlsx') => {
    setYearlyLoading(format);
    try {
      await downloadReport(
        `/api/reports/yearly/${format}?year=${yearlyYear}`,
        `report_${yearlyYear}.${format}`,
      );
    } catch (err) {
      console.error(err);
    } finally {
      setYearlyLoading(null);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">{t('reports.title')}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{t('reports.subtitle')}</p>
      </div>

      {/* Monthly report */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">{t('reports.monthly')}</CardTitle>
          </div>
          <CardDescription>{t('reports.monthlyDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-3 flex-wrap">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t('reports.year')}</label>
              <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t('reports.month')}</label>
              <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m) => (
                    <SelectItem key={m} value={String(m)}>{getMonthName(m, locale)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={!!monthlyLoading}
              onClick={() => handleMonthlyDownload('pdf')}
              className="flex-1 sm:flex-none"
            >
              {monthlyLoading === 'pdf' ? (
                <Download className="mr-2 h-4 w-4 animate-bounce" />
              ) : (
                <FileText className="mr-2 h-4 w-4 text-red-500" />
              )}
              {monthlyLoading === 'pdf' ? t('common.loading') : t('reports.exportPdf')}
            </Button>
            <Button
              variant="outline"
              disabled={!!monthlyLoading}
              onClick={() => handleMonthlyDownload('xlsx')}
              className="flex-1 sm:flex-none"
            >
              {monthlyLoading === 'xlsx' ? (
                <Download className="mr-2 h-4 w-4 animate-bounce" />
              ) : (
                <FileSpreadsheet className="mr-2 h-4 w-4 text-green-600" />
              )}
              {monthlyLoading === 'xlsx' ? t('common.loading') : t('reports.exportXlsx')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Yearly report */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">{t('reports.yearly')}</CardTitle>
          </div>
          <CardDescription>{t('reports.yearlyDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-3 flex-wrap">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t('reports.year')}</label>
              <Select value={String(yearlyYear)} onValueChange={(v) => setYearlyYear(Number(v))}>
                <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={!!yearlyLoading}
              onClick={() => handleYearlyDownload('pdf')}
              className="flex-1 sm:flex-none"
            >
              {yearlyLoading === 'pdf' ? (
                <Download className="mr-2 h-4 w-4 animate-bounce" />
              ) : (
                <FileText className="mr-2 h-4 w-4 text-red-500" />
              )}
              {yearlyLoading === 'pdf' ? t('common.loading') : t('reports.exportPdf')}
            </Button>
            <Button
              variant="outline"
              disabled={!!yearlyLoading}
              onClick={() => handleYearlyDownload('xlsx')}
              className="flex-1 sm:flex-none"
            >
              {yearlyLoading === 'xlsx' ? (
                <Download className="mr-2 h-4 w-4 animate-bounce" />
              ) : (
                <FileSpreadsheet className="mr-2 h-4 w-4 text-green-600" />
              )}
              {yearlyLoading === 'xlsx' ? t('common.loading') : t('reports.exportXlsx')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
