import { describe,it,expect } from 'vitest';
import { applyLinkProblem,publicAddress,failureState,available,filterJobs,EMPTY_PREFERENCES,PAGE_SIZE,matchScore,jobSchema,type Job,type Filters } from './job-center';
const job:Job={id:'11111111-1111-4111-8111-111111111111',title:'Data Analyst',company:'Acme',company_website:null,city:'Lagos',country:'Nigeria',arrangement:'remote',employment:'full-time',role_key:'data_analyst',other_role:'',seniority:'entry',salary_currency:'USD',salary_min:2000,salary_max:4000,salary_period:'month',summary:'Test',apply_url:'https://example.com/jobs',posted_date:'2026-11-15',expires_date:'2026-12-15',status:'published',deleted_at:null};
const filters:Filters={...EMPTY_PREFERENCES,keyword:'',location:'',salary:'',days:'',sort:'newest',seniority:''};
describe('job center rules',()=>{
 it('requires https',()=>expect(applyLinkProblem('http://example.com')).not.toBeNull());
 it('rejects private and loopback URLs including normalized numeric addresses',()=>{for(const u of ['https://127.0.0.1','https://2130706433','https://10.0.0.1','https://[::1]','https://[::ffff:127.0.0.1]','https://metadata.internal','https://169.254.169.254'])expect(applyLinkProblem(u),u).not.toBeNull();});
 it('rejects private DNS answers and permits public answers',()=>{expect(publicAddress('192.168.1.1')).toBe(false);expect(publicAddress('2606:4700:4700::1111')).toBe(true);expect(publicAddress('1.1.1.1')).toBe(true);});
 it('hides after exactly 3 consecutive failures',()=>{expect(failureState(1,false)).toEqual({failures:2,hide:false});expect(failureState(2,false)).toEqual({failures:3,hide:true});});
 it('resets consecutive failures on success',()=>expect(failureState(2,true)).toEqual({failures:0,hide:false}));
 it('expires after the expiry date but not on that date',()=>{expect(available(job,'2026-12-15')).toBe(true);expect(available(job,'2026-12-16')).toBe(false);});
 it('hides unpublished and deleted jobs',()=>{expect(available({...job,status:'draft'},'2026-11-15')).toBe(false);expect(available({...job,deleted_at:'2026-11-15'},'2026-11-15')).toBe(false);});
 it('uses 20 jobs per page',()=>expect(PAGE_SIZE).toBe(20));
 it('filters role arrangement employment location date salary and keyword',()=>{const f={...filters,roles:['data_analyst'],arrangements:['remote'],employment_types:['full-time'],location:'Lagos',days:'7',salary:'2000',keyword:'Acme'};expect(filterJobs([job,{...job,id:'2',arrangement:'on-site'}],f,EMPTY_PREFERENCES,null,new Date('2026-11-15T12:00:00Z')).map(j=>j.id)).toEqual([job.id]);});
 it('best match uses only job preferences and target role',()=>expect(matchScore(job,{roles:['data_analyst'],arrangements:['remote'],employment_types:['full-time'],countries:['Nigeria']},'data_analyst')).toBe(13));
 it('enforces summary maximum 600',()=>expect(jobSchema.safeParse({...job,summary:'x'.repeat(601),practice_text:'word '.repeat(50),source_note:'',staff_notes:''}).success).toBe(false));
 it('keeps Other roles without enabling a live simulation',()=>expect(jobSchema.safeParse({...job,role_key:'other',other_role:'Accountant',practice_text:'word '.repeat(50),source_note:'',staff_notes:''}).success).toBe(true));
});