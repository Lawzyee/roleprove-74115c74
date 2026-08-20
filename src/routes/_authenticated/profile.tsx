import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { ScoreRing } from "@/components/ScoreRing";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { compositeScore } from "@/lib/simulations";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Your profile | RoleProve" },
      { name: "description", content: "Manage your headline, credentials, linked accounts and simulation history." },
      { property: "og:title", content: "Your profile | RoleProve" },
      { property: "og:description", content: "Manage your headline, credentials, linked accounts and simulation history." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: "",
    headline: "",
    target_role: "",
    location: "",
    linkedin_url: "",
    github_url: "",
    portfolio_url: "",
  });
  const [cred, setCred] = useState({
    title: "",
    issuer: "",
    year: "",
    credential_type: "certification",
    verification_url: "",
  });
  const [credFile, setCredFile] = useState<File | null>(null);
  const [addingCred, setAddingCred] = useState(false);
  const [saving, setSaving] = useState(false);

  const profileQuery = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const credsQuery = useQuery({
    queryKey: ["credentials", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credentials")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const attemptsQuery = useQuery({
    queryKey: ["attempts", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("simulation_attempts")
        .select("id, status, overall_score, started_at, simulations(title)")
        .eq("user_id", user!.id)
        .order("started_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    const p = profileQuery.data;
    if (!p) return;
    setForm({
      name: p.name ?? "",
      headline: p.headline ?? "",
      target_role: p.target_role ?? "",
      location: p.location ?? "",
      linkedin_url: p.linkedin_url ?? "",
      github_url: p.github_url ?? "",
      portfolio_url: p.portfolio_url ?? "",
    });
  }, [profileQuery.data]);

  async function saveProfile() {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update(form).eq("id", user.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Profile saved");
      qc.invalidateQueries({ queryKey: ["profile", user.id] });
    }
  }

  async function addCredential() {
    if (!user || !cred.title.trim() || !cred.issuer.trim()) return;
    setAddingCred(true);
    try {
      let filePath: string | null = null;
      if (credFile) {
        const path = `${user.id}/${crypto.randomUUID()}-${credFile.name}`;
        const { error: upErr } = await supabase.storage.from("credentials").upload(path, credFile);
        if (upErr) throw upErr;
        filePath = path;
      }
      const hasEvidence = !!filePath || !!cred.verification_url.trim();
      const { error } = await supabase.from("credentials").insert({
        user_id: user.id,
        title: cred.title.trim(),
        issuer: cred.issuer.trim(),
        year: cred.year ? Number(cred.year) : null,
        credential_type: cred.credential_type,
        verification_url: cred.verification_url.trim() || null,
        file_path: filePath,
        status: hasEvidence ? "pending_review" : "self_reported",
      });
      if (error) throw error;
      setCred({ title: "", issuer: "", year: "", credential_type: "certification", verification_url: "" });
      setCredFile(null);
      qc.invalidateQueries({ queryKey: ["credentials", user.id] });
      toast.success("Credential added");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add credential");
    } finally {
      setAddingCred(false);
    }
  }

  async function openCredentialFile(path: string) {
    const { data, error } = await supabase.storage.from("credentials").createSignedUrl(path, 60);
    if (error || !data) return toast.error(error?.message ?? "Could not open file");
    window.open(data.signedUrl, "_blank", "noopener");
  }

  async function removeCredential(id: string) {
    const { error } = await supabase.from("credentials").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["credentials", user?.id] });
  }

  const score = compositeScore(attemptsQuery.data ?? []);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-5 py-10">
        <div className="flex flex-wrap items-center gap-6">
          <ScoreRing value={score} size={120} />
          <div>
            <h1 className="font-display text-3xl font-semibold">{form.name || "Your profile"}</h1>
            <p className="text-muted-foreground">{form.headline || "Add a headline to introduce yourself."}</p>
            <p className="mt-1 text-sm text-muted-foreground">{user?.email}</p>
          </div>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <Card className="border-border shadow-none">
            <CardHeader>
              <CardTitle className="font-display text-lg">Details</CardTitle>
              <CardDescription>This is what employers will eventually see next to your score.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {(
                [
                  ["name", "Full name", "Ada Okafor"],
                  ["headline", "Headline", "e.g. Senior Marketing Manager moving into Data"],
                  ["target_role", "Target role", "e.g. Data Analyst"],
                  ["location", "Location", "Manchester, UK"],
                ] as const
              ).map(([key, label, placeholder]) => (
                <div key={key} className="space-y-2">
                  <Label htmlFor={key}>{label}</Label>
                  <Input
                    id={key}
                    placeholder={placeholder}
                    value={form[key]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-border shadow-none">
            <CardHeader>
              <CardTitle className="font-display text-lg">Linked accounts</CardTitle>
              <CardDescription>Optional links shown alongside your simulation history.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {(
                [
                  ["linkedin_url", "LinkedIn URL"],
                  ["github_url", "GitHub URL"],
                  ["portfolio_url", "Portfolio URL"],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="space-y-2">
                  <Label htmlFor={key}>{label}</Label>
                  <Input
                    id={key}
                    placeholder="https://"
                    value={form[key]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  />
                </div>
              ))}
              <Button onClick={saveProfile} disabled={saving}>
                {saving ? "Saving…" : "Save profile"}
              </Button>
            </CardContent>
          </Card>

          <Card className="border-border shadow-none">
            <CardHeader>
              <CardTitle className="font-display text-lg">Credentials</CardTitle>
              <CardDescription>Self-reported for now — verification comes later.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <Input
                  placeholder="Title"
                  value={cred.title}
                  onChange={(e) => setCred({ ...cred, title: e.target.value })}
                />
                <Input
                  placeholder="Issuer"
                  value={cred.issuer}
                  onChange={(e) => setCred({ ...cred, issuer: e.target.value })}
                />
                <Input
                  placeholder="Year"
                  type="number"
                  value={cred.year}
                  onChange={(e) => setCred({ ...cred, year: e.target.value })}
                />
              </div>
              <Button variant="outline" onClick={addCredential}>
                Add credential
              </Button>
              <div className="divide-y divide-border">
                {(credsQuery.data ?? []).map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-3 py-3">
                    <div>
                      <p className="text-sm font-medium">{c.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.issuer}
                        {c.year ? ` · ${c.year}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">Self-reported</Badge>
                      <Button size="sm" variant="ghost" onClick={() => removeCredential(c.id)}>
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border shadow-none">
            <CardHeader>
              <CardTitle className="font-display text-lg">Simulation history</CardTitle>
            </CardHeader>
            <CardContent className="divide-y divide-border p-0 px-6 pb-6">
              {(attemptsQuery.data ?? []).length === 0 && (
                <p className="py-3 text-sm text-muted-foreground">No attempts yet.</p>
              )}
              {(attemptsQuery.data ?? []).map((a: any) => (
                <div key={a.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="text-sm font-medium">{a.simulations?.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.status === "completed" ? "Completed" : "In progress"} ·{" "}
                      {new Date(a.started_at).toLocaleDateString()}
                    </p>
                  </div>
                  {a.status === "completed" && (
                    <Button asChild size="sm" variant="outline">
                      <Link to="/results/$attemptId" params={{ attemptId: a.id }}>
                        {a.overall_score}
                      </Link>
                    </Button>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
