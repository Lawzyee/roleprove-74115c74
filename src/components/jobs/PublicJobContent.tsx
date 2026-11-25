import { Link } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { ShieldAlert,ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ShareJob } from './ShareJob';
import { acceptsExternal,acceptsRoleProve } from '@/lib/applications';
import { sharedJobPath,type SharedJob } from '@/lib/job-sharing';
import { countPublicJobFn } from '@/lib/job-sharing.functions';
export function PublicJobContent({job}:{job:SharedJob}){
 const click=useServerFn(countPublicJobFn);const back=sharedJobPath(job.id);
 const external=acceptsExternal(job.application_method);const roleprove=acceptsRoleProve(job.application_method);
 return <main className="mx-auto max-w-4xl px-5 py-9"><div className="flex flex-wrap items-center justify-between gap-4"><span className="text-sm text-muted-foreground">RoleProve jobs</span><ShareJob id={job.id} title={`${job.title} at ${job.company}`}/></div>
 <header className="mt-7 border-b border-border pb-7"><div className="flex flex-wrap gap-2"><Badge variant="outline">{external?'External listing':'Apply in RoleProve'}</Badge>{job.company_approved&&<Badge variant="secondary">Reviewed by RoleProve</Badge>}</div><h1 className="mt-4 break-words font-display text-3xl font-semibold">{job.title}</h1><p className="mt-2 break-words text-lg text-muted-foreground">{job.company}</p><div className="mt-4 flex flex-wrap gap-2"><Badge variant="outline">{job.arrangement}</Badge><Badge variant="outline">{job.employment}</Badge></div><p className="mt-4 text-sm">{[job.city,job.country].filter(Boolean).join(', ')}{job.salary_min!==null||job.salary_max!==null?` · ${job.salary_currency??''} ${job.salary_min??'—'} – ${job.salary_max??'—'} / ${job.salary_period??'year'}`:''}</p><p className="mt-2 text-xs text-muted-foreground">Posted {job.posted_date} · Expires {job.expires_date}</p></header>
 <p className="my-7 whitespace-pre-wrap break-words leading-relaxed">{job.summary}</p>{job.full_description&&<section className="mb-7"><h2 className="font-display text-xl font-semibold">Job description</h2><p className="mt-4 whitespace-pre-wrap break-words leading-relaxed">{job.full_description}</p></section>}
 <div className="border-y border-border py-5"><p className="text-sm">{external?"This is an external listing. You apply on the company's website. ":'You apply with RoleProve and choose exactly what this employer sees. Applying is free. '}{job.company_approved?'RoleProve does not guarantee any role.':'RoleProve does not verify employers or guarantee any role.'}</p><p className="mt-3 flex items-start gap-2 text-sm font-medium"><ShieldAlert className="h-4 w-4 shrink-0 text-primary"/>Never pay to apply and never share bank details.</p></div>
 <div className="my-6 flex flex-wrap gap-3">{external&&<Button asChild className="h-auto min-h-10 whitespace-normal"><a href={job.apply_url} target="_blank" rel="noopener noreferrer nofollow" onClick={()=>void click({data:{id:job.id,apply:true}}).catch(()=>{})}>Apply on the company's website<ArrowUpRight className="h-4 w-4 shrink-0"/></a></Button>}{roleprove&&<><Button asChild><Link to="/auth" search={{mode:'login',returnTo:back}}>Sign in to apply</Link></Button><Button asChild variant="outline"><Link to="/auth" search={{mode:'signup',as:'seeker',returnTo:back}}>Sign up to apply</Link></Button></>}</div>
 <aside className="mt-8 rounded-lg border border-border p-5"><h2 className="font-display text-lg font-semibold">Practise for this role with a free RoleProve account</h2><Button asChild variant="link" className="mt-2 px-0"><Link to="/auth" search={{mode:'signup',as:'seeker',returnTo:back}}>Create an account</Link></Button></aside></main>;
}
