import type { ReactNode } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

export function Tick({ checked, onChange, children, id }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; id: string }) {
  return <div className="flex items-start gap-3"><Checkbox id={id} checked={checked} onCheckedChange={v => onChange(v === true)} className="mt-0.5" /><Label htmlFor={id} className="text-sm font-normal leading-snug">{children}</Label></div>;
}
export function MultiTicks<T extends string>({ legend, options, value, onChange, labels }: { legend: string; options: readonly T[]; value: T[]; onChange: (v: T[]) => void; labels?: Record<string, string> }) {
  return <fieldset className="space-y-2"><legend className="mb-2 text-sm font-medium">{legend}</legend><div className="flex flex-wrap gap-x-5 gap-y-2">{options.map(o =>
    <Tick key={o} id={`${legend}-${o}`} checked={value.includes(o)} onChange={c => onChange(c ? [...value, o] : value.filter(x => x !== o))}>{labels?.[o] ?? o}</Tick>)}</div></fieldset>;
}
/** Hidden from people; bots tend to fill it. */
export function Honeypot({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden"><label>Website<input tabIndex={-1} autoComplete="off" value={value} onChange={e => onChange(e.target.value)} /></label></div>;
}
export const ROLE_LABELS: Record<string, string> = { data_analyst: 'Data Analyst', customer_support: 'Customer Support', other: 'Other' };
export const employerHead = (title: string, description: string, index = true) => ({ meta: [
  { title: `${title} | RoleProve` }, { name: 'description', content: description },
  { property: 'og:title', content: `${title} | RoleProve` }, { property: 'og:description', content: description },
  { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' },
  ...(index ? [] : [{ name: 'robots', content: 'noindex' }]),
] });
