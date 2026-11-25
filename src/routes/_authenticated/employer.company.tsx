import { createFileRoute } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { toast } from 'sonner';
import { CompanyForm, Levels, StatusBanner } from '@/components/employers/AccountParts';
import { useEmployerState } from '@/components/employers/useEmployerState';
import { updateCompanyFn } from '@/lib/employer-accounts.functions';
import type { CompanyInput } from '@/lib/employer-accounts';

export const Route = createFileRoute('/_authenticated/employer/company')({ component: CompanyPage });

function CompanyPage() {
  const q = useEmployerState(); const qc = useQueryClient(); const save = useServerFn(updateCompanyFn);
  if (q.isPending) return <p>Loading…</p>;
  const s = q.data;
  if (!s?.company || !s.member) return <p>Set up your company from the Overview tab first.</p>;
  const c = s.company;
  const canEdit = s.member.role === 'owner' && s.access.editProfile;
  const initial: CompanyInput = { name: c.name, website: c.website, country: c.country, size_band: c.size_band as CompanyInput['size_band'], industry: c.industry as CompanyInput['industry'], description: c.description, registration_number: c.registration_number, public_page_url: c.public_page_url };
  return <div className="max-w-2xl space-y-5">
    <h1 className="font-display text-3xl font-semibold">Company profile</h1>
    <StatusBanner status={c.status} reason={c.status_reason} />
    <Levels levels={s.levels} />
    {!canEdit && <p className="text-sm text-muted-foreground">{s.member.role === 'owner' ? 'Your company profile can\u2019t be changed right now.' : 'Only the company owner can edit this profile.'}</p>}
    <CompanyForm key={c.updated_at} initial={initial} domain={c.email_domain} disabled={!canEdit} submitLabel="Save changes" onSubmit={async (v) => { const r = await save({ data: v }); if ('error' in r) return r.error; toast.success('Company profile saved'); await qc.invalidateQueries({ queryKey: ['employer-state'] }); return null; }} />
  </div>;
}
