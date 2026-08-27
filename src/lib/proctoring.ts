export const RECORDING_BUCKET = "attempt-recordings";

export type ProctorStreams = {
  camera: MediaStream;
  screen: MediaStream;
};

export function stopStream(stream: MediaStream | null | undefined) {
  stream?.getTracks().forEach((t) => t.stop());
}

function pickMimeType() {
  const candidates = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  for (const type of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

/**
 * Composites the screen share (full frame) and the webcam (picture-in-picture)
 * onto a canvas, mixes in the microphone, and records everything to one webm file.
 */
export class AttemptRecorder {
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private raf = 0;
  private canvas: HTMLCanvasElement | null = null;
  private canvasStream: MediaStream | null = null;
  private screenVideo: HTMLVideoElement | null = null;
  private cameraVideo: HTMLVideoElement | null = null;

  constructor(
    private streams: ProctorStreams,
    private onLost: (reason: string) => void,
  ) {}

  async start() {
    const canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Recording is not supported in this browser.");
    this.canvas = canvas;

    const mkVideo = (stream: MediaStream) => {
      const v = document.createElement("video");
      v.srcObject = stream;
      v.muted = true;
      v.playsInline = true;
      return v.play().then(() => v);
    };

    this.screenVideo = await mkVideo(this.streams.screen);
    this.cameraVideo = await mkVideo(this.streams.camera);

    const draw = () => {
      ctx.fillStyle = "#0b0f10";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (this.screenVideo && this.screenVideo.videoWidth) {
        ctx.drawImage(this.screenVideo, 0, 0, canvas.width, canvas.height);
      }
      if (this.cameraVideo && this.cameraVideo.videoWidth) {
        const w = 256;
        const h = 144;
        ctx.drawImage(this.cameraVideo, canvas.width - w - 16, canvas.height - h - 16, w, h);
      }
      this.raf = requestAnimationFrame(draw);
    };
    draw();

    const canvasStream = canvas.captureStream(12);
    const micTrack = this.streams.camera.getAudioTracks()[0];
    if (micTrack) canvasStream.addTrack(micTrack);
    this.canvasStream = canvasStream;

    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(canvasStream, mimeType ? { mimeType } : undefined);
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    recorder.start(4000);
    this.recorder = recorder;

    const screenTrack = this.streams.screen.getVideoTracks()[0];
    if (screenTrack) screenTrack.onended = () => this.onLost("Screen sharing was stopped.");
    const camTrack = this.streams.camera.getVideoTracks()[0];
    if (camTrack) camTrack.onended = () => this.onLost("The camera was disconnected.");
    if (micTrack) micTrack.onended = () => this.onLost("The microphone was disconnected.");
  }

  async stop(): Promise<Blob | null> {
    cancelAnimationFrame(this.raf);
    const recorder = this.recorder;
    if (!recorder) return null;

    const blob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(this.chunks, { type: recorder.mimeType || "video/webm" }));
      if (recorder.state !== "inactive") recorder.stop();
      else resolve(new Blob(this.chunks, { type: "video/webm" }));
    });

    this.recorder = null;
    return blob.size > 0 ? blob : null;
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    try {
      if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop();
    } catch {
      /* already stopped */
    }
    this.recorder = null;
    stopStream(this.canvasStream);
    stopStream(this.streams.camera);
    stopStream(this.streams.screen);
  }
}
