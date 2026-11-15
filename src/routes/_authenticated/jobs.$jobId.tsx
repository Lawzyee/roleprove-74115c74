import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
import { queryOptions, useSuspenseQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowUpRight, Bookmark, Flag, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { SiteHeader } from '@/components/SiteHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { jobHead, jobRole } from '@/components/jobs/JobParts';
import { getJobCenterFn, saveTrackedJobFn, clickApplyJobFn, practiceJobFn, reportJobFn } from '@/lib/job-center.functions';
import { available, salaryLabel, JOB_REPORT_REASONS } from '@/lib/job-center';
import { getStripeEnvironment } from '@/lib/stripe';
const options=queryOptions({queryKey:['job-center'],queryFn:()=>getJobCenterFn()});
export const Route=createFileRoute('/_authenticated/jobs/$jobId')({head:()=>jobHead('External job','View an external job listing and practice its requirements.'),loader:({context})=>context.queryClient.ensureQueryData(options),component:JobDetail});
function JobDetail(){
  const {jobId}=Route.useParams();const {data}=useSuspenseQuery(options);const qc=useQueryClient();const router=useRouter();
  const save=useServerFn(saveTrackedJobFn);const click=useServerFn(clickApplyJobFn);const practice=useServerFn(practiceJobFn);const report=useServerFn(reportJobFn);
  const [returned,setReturned]=useState(false);const [busy,setBusy]=useState(false);const [reportOpen,setReportOpen]=useState(false);const [reason,setReason]=useState<typeof JOB_REPORT_REASONS[number]>('looks like a scam');const [details,setDetails]=useState('');
  useEffect(()=>{const focus=()=>{if(sessionStorage.getItem('job-applied-prompt')===jobId)setReturned(true);};window.addEventListener('focus',focus);return()=>window.removeEventListener('focus',focus);},[jobId]);
  const job=data.jobs.find(j=>j.id===jobId);const tracked=data.tracker.find(t=>t.job_id===jobId);
  const record=async(status:'saved'|'applied')=>{await save({data:{id:jobId,status,notes:tracked?.notes??''}});await qc.invalidateQueries({queryKey:['job-center']});toast.success(status==='applied'?'Marked as applied.':'Job saved.');};
  const generate=async(kind:'simulation'|'interview_prep')=>{setBusy(true);try{const r=await practice({data:{id:jobId,kind,environment:getStripeEnvironment()}});if(r.kind==='simulation')await router.navigate({to:'/simulate/$attemptId',params:{attemptId:r.resourceId}});else await router.navigate({to:'/interview-prep/$sessionId',params:{sessionId:r.resourceId}});}catch(e){toast.error((e as Error).message);}finally{setBusy(false);}};
  if(!job)return <><SiteHeader/><main className="mx-auto max-w-4xl px-5 py-10"><h1 className="text-2xl font-semibold">Job not available</h1><Button asChild className="mt-4"><Link to="/jobs">Job center</Link></Button></main></>;
  const active=available(job);
  return <><SiteHeader/><main className="mx-auto max-w-4xl px-5 py-9"><Link to="/jobs" className="flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4"/>Job center</Link>
    <header className="mt-7 border-b border-border pb-7"><Badge variant="outline">External listing</Badge><h1 className="mt-4 font-display text-3xl font-semibold">{job.title}</h1><p className="mt-2 text-lg text-muted-foreground">{job.company}</p><div className="mt-4 flex flex-wrap gap-2"><Badge variant="secondary">{jobRole(job)}</Badge><Badge variant="outline">{job.arrangement}</Badge><Badge variant="outline">{job.employment}</Badge><Badge variant="outline">{job.seniority}</Badge></div><p className="mt-4 text-sm">{[job.city,job.country].filter(Boolean).join(', ')}{salaryLabel(job)?` · ${salaryLabel(job)}`:''}</p><p className="mt-2 text-xs text-muted-foreground">Posted {job.posted_date} · Expires {job.expires_date}</p></header>
    {!active&&<p role="status" className="mt-5 border-l-4 border-destructive bg-muted p-4">No longer available</p>}
    <p className="my-7 whitespace-pre-wrap leading-relaxed">{job.summary}</p>
    <div className="border-y border-border py-5"><p className="text-sm">This is an external listing. You apply on the company's website. RoleProve does not verify employers or guarantee any role.</p><p className="mt-3 flex items-center gap-2 text-sm font-medium"><ShieldAlert className="h-4 w-4 text-primary"/>Never pay to apply and never share bank details.</p></div>
    <div className="my-6 flex flex-wrap gap-3"><Button variant="outline" onClick={()=>record('saved').catch(e=>toast.error(e.message))} disabled={Boolean(tracked)}><Bookmark className="mr-2 h-4 w-4"/>{tracked?'Saved':'Save'}</Button><Button asChild disabled={!active}>{active?<a href={job.apply_url} target="_blank" rel="noopener noreferrer nofollow" onClick={()=>{sessionStorage.setItem('job-applied-prompt',jobId);setReturned(true);click({data:{id:jobId}}).catch(e=>toast.error(e.message));}}>Apply <ArrowUpRight className="ml-2 h-4 w-4"/></a>:<span>Apply unavailable</span>}</Button><Button variant="ghost" onClick={()=>setReportOpen(true)}><Flag className="mr-2 h-4 w-4"/>Report this job</Button></div>
    {returned&&<div className="mb-7 flex flex-wrap items-center gap-3 border-l-4 border-primary bg-accent p-4"><span>Did you apply?</span><Button size="sm" onClick={()=>record('applied').then(()=>{setReturned(false);sessionStorage.removeItem('job-applied-prompt');}).catch(e=>toast.error(e.message))}>Mark as applied</Button><Button size="sm" variant="ghost" onClick={()=>{setReturned(false);sessionStorage.removeItem('job-applied-prompt');}}>Not yet</Button></div>}
    <section className="border-t border-border pt-6"><h2 className="font-display text-xl font-semibold">Practice for this role</h2>{job.role_key==='other'&&<p className="mt-2 text-sm text-muted-foreground">A simulation for that role is not available yet.</p>}<div className="mt-4 flex flex-wrap gap-3">{job.role_key!=='other'&&<Button disabled={busy||!active} onClick={()=>generate('simulation')}>{busy?'Preparing…':'Practice for this role'}</Button>}<Button variant="outline" disabled={busy||!active} onClick={()=>generate('interview_prep')}>Interview prep for this role</Button></div></section>
    <Dialog open={reportOpen} onOpenChange={setReportOpen}><DialogContent><DialogHeader><DialogTitle>Report this job</DialogTitle></DialogHeader><Select value={reason} onValueChange={v=>setReason(v as typeof reason)}><SelectTrigger aria-label="Report reason"><SelectValue/></SelectTrigger><SelectContent>{JOB_REPORT_REASONS.map(r=><SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select><Textarea aria-label="Report details" placeholder="Details (optional)" maxLength={2000} value={details} onChange={e=>setDetails(e.target.value)}/><Button onClick={async()=>{try{await report({data:{id:jobId,reason,details}});setReportOpen(false);toast.success('Report sent to support staff.');}catch(e){toast.error((e as Error).message);}}}>Send report</Button></DialogContent></Dialog>
  </main></>;
}