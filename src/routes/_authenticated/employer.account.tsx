import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getStripeEnvironment } from '@/lib/stripe';
import { deleteAccountFn } from '@/lib/payments.functions';
import { confirmExportDownloaded, requestDataExport } from '@/lib/data-export.functions';
import { NotificationSettingsCard } from '@/components/inbox/NotificationSettingsCard';
import { employerHead } from '@/components/employers/Fields';

export const Route = createFileRoute('/_authenticated/employer/account')({ head:()=>employerHead('Employer account and data','Your employer account, notification preferences and company data export.',false), component: AccountPage });

function AccountPage() {
  const { user, signOut } = useAuth(); const router = useRouter(); const qc = useQueryClient();
  const requestExport = useServerFn(requestDataExport); const confirmDownloaded = useServerFn(confirmExportDownloaded);
  const [busy, setBusy] = useState(false); const [status, setStatus] = useState<string | null>(null); const [blob, setBlob] = useState<Blob | null>(null);
  const [reauth, setReauth] = useState(false); const [password, setPassword] = useState('');
  async function exportData(pw?: string) {
    if (!user) return; setBusy(true);
    try {
      if (pw) { const { error } = await supabase.auth.signInWithPassword({ email: user.email ?? '', password: pw }); if (error) return toast.error('That password is not correct.'); setReauth(false); setPassword(''); }
      setStatus('Building your export…');
      const r = await requestExport();
      if ('error' in r) { setStatus(null); if (r.code === 'reauth') { setReauth(true); return; } return toast.error(r.error, { duration: 12000 }); }
      const res = await fetch(r.url); if (!res.ok) { setStatus(null); return toast.error('Your export was created but could not be fetched. Please contact support.'); }
      setBlob(await res.blob()); await confirmDownloaded({ data: { exportId: r.exportId } }); setStatus('Your export is ready.');
    } finally { setBusy(false); }
  }
  function save() { if (!blob) return; const u = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = u; a.download = `roleprove-employer-data-${new Date().toISOString().slice(0, 10)}.zip`; a.click(); setTimeout(() => URL.revokeObjectURL(u), 30000); }
  async function del() {
    if (!window.confirm('This permanently deletes your employer account and removes you from your company. If you are the last member, the company is deleted after a notice period. Continue?')) return;
    setBusy(true);
    const r = await deleteAccountFn({ data: { environment: getStripeEnvironment() } });
    if ('error' in r) { setBusy(false); return toast.error(`Could not delete your account: ${r.error}`, { duration: 12000 }); }
    await qc.cancelQueries(); qc.clear(); await signOut(); setBusy(false);
    toast.success('Your account has been deleted'); router.navigate({ to: '/', replace: true });
  }
  return <div className="max-w-2xl space-y-6">
    <h1 className="font-display text-3xl font-semibold">Account and data</h1>
    <p className="text-sm text-muted-foreground">Signed in as {user?.email}</p>
    <NotificationSettingsCard />
    <Card className="border-border shadow-none"><CardHeader><CardTitle className="font-display text-lg">Your data</CardTitle><CardDescription>Download a copy of your account, company profile and your actions in the company log, or delete your account.</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-3"><Button variant="outline" onClick={() => exportData()} disabled={busy}>Export my data</Button>{blob && <Button onClick={save}>Save zip</Button>}<Button variant="destructive" onClick={del} disabled={busy}>Delete my account</Button></div>
        {status && <p role="status" className="text-sm">{status}</p>}
        <p className="text-xs text-muted-foreground">Company owners with other team members must make someone else the owner first.</p>
      </CardContent></Card>
    <Dialog open={reauth} onOpenChange={setReauth}><DialogContent><DialogHeader><DialogTitle>Confirm it's you</DialogTitle><DialogDescription>Enter your password to export your data.</DialogDescription></DialogHeader>
      <Input type="password" aria-label="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <DialogFooter><Button onClick={() => exportData(password)} disabled={busy || !password}>Continue</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
