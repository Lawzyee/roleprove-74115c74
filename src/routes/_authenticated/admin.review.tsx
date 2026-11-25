import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { SiteHeader } from '@/components/SiteHeader';
import { StaffReviewNav } from '@/components/jobs/StaffReviewNav';
import { getIsSupportStaffFn } from '@/lib/support.functions';
export const Route=createFileRoute('/_authenticated/admin/review')({head:()=>({meta:[{title:'Staff review | RoleProve'},{name:'description',content:'RoleProve staff company and job review.'},{property:'og:title',content:'Staff review | RoleProve'},{property:'og:description',content:'RoleProve staff company and job review.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary'},{name:'robots',content:'noindex'}]}),component:Page});
function Page(){const staff=useQuery({queryKey:['is-staff'],queryFn:()=>getIsSupportStaffFn()});return <><SiteHeader/><main className="mx-auto max-w-4xl px-5 py-10"><h1 className="mb-6 font-display text-3xl">{staff.data?.staff?'Staff review':'Staff access required'}</h1>{staff.data?.staff&&<StaffReviewNav/>}</main></>;}
