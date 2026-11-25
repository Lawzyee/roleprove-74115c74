import { Link } from '@tanstack/react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MapPin, Bookmark, ArrowUpRight } from 'lucide-react';
import { ROLE_REGISTRY } from '@/lib/role-registry';
import { salaryLabel, type Job } from '@/lib/job-center';
import { PROVENANCE_BADGE } from '@/lib/employer';
export function jobRole(j:Job) { return j.role_key==='data_analyst'?ROLE_REGISTRY.data_analyst.name:j.role_key==='customer_support'?ROLE_REGISTRY.customer_support.name:j.other_role; }
export function JobCard({job,saved,onSave}:{job:Job;saved:boolean;onSave:()=>void}) {
  return <article className="flex min-w-0 flex-col rounded-lg border border-border bg-card p-5">
    <div className="flex items-start justify-between gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent font-display font-semibold text-accent-foreground">{job.company.split(/\s+/).map(s=>s[0]).join('').slice(0,2).toUpperCase()}</span><Button size="icon" variant="ghost" aria-label={saved?'Saved job':'Save job'} title={saved?'Saved job':'Save job'} onClick={onSave}><Bookmark className={saved?'fill-primary text-primary':''} /></Button></div>
    <Link to="/jobs/$jobId" params={{jobId:job.id}} className="mt-4 font-display text-lg font-semibold text-foreground hover:text-primary">{job.title}</Link>
    <p className="mt-1 text-sm">{job.company}</p><p className="mt-3 flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="h-4 w-4 shrink-0"/>{[job.city,job.country].filter(Boolean).join(', ')||'Location not specified'}</p>
    <div className="mt-3 flex flex-wrap gap-2"><Badge variant="secondary">{job.arrangement}</Badge><Badge variant="outline">{job.employment}</Badge><Badge variant="outline">{jobRole(job)}</Badge></div>
    {job.source_type==='employer_submitted'&&<p className="mt-3 text-xs text-muted-foreground">{PROVENANCE_BADGE}</p>}{salaryLabel(job)&&<p className="mt-4 text-sm font-medium">{salaryLabel(job)}</p>}
    <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-5 text-xs text-muted-foreground"><span>External listing · {job.posted_date}</span><Link to="/jobs/$jobId" params={{jobId:job.id}} aria-label={`View ${job.title}`}><ArrowUpRight className="h-4 w-4"/></Link></div>
  </article>;
}
export const jobHead=(title:string,description:string)=>({meta:[{title:`${title} | RoleProve`},{name:'description',content:description},{property:'og:title',content:`${title} | RoleProve`},{property:'og:description',content:description},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary'},{name:'robots',content:'noindex, nofollow'}]});