import { Link } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { SiteHeader } from '@/components/SiteHeader';
import { Button } from '@/components/ui/button';

/** Shared page for emailed links. `auto` runs on open (confirmations); otherwise the visitor presses a button, so email scanners can't trigger it. */
export function TokenAction({ token, title, intro, button, auto, run, success, failure }: {
  token?: string; title: string; intro: string; button: string; auto?: boolean;
  run: (token: string) => Promise<{ ok?: boolean; error?: string }>; success: string; failure: string;
}) {
  const [state, setState] = useState<'idle' | 'busy' | 'ok' | 'fail'>('idle'); const [msg, setMsg] = useState('');
  const started = useRef(false);
  const go = async () => { if (!token) return; setState('busy'); try { const r = await run(token); if (r.ok) setState('ok'); else { setMsg(r.error ?? failure); setState('fail'); } } catch { setMsg(failure); setState('fail'); } };
  useEffect(() => { if (auto && token && !started.current) { started.current = true; void go(); } }, [auto, token]); // eslint-disable-line react-hooks/exhaustive-deps
  return <><SiteHeader /><main className="mx-auto max-w-xl px-5 py-14">
    <h1 className="font-display text-3xl font-semibold">{title}</h1>
    {!token ? <p className="mt-4">This link is incomplete. Please open it straight from the email.</p>
      : state === 'ok' ? <p role="status" className="mt-4 rounded-md bg-accent p-4">{success}</p>
      : state === 'fail' ? <p role="alert" className="mt-4 text-destructive">{msg}</p>
      : <><p className="mt-4 text-muted-foreground">{intro}</p>{!auto && <Button className="mt-6" disabled={state === 'busy'} onClick={go}>{state === 'busy' ? 'Working…' : button}</Button>}{auto && <p className="mt-6 text-sm">Working…</p>}</>}
    <Button asChild variant="ghost" className="mt-8 px-0"><Link to="/employers">Back to For employers</Link></Button>
  </main></>;
}
