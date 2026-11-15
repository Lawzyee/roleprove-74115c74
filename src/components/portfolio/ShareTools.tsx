import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Copy, Download, Linkedin, Mail, MessageCircle, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function shareLinks(url: string, name: string) {
  const text = `${name ? `${name}'s` : "My"} portfolio of hands-on job simulation projects on RoleProve`;
  return {
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
    email: `mailto:?subject=${encodeURIComponent(text)}&body=${encodeURIComponent(`${text}:\n${url}`)}`,
    whatsapp: `https://wa.me/?text=${encodeURIComponent(`${text}: ${url}`)}`,
    text,
  };
}

export function ShareTools({ url, name, slug }: { url: string; name: string; slug: string }) {
  const [qr, setQr] = useState<string | null>(null);
  const [canShare, setCanShare] = useState(false);
  useEffect(() => {
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
    QRCode.toDataURL(url, { width: 512, margin: 2, errorCorrectionLevel: "M" }).then(setQr).catch(() => setQr(null));
  }, [url]);
  const l = shareLinks(url, name);
  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(url); toast.success("Link copied."); }}><Copy className="mr-1.5 h-4 w-4" />Copy link</Button>
        <Button size="sm" variant="outline" asChild><a href={l.linkedin} target="_blank" rel="noopener noreferrer"><Linkedin className="mr-1.5 h-4 w-4" />LinkedIn</a></Button>
        <Button size="sm" variant="outline" asChild><a href={l.email}><Mail className="mr-1.5 h-4 w-4" />Email</a></Button>
        <Button size="sm" variant="outline" asChild><a href={l.whatsapp} target="_blank" rel="noopener noreferrer"><MessageCircle className="mr-1.5 h-4 w-4" />WhatsApp</a></Button>
        {canShare && <Button size="sm" variant="outline" onClick={() => navigator.share({ title: l.text, url }).catch(() => {})}><Share2 className="mr-1.5 h-4 w-4" />Share…</Button>}
      </div>
      <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
        {qr && (
          <div className="flex flex-col items-center gap-2">
            <img src={qr} alt="QR code for your portfolio link" className="h-32 w-32 rounded border border-border bg-background" />
            <Button size="sm" variant="ghost" asChild><a href={qr} download={`roleprove-${slug}-qr.png`}><Download className="mr-1.5 h-4 w-4" />Download QR</a></Button>
          </div>
        )}
        <div className="rounded-lg bg-muted p-4 text-sm">
          <p className="font-medium">Where to use your link</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
            <li>Your LinkedIn profile: add it under Featured or Contact info.</li>
            <li>Your CV: next to your email and phone number.</li>
            <li>Job applications: in the cover letter or the “website” field.</li>
            <li>Email signature, and messages to recruiters.</li>
            <li>Printed CVs or at events: use the QR code.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
