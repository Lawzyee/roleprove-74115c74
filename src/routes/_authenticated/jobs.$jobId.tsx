import { createFileRoute } from '@tanstack/react-router';
import { queryOptions } from '@tanstack/react-query';
import { getJobCenterFn } from '@/lib/job-center.functions';
import { jobHead } from '@/components/jobs/JobParts';
import { CandidateJobDetail } from '@/components/jobs/CandidateJobDetail';
const options=queryOptions({queryKey:['job-center'],queryFn:()=>getJobCenterFn()});
export const Route=createFileRoute('/_authenticated/jobs/$jobId')({head:()=>jobHead('External job','View an external job listing and practice its requirements.'),loader:({context})=>context.queryClient.ensureQueryData(options),errorComponent:()=> <p role="alert">Could not load this job.</p>,notFoundComponent:()=> <p>Job not available.</p>,component:()=>{const {jobId}=Route.useParams();return <CandidateJobDetail jobId={jobId}/>;}});
