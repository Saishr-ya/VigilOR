import React, { useState, useEffect, useRef } from 'react';
import { RealtimeVision } from '@overshoot/sdk';
import Tally from './Tally';
import SafetyLock from './SafetyLock';
import EventLog from './EventLog';
import { useItemTracking } from '../hooks/useItemTracking';

const LiveMonitoring = ({ zones, externalStream }) => {
  const videoRef = useRef(null);
  const [scale, setScale] = useState({ x: 1, y: 1 });
  const [analysisResult, setAnalysisResult] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [apiError, setApiError] = useState(null);
  const visionRef = useRef(null);

  // Update scale when video resizes
  useEffect(() => {
    const updateScale = () => {
      const video = videoRef.current;
      if (video && video.videoWidth > 0) {
        // We use object-contain or h-auto, so displayed size might differ from intrinsic
        // But if we use h-auto w-full, the aspect ratio is preserved.
        // The scale is simply clientWidth / videoWidth
        const currentScale = video.clientWidth / video.videoWidth;
        setScale({ x: currentScale, y: currentScale });
      }
    };

    const video = videoRef.current;
    if (video) {
      video.addEventListener('resize', updateScale);
      video.addEventListener('loadedmetadata', updateScale);
      // Initial check
      updateScale();
      // Also window resize
      window.addEventListener('resize', updateScale);
    }

    return () => {
      if (video) {
        video.removeEventListener('resize', updateScale);
        video.removeEventListener('loadedmetadata', updateScale);
      }
      window.removeEventListener('resize', updateScale);
    };
  }, [externalStream]); // Re-run if stream changes (might change resolution)

  const { trackedItems, events, counts } = useItemTracking(analysisResult);

  useEffect(() => {
    const apiKey = import.meta.env.VITE_OVERSHOOT_API_KEY;
    const baseUrl = import.meta.env.VITE_OVERSHOOT_BASE_URL || "https://cluster1.overshoot.ai/api/v0.2";

    if (!apiKey) {
      setApiError("Missing VITE_OVERSHOOT_API_KEY");
      return;
    }

    if (!zones || !zones.tray || !zones.incision) {
      return;
    }

    const prompt = [
      "Identify all clearly visible objects (surgical instruments, bottles, phones, etc).",
      "For each object, return:",
      "- type: short label (e.g. bottle, sponge, scissors)",
      "- x: center x pixel",
      "- y: center y pixel",
      "",
      `Tray bounds: x1=${zones.tray.x1}, x2=${zones.tray.x2}, y1=${zones.tray.y1}, y2=${zones.tray.y2}.`,
      `Incision bounds: x1=${zones.incision.x1}, x2=${zones.incision.x2}, y1=${zones.incision.y1}, y2=${zones.incision.y2}.`,
      "",
      "Return JSON: { \"items\": [{\"type\": string, \"x\": number, \"y\": number, \"zone\": \"tray\" | \"incision\" | null}] }"
    ].join(" ");

    // Config options
    const config = {
      apiUrl: baseUrl,
      apiKey: apiKey,
      prompt: prompt,
      model: 'Qwen/Qwen3-VL-30B-A3B-Instruct',
      source: externalStream || undefined, // Try passing stream if available
      outputSchema: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string' },
                x: { type: 'number' },
                y: { type: 'number' },
                zone: { type: 'string', enum: ['tray', 'incision', null] }
              }
            }
          },
          tray_count: { type: 'number' },
          incision_count: { type: 'number' }
        }
      },
      onResult: (result) => {
        setIsProcessing(true);
        try {
          let parsed;
          if (typeof result.result === 'string') {
            parsed = JSON.parse(result.result);
          } else {
            parsed = result.result;
          }
          
          console.log("[LiveMonitoring] Vision Result:", parsed);
          
          const normalizedItems = (parsed.items || []).map(item => {
            let zone = item.zone;
            if (!zone && typeof item.x === 'number' && typeof item.y === 'number') {
               if (item.x >= zones.tray.x1 && item.x <= zones.tray.x2 &&
                   item.y >= zones.tray.y1 && item.y <= zones.tray.y2) {
                 zone = 'tray';
               } else if (item.x >= zones.incision.x1 && item.x <= zones.incision.x2 &&
                          item.y >= zones.incision.y1 && item.y <= zones.incision.y2) {
                 zone = 'incision';
               }
            }
            return { ...item, zone };
          });
          
          setAnalysisResult({
             items: normalizedItems,
             tray_count: parsed.tray_count || 0,
             incision_count: parsed.incision_count || 0
          });
          setApiError(null);
        } catch (e) {
          console.error("[LiveMonitoring] Parse error", e);
        }
      }
    };

    // If external stream is present, try to use it
    // We can pass the video element as source if SDK supports it, or the stream?
    // If SDK takes a 'source' parameter that can be a video element:
    if (externalStream && videoRef.current) {
        // config.source = videoRef.current; // Hypothetical support
        // Note: If RealtimeVision doesn't support video element source, this won't work for analysis.
        // But let's assume it defaults to camera if not specified.
        // If we want to use external stream, we might need to rely on the fact that
        // CameraPreview is playing the stream, and if we pass the video element, SDK might use it.
    }

    const vision = new RealtimeVision(config);

    visionRef.current = vision;
    
    vision.start().catch(err => {
      console.error("[LiveMonitoring] Failed to start vision", err);
      setApiError(err.message);
    });

    return () => {
      if (visionRef.current) {
        visionRef.current.stop();
      }
    };
  }, [zones, externalStream]);

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] gap-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1">
        <div className="lg:col-span-2 flex flex-col gap-6">
          <div className="bg-black rounded-lg overflow-hidden shadow-lg relative">
           <CameraPreview forwardedRef={videoRef} externalStream={externalStream} />
           
           {/* Overlay for tracked items */}
           <div className="absolute inset-0 pointer-events-none">
             {trackedItems.map((item) => (
               <div 
                 key={item.id}
                 className={`absolute w-6 h-6 rounded-full border-2 border-white shadow-sm transition-all duration-300 ${
                   item.zone === 'incision' ? 'bg-red-500' : 'bg-green-500'
                 }`}
                 style={{ 
                   left: item.x * scale.x, 
                   top: item.y * scale.y, 
                   transform: 'translate(-50%, -50%)',
                   opacity: (Date.now() - item.lastSeen) > 1000 ? 0.5 : 1
                 }}
               >
                 <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-black/70 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                   {item.type}
                 </span>
               </div>
             ))}
             
             {/* Zone Outlines */}
             {zones && (
                <>
                  <div 
                    className="absolute border-2 border-green-500/30 bg-green-500/10 pointer-events-none"
                    style={{
                        left: zones.tray.x1 * scale.x,
                        top: zones.tray.y1 * scale.y,
                        width: (zones.tray.x2 - zones.tray.x1) * scale.x,
                        height: (zones.tray.y2 - zones.tray.y1) * scale.y
                    }}
                  />
                  <div 
                    className="absolute border-2 border-red-500/30 bg-red-500/10 pointer-events-none"
                    style={{
                        left: zones.incision.x1 * scale.x,
                        top: zones.incision.y1 * scale.y,
                        width: (zones.incision.x2 - zones.incision.x1) * scale.x,
                        height: (zones.incision.y2 - zones.incision.y1) * scale.y
                    }}
                  />
                </>
             )}
           </div>
           
           <div className="absolute top-4 right-4 bg-black/60 text-white px-3 py-1 rounded-full text-sm flex items-center gap-2">
             <div className={`w-2 h-2 rounded-full ${isProcessing ? 'bg-green-400' : 'bg-yellow-400'}`} />
             {isProcessing ? 'Active' : 'Initializing...'}
           </div>
          </div>
          
          <Tally items={{ tray: trackedItems.filter(i => i.zone === 'tray'), incision: trackedItems.filter(i => i.zone === 'incision') }} />
        </div>

        <div className="flex flex-col gap-6">
          <SafetyLock incisionCount={counts.incision} onLock={() => console.log('Locked')} />
          <EventLog events={events} />
        </div>
      </div>
      {apiError && (
        <div className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          Analysis error: {apiError}
        </div>
      )}
    </div>
  );
};

// Simple internal component to just show the user's face/environment so they can see what they are doing
const CameraPreview = ({ forwardedRef, externalStream }) => {
  useEffect(() => {
    let stream = null;
    
    if (externalStream) {
      if (forwardedRef.current) {
        forwardedRef.current.srcObject = externalStream;
      }
      return;
    }

    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }, 
          audio: false 
        });
        if (forwardedRef.current) {
          forwardedRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error("Error accessing camera for preview:", err);
      }
    };
    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [forwardedRef, externalStream]);

  return (
    <video 
      ref={forwardedRef} 
      autoPlay 
      playsInline 
      muted 
      className="w-full h-auto block"
    />
  );
};


export default LiveMonitoring;
