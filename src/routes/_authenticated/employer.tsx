import { createFileRoute, Link, Outlet } from '@tanstack/react-router';
import { SiteHeader } from '@/components/SiteHeader';
import { employerHead } from '@/components/employers/Fields';

export const Route = createFileRoute('/_authenticated/employer')({
  head: () => employerHead('Employer area', 'Your RoleProve employer area: company status, profile and team.', false),
  component: Layout,
});

const tabs = [{ to: '/employer', label: 'Overview', exact: true }, { to: '/employer/company', label: 'Company' }, { to: '/employer/team', label: 'Team' }, { to: '/employer/account', label: 'Account' }] as const;
function Layout() {
  return <><SiteHeader /><main className="mx-auto max-w-5xl px-5 py-8">
    <nav aria-label="Employer area" className="mb-6 flex gap-1 overflow-x-auto border-b border-border">
      {tabs.map((t) => <Link key={t.to} to={t.to} activeOptions={{ exact: 'exact' in t }} className="whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground hover:text-foreground" activeProps={{ className: 'border-primary text-foreground font-medium' }}>{t.label}</Link>)}
    </nav>
    <Outlet />
  </main></>;
}
