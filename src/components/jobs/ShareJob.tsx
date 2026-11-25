import { Copy, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { sharedJobUrl } from '@/lib/job-sharing';
export function ShareJob({id,title}:{id:string;title:string}){
 const copy=async()=>{try{await navigator.clipboard.writeText(sharedJobUrl(id));toast.success('Link copied.');}catch{toast.error('Could not copy the link.');}};
 const share=async()=>{try{if(navigator.share)await navigator.share({title,url:sharedJobUrl(id)});else await copy();}catch(e){if(!(e instanceof Error&&e.name==='AbortError'))toast.error('Could not share this link.');}};
 return <div className="flex gap-2"><Button size="sm" variant="outline" onClick={()=>void copy()}><Copy className="h-4 w-4"/>Copy link</Button><Button size="sm" variant="ghost" onClick={()=>void share()}><Share2 className="h-4 w-4"/>Share</Button></div>;
}
