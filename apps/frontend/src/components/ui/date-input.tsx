import * as React from 'react';
import { Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from './input';

// Native <input type="date"> renders in the browser's locale (often mm/dd/yyyy),
// so this shows dd.mm.yyyy text while keeping the value as ISO yyyy-mm-dd.

function isoToDisplay(iso: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '';
}

function displayToIso(text: string): string | null {
  const m = /^\s*(\d{1,2})[./-](\d{1,2})[./-](\d{4})\s*$/.exec(text);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  const y = Number(m[3]);
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export interface DateInputProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  required?: boolean;
  disabled?: boolean;
  title?: string;
}

export function DateInput({ value, onChange, className, required, disabled, title }: DateInputProps) {
  const [text, setText] = React.useState(() => isoToDisplay(value));
  const pickerRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (displayToIso(text) !== value) setText(isoToDisplay(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function handleText(next: string) {
    setText(next);
    if (next.trim() === '') onChange('');
    else {
      const iso = displayToIso(next);
      if (iso) onChange(iso);
    }
  }

  function openPicker() {
    const el = pickerRef.current;
    if (!el) return;
    if (typeof el.showPicker === 'function') el.showPicker();
    else el.click();
  }

  return (
    <div className={cn('relative', className)}>
      <Input
        type="text"
        inputMode="numeric"
        placeholder="dd.mm.yyyy"
        className={cn('pr-9', className)}
        value={text}
        onChange={e => handleText(e.target.value)}
        onBlur={() => setText(isoToDisplay(value))}
        required={required}
        disabled={disabled}
        title={title}
      />
      <button
        type="button"
        tabIndex={-1}
        className="absolute right-0 top-0 h-full px-2.5 text-muted-foreground hover:text-foreground disabled:opacity-50"
        onClick={openPicker}
        disabled={disabled}
      >
        <Calendar className="h-4 w-4" />
      </button>
      <input
        ref={pickerRef}
        type="date"
        tabIndex={-1}
        aria-hidden
        className="absolute right-0 bottom-0 h-0 w-0 opacity-0 pointer-events-none"
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  );
}
