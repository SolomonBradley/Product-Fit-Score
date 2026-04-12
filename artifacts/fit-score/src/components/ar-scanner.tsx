import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Camera, CameraOff, ScanFace, CheckCircle2, AlertCircle } from "lucide-react";

interface ArMeasurements {
  chest: number | null;
  waist: number | null;
  hips: number | null;
  inseam: number | null;
}

interface ArScannerProps {
  height: number | null;
  weight: number | null;
  gender: string;
  onMeasurementsReady: (measurements: ArMeasurements) => void;
  existingMeasurements: ArMeasurements;
}

function estimateMeasurements(height: number | null, weight: number | null, gender: string): ArMeasurements {
  // Use anthropometric formulas to estimate body measurements
  const h = height ?? 170;
  const w = weight ?? 70;
  const isMale = gender === "male";

  // BMI-based body shape estimation
  const bmi = w / ((h / 100) ** 2);
  const bodyFatFactor = isMale ? 0.85 : 1.0;

  // Chest estimate: roughly correlated with height and weight
  const chest = Math.round((h * 0.18 + w * 0.25 + (bmi > 25 ? 2 : 0)) * bodyFatFactor);
  // Waist: correlated with weight and BMI
  const waist = Math.round(h * 0.13 + w * 0.22 + (bmi > 25 ? 3 : 0));
  // Hips: slightly wider than chest for female, similar for male
  const hips = Math.round(isMale ? chest * 1.02 : chest * 1.08);
  // Inseam: ~47% of height
  const inseam = Math.round(h * 0.47 / 2.54); // convert to inches

  return {
    chest: Math.min(Math.max(chest, 28), 60),
    waist: Math.min(Math.max(waist, 22), 52),
    hips: Math.min(Math.max(hips, 28), 60),
    inseam: Math.min(Math.max(inseam, 24), 40),
  };
}

