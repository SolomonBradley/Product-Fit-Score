import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Camera, CameraOff, ScanFace, CheckCircle2, AlertCircle, RefreshCcw } from "lucide-react";
import { PoseLandmarker, FilesetResolver, DrawingUtils } from "@mediapipe/tasks-vision";

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

export default function ArScanner({ height, onMeasurementsReady, existingMeasurements }: ArScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  const [cameraState, setCameraState] = useState<"idle" | "requesting" | "shirt" | "pants" | "done" | "error">("idle");
  const [scanMessage, setScanMessage] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [measurements, setMeasurements] = useState<ArMeasurements>(existingMeasurements);
  const [isModelLoading, setIsModelLoading] = useState(false);

  // MediaPipe refs
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const requestRef = useRef<number>(0);
  const currentLandmarksRef = useRef<any>(null); // Store latest landmarks

  // Constants
  const USER_HEIGHT_CM = height ?? 170; 
  const CM_TO_INCHES = 0.393701;

  // Cleanup
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (requestRef.current) {
      cancelAnimationFrame(requestRef.current);
    }
  }, []);

  useEffect(() => {
    return () => {
      stopCamera();
      if (landmarkerRef.current) {
        landmarkerRef.current.close();
      }
    };
  }, [stopCamera]);

  // Render loop for skeleton
  const predictWebcam = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const landmarker = landmarkerRef.current;

    if (!video || !canvas || !landmarker || video.readyState < 2) {
      if (cameraState === "shirt" || cameraState === "pants") {
        requestRef.current = requestAnimationFrame(predictWebcam);
      }
      return;
    }

    // Set canvas size
    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;
    canvas.width = videoWidth;
    canvas.height = videoHeight;

    let startTimeMs = performance.now();
    try {
      if (video.currentTime > 0) {
        const results = landmarker.detectForVideo(video, startTimeMs);
        currentLandmarksRef.current = results.landmarks?.[0] || null;

        const ctx = canvas.getContext("2d");
        if (ctx && results.landmarks) {
          ctx.save();
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          const drawingUtils = new DrawingUtils(ctx);
          for (const landmark of results.landmarks) {
            drawingUtils.drawLandmarks(landmark, { radius: 3, color: "#6366f1" });
            drawingUtils.drawConnectors(landmark, PoseLandmarker.POSE_CONNECTIONS, { color: "#818cf8", lineWidth: 2 });
          }
          ctx.restore();
        }
      }
    } catch (e) {
      console.warn("Pose estimation skipped frame.");
    }
    
    if (cameraState === "shirt" || cameraState === "pants") {
      requestRef.current = requestAnimationFrame(predictWebcam);
    }
  }, [cameraState]);

  const initMediaPipe = async () => {
    if (landmarkerRef.current) return true;
    try {
      setIsModelLoading(true);
      setScanMessage("Loading AI tracking models...");
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
      );
      landmarkerRef.current = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
          delegate: "GPU"
        },
        runningMode: "VIDEO",
        numPoses: 1
      });
      return true;
    } catch (err) {
      console.error(err);
      setErrorMsg("Failed to load AI measurement models.");
      setCameraState("error");
      return false;
    } finally {
      setIsModelLoading(false);
    }
  };

  const startCamera = async () => {
    setCameraState("requesting");
    setErrorMsg("");
    
    const modelLoaded = await initMediaPipe();
    if (!modelLoaded) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          setCameraState("shirt");
          setScanMessage("Stand fully in frame.");
          requestRef.current = requestAnimationFrame(predictWebcam);
        };
      }
    } catch (err: unknown) {
      const error = err as Error;
      stopCamera();
      setCameraState("error");
      if (error.name === "NotAllowedError") {
        setErrorMsg("Camera access denied.");
      } else {
        setErrorMsg("No camera detected.");
      }
    }
  };

  // Helper to calculate distance
  const calcDist = (lm1: any, lm2: any) => {
    return Math.sqrt(Math.pow(lm1.x - lm2.x, 2) + Math.pow(lm1.y - lm2.y, 2));
  };

  const handleCaptureShirt = () => {
    const lms = currentLandmarksRef.current;
    if (!lms || lms.length === 0) {
      setScanMessage("No body detected! Stand clearly in frame.");
      return;
    }

    // Nodes: 0: nose, 31: right ankle, 11: left shoulder, 12: right shoulder
    const head = lms[0];
    const ankle = lms[31];
    const leftShoulder = lms[11];
    const rightShoulder = lms[12];

    const bodyPixelHeight = calcDist(head, ankle) || 1; // Prevent div by 0
    // Pixels per cm based on user height
    const pxPerCm = bodyPixelHeight / USER_HEIGHT_CM; 

    // Chest approx: (shoulder width) * 2 or slightly curved around
    // 1D distance * approx circumference factor (3.14 / 1.5)
    const shoulderWidthPx = calcDist(leftShoulder, rightShoulder);
    const shoulderWidthCm = shoulderWidthPx / pxPerCm;
    
    let chestCircumferenceInches = Math.round((shoulderWidthCm * 2.2) * CM_TO_INCHES);
    // Sanity check boundings
    chestCircumferenceInches = Math.min(Math.max(chestCircumferenceInches, 30), 55);

    setMeasurements(prev => ({ ...prev, chest: chestCircumferenceInches }));
    setCameraState("pants");
    setScanMessage("Great! Now make sure your full legs are in frame.");
  };

  const handleCapturePants = () => {
    const lms = currentLandmarksRef.current;
    if (!lms || lms.length === 0) {
      setScanMessage("No body detected! Stand clearly in frame.");
      return;
    }

    // Nodes: 0: nose, 31: right ankle, 23: left hip, 24: right hip
    const head = lms[0];
    const ankle = lms[31];
    const leftHip = lms[23];
    const rightHip = lms[24];

    const bodyPixelHeight = calcDist(head, ankle) || 1;
    const pxPerCm = bodyPixelHeight / USER_HEIGHT_CM; 

    // Waist approx (using hips as proxy for waist/hip circumference)
    const hipWidthPx = calcDist(leftHip, rightHip);
    const hipWidthCm = hipWidthPx / pxPerCm;
    let waistCircInches = Math.round((hipWidthCm * 2.3) * CM_TO_INCHES);
    let hipsCircInches = Math.round((hipWidthCm * 2.5) * CM_TO_INCHES);

    // Inseam approx (hip to ankle straight line)
    const inseamPx = calcDist(leftHip, lms[27]); // 27 = left ankle
    const inseamCm = inseamPx / pxPerCm;
    let inseamInches = Math.round(inseamCm * CM_TO_INCHES);

    // Bounds check
    waistCircInches = Math.min(Math.max(waistCircInches, 24), 50);
    hipsCircInches = Math.min(Math.max(hipsCircInches, 30), 55);
    inseamInches = Math.min(Math.max(inseamInches, 24), 40);

    const finalMeasurements = {
      ...measurements,
      waist: waistCircInches,
      hips: hipsCircInches,
      inseam: inseamInches
    };

    setMeasurements(finalMeasurements);
    stopCamera();
    setCameraState("done");
    onMeasurementsReady(finalMeasurements);
  };

  const reset = () => {
    stopCamera();
    setCameraState("idle");
    setMeasurements({ chest: null, waist: null, hips: null, inseam: null });
  };

  if (existingMeasurements.chest && cameraState === "idle") {
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
        <Button variant="outline" size="sm" onClick={reset} className="text-xs mt-4">
          <RefreshCcw className="w-4 h-4 mr-2" /> Start Over
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
      {/* Video Viewfinder Container */}
      <div className="relative w-full aspect-[4/3] bg-black rounded-xl overflow-hidden border border-border/50">
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          muted
          playsInline
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
        />

        {/* UI Overlays based on state */}
        {cameraState === "idle" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted/80 backdrop-blur-sm gap-3">
            <ScanFace className="w-12 h-12 text-primary" />
            <p className="text-sm text-center text-muted-foreground px-6">
              Use actual AR Body Tracking to extract your unique measurements.
            </p>
            <Button onClick={startCamera} className="mt-2" disabled={isModelLoading}>
              {isModelLoading ? "Loading AI..." : "Open Camera"}
            </Button>
          </div>
        )}

        {cameraState === "requesting" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 gap-3">
            <ScanFace className="w-10 h-10 text-white animate-pulse" />
            <p className="text-white text-sm">{scanMessage || "Requesting camera access..."}</p>
          </div>
        )}

        {/* Visual guide overlay for Shirts/Pants */}
        {(cameraState === "shirt" || cameraState === "pants") && (
          <>
            <div className="absolute top-4 left-0 right-0 z-10 flex justify-center">
              <div className="bg-black/60 text-white text-xs px-4 py-1.5 rounded-full backdrop-blur-md border border-white/10 font-medium">
                {cameraState === "shirt" ? "Step 1: Upper Body" : "Step 2: Lower Body"}
              </div>
            </div>
            
            <div className="absolute inset-0 pointer-events-none border-4 border-dashed border-primary/20 m-6 rounded-2xl" />
            
            <div className="absolute bottom-4 left-0 right-0 z-10 flex flex-col items-center gap-3">
               <p className="bg-black/80 px-3 py-1 rounded text-white text-xs font-semibold max-w-[80%] text-center">
                 {scanMessage}
               </p>
               {cameraState === "shirt" ? (
                 <Button onClick={handleCaptureShirt} size="lg" className="w-[80%] shadow-xl shadow-primary/20">
                   Capture Shirt Size
                 </Button>
               ) : (
                 <Button onClick={handleCapturePants} size="lg" className="w-[80%] shadow-xl shadow-primary/20 bg-green-600 hover:bg-green-700">
                   Capture Pants Size
                 </Button>
               )}
            </div>
          </>
        )}
      </div>

      {cameraState === "shirt" || cameraState === "pants" ? (
        <Button variant="ghost" onClick={reset} className="w-full text-muted-foreground">
          Cancel Scan
        </Button>
      ) : null}
    </div>
  );
}

function MeasurementGrid({ measurements }: { measurements: ArMeasurements }) {
  return (
    <div className="grid grid-cols-2 gap-3 text-left bg-muted/30 p-4 rounded-lg border">
      <div className="space-y-0.5">
        <p className="text-xs text-muted-foreground">Chest</p>
        <p className="font-semibold">{measurements.chest ? `${measurements.chest}"` : "--"}</p>
      </div>
      <div className="space-y-0.5">
        <p className="text-xs text-muted-foreground">Waist</p>
        <p className="font-semibold">{measurements.waist ? `${measurements.waist}"` : "--"}</p>
      </div>
      <div className="space-y-0.5">
        <p className="text-xs text-muted-foreground">Hips</p>
        <p className="font-semibold">{measurements.hips ? `${measurements.hips}"` : "--"}</p>
      </div>
      <div className="space-y-0.5">
        <p className="text-xs text-muted-foreground">Inseam</p>
        <p className="font-semibold">{measurements.inseam ? `${measurements.inseam}"` : "--"}</p>
      </div>
    </div>
  );
}
