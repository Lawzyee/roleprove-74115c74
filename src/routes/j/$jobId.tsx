import { NotFoundPage } from '@/components/NotFoundPage';
import { createFileRoute,notFound,ClientOnly,useRouter } from '@tanstack/react-router';
import { queryOptions,useSuspenseQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { useEffect,Suspense } from 'react';
import { z } from 'zod';
import { readPublicJobFn,countPublicJobFn } from '@/lib/job-sharing.functions';
import { sharedJobUrl } from '@/lib/job-sharing';
import { SiteHeader } from '@/components/SiteHeader';
import { PublicJobContent } from '@/components/jobs/PublicJobContent';
import { CandidateJobDetail } from '@/components/jobs/CandidateJobDetail';
import { useAuth } from '@/hooks/useAuth';
import { useAccountKind } from '@/hooks/useAccountKind';
import { Button } from '@/components/ui/button';
const options=(id:string)=>queryOptions({queryKey:['public-job',id],queryFn:()=>readPublicJobFn({data:{id}}),staleTime:0});
export const Route=createFileRoute('/j/$jobId')({
 loader:async({params,context})=>{if(!z.string().uuid().safeParse(params.jobId).success)throw notFound();const r=await context.queryClient.ensureQueryData(options(params.jobId));if(r.state==='not_found')throw notFound();return r;},
 head:({loaderData})=>{const r=loaderData;const title=r?.state==='published'?`${r.job.title} at ${r.job.company}`:'Job no longer available | RoleProve';const description=r?.state==='published'?r.job.summary.slice(0,200):'This job is no longer available.';return {meta:[{title},{name:'description',content:description},{property:'og:title',content:title},{property:'og:description',content:description},{property:'og:site_name',content:'RoleProve'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary'},{name:'robots',content:r?.state==='published'&&r.indexable?'index,follow':'noindex,nofollow'},...(r?.state==='published'?[{property:'og:url',content:sharedJobUrl(r.job.id)}]:[])],links:r?.state==='published'?[{rel:'canonical',href:sharedJobUrl(r.job.id)}]:[]};},
 errorComponent:()=>{const router=useRouter();return <><SiteHeader/><main className="mx-auto max-w-4xl px-5 py-12"><h1 className="font-display text-2xl">This job page couldn’t load</h1><Button className="mt-5" onClick={()=>void router.invalidate()}>Try again</Button></main></>;},
 notFoundComponent:NotFoundPage,component:PublicJob,
});
function PublicJob(){const {jobId}=Route.useParams();const {data}=useSuspenseQuery(options(jobId));const count=useServerFn(countPublicJobFn);
 useEffect(()=>{if(data.state==='published')void count({data:{id:jobId,apply:false}}).catch(()=>{});},[jobId,data.state,count]);
 if(data.state!=='published')return <><SiteHeader/><main className="mx-auto max-w-4xl px-5 py-16"><h1 className="font-display text-2xl">This job is no longer available</h1></main></>;
 const fallback=<><SiteHeader/><PublicJobContent job={data.job}/></>;
 return <ClientOnly fallback={fallback}><SignedInJob id={jobId} fallback={fallback}/></ClientOnly>;
}
function SignedInJob({id,fallback}:{id:string;fallback:React.ReactNode}){const {user}=useAuth();const kind=useAccountKind();if(!user||kind.data!=='candidate')return fallback;return <Suspense fallback={fallback}><CandidateJobDetail jobId={id} countView={false}/></Suspense>;}
