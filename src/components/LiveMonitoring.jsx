import React, { useState, useEffect, useRef } from 'react';
import { RealtimeVision } from '@overshoot/sdk';
import Tally from './Tally';
import SafetyLock from './SafetyLock';
import EventLog from './EventLog';
import { useItemTracking } from '../hooks/useItemTracking';

const LiveMonitoring = ({ zones, externalStream, onClosePatient, videoMode, videoFileUrl, onVideoModeChange, onVideoFileChange }) => {
  const videoRef = useRef(null);
  const [displaySize, setDisplaySize] = useState({ width: 1, height: 1 });
  const [analysisResult, setAnalysisResult] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [apiError, setApiError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const visionRef = useRef(null);
  const [snapshotMode, setSnapshotMode] = useState(false);
  const [baselineCounts, setBaselineCounts] = useState(null);
  const [postCounts, setPostCounts] = useState(null);
  const [scanPhase, setScanPhase] = useState(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState(null);
  const [discrepancy, setDiscrepancy] = useState(null);
  const [postScanVersion, setPostScanVersion] = useState(0);
  const [showIncisionPopup, setShowIncisionPopup] = useState(false);
  const [rfPredictions, setRfPredictions] = useState([]);
  const [dynamicZones, setDynamicZones] = useState(zones);
  const dynamicZonesRef = useRef(zones);
  const zoneTemplatesRef = useRef({ tray: null, incision: null });

  const videoElementForScale = videoRef.current;
  const sourceWidth =
    (videoElementForScale && (videoElementForScale.videoWidth || videoElementForScale.clientWidth)) ||
    displaySize.width ||
    1;
  const sourceHeight =
    (videoElementForScale && (videoElementForScale.videoHeight || videoElementForScale.clientHeight)) ||
    displaySize.height ||
    1;
  const scale = {
    x: displaySize.width / sourceWidth,
    y: displaySize.height / sourceHeight,
  };

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

  useEffect(() => {
    setDynamicZones(zones);
    dynamicZonesRef.current = zones;
    const current = zoneTemplatesRef.current;
    if (current.tray) {
      current.tray.delete();
    }
    if (current.incision) {
      current.incision.delete();
    }
    zoneTemplatesRef.current = { tray: null, incision: null };
  }, [zones]);

  useEffect(() => {
    return () => {
      const current = zoneTemplatesRef.current;
      if (current.tray) {
        current.tray.delete();
      }
      if (current.incision) {
        current.incision.delete();
      }
      zoneTemplatesRef.current = { tray: null, incision: null };
    };
  }, []);

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

    const video = videoRef.current;
    const width = video ? (video.videoWidth || 1280) : 1280;
    const height = video ? (video.videoHeight || 720) : 720;

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

    if (videoMode === 'file') {
      setSnapshotMode(true);
      return undefined;
    }

    setSnapshotMode(false);

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

          const baseZones = dynamicZonesRef.current || zones;
          const updatedZones = trackZonesWithTemplate(videoRef.current, baseZones, zoneTemplatesRef);
          const finalZones = updatedZones || baseZones;
          if (finalZones) {
            dynamicZonesRef.current = finalZones;
            setDynamicZones(finalZones);
          }

          const normalizedItems = (parsed.items || []).map(item => {
            const currentVideo = videoRef.current;
            const w = currentVideo ? currentVideo.videoWidth : 1280;
            const h = currentVideo ? currentVideo.videoHeight : 720;
            const x = typeof item.x === 'number' ? item.x : 0;
            const y = typeof item.y === 'number' ? item.y : 0;

            const xNorm = w ? x / w : 0;
            const yNorm = h ? y / h : 0;

            const trayMarginX = 0.02;
            const trayMarginY = 0.02;
            const incisionMarginX = 0.05;
            const incisionMarginY = 0.05;

            const zonesForClassification = finalZones || zones;

            const trayX1 = Math.max(0, zonesForClassification.tray.x1 - trayMarginX);
            const trayX2 = Math.min(1, zonesForClassification.tray.x2 + trayMarginX);
            const trayY1 = Math.max(0, zonesForClassification.tray.y1 - trayMarginY);
            const trayY2 = Math.min(1, zonesForClassification.tray.y2 + trayMarginY);

            const incisionX1 = Math.max(0, zonesForClassification.incision.x1 - incisionMarginX);
            const incisionX2 = Math.min(1, zonesForClassification.incision.x2 + incisionMarginX);
            const incisionY1 = Math.max(0, zonesForClassification.incision.y1 - incisionMarginY);
            const incisionY2 = Math.min(1, zonesForClassification.incision.y2 + incisionMarginY);

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
  }, [zones, externalStream, videoMode]);

  const handleScan = async phase => {
    if (!videoRef.current) return;
    setScanPhase(phase);
    setScanLoading(true);
    setScanError(null);
    try {
      const frame = captureFrameFromVideo(videoRef.current);
      const enhancedBase64 = await enhanceFrameWithOpenCV(frame.canvas);
      const rfResult = await runRoboflowDetection(enhancedBase64);
      console.log('[LiveMonitoring] Roboflow raw result:', rfResult);
      const { counts, predictions } = buildCountsFromRoboflow(rfResult);
      console.log('[LiveMonitoring] Roboflow counts:', counts);
      console.log('[LiveMonitoring] Roboflow predictions:', predictions);
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
    }
  };

  const hasDiscrepancy =
    discrepancy &&
    ((discrepancy.missing && discrepancy.missing.length > 0) ||
      (discrepancy.extra && discrepancy.extra.length > 0));

  const overshootCounts = analysisResult ? buildCountsFromOvershoot(analysisResult) : null;
  const roboPostTotal = postCounts ? Object.values(postCounts).reduce((sum, v) => sum + v, 0) : null;
  const overshootTotal = overshootCounts ? Object.values(overshootCounts).reduce((sum, v) => sum + v, 0) : null;

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
        <div className="lg:col-span-2 flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => onVideoModeChange('camera')}
              className={`px-3 py-1 rounded-full text-sm border ${
                videoMode === 'camera'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-300'
              }`}
            >
              Live camera
            </button>
            <label className="px-3 py-1 rounded-full text-sm border bg-white text-gray-700 border-gray-300 cursor-pointer">
              Upload video
              <input
                type="file"
                accept="video/*"
                onChange={handleVideoFileChange}
                className="hidden"
              />
            </label>
            {videoMode === 'file' && videoFileUrl && (
              <span className="text-xs text-gray-500">
                Using uploaded video
              </span>
            )}
          </div>

          <div className="bg-black rounded-lg overflow-hidden shadow-lg relative">
           <CameraPreview
             forwardedRef={videoRef}
             externalStream={externalStream}
             videoFileUrl={videoFileUrl}
             videoMode={videoMode}
           />
           
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
             
             {(() => {
               const zonesToRender = dynamicZones || zones;
               if (!zonesToRender || !zonesToRender.tray || !zonesToRender.incision) {
                 return null;
               }
               return (
                 <>
                   <div 
                     className="absolute border-2 border-green-500/30 bg-green-500/10 pointer-events-none"
                     style={{
                         left: zonesToRender.tray.x1 * displaySize.width,
                         top: zonesToRender.tray.y1 * displaySize.height,
                         width: (zonesToRender.tray.x2 - zonesToRender.tray.x1) * displaySize.width,
                         height: (zonesToRender.tray.y2 - zonesToRender.tray.y1) * displaySize.height
                     }}
                   />
                   <div 
                     className="absolute border-2 border-red-500/30 bg-red-500/10 pointer-events-none"
                     style={{
                         left: zonesToRender.incision.x1 * displaySize.width,
                         top: zonesToRender.incision.y1 * displaySize.height,
                         width: (zonesToRender.incision.x2 - zonesToRender.incision.x1) * displaySize.width,
                         height: (zonesToRender.incision.y2 - zonesToRender.incision.y1) * displaySize.height
                     }}
                   />
                 </>
               );
             })()}
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
            {videoMode === 'file' && snapshotMode && (
              <span className="text-xs text-gray-500">
                Overshoot running on snapshots for uploaded video
              </span>
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
const CameraPreview = ({ forwardedRef, externalStream, videoFileUrl, videoMode }) => {
  useEffect(() => {
    let stream = null;
    const video = forwardedRef.current;

    if (videoMode === 'file' && videoFileUrl && video) {
      video.srcObject = null;
      video.src = videoFileUrl;
      video.play().catch(() => {});
      return () => {};
    }

    if (externalStream && video) {
      video.srcObject = externalStream;
      return () => {};
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
  }, [forwardedRef, externalStream, videoFileUrl, videoMode]);

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

function trackZonesWithTemplate(videoElement, currentZones, templatesRef) {
  const cv = window.cv;
  if (!cv || !videoElement || !currentZones) {
    return currentZones;
  }
  const frameData = captureFrameFromVideo(videoElement);
  const canvas = frameData.canvas;
  const src = cv.imread(canvas);
  const gray = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

  const updated = { ...currentZones };
  const names = ['tray', 'incision'];

  names.forEach(name => {
    const zone = currentZones[name];
    if (!zone) {
      return;
    }
    const cols = gray.cols;
    const rows = gray.rows;
    const x = Math.max(0, Math.min(cols - 1, Math.round(zone.x1 * cols)));
    const y = Math.max(0, Math.min(rows - 1, Math.round(zone.y1 * rows)));
    const w = Math.max(10, Math.round((zone.x2 - zone.x1) * cols));
    const h = Math.max(10, Math.round((zone.y2 - zone.y1) * rows));
    const width = Math.min(w, cols - x);
    const height = Math.min(h, rows - y);
    if (width <= 0 || height <= 0) {
      return;
    }

    let template = templatesRef.current[name];
    if (!template) {
      const roi = gray.roi(new cv.Rect(x, y, width, height));
      const clone = roi.clone();
      roi.delete();
      templatesRef.current[name] = clone;
      updated[name] = zone;
      return;
    }

    const resultCols = gray.cols - template.cols + 1;
    const resultRows = gray.rows - template.rows + 1;
    if (resultCols <= 0 || resultRows <= 0) {
      return;
    }

    const result = new cv.Mat();
    result.create(resultRows, resultCols, cv.CV_32FC1);
    cv.matchTemplate(gray, template, result, cv.TM_CCOEFF_NORMED);
    const mm = cv.minMaxLoc(result);
    const maxLoc = mm.maxLoc;
    const maxVal = mm.maxVal;
    result.delete();

    if (typeof maxVal !== 'number' || maxVal < 0.5) {
      return;
    }

    const nx1 = maxLoc.x / gray.cols;
    const ny1 = maxLoc.y / gray.rows;
    const nx2 = (maxLoc.x + template.cols) / gray.cols;
    const ny2 = (maxLoc.y + template.rows) / gray.rows;

    updated[name] = {
      x1: Math.max(0, Math.min(1, nx1)),
      y1: Math.max(0, Math.min(1, ny1)),
      x2: Math.max(0, Math.min(1, nx2)),
      y2: Math.max(0, Math.min(1, ny2))
    };

    const newRoi = gray.roi(new cv.Rect(maxLoc.x, maxLoc.y, template.cols, template.rows));
    const newTemplate = newRoi.clone();
    newRoi.delete();
    template.delete();
    templatesRef.current[name] = newTemplate;
  });

  gray.delete();
  src.delete();

  return updated;
}

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
  let predictionsArray = [];
  if (
    result &&
    result.outputs &&
    result.outputs.predictions &&
    Array.isArray(result.outputs.predictions.predictions)
  ) {
    predictionsArray = result.outputs.predictions.predictions;
  } else if (
    result &&
    result.outputs &&
    Array.isArray(result.outputs)
  ) {
    predictionsArray = result.outputs.flatMap(block => {
      if (!block) {
        return [];
      }
      if (Array.isArray(block.predictions)) {
        return block.predictions;
      }
      if (block.image && Array.isArray(block.image.predictions)) {
        return block.image.predictions;
      }
      const nestedSources = Object.values(block).flatMap(value => {
        if (!value) {
          return [];
        }
        if (Array.isArray(value.predictions)) {
          return value.predictions;
        }
        if (value.image && Array.isArray(value.image.predictions)) {
          return value.image.predictions;
        }
        return [];
      });
      return nestedSources;
    });
  } else if (result && Array.isArray(result.predictions)) {
    predictionsArray = result.predictions;
  }
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
