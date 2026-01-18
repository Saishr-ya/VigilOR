import React, { useState, useEffect, useRef } from 'react';
import { RealtimeVision } from '@overshoot/sdk';
import Tally from './Tally';
import SafetyLock from './SafetyLock';
import EventLog from './EventLog';
import { useItemTracking } from '../hooks/useItemTracking';

const LiveMonitoring = ({ zones, externalStream, onClosePatient }) => {
  const videoRef = useRef(null);
  const [displaySize, setDisplaySize] = useState({ width: 1, height: 1 });
  const [analysisResult, setAnalysisResult] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [apiError, setApiError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const visionRef = useRef(null);

  // Update display size when video resizes
  useEffect(() => {
    const updateSize = () => {
      const video = videoRef.current;
      if (video) {
        setDisplaySize({ 
          width: video.clientWidth, 
          height: video.clientHeight 
        });
      }
    };

    const video = videoRef.current;
    if (video) {
      video.addEventListener('resize', updateSize);
      video.addEventListener('loadedmetadata', updateSize);
      // Initial check
      updateSize();
      // Also window resize
      window.addEventListener('resize', updateSize);
    }

    return () => {
      if (video) {
        video.removeEventListener('resize', updateSize);
        video.removeEventListener('loadedmetadata', updateSize);
      }
      window.removeEventListener('resize', updateSize);
    };
  }, [externalStream]);

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

      // Convert normalized zones to pixels for the prompt
      const video = videoRef.current;
      const width = video ? video.videoWidth : 1280;
      const height = video ? video.videoHeight : 720;

      const tray = {
        x1: Math.round(zones.tray.x1 * width),
        y1: Math.round(zones.tray.y1 * height),
        x2: Math.round(zones.tray.x2 * width),
        y2: Math.round(zones.tray.y2 * height)
      };

      const incision = {
        x1: Math.round(zones.incision.x1 * width),
        y1: Math.round(zones.incision.y1 * height),
        x2: Math.round(zones.incision.x2 * width),
        y2: Math.round(zones.incision.y2 * height)
      };

      const prompt = [
        "Identify all clearly visible objects (surgical instruments, bottles, phones, etc).",
        "For each object, return:",
        "- type: short label (e.g. bottle, sponge, scissors)",
        "- x: center x pixel",
        "- y: center y pixel",
        "",
        `Tray bounds: x1=${tray.x1}, x2=${tray.x2}, y1=${tray.y1}, y2=${tray.y2}.`,
        `Incision bounds: x1=${incision.x1}, x2=${incision.x2}, y1=${incision.y1}, y2=${incision.y2}.`,
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
            const video = videoRef.current;
            const width = video ? video.videoWidth : 1280;
            const height = video ? video.videoHeight : 720;
            const x = typeof item.x === 'number' ? item.x : 0;
            const y = typeof item.y === 'number' ? item.y : 0;

            const xNorm = x / width;
            const yNorm = y / height;

            const trayMarginX = 0.02;
            const trayMarginY = 0.02;
            const incisionMarginX = 0.05;
            const incisionMarginY = 0.05;

            const trayX1 = Math.max(0, zones.tray.x1 - trayMarginX);
            const trayX2 = Math.min(1, zones.tray.x2 + trayMarginX);
            const trayY1 = Math.max(0, zones.tray.y1 - trayMarginY);
            const trayY2 = Math.min(1, zones.tray.y2 + trayMarginY);

            const incisionX1 = Math.max(0, zones.incision.x1 - incisionMarginX);
            const incisionX2 = Math.min(1, zones.incision.x2 + incisionMarginX);
            const incisionY1 = Math.max(0, zones.incision.y1 - incisionMarginY);
            const incisionY2 = Math.min(1, zones.incision.y2 + incisionMarginY);

            let zone = null;
            const inTray = xNorm >= trayX1 && xNorm <= trayX2 &&
                           yNorm >= trayY1 && yNorm <= trayY2;
            const inIncision = xNorm >= incisionX1 && xNorm <= incisionX2 &&
                               yNorm >= incisionY1 && yNorm <= incisionY2;

            if (inIncision) {
              zone = 'incision';
            } else if (inTray) {
              zone = 'tray';
            }

            return { ...item, x: xNorm, y: yNorm, zone };
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
             {trackedItems.filter(item => item.zone === 'tray' || item.zone === 'incision').map((item) => (
               <div 
                 key={item.id}
                 className={`absolute w-6 h-6 rounded-full border-2 border-white shadow-sm transition-all duration-300 ${
                   item.zone === 'incision' ? 'bg-red-500' : 'bg-green-500'
                 }`}
                 style={{ 
                   left: item.x * displaySize.width, 
                   top: item.y * displaySize.height, 
                   transform: 'translate(-50%, -50%)',
                   opacity: (Date.now() - item.lastSeen) > 300 ? 0.5 : 1
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
                        left: zones.tray.x1 * displaySize.width,
                        top: zones.tray.y1 * displaySize.height,
                        width: (zones.tray.x2 - zones.tray.x1) * displaySize.width,
                        height: (zones.tray.y2 - zones.tray.y1) * displaySize.height
                    }}
                  />
                  <div 
                    className="absolute border-2 border-red-500/30 bg-red-500/10 pointer-events-none"
                    style={{
                        left: zones.incision.x1 * displaySize.width,
                        top: zones.incision.y1 * displaySize.height,
                        width: (zones.incision.x2 - zones.incision.x1) * displaySize.width,
                        height: (zones.incision.y2 - zones.incision.y1) * displaySize.height
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
          <SafetyLock incisionCount={counts.incision} onLock={onClosePatient} />
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
