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
  const [baselineCounts, setBaselineCounts] = useState(null);
  const [postCounts, setPostCounts] = useState(null);
  const [scanPhase, setScanPhase] = useState(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState(null);
  const [discrepancy, setDiscrepancy] = useState(null);
  const [postScanVersion, setPostScanVersion] = useState(0);
  const [showIncisionPopup, setShowIncisionPopup] = useState(false);
  const [rfPredictions, setRfPredictions] = useState([]);

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
      source: externalStream || undefined,
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

            // Reduced margins for more accurate zone detection
            const trayMarginX = 0.0;
            const trayMarginY = 0.0;
            const incisionMarginX = 0.0;
            const incisionMarginY = 0.0;

            const trayX1 = Math.max(0, zones.tray.x1 - trayMarginX);
            const trayX2 = Math.min(1, zones.tray.x2 + trayMarginX);
            const trayY1 = Math.max(0, zones.tray.y1 - trayMarginY);
            const trayY2 = Math.min(1, zones.tray.y2 + trayMarginY);

            const incisionX1 = Math.max(0, zones.incision.x1 - incisionMarginX);
            const incisionX2 = Math.min(1, zones.incision.x2 + incisionMarginX);
            const incisionY1 = Math.max(0, zones.incision.y1 - incisionMarginY);
            const incisionY2 = Math.min(1, zones.incision.y2 + incisionMarginY);

            let zone = item.zone; // Keep the zone from API if provided
            
            // Only override if zone is null or undefined
            if (!zone) {
              const inTray = xNorm >= trayX1 && xNorm <= trayX2 &&
                             yNorm >= trayY1 && yNorm <= trayY2;
              const inIncision = xNorm >= incisionX1 && xNorm <= incisionX2 &&
                                 yNorm >= incisionY1 && yNorm <= incisionY2;

              if (inIncision) {
                zone = 'incision';
              } else if (inTray) {
                zone = 'tray';
              }
            }
            
            console.log("[LiveMonitoring] Item:", item.type, "at", xNorm.toFixed(2), yNorm.toFixed(2), "zone:", zone);

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

  const handleScan = async phase => {
    if (!videoRef.current) return;
    setScanPhase(phase);
    setScanLoading(true);
    setScanError(null);
    try {
      const frame = captureFrameFromVideo(videoRef.current);
      const enhancedBase64 = await enhanceFrameWithOpenCV(frame.canvas);
      const rfResult = await runRoboflowDetection(enhancedBase64);
      const { counts, predictions } = buildCountsFromRoboflow(rfResult);
      setRfPredictions(predictions);

      const scanCounts = trackedItems.reduce((acc, item) => {
        const label = item.type || 'unknown';
        acc[label] = (acc[label] || 0) + 1;
        return acc;
      }, {});

      if (phase === 'baseline') {
        setBaselineCounts(scanCounts);
        setPostCounts(null);
        setDiscrepancy(null);
      } else {
        setPostCounts(scanCounts);
        if (baselineCounts) {
          const diff = compareCounts(baselineCounts, scanCounts);
          setDiscrepancy(diff);
        } else {
          setDiscrepancy(null);
        }
      }
    } catch (err) {
      console.error('[LiveMonitoring] Roboflow scan error', err);
      setScanError(err.message || String(err));
    } finally {
      setScanLoading(false);
      if (phase === 'post') {
        setPostScanVersion(v => v + 1);
      }
    }
  };

  const hasDiscrepancy =
    discrepancy &&
    ((discrepancy.missing && discrepancy.missing.length > 0) ||
      (discrepancy.extra && discrepancy.extra.length > 0));

  const overshootCounts = analysisResult ? buildCountsFromOvershoot(analysisResult) : null;
  const roboPostTotal = postCounts ? Object.values(postCounts).reduce((sum, v) => sum + v, 0) : null;
  const overshootTotal = overshootCounts ? Object.values(overshootCounts).reduce((sum, v) => sum + v, 0) : null;

  const incisionItems = trackedItems.filter(i => i.zone === 'incision');
  const incisionCount = incisionItems.length;
  const incisionSummaryByType = incisionItems.reduce((acc, item) => {
    if (!item.type) {
      return acc;
    }
    acc[item.type] = (acc[item.type] || 0) + 1;
    return acc;
  }, {});
  const hasRetainedInIncision =
    scanPhase === 'post' &&
    incisionCount > 0;
  const allItemsAccountedFor =
    baselineCounts &&
    postCounts &&
    !hasDiscrepancy &&
    !hasRetainedInIncision;

  useEffect(() => {
    if (postScanVersion <= 0) {
      return;
    }
    if (scanPhase !== 'post') {
      return;
    }
    const incisionItemsNow = trackedItems.filter(i => i.zone === 'incision');
    setShowIncisionPopup(incisionItemsNow.length > 0);
  }, [postScanVersion, scanPhase]);

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] gap-4">
      {showIncisionPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-lg p-4 max-w-sm w-full">
            <div className="font-semibold text-red-700 mb-2">
              Items still in incision zone
            </div>
            <div className="text-sm text-gray-800 mb-3">
              {incisionCount > 0 ? (
                Object.entries(incisionSummaryByType).map(([type, count]) => (
                  <div key={type}>
                    {count} {type}
                  </div>
                ))
              ) : (
                <div>Items remain in the incision zone.</div>
              )}
            </div>
            <button
              onClick={() => setShowIncisionPopup(false)}
              className="px-4 py-2 rounded bg-red-600 text-white text-sm hover:bg-red-700"
            >
              OK
            </button>
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1">
        <div className="lg:col-span-3 flex flex-col gap-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <Tally items={{ tray: trackedItems.filter(i => i.zone === 'tray'), incision: trackedItems.filter(i => i.zone === 'incision') }} />
            </div>
            <div className="lg:col-span-1">
              <SafetyLock incisionCount={counts.incision} onLock={onClosePatient} />
            </div>
          </div>

          <div className="bg-black rounded-lg overflow-hidden shadow-lg relative">
           <CameraPreview forwardedRef={videoRef} externalStream={externalStream} />
           
           {/* Overlay for tracked items */}
           <div className="absolute inset-0 pointer-events-none">
             {trackedItems.filter(item => item.zone === 'tray' || item.zone === 'incision').map((item) => {
               // Estimate object size (you can adjust these values)
               const objectWidth = 80; // pixels
               const objectHeight = 80; // pixels
               const centerX = item.x * displaySize.width;
               const centerY = item.y * displaySize.height;
               
               return (
                 <div 
                 key={item.id}
                 className="absolute transition-all duration-300"
                 style={{ 
                   left: centerX - objectWidth / 2, 
                   top: centerY - objectHeight / 2,
                   width: objectWidth,
                   height: objectHeight,
                   opacity: (Date.now() - item.lastSeen) > 300 ? 0.5 : 1
                 }}
               >
                 <span className={`absolute -top-6 left-0 right-0 text-center text-xs px-2 py-1 rounded whitespace-nowrap ${
                   item.zone === 'incision' 
                     ? 'bg-red-500/50 text-white' 
                     : item.zone === 'tray' 
                       ? 'bg-green-500/50 text-white' 
                       : 'bg-black/70 text-white'
                 }`}>
                   {item.type}
                 </span>
               </div>
               );
             })}

            {rfPredictions.map(pred => {
              const baseWidth = 640;
              const baseHeight = 480;
              const scaleX = displaySize.width / baseWidth;
              const scaleY = displaySize.height / baseHeight;
              const left = (pred.x - pred.width / 2) * scaleX;
              const top = (pred.y - pred.height / 2) * scaleY;
              const width = pred.width * scaleX;
              const height = pred.height * scaleY;
              let color = 'border-white';
              if (pred.class === 'scalpel') color = 'border-red-500';
              else if (pred.class === 'scissors') color = 'border-blue-500';
              else if (pred.class === 'clamp') color = 'border-green-500';
              else if (pred.class === 'sponge') color = 'border-yellow-400';
              return (
                <div
                  key={pred.id}
                  className={`absolute border-2 ${color} bg-black/10`}
                  style={{
                    left,
                    top,
                    width,
                    height,
                  }}
                >
                  <span className="absolute -top-6 left-0 bg-black/80 text-white text-xs px-2 py-1">
                    {pred.class} {(pred.confidence * 100).toFixed(0)}%
                  </span>
                </div>
              );
            })}
             
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

          <div className="flex flex-wrap items-center gap-4">
            <button
              onClick={() => handleScan('baseline')}
              disabled={scanLoading}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {scanPhase === 'baseline' && scanLoading ? 'Capturing baseline...' : 'Capture Baseline Scan'}
            </button>
            <button
              onClick={() => handleScan('post')}
              disabled={scanLoading || !baselineCounts}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {scanPhase === 'post' && scanLoading ? 'Capturing post-surgery...' : 'Capture Post-Surgery Scan'}
            </button>
            {baselineCounts && (
              <div className="text-sm text-gray-600">
                Baseline saved
              </div>
            )}
          </div>

          {scanError && (
            <div className="mt-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
              Roboflow error: {scanError}
            </div>
          )}

          {baselineCounts && postCounts && (
            <div
              className={`mt-4 text-sm rounded px-3 py-2 border ${
                hasRetainedInIncision || hasDiscrepancy
                  ? 'bg-red-50 border-red-200 text-red-800'
                  : 'bg-green-50 border-green-200 text-green-800'
              }`}
            >
              <div className="font-semibold mb-1">
                {hasRetainedInIncision
                  ? 'Items still in incision zone'
                  : hasDiscrepancy
                    ? 'Count mismatch detected'
                    : 'All items accounted for'}
              </div>
              <div className="mb-1">
                Baseline total:{' '}
                {Object.values(baselineCounts).reduce((sum, v) => sum + v, 0)}; Post-surgery total:{' '}
                {Object.values(postCounts).reduce((sum, v) => sum + v, 0)}
              </div>
              {hasDiscrepancy && (
                <div className="space-y-1">
                  {discrepancy.missing &&
                    discrepancy.missing.map(item => (
                      <div key={`missing-${item.type}`}>
                        {item.count} {item.type} missing
                      </div>
                    ))}
                  {discrepancy.extra &&
                    discrepancy.extra.map(item => (
                      <div key={`extra-${item.type}`}>
                        {item.count} extra {item.type}
                      </div>
                    ))}
                </div>
              )}
              {hasRetainedInIncision && (
                <div className="mt-3 text-sm rounded px-3 py-2 border bg-red-50 border-red-200 text-red-800">
                  <div className="font-semibold mb-1">
                    {incisionCount} item{incisionCount > 1 ? 's' : ''} still in incision zone
                  </div>
                  <div className="space-y-1">
                    {Object.entries(incisionSummaryByType).map(([type, count]) => (
                      <div key={type}>
                        {count} {type}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
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

function captureFrameFromVideo(videoElement) {
  const canvas = document.createElement('canvas');
  const width = videoElement.videoWidth || videoElement.clientWidth || 1280;
  const height = videoElement.videoHeight || videoElement.clientHeight || 720;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(videoElement, 0, 0, width, height);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
  return { canvas, dataUrl };
}

async function enhanceFrameWithOpenCV(canvas) {
  const cv = window.cv;
  if (!cv) {
    return canvas.toDataURL('image/jpeg', 0.9);
  }
  try {
    const src = cv.imread(canvas);
    const dst = new cv.Mat();
    cv.cvtColor(src, src, cv.COLOR_RGBA2RGB);
    const alpha = 1.5;
    const beta = 0;
    src.convertTo(dst, -1, alpha, beta);
    const blurred = new cv.Mat();
    const ksize = new cv.Size(5, 5);
    cv.bilateralFilter(dst, blurred, 9, 75, 75);
    cv.imshow(canvas, blurred);
    src.delete();
    dst.delete();
    blurred.delete();
    return canvas.toDataURL('image/jpeg', 0.9);
  } catch (e) {
    return canvas.toDataURL('image/jpeg', 0.9);
  }
}

async function runRoboflowDetection(base64Image) {
  const apiKey = import.meta.env.VITE_ROBOFLOW_API_KEY;
  const workspace = import.meta.env.VITE_ROBOFLOW_WORKSPACE;
  const workflowId = import.meta.env.VITE_ROBOFLOW_WORKFLOW_ID;
  if (!apiKey || !workspace || !workflowId) {
    throw new Error('Missing Roboflow configuration');
  }
  const url = `https://serverless.roboflow.com/${workspace}/workflows/${workflowId}`;
  const payloadImage = base64Image.includes(',')
    ? base64Image.split(',')[1]
    : base64Image;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      api_key: apiKey,
      inputs: {
        image: {
          type: 'base64',
          value: payloadImage,
        },
      },
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Roboflow error ${response.status}: ${text}`);
  }
  return response.json();
}

function buildCountsFromRoboflow(result) {
  const predictionsArray =
    result &&
    result.outputs &&
    result.outputs.predictions &&
    Array.isArray(result.outputs.predictions.predictions)
      ? result.outputs.predictions.predictions
      : [];
  const predictions = predictionsArray.map((p, idx) => ({
    id: p.id || idx,
    class: p.class || p.name || 'unknown',
    confidence: typeof p.confidence === 'number' ? p.confidence : 0,
    x: p.x,
    y: p.y,
    width: p.width,
    height: p.height,
  }));
  const counts = {};
  predictions.forEach(pred => {
    const label = pred.class;
    counts[label] = (counts[label] || 0) + 1;
  });
  return { counts, predictions };
}

function compareCounts(baseline, post) {
  const types = new Set([...Object.keys(baseline || {}), ...Object.keys(post || {})]);
  const missing = [];
  const extra = [];
  types.forEach(type => {
    const before = baseline[type] || 0;
    const after = post[type] || 0;
    if (after < before) {
      missing.push({ type, count: before - after });
    } else if (after > before) {
      extra.push({ type, count: after - before });
    }
  });
  return { missing, extra };
}

function buildCountsFromOvershoot(analysis) {
  if (!analysis || !Array.isArray(analysis.items)) {
    return null;
  }
  const counts = {};
  analysis.items.forEach(item => {
    if (!item.type) {
      return;
    }
    counts[item.type] = (counts[item.type] || 0) + 1;
  });
  return counts;
}

export default LiveMonitoring;