import { useTranslation } from 'react-i18next';
import { Plus, X, Phone, Mail, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface ClContact {
  name: string;
  role: string;
  phone: string;
  email: string;
}

export const emptyContact: ClContact = { name: '', role: '', phone: '', email: '' };

// Drops rows the user added but left without a name — the backend requires one.
export function cleanContacts(contacts: ClContact[]): ClContact[] {
  return contacts
    .map(c => ({ name: c.name.trim(), role: c.role.trim(), phone: c.phone.trim(), email: c.email.trim() }))
    .filter(c => c.name);
}

export function ContactsEditor({ value, onChange }: { value: ClContact[]; onChange: (contacts: ClContact[]) => void }) {
  const { t } = useTranslation();

  function update(index: number, patch: Partial<ClContact>) {
    onChange(value.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{t('changelog.contacts.title')}</label>
      {value.map((c, i) => (
        <div key={i} className="relative rounded-md border p-2 pr-9 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Input placeholder={`${t('changelog.contacts.name')} *`} value={c.name} onChange={e => update(i, { name: e.target.value })} />
          <Input placeholder={t('changelog.contacts.role')} value={c.role} onChange={e => update(i, { role: e.target.value })} />
          <Input type="tel" placeholder={t('changelog.contacts.phone')} value={c.phone} onChange={e => update(i, { phone: e.target.value })} />
          <Input type="email" placeholder={t('changelog.contacts.email')} value={c.email} onChange={e => update(i, { email: e.target.value })} />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute top-2 right-1 h-7 w-7"
            onClick={() => onChange(value.filter((_, idx) => idx !== i))}
            title={t('common.remove')}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...value, { ...emptyContact }])}>
        <Plus className="h-3.5 w-3.5 mr-2" />{t('changelog.contacts.add')}
      </Button>
    </div>
  );
}

export function ContactsList({ contacts }: { contacts: ClContact[] }) {
  const { t } = useTranslation();
  if (contacts.length === 0) return null;

  return (
    <div className="space-y-1">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('changelog.contacts.title')}</h3>
      <div className="flex flex-wrap gap-2">
        {contacts.map((c, i) => (
          <div key={i} className="rounded-md border px-3 py-2 text-sm space-y-0.5 min-w-[200px]">
            <div className="flex items-center gap-2 font-medium">
              <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              {c.name}
              {c.role && <span className="text-xs font-normal text-muted-foreground">· {c.role}</span>}
            </div>
            {c.phone && (
              <a href={`tel:${c.phone}`} className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
                <Phone className="h-3 w-3 shrink-0" />{c.phone}
              </a>
            )}
            {c.email && (
              <a href={`mailto:${c.email}`} className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
                <Mail className="h-3 w-3 shrink-0" />{c.email}
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
