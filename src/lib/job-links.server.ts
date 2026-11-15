import ipaddr from 'ipaddr.js';
import { request } from 'node:https';
import { applyLinkProblem, publicAddress } from './job-center';
export class LinkCheckUnavailable extends Error {}

// Resolve through HTTPS, then pin the connection to a validated address. Never fetch the original hostname after checking DNS.
export async function resolvePublicLink(value:string):Promise<{url:URL;address:string;family:4|6}> {
  const problem=applyLinkProblem(value); if(problem)throw new Error(problem);
  const url=new URL(value); const host=url.hostname.replace(/^\[|\]$/g,'');
  if(ipaddr.isValid(host)) { if(!publicAddress(host))throw new Error('Private address blocked.'); return {url,address:host,family:ipaddr.parse(host).kind()==='ipv6'?6:4}; }
  const addresses:string[]=[];
  for(const type of ['A','AAAA']) {
    let res:Response;
    try { res=await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`,{headers:{accept:'application/dns-json'},signal:AbortSignal.timeout(4000)}); } catch { throw new LinkCheckUnavailable('Website address checking is unavailable. Save as draft and retry publishing later.'); }
    if(!res.ok)throw new LinkCheckUnavailable('Could not validate the website address.');
    const data=await res.json() as {Status:number;Answer?:{type:number;data:string}[]};
    if(data.Status!==0&&data.Status!==3)throw new Error('Could not validate DNS.');
    for(const a of data.Answer??[])if(a.type===1||a.type===28)addresses.push(a.data);
  }
  if(!addresses.length||addresses.some(a=>!publicAddress(a)))throw new Error('Website has no safe public address.');
  const address=addresses.find(a=>ipaddr.parse(a).kind()==='ipv4')??addresses[0];
  if(!address)throw new Error('Website unavailable.');
  return {url,address,family:ipaddr.parse(address).kind()==='ipv6'?6:4};
}
async function pinnedHead(target:Awaited<ReturnType<typeof resolvePublicLink>>) {
  return new Promise<{status:number;location?:string}>((resolve,reject)=>{
    const {url,address,family}=target;
    const timer=setTimeout(()=>{req.destroy();reject(new Error('Link check timed out.'));},6000);
    const req=request({hostname:address,family,servername:url.hostname.replace(/^\[|\]$/g,''),port:443,path:url.pathname+url.search,method:'HEAD',agent:false,headers:{Host:url.host,'User-Agent':'RoleProve-LinkCheck/1.0'},rejectUnauthorized:true},res=>{
      clearTimeout(timer);res.resume();resolve({status:res.statusCode??0,location:res.headers.location});
    });
    req.on('error',e=>{clearTimeout(timer);reject(e);});
    // Delay sending any HTTP bytes until the actual socket is verified. Unsupported runtimes fail closed.
    req.on('socket',socket=>socket.once('secureConnect',()=>{
      const remote=socket.remoteAddress;
      if(!remote||!publicAddress(remote)||ipaddr.process(remote).toString()!==ipaddr.process(address).toString()){clearTimeout(timer);req.destroy();reject(new LinkCheckUnavailable('Safe pinned link checks unavailable.'));return;}
      req.end();
    }));
  });
}
export async function checkApplicationLink(value:string) {
  let current=value;
  for(let redirects=0;redirects<=3;redirects++) {
    const target=await resolvePublicLink(current);
    const r=await pinnedHead(target);
    if(r.status>=300&&r.status<400&&r.location) { if(redirects===3)throw new Error('Too many redirects.');current=new URL(r.location,target.url).href;continue; }
    return r.status>=200&&r.status<400;
  }
  return false;
}