import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { getIsSupportStaffFn } from '@/lib/support.functions';
import { staffReviewStateFn } from '@/lib/job-sharing.functions';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
export function StaffReviewNav(){const {user}=useAuth();const staff=useQuery({queryKey:['is-staff'],queryFn:()=>getIsSupportStaffFn(),enabled:Boolean(user)});const q=useQuery({queryKey:['staff-review-state'],queryFn:()=>staffReviewStateFn(),enabled:Boolean(user)&&staff.data?.staff===true,staleTime:0,refetchInterval:60000});if(!user||!staff.data?.staff)return null;return <nav aria-label="Staff" className="flex flex-wrap gap-2"><Button variant="ghost" size="sm" asChild><Link to="/admin/review">Staff</Link></Button><Button variant="ghost" size="sm" asChild><Link to="/admin/jobs">Jobs{Boolean(q.data?.jobs)&&<Badge variant="secondary">{q.data?.jobs}</Badge>}</Link></Button><Button variant="ghost" size="sm" asChild><Link to="/admin/companies">Companies{Boolean(q.data?.companies)&&<Badge variant="secondary">{q.data?.companies}</Badge>}</Link></Button><Button variant="ghost" size="sm" asChild><Link to="/admin/support">Support</Link></Button></nav>;}
