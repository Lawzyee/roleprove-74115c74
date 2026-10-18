import { createFileRoute, Link } from '@tanstack/react-router';
import { SiteHeader } from '@/components/SiteHeader';
import { Button } from '@/components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useAuth } from '@/hooks/useAuth';
import { FAQ, SUPPORT_EMAIL } from '@/lib/support-config';

export const Route = createFileRoute('/help')({
  head: () => ({ meta: [
    { title: 'Help centre | RoleProve' },
    { name: 'description', content: 'Answers about billing, scoring, recordings and your data, plus how to contact RoleProve support.' },
    { property: 'og:title', content: 'Help centre | RoleProve' },
    { property: 'og:description', content: 'Get help with RoleProve billing, scoring, privacy and technical problems.' },
    { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' },
  ] }),
  component: HelpPage,
});

function HelpPage() {
  const { user } = useAuth();
  return <><SiteHeader /><main className="mx-auto max-w-3xl px-5 py-10">
    <h1 className="font-display text-3xl font-semibold">Help centre</h1>
    <p className="mt-2 text-muted-foreground">Quick answers to common questions.</p>
    <div className="mt-8 space-y-8">{FAQ.map((s) => <section key={s.section}>
      <h2 className="font-display text-lg font-semibold">{s.section}</h2>
      <Accordion type="multiple">{s.items.map((item) => <AccordionItem key={item.q} value={item.q}>
        <AccordionTrigger>{item.q}</AccordionTrigger><AccordionContent>{item.a}</AccordionContent>
      </AccordionItem>)}</Accordion>
    </section>)}</div>
    <section className="mt-10 rounded-lg border border-border p-6">
      <h2 className="font-display text-lg font-semibold">Still need help?</h2>
      {user ? <div className="mt-3 flex flex-wrap gap-2"><Button asChild><Link to="/support/new">Contact support</Link></Button><Button asChild variant="outline"><Link to="/support">My support tickets</Link></Button></div>
        : <div className="mt-3 space-y-2"><Button asChild><Link to="/auth">Sign in to contact support</Link></Button><p className="text-sm text-muted-foreground">Can't sign in? Email <a className="text-primary underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</p></div>}
    </section>
  </main></>;
}