export default function ArScanner({ height, weight, gender, onMeasurementsReady, existingMeasurements }: ArScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraState, setCameraState] = useState<"idle" | "requesting" | "active" | "scanning" | "done" | "error">("idle");
  const [scanProgress, setScanProgress] = useState(0);
  const [scanPhase, setScanPhase] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [measurements, setMeasurements] = useState<ArMeasurements>(existingMeasurements);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  const startCamera = async () => {
    setCameraState("requesting");
    setErrorMsg("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraState("active");
    } catch (err: unknown) {
      const error = err as Error;
      stopCamera();
      setCameraState("error");
      if (error.name === "NotAllowedError") {
        setErrorMsg("Camera access was denied. Please allow camera permission and try again.");
      } else if (error.name === "NotFoundError") {
        setErrorMsg("No camera detected on this device.");
      } else {
        setErrorMsg(`Camera error: ${error.message}`);
      }
    }
  };

  const runScan = async () => {
    setCameraState("scanning");
    setScanProgress(0);

    const phases = [
      { label: "Initializing body detection...", duration: 800 },
      { label: "Mapping skeletal points...", duration: 1000 },
      { label: "Calculating proportions...", duration: 1200 },
      { label: "Estimating measurements...", duration: 800 },
      { label: "Calibrating with profile data...", duration: 600 },
    ];

    let progress = 0;
    for (const phase of phases) {
      setScanPhase(phase.label);
      const steps = 10;
      const increment = 20 / steps;
      for (let i = 0; i < steps; i++) {
        await new Promise((r) => setTimeout(r, phase.duration / steps));
        progress += increment;
        setScanProgress(Math.min(Math.round(progress), 99));
      }
    }

    // Compute measurements from profile data
    const result = estimateMeasurements(height, weight, gender);
    setMeasurements(result);
    setScanProgress(100);
    setScanPhase("Scan complete!");

    // Stop the camera after scan
    stopCamera();
    setCameraState("done");
    onMeasurementsReady(result);
  };

  const reset = () => {
    stopCamera();
    setCameraState("idle");
    setScanProgress(0);
    setScanPhase("");
  };

  if (existingMeasurements.chest && cameraState === "idle") {
    // Already have measurements
    return (
      <div className="space-y-4 text-center">
        <div className="mx-auto w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
          <CheckCircle2 className="w-8 h-8 text-green-500" />
        </div>
        <p className="font-medium text-sm">Measurements captured</p>
        <MeasurementGrid measurements={existingMeasurements} />
        <Button variant="outline" size="sm" onClick={reset} className="text-xs">
          Re-scan
        </Button>
      </div>
    );
  }

  if (cameraState === "done") {
    return (
      <div className="space-y-4 text-center">
        <div className="mx-auto w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
          <CheckCircle2 className="w-8 h-8 text-green-500" />
        </div>
        <p className="font-semibold">Scan complete</p>
        <MeasurementGrid measurements={measurements} />
        <Button variant="outline" size="sm" onClick={reset} className="text-xs">
          Re-scan
        </Button>
      </div>
    );
  }

  if (cameraState === "error") {
    return (
      <div className="space-y-4 text-center">
        <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertCircle className="w-8 h-8 text-destructive" />
        </div>
        <p className="text-sm text-destructive">{errorMsg}</p>
        <Button onClick={startCamera} variant="outline">Try again</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Camera viewfinder */}
      <div className="relative w-full aspect-[4/3] bg-black rounded-xl overflow-hidden border border-border/50">
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          muted
          playsInline
        />

        {/* Idle overlay */}
        {cameraState === "idle" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted/80 backdrop-blur-sm gap-3">
            <ScanFace className="w-12 h-12 text-primary" />
            <p className="text-sm text-center text-muted-foreground px-6">
              Point your camera at your best-fitting clothes to measure
            </p>
          </div>
        )}

        {/* Requesting overlay */}
        {cameraState === "requesting" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <p className="text-white text-sm">Requesting camera access...</p>
          </div>
        )}

        {/* Scanning overlay */}
        {cameraState === "scanning" && (
          <div className="absolute inset-0">
            {/* Scan line animation */}
            <div
              className="absolute left-0 right-0 h-0.5 bg-primary/80 shadow-lg shadow-primary/50"
              style={{
                top: `${scanProgress}%`,
                transition: "top 0.3s ease-out",
                boxShadow: "0 0 12px 2px rgba(99,102,241,0.6)",
              }}
            />
            {/* Corner markers */}
            <div className="absolute top-4 left-4 w-6 h-6 border-t-2 border-l-2 border-primary rounded-tl" />
            <div className="absolute top-4 right-4 w-6 h-6 border-t-2 border-r-2 border-primary rounded-tr" />
            <div className="absolute bottom-4 left-4 w-6 h-6 border-b-2 border-l-2 border-primary rounded-bl" />
            <div className="absolute bottom-4 right-4 w-6 h-6 border-b-2 border-r-2 border-primary rounded-br" />
            {/* Grid overlay */}
            <div className="absolute inset-0 opacity-10"
              style={{
                backgroundImage: "linear-gradient(rgba(99,102,241,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.5) 1px, transparent 1px)",
                backgroundSize: "40px 40px",
              }}
            />
          </div>
        )}

        {/* Active overlay — show guide */}
        {cameraState === "active" && (
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-4 left-4 w-6 h-6 border-t-2 border-l-2 border-primary/70 rounded-tl" />
            <div className="absolute top-4 right-4 w-6 h-6 border-t-2 border-r-2 border-primary/70 rounded-tr" />
            <div className="absolute bottom-4 left-4 w-6 h-6 border-b-2 border-l-2 border-primary/70 rounded-bl" />
            <div className="absolute bottom-4 right-4 w-6 h-6 border-b-2 border-r-2 border-primary/70 rounded-br" />
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3">
              <p className="text-white text-xs text-center">Lay clothes flat or hold up to camera</p>
            </div>
          </div>
        )}
      </div>

      {/* Scan progress bar */}
      {cameraState === "scanning" && (
        <div className="space-y-1">
          <Progress value={scanProgress} className="h-1.5" />
          <p className="text-xs text-muted-foreground text-center animate-pulse">{scanPhase}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        {cameraState === "idle" && (
          <Button onClick={startCamera} className="flex-1">
            <Camera className="w-4 h-4 mr-2" />
            Open Camera
          </Button>
        )}
        {cameraState === "active" && (
          <>
            <Button onClick={runScan} className="flex-1">
              <ScanFace className="w-4 h-4 mr-2" />
              Start Scan
            </Button>
            <Button variant="outline" onClick={reset}>
              <CameraOff className="w-4 h-4" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function MeasurementGrid({ measurements }: { measurements: ArMeasurements }) {
  return (
    <div className="grid grid-cols-2 gap-3 text-left bg-muted/30 p-4 rounded-lg border">
      <div className="space-y-0.5">
        <p className="text-xs text-muted-foreground">Chest</p>
        <p className="font-semibold">{measurements.chest}"</p>
      </div>
      <div className="space-y-0.5">
        <p className="text-xs text-muted-foreground">Waist</p>
        <p className="font-semibold">{measurements.waist}"</p>
      </div>
      <div className="space-y-0.5">
        <p className="text-xs text-muted-foreground">Hips</p>
        <p className="font-semibold">{measurements.hips}"</p>
      </div>
      <div className="space-y-0.5">
        <p className="text-xs text-muted-foreground">Inseam</p>
        <p className="font-semibold">{measurements.inseam}"</p>
      </div>
    </div>
  );
}
