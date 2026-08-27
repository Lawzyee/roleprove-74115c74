import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Circle, Loader2, Mic, Monitor, ShieldCheck, Video, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { stopStream, type ProctorStreams } from "@/lib/proctoring";

type CheckState = "idle" | "pending" | "ok" | "failed";

function CheckRow({ state, icon, label, detail }: { state: CheckState; icon: React.ReactNode; label: string; detail: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border p-3">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div className="flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
      {state === "ok" && <CheckCircle2 className="h-5 w-5 text-primary" />}
      {state === "failed" && <XCircle className="h-5 w-5 text-destructive" />}
      {state === "pending" && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
      {state === "idle" && <Circle className="h-5 w-5 text-muted-foreground/40" />}
    </div>
  );
}

export function VerifiedAttemptGate({
  title,
  estimatedMinutes,
  stageCount,
  onPractice,
  onVerified,
  busy,
}: {
  title: string;
  estimatedMinutes: number;
  stageCount: number;
  onPractice: () => void;
  onVerified: (streams: ProctorStreams) => void;
  busy?: boolean;
}) {
  const [mode, setMode] = useState<"choose" | "verified">("choose");
  const [camState, setCamState] = useState<CheckState>("idle");
  const [micState, setMicState] = useState<CheckState>("idle");
  const [screenState, setScreenState] = useState<CheckState>("idle");
  const [level, setLevel] = useState(0);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previewRef = useRef<HTMLVideoElement>(null);
  const cameraRef = useRef<MediaStream | null>(null);
  const screenRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef(0);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      audioCtxRef.current?.close().catch(() => {});
      stopStream(cameraRef.current);
      stopStream(screenRef.current);
    };
  }, []);

  async function requestCamMic() {
    setError(null);
    setCamState("pending");
    setMicState("pending");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      cameraRef.current = stream;
      if (previewRef.current) {
        previewRef.current.srcObject = stream;
        await previewRef.current.play().catch(() => {});
      }
      setCamState(stream.getVideoTracks().length ? "ok" : "failed");
      setMicState(stream.getAudioTracks().length ? "ok" : "failed");

      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let peak = 0;
        for (const v of data) peak = Math.max(peak, Math.abs(v - 128) / 128);
        setLevel(Math.min(100, Math.round(peak * 180)));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      setCamState("failed");
      setMicState("failed");
      setError("Camera and microphone access was denied. A verified attempt can't run without them.");
    }
  }

  async function requestScreen() {
    setError(null);
    setScreenState("pending");
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      screenRef.current = stream;
      setScreenState("ok");
    } catch {
      setScreenState("failed");
      setError("Screen sharing was denied. A verified attempt records your screen for the whole session.");
    }
  }

  const ready = camState === "ok" && micState === "ok" && screenState === "ok" && consent;

  function start() {
    if (!ready || !cameraRef.current || !screenRef.current) return;
    cancelAnimationFrame(rafRef.current);
    audioCtxRef.current?.close().catch(() => {});
    const streams = { camera: cameraRef.current, screen: screenRef.current };
    cameraRef.current = null;
    screenRef.current = null;
    onVerified(streams);
  }

  function fallbackToPractice() {
    stopStream(cameraRef.current);
    stopStream(screenRef.current);
    cameraRef.current = null;
    screenRef.current = null;
    onPractice();
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <Badge variant="secondary" className="gap-1">
        <ShieldCheck className="h-3 w-3" /> Before you begin
      </Badge>
      <h1 className="mt-3 font-display text-3xl font-semibold">{title}</h1>
      <p className="mt-2 text-muted-foreground">
        {stageCount} stages, roughly {estimatedMinutes} minutes. You'll be assessed on your written analysis and
        decisions at each stage against a weighted rubric.
      </p>

      {mode === "choose" ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="font-display text-lg">Practice attempt</CardTitle>
              <CardDescription>No recording. Full feedback and a score, marked as practice.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full" disabled={busy} onClick={onPractice}>
                Start practice attempt
              </Button>
            </CardContent>
          </Card>
          <Card className="border-primary/40">
            <CardHeader>
              <CardTitle className="font-display text-lg">Verified attempt</CardTitle>
              <CardDescription>
                Camera, microphone and screen are recorded for the whole attempt. Produces a verified score.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" disabled={busy} onClick={() => setMode("verified")}>
                Set up verified attempt
              </Button>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="mt-8 space-y-6">
          <div className="rounded-2xl border border-border bg-card p-5">
            <h2 className="font-display text-lg font-semibold">What gets recorded</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              <li>Recording of your camera, microphone and full screen starts the moment you press start and runs until you submit.</li>
              <li>The recording is stored privately, linked to this attempt only.</li>
              <li>Only you can play it back — there is no recruiter access today.</li>
              <li>Deleting your data in Settings permanently deletes the recording file too.</li>
              <li>If you deny a permission or stop sharing mid-attempt, the verified attempt halts and you can switch to practice.</li>
            </ul>
          </div>

          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
              <video
                ref={previewRef}
                muted
                playsInline
                className="h-[120px] w-full rounded-xl border border-border bg-muted object-cover"
              />
              <div className="space-y-3">
                <CheckRow state={camState} icon={<Video className="h-4 w-4" />} label="Camera" detail="You should see yourself in the preview." />
                <CheckRow state={micState} icon={<Mic className="h-4 w-4" />} label="Microphone" detail="Speak — the bar below should move." />
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-primary transition-all" style={{ width: `${level}%` }} />
                </div>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={requestCamMic}>
              {camState === "ok" ? "Re-test camera & microphone" : "Test camera & microphone"}
            </Button>

            <CheckRow state={screenState} icon={<Monitor className="h-4 w-4" />} label="Screen sharing" detail="Share your entire screen when prompted." />
            <Button variant="outline" size="sm" onClick={requestScreen}>
              {screenState === "ok" ? "Re-select screen" : "Share screen"}
            </Button>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <label className="flex items-start gap-3 rounded-xl border border-border p-4">
            <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} className="mt-0.5" />
            <span className="text-sm">
              I consent to RoleProve recording my camera, microphone and screen for the duration of this verified
              attempt, and to that recording being stored privately against this attempt. This consent is specific to
              recording and is separate from the general Terms of Service.
            </span>
          </label>

          <div className="flex flex-wrap gap-3">
            <Button disabled={!ready || busy} onClick={start}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Start verified attempt
            </Button>
            <Button variant="ghost" disabled={busy} onClick={fallbackToPractice}>
              Switch to practice attempt instead
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}
