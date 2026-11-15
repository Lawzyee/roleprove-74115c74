import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

const OUT = 512;

/** Square crop: zoom + position. Output is re-drawn on a canvas (drops EXIF/location) as a 512px JPEG. */
export function PhotoCropper({ file, onCancel, onDone }: { file: File | null; onCancel: () => void; onDone: (base64: string) => void }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [x, setX] = useState(50);
  const [y, setY] = useState(50);
  const preview = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!file) { setImg(null); return; }
    const url = URL.createObjectURL(file);
    const i = new Image();
    i.onload = () => { setImg(i); setZoom(1); setX(50); setY(50); };
    i.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function draw(canvas: HTMLCanvasElement, size: number) {
    if (!img) return;
    const ctx = canvas.getContext("2d")!;
    canvas.width = size; canvas.height = size;
    const side = Math.min(img.width, img.height) / zoom;
    const sx = (img.width - side) * (x / 100);
    const sy = (img.height - side) * (y / 100);
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, size, size);
    ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
  }
  useEffect(() => { if (preview.current) draw(preview.current, 240); });

  return (
    <Dialog open={!!file} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Crop your photo</DialogTitle><DialogDescription>Choose a square, professional crop.</DialogDescription></DialogHeader>
        <div className="flex justify-center"><canvas ref={preview} className="h-60 w-60 rounded-full border border-border" /></div>
        <div className="space-y-3">
          <Label>Zoom</Label><Slider min={1} max={4} step={0.05} value={[zoom]} onValueChange={([v]) => setZoom(v)} />
          <Label>Left / right</Label><Slider min={0} max={100} value={[x]} onValueChange={([v]) => setX(v)} />
          <Label>Up / down</Label><Slider min={0} max={100} value={[y]} onValueChange={([v]) => setY(v)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button disabled={!img} onClick={() => {
            const c = document.createElement("canvas");
            draw(c, OUT);
            onDone(c.toDataURL("image/jpeg", 0.88).split(",")[1]);
          }}>Use photo</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
