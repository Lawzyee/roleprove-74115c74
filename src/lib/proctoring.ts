// Client-only proctoring recorder for verified attempts.
// Composites screen share + camera (picture-in-picture) with microphone audio
// into a single WebM recording.
import { supabase } from "@/integrations/supabase/client";

export type MediaStreams = { camera: MediaStream; screen: MediaStream };

export const RECORDINGS_BUCKET = "attempt-recordings";

export function recordingPath(userId: string, attemptId: string) {
  return `${userId}/${attemptId}.webm`;
}

export async function requestCamera() {
  return navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: true });
}

export async function requestScreen() {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { displaySurface: "monitor" } as MediaTrackConstraints,
    audio: false,
  });
  const surface = (stream.getVideoTracks()[0]?.getSettings() as any)?.displaySurface;
  if (surface && surface !== "monitor") {
    stream.getTracks().forEach((t) => t.stop());
    throw new Error("Please share your entire screen, not a single window or tab.");
  }
  return stream;
}

type Active = {
  attemptId: string;
  recorder: MediaRecorder;
  chunks: Blob[];
  streams: MediaStreams;
  timer: number;
  onInterrupt?: (reason: string) => void;
};

let active: Active | null = null;

export function getActiveRecording(attemptId: string) {
  return active && active.attemptId === attemptId ? active : null;
}

export function startRecording(attemptId: string, streams: MediaStreams, onInterrupt: (reason: string) => void) {
  stopTracks(active?.streams);
  const screenVideo = document.createElement("video");
  const camVideo = document.createElement("video");
  for (const [v, s] of [[screenVideo, streams.screen], [camVideo, streams.camera]] as const) {
    v.srcObject = s;
    v.muted = true;
    v.playsInline = true;
    void v.play();
  }
  const canvas = document.createElement("canvas");
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext("2d")!;
  const timer = window.setInterval(() => {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (screenVideo.videoWidth) ctx.drawImage(screenVideo, 0, 0, canvas.width, canvas.height);
    if (camVideo.videoWidth) ctx.drawImage(camVideo, canvas.width - 260, canvas.height - 200, 240, 180);
  }, 1000 / 15);

  const out = canvas.captureStream(15);
  streams.camera.getAudioTracks().forEach((t) => out.addTrack(t));
  const mime = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find((m) =>
    MediaRecorder.isTypeSupported(m),
  );
  const recorder = new MediaRecorder(out, { mimeType: mime, videoBitsPerSecond: 1_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  recorder.start(5000);

  const rec: Active = { attemptId, recorder, chunks, streams, timer, onInterrupt };
  const interrupt = (reason: string) => () => {
    if (active === rec) rec.onInterrupt?.(reason);
  };
  streams.screen.getVideoTracks().forEach((t) => (t.onended = interrupt("Screen sharing was stopped.")));
  streams.camera.getVideoTracks().forEach((t) => (t.onended = interrupt("The camera was disconnected.")));
  streams.camera.getAudioTracks().forEach((t) => (t.onended = interrupt("The microphone was disconnected.")));
  active = rec;
  return rec;
}

function stopTracks(streams?: MediaStreams) {
  streams?.camera.getTracks().forEach((t) => t.stop());
  streams?.screen.getTracks().forEach((t) => t.stop());
}

export function cancelRecording() {
  if (!active) return;
  const rec = active;
  active = null;
  clearInterval(rec.timer);
  if (rec.recorder.state !== "inactive") rec.recorder.stop();
  stopTracks(rec.streams);
}

/** Stops the recording and uploads it. Returns the storage path. */
export async function finishAndUpload(attemptId: string, userId: string): Promise<string> {
  const rec = getActiveRecording(attemptId);
  if (!rec) throw new Error("Recording is not running.");
  active = null;
  rec.onInterrupt = undefined;
  await new Promise<void>((resolve) => {
    rec.recorder.onstop = () => resolve();
    if (rec.recorder.state === "inactive") resolve();
    else rec.recorder.stop();
  });
  clearInterval(rec.timer);
  stopTracks(rec.streams);
  const blob = new Blob(rec.chunks, { type: "video/webm" });
  const path = recordingPath(userId, attemptId);
  const { error } = await supabase.storage
    .from(RECORDINGS_BUCKET)
    .upload(path, blob, { upsert: true, contentType: "video/webm" });
  if (error) throw error;
  const { error: dbErr } = await supabase
    .from("simulation_attempts")
    .update({ recording_file_path: path })
    .eq("id", attemptId);
  if (dbErr) throw dbErr;
  return path;
}

/** Removes every recording in the user's folder. */
export async function deleteAllRecordings(userId: string) {
  const { data } = await supabase.storage.from(RECORDINGS_BUCKET).list(userId, { limit: 1000 });
  const paths = (data ?? []).map((f) => `${userId}/${f.name}`);
  if (paths.length) {
    const { error } = await supabase.storage.from(RECORDINGS_BUCKET).remove(paths);
    if (error) throw error;
  }
}
