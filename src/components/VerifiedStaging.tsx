import { useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, Mic, Monitor, ShieldCheck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { requestCamera, requestScreen, type MediaStreams } from "@/lib/proctoring";

type Status = "idle" | "ok" | "fail";

function StatusIcon({ s }: { s: Status }) {
  if (s === "ok") return <CheckCircle2 className="h-5 w-5 text-primary" />;
  if (s === "fail") return <XCircle className="h-5 w-5 text-destructive" />;
  return <span className="h-5 w-5 rounded-full border border-border" />;
}

export function VerifiedStaging({
  title,
  stageCount,
  minutes,
  resuming,
  onStart,
  onPractice,
}: {
  title: string;
  stageCount: number;
  minutes: number;
  resuming: boolean;
  onStart: (streams: MediaStreams) => Promise<void>;
  onPractice: () => void;
}) {
  const [camera, setCamera] = useState<MediaStream | null>(null);
  const [screen, setScreen] = useState<MediaStream | null>(null);
  const [camStatus, setCamStatus] = useState<Status>("idle");
  const [micStatus, setMicStatus] = useState<Status>("idle");
  const [screenStatus, setScreenStatus] = useState<Status>("idle");
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [starting, setStarting] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const handedOff = useRef(false);

  useEffect(() => {
    if (videoRef.current && camera) videoRef.current.srcObject = camera;
  }, [camera]);

  // Mic level meter
  useEffect(() => {
    if (!camera || !camera.getAudioTracks().length) return;
    const ac = new AudioContext();
    const analyser = ac.createAnalyser();
    ac.createMediaStreamSource(camera).connect(analyser);
    const buf = new Uint8Array(analyser.fftSize);
    let peak = 0;
    const id = window.setInterval(() => {
      analyser.getByteTimeDomainData(buf);
      let max = 0;
      for (const v of buf) max = Math.max(max, Math.abs(v - 128));
      const pct = Math.min(100, Math.round((max / 128) * 250));
      setLevel(pct);
      peak = Math.max(peak, pct);
      if (peak > 8) setMicStatus("ok");
    }, 100);
    return () => {
      clearInterval(id);
      void ac.close();
    };
  }, [camera]);

  // Release devices if the user leaves without starting
  useEffect(
    () => () => {
      if (handedOff.current) return;
      camera?.getTracks().forEach((t) => t.stop());
      screen?.getTracks().forEach((t) => t.stop());
    },
    [camera, screen],
  );

  async function checkCamera() {
    setError(null);
    try {
      const s = await requestCamera();
      setCamera(s);
      setCamStatus(s.getVideoTracks().length ? "ok" : "fail");
      if (!s.getAudioTracks().length) setMicStatus("fail");
    } catch {
      setCamStatus("fail");
      setMicStatus("fail");
      setError("Camera or microphone access was denied. A verified attempt needs both.");
    }
  }

  async function checkScreen() {
    setError(null);
    try {
      const s = await requestScreen();
      s.getVideoTracks()[0].onended = () => {
        setScreen(null);
        setScreenStatus("fail");
      };
      setScreen(s);
      setScreenStatus("ok");
    } catch (e) {
      setScreenStatus("fail");
      setError(e instanceof Error && e.message.includes("entire screen") ? e.message : "Screen sharing was denied. A verified attempt needs your full screen.");
    }
  }

  const ready = camStatus === "ok" && micStatus === "ok" && screenStatus === "ok" && consent && camera && screen;
  const anyFail = camStatus === "fail" || micStatus === "fail" || screenStatus === "fail";

  async function start() {
    if (!ready || !camera || !screen) return;
    setStarting(true);
    handedOff.current = true;
    try {
      await onStart({ camera, screen });
    } catch (e) {
      handedOff.current = false;
      setStarting(false);
      setError(e instanceof Error ? e.message : "Could not start recording.");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-primary">Verified attempt</p>
        <h1 className="mt-1 font-display text-2xl font-semibold">Before you begin</h1>
        {resuming && (
          <p className="mt-2 rounded-lg border border-border bg-muted/50 p-3 text-sm">
            Recording stopped when you left this page. Your saved answers are kept, but recording must restart before you
            continue. The new recording replaces any earlier one for this attempt.
          </p>
        )}
      </div>

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="text-base">What will be assessed</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">{title}</span> — {stageCount} stages covering business framing,
            data work, analysis and an executive recommendation. Allow roughly {minutes} minutes.
          </p>
          <p>Completing it under recording produces a verified score.</p>
        </CardContent>
      </Card>

      <Card className="border-primary/40 shadow-none">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-primary" /> What we record
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            As soon as you press <span className="font-medium text-foreground">Start verified attempt</span>, your{" "}
            <span className="font-medium text-foreground">camera, microphone and entire screen</span> are recorded
            continuously until you submit.
          </p>
          <p>
            The recording is stored privately, linked only to this attempt. Right now only you can watch it — no
            recruiter or employer can access it. You can delete it at any time by deleting your data in Settings.
          </p>
          <p>If you stop screen sharing or disconnect your camera or microphone, the verified attempt pauses and you can switch to practice instead.</p>
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Device check</CardTitle>
          <CardDescription>Each check must pass before you can start.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
            <div className="aspect-[4/3] overflow-hidden rounded-lg border border-border bg-muted">
              {camera ? (
                <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  <Camera className="h-6 w-6" />
                </div>
              )}
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2"><StatusIcon s={camStatus} /> <Camera className="h-4 w-4" /> Camera</span>
                <Button size="sm" variant="outline" onClick={checkCamera}>
                  {camera ? "Re-test" : "Test camera & mic"}
                </Button>
              </div>
              <div className="space-y-1">
                <span className="flex items-center gap-2"><StatusIcon s={micStatus} /> <Mic className="h-4 w-4" /> Microphone {camera && micStatus !== "ok" && <span className="text-muted-foreground">— say something</span>}</span>
                <Progress value={level} className="h-2" />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2"><StatusIcon s={screenStatus} /> <Monitor className="h-4 w-4" /> Full-screen share</span>
                <Button size="sm" variant="outline" onClick={checkScreen}>
                  {screen ? "Re-share" : "Share screen"}
                </Button>
              </div>
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      <div className="flex items-start gap-3 rounded-lg border border-border p-4">
        <Checkbox id="rec-consent" checked={consent} onCheckedChange={(v) => setConsent(v === true)} />
        <Label htmlFor="rec-consent" className="text-sm font-normal leading-relaxed">
          I consent to RoleProve recording my camera, microphone and entire screen for the duration of this attempt, and
          storing that recording privately with this attempt.
        </Label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant={anyFail ? "default" : "ghost"} onClick={onPractice} disabled={starting}>
          Switch to a practice attempt instead
        </Button>
        <Button onClick={start} disabled={!ready || starting}>
          {starting ? "Starting…" : "Start verified attempt"}
        </Button>
      </div>
    </div>
  );
}
