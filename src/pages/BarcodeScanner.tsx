import { useEffect, useRef, useState } from "react";
import { code39Parse } from "../lib/barcode";
import { Button, Modal, TextInput } from "../ui";
import { IcScan } from "../icons";

/**
 * Camera barcode scanner.
 * - Uses the native Barcode Detection API (Chrome/Edge/Android) when present.
 * - Falls back to a manual code entry box (works with USB/Bluetooth scanners too:
 *   they type into the focused input and submit on Enter).
 */
export function BarcodeScannerModal({ onClose, onCode }: { onClose: () => void; onCode: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const [manual, setManual] = useState("");
  const [apiSupported, setApiSupported] = useState(false);
  const [err, setErr] = useState("");

  const supported = typeof window !== "undefined" && "BarcodeDetector" in window;

  useEffect(() => {
    let cancelled = false;
    setApiSupported(supported);

    const stop = () => {
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
    stop();

    if (!supported) return () => undefined;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();

        const DetectorCtor = (window as unknown as {
          BarcodeDetector: { new (o?: object): { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> } };
        }).BarcodeDetector;
        const detector = new DetectorCtor({
          formats: ["code_39", "code_128", "ean_13", "ean_8", "upc_a", "upc_e", "qr_code"],
        });

        const tick = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes.length > 0) {
              const parsed = code39Parse(codes[0]!.rawValue);
              if (parsed) {
                onCode(parsed);
                onClose();
                return;
              }
            }
          } catch { /* frame not ready */ }
          rafRef.current = requestAnimationFrame(() => void tick());
        };
        void tick();
      } catch {
        if (!cancelled) setErr("Camera unavailable — type the code below instead.");
      }
    })();

    return () => {
      cancelled = true;
      stop();
    };
  }, [supported, onCode, onClose]);

  const submitManual = () => {
    const parsed = code39Parse(manual);
    if (parsed) {
      onCode(parsed);
      onClose();
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Scan barcode"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </div>
      }
    >
      <div className="space-y-3">
        {supported && !err ? (
          <div className="relative overflow-hidden rounded-xl bg-ink-950" style={{ aspectRatio: "4/3" }}>
            <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-24 w-3/4 rounded-lg border-2 border-emerald-400/90 shadow-[0_0_0_9999px_rgba(10,14,20,0.35)]" />
            </div>
            <p className="absolute bottom-2 left-0 right-0 text-center text-[11px] font-medium text-white/70">
              Hold the barcode steady inside the frame
            </p>
          </div>
        ) : null}
        {err ? <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">{err}</p> : null}
        {!apiSupported && !err ? (
          <p className="rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-500">
            Live camera detection isn't supported in this browser — a USB scanner or typing the code works below.
          </p>
        ) : null}
        <div className="flex gap-2">
          <TextInput
            autoFocus
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitManual()}
            placeholder="…or type / scan into here, press Enter"
          />
          <Button disabled={!manual.trim()} onClick={submitManual}><IcScan size={15} /> Find</Button>
        </div>
      </div>
    </Modal>
  );
}
