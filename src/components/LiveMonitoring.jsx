import React, { useState, useEffect, useRef } from 'react';
import { RealtimeVision } from '@overshoot/sdk';
import Tally from './Tally';
import SafetyLock from './SafetyLock';
import EventLog from './EventLog';
import { useItemTracking } from '../hooks/useItemTracking';

const ROBOFLOW_VALIDATION_INTERVAL_MINUTES = 2;
const ROBOFLOW_TRACKING_INTERVAL_MS = 2500;

const LiveMonitoring = ({ zones, externalStream, onClosePatient, videoMode, videoFileUrl, videoFile, onVideoModeChange, onVideoFileChange }) => {
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
  const [baselineObjectHints, setBaselineObjectHints] = useState(null);
  const zoneTemplatesRef = useRef({ tray: null, incision: null });
  const trackedItemsRef = useRef([]);
  const [trackingActive, setTrackingActive] = useState(false);
  const [osdTime, setOsdTime] = useState('');

  const handleVideoFileChange = event => {
    const file = event.target.files && event.target.files[0];
    if (!file) {
      return;
    }
    onVideoFileChange(file);
    onVideoModeChange('file');
  };

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
    trackedItemsRef.current = trackedItems;
  }, [trackedItems]);

  useEffect(() => {
    if (videoMode !== 'camera') {
      setOsdTime('');
      return;
    }
    const update = () => {
      const now = new Date();
      const pad = (value) => value.toString().padStart(2, '0');
      const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
      setOsdTime(`${date} ${time}`);
    };
    update();
    const id = setInterval(update, 1000);
    return () => {
      clearInterval(id);
    };
  }, [videoMode]);

  useEffect(() => {
    const apiKey = import.meta.env.VITE_OVERSHOOT_API_KEY;
    const baseUrl = import.meta.env.VITE_OVERSHOOT_BASE_URL || "https://cluster1.overshoot.ai/api/v0.2";

    if (videoMode === 'file') {
      setSnapshotMode(false);
      return;
    }

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
      "Identify all clearly visible surgical instruments (scissor, retractor, mallet, elevator, forceps, syringe).",
      "For each instrument, return:",
      "- type: short label",
      "- x: center x pixel",
      "- y: center y pixel",
      "",
      `Tray bounds: x1=${tray.x1}, x2=${tray.x2}, y1=${tray.y1}, y2=${tray.y2}.`,
      `Incision bounds: x1=${incision.x1}, x2=${incision.x2}, y1=${incision.y1}, y2=${incision.y2}.`,
      "",
      "Return JSON: { \"items\": [{\"type\": string, \"x\": number, \"y\": number}] }"
    ].join(" ");

    setSnapshotMode(false);

    const sourceConfig = {
      type: 'camera'
    };

    const config = {
      apiUrl: baseUrl,
      apiKey: apiKey,
      prompt: prompt,
      model: 'Qwen/Qwen3-VL-30B-A3B-Instruct',
      source: sourceConfig,
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
                y: { type: 'number' }
              }
            }
          }
        }
      },
      onResult: (result) => {
        try {
          let parsed = null;
          const raw = result && result.result;

          if (raw == null) {
            return;
          }

          if (typeof raw === 'object') {
            parsed = raw;
          } else if (typeof raw === 'string') {
            const trimmed = raw.trim();
            if (!trimmed) {
              return;
            }
            if (!((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']')))) {
              return;
            }
            try {
              parsed = JSON.parse(trimmed);
            } catch (e) {
              console.warn("[LiveMonitoring] Skipping non-JSON chunk from Overshoot", e);
              return;
            }
          } else {
            return;
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

            let xNorm;
            let yNorm;
            if (x <= 1 && y <= 1) {
              xNorm = x;
              yNorm = y;
            } else {
              xNorm = w ? x / w : 0;
              yNorm = h ? y / h : 0;
            }

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
            tray_count: normalizedItems.filter(i => i.zone === 'tray').length,
            incision_count: normalizedItems.filter(i => i.zone === 'incision').length
          });
          setApiError(null);
        } catch (e) {
          console.error("[LiveMonitoring] Parse error", e);
        }
      }
    };

    const vision = new RealtimeVision(config);

    visionRef.current = vision;

    vision.start()
      .then(() => {
        setIsProcessing(true);
      })
      .catch(err => {
        console.error("[LiveMonitoring] Failed to start vision", err);
        setApiError(err.message);
        setIsProcessing(false);
      });

    return () => {
      if (visionRef.current) {
        visionRef.current.stop();
      }
      setIsProcessing(false);
    };
  }, [zones, videoMode, videoFile]);

  useEffect(() => {
    if (videoMode !== 'file') {
      setTrackingActive(false);
      return;
    }
    setTrackingActive(false);
  }, [videoMode, videoFileUrl]);

  const handleScan = async phase => {
    if (!videoRef.current) return;
    setScanPhase(phase);
    setScanLoading(true);
    setScanError(null);
    try {
      if (videoMode === 'file' && phase === 'baseline') {
        const video = videoRef.current;
        try {
          video.currentTime = 0;
        } catch (e) {}
        video.play().catch(() => {});
        setTrackingActive(true);
      }
      const frame = captureFrameFromVideo(videoRef.current);
      const enhancedBase64 = await enhanceFrameWithOpenCV(frame.canvas);
      const rfResult = await runRoboflowDetection(enhancedBase64);
      console.log('[LiveMonitoring] Roboflow raw result:', rfResult);
      const { counts, predictions } = buildCountsFromRoboflow(rfResult);
      console.log('[LiveMonitoring] Roboflow counts:', counts);
      console.log('[LiveMonitoring] Roboflow predictions:', predictions);
      setRfPredictions(predictions);

      const video = videoRef.current;
      const width = video ? (video.videoWidth || video.clientWidth || 1280) : 1280;
      const height = video ? (video.videoHeight || video.clientHeight || 720) : 720;

      const zonesForClassification = dynamicZones || zones;
      let trayZoneCount = 0;
      let incisionZoneCount = 0;

      const itemsFromRoboflow = predictions.map(pred => {
        const xCenter = typeof pred.x === 'number' ? pred.x : 0;
        const yCenter = typeof pred.y === 'number' ? pred.y : 0;
        const xNorm = width ? xCenter / width : 0;
        const yNorm = height ? yCenter / height : 0;

        let zone = null;
        if (zonesForClassification && zonesForClassification.tray && zonesForClassification.incision) {
          const trayMarginX = 0.02;
          const trayMarginY = 0.02;
          const incisionMarginX = 0.05;
          const incisionMarginY = 0.05;

          const trayX1 = Math.max(0, zonesForClassification.tray.x1 - trayMarginX);
          const trayX2 = Math.min(1, zonesForClassification.tray.x2 + trayMarginX);
          const trayY1 = Math.max(0, zonesForClassification.tray.y1 - trayMarginY);
          const trayY2 = Math.min(1, zonesForClassification.tray.y2 + trayMarginY);

          const incisionX1 = Math.max(0, zonesForClassification.incision.x1 - incisionMarginX);
          const incisionX2 = Math.min(1, zonesForClassification.incision.x2 + incisionMarginX);
          const incisionY1 = Math.max(0, zonesForClassification.incision.y1 - incisionMarginY);
          const incisionY2 = Math.min(1, zonesForClassification.incision.y2 + incisionMarginY);

          const inTray = xNorm >= trayX1 && xNorm <= trayX2 &&
                         yNorm >= trayY1 && yNorm <= trayY2;
          const inIncision = xNorm >= incisionX1 && xNorm <= incisionX2 &&
                             yNorm >= incisionY1 && yNorm <= incisionY2;

          if (inIncision) {
            zone = 'incision';
            incisionZoneCount += 1;
          } else if (inTray) {
            zone = 'tray';
            trayZoneCount += 1;
          }
        }

        return {
          type: pred.class || pred.name || 'unknown',
          x: xNorm,
          y: yNorm,
          zone
        };
      });

      setAnalysisResult({
        items: itemsFromRoboflow,
        tray_count: trayZoneCount,
        incision_count: incisionZoneCount
      });

      const scanCounts = counts || {};

      if (phase === 'baseline') {
        setBaselineCounts(scanCounts);
        setPostCounts(null);
        setDiscrepancy(null);
        setBaselineObjectHints(itemsFromRoboflow);
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
      const video = videoRef.current;
      if (video && video.paused) {
        video.play().catch(() => {});
      }
    }
  };

  useEffect(() => {
    if (!baselineCounts) {
      return;
    }
    if (!videoRef.current) {
      return;
    }
    if (videoMode !== 'camera') {
      return;
    }
    const intervalMs = ROBOFLOW_VALIDATION_INTERVAL_MINUTES * 60 * 1000;
    let cancelled = false;

    const runValidation = async () => {
      if (cancelled) {
        return;
      }
      if (!videoRef.current) {
        return;
      }
      try {
        const frame = captureFrameFromVideo(videoRef.current);
        const enhancedBase64 = await enhanceFrameWithOpenCV(frame.canvas);
        const rfResult = await runRoboflowDetection(enhancedBase64);
        const { counts, predictions } = buildCountsFromRoboflow(rfResult);

        const video = videoRef.current;
        const width = video ? (video.videoWidth || video.clientWidth || 1280) : 1280;
        const height = video ? (video.videoHeight || video.clientHeight || 720) : 720;

        const zonesForClassification = dynamicZones || zones;
        let trayZoneCount = 0;
        let incisionZoneCount = 0;

        const itemsFromRoboflow = predictions.map(pred => {
          const xCenter = typeof pred.x === 'number' ? pred.x : 0;
          const yCenter = typeof pred.y === 'number' ? pred.y : 0;
          const xNorm = width ? xCenter / width : 0;
          const yNorm = height ? yCenter / height : 0;

          let zone = null;
          if (zonesForClassification && zonesForClassification.tray && zonesForClassification.incision) {
            const trayMarginX = 0.02;
            const trayMarginY = 0.02;
            const incisionMarginX = 0.05;
            const incisionMarginY = 0.05;

            const trayX1 = Math.max(0, zonesForClassification.tray.x1 - trayMarginX);
            const trayX2 = Math.min(1, zonesForClassification.tray.x2 + trayMarginX);
            const trayY1 = Math.max(0, zonesForClassification.tray.y1 - trayMarginY);
            const trayY2 = Math.min(1, zonesForClassification.tray.y2 + trayMarginY);

            const incisionX1 = Math.max(0, zonesForClassification.incision.x1 - incisionMarginX);
            const incisionX2 = Math.min(1, zonesForClassification.incision.x2 + incisionMarginX);
            const incisionY1 = Math.max(0, zonesForClassification.incision.y1 - incisionMarginY);
            const incisionY2 = Math.min(1, zonesForClassification.incision.y2 + incisionMarginY);

            const inTray = xNorm >= trayX1 && xNorm <= trayX2 &&
                           yNorm >= trayY1 && yNorm <= trayY2;
            const inIncision = xNorm >= incisionX1 && xNorm <= incisionX2 &&
                               yNorm >= incisionY1 && yNorm <= incisionY2;

            if (inIncision) {
              zone = 'incision';
              incisionZoneCount += 1;
            } else if (inTray) {
              zone = 'tray';
              trayZoneCount += 1;
            }
          }

          return {
            type: pred.class || pred.name || 'unknown',
            x: xNorm,
            y: yNorm,
            zone
          };
        });

        const currentTracked = trackedItemsRef.current || [];
        const matchThreshold = 0.08;

        const unmatchedDetections = itemsFromRoboflow.filter(det => {
          return !currentTracked.some(item => {
            if (item.type !== det.type) {
              return false;
            }
            const dx = item.x - det.x;
            const dy = item.y - det.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            return dist < matchThreshold;
          });
        });

        let hasCountMismatch = false;
        const overshootCountsNow = currentTracked.reduce((acc, item) => {
          if (item.zone === 'tray') {
            acc.tray = (acc.tray || 0) + 1;
          }
          if (item.zone === 'incision') {
            acc.incision = (acc.incision || 0) + 1;
          }
          return acc;
        }, { tray: 0, incision: 0 });

        const roboTotal = Object.values(counts || {}).reduce((sum, v) => sum + v, 0);
        const overshootTotalNow = overshootCountsNow.tray + overshootCountsNow.incision;
        hasCountMismatch = roboTotal !== overshootTotalNow;

        if (unmatchedDetections.length > 0 || hasCountMismatch) {
          setAnalysisResult({
            items: itemsFromRoboflow,
            tray_count: trayZoneCount,
            incision_count: incisionZoneCount
          });
        }
      } catch (err) {
        console.error('[LiveMonitoring] Roboflow periodic validation error', err);
      }
    };

    const id = setInterval(runValidation, intervalMs);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [baselineCounts, dynamicZones, zones, videoMode]);

  useEffect(() => {
    if (videoMode !== 'file') {
      return;
    }
    if (!trackingActive) {
      return;
    }
    let cancelled = false;
    let inFlight = false;

    const runTracking = async () => {
      if (cancelled) {
        return;
      }
      if (!videoRef.current) {
        setTimeout(runTracking, ROBOFLOW_TRACKING_INTERVAL_MS);
        return;
      }
      if (inFlight) {
        setTimeout(runTracking, ROBOFLOW_TRACKING_INTERVAL_MS);
        return;
      }
      try {
        const video = videoRef.current;
        if (!video || video.paused || video.ended) {
          setTimeout(runTracking, ROBOFLOW_TRACKING_INTERVAL_MS);
          return;
        }
        inFlight = true;
        const frame = captureFrameFromVideo(video);
        const rfResult = await runRoboflowDetection(frame.dataUrl);
        const { counts, predictions } = buildCountsFromRoboflow(rfResult);

        const width = video ? (video.videoWidth || video.clientWidth || 1280) : 1280;
        const height = video ? (video.videoHeight || video.clientHeight || 720) : 720;

        const zonesForClassification = dynamicZones || zones;
        let trayZoneCount = 0;
        let incisionZoneCount = 0;

        const itemsFromRoboflow = predictions.map(pred => {
          const xCenter = typeof pred.x === 'number' ? pred.x : 0;
          const yCenter = typeof pred.y === 'number' ? pred.y : 0;
          const xNorm = width ? xCenter / width : 0;
          const yNorm = height ? yCenter / height : 0;

          let zone = null;
          if (zonesForClassification && zonesForClassification.tray && zonesForClassification.incision) {
            const trayMarginX = 0.02;
            const trayMarginY = 0.02;
            const incisionMarginX = 0.05;
            const incisionMarginY = 0.05;

            const trayX1 = Math.max(0, zonesForClassification.tray.x1 - trayMarginX);
            const trayX2 = Math.min(1, zonesForClassification.tray.x2 + trayMarginX);
            const trayY1 = Math.max(0, zonesForClassification.tray.y1 - trayMarginY);
            const trayY2 = Math.min(1, zonesForClassification.tray.y2 + trayMarginY);

            const incisionX1 = Math.max(0, zonesForClassification.incision.x1 - incisionMarginX);
            const incisionX2 = Math.min(1, zonesForClassification.incision.x2 + incisionMarginX);
            const incisionY1 = Math.max(0, zonesForClassification.incision.y1 - incisionMarginY);
            const incisionY2 = Math.min(1, zonesForClassification.incision.y2 + incisionMarginY);

            const inTray = xNorm >= trayX1 && xNorm <= trayX2 &&
                           yNorm >= trayY1 && yNorm <= trayY2;
            const inIncision = xNorm >= incisionX1 && xNorm <= incisionX2 &&
                               yNorm >= incisionY1 && yNorm <= incisionY2;

            if (inIncision) {
              zone = 'incision';
              incisionZoneCount += 1;
            } else if (inTray) {
              zone = 'tray';
              trayZoneCount += 1;
            }
          }

          return {
            type: pred.class || pred.name || 'unknown',
            x: xNorm,
            y: yNorm,
            zone
          };
        });

        setAnalysisResult({
          items: itemsFromRoboflow,
          tray_count: trayZoneCount,
          incision_count: incisionZoneCount
        });
      } catch (err) {
        console.error('[LiveMonitoring] Roboflow tracking error', err);
      } finally {
        inFlight = false;
        if (!cancelled) {
          setTimeout(runTracking, ROBOFLOW_TRACKING_INTERVAL_MS);
        }
      }
    };

    runTracking();

    return () => {
      cancelled = true;
    };
  }, [videoMode, videoFileUrl, dynamicZones, zones, trackingActive]);

  const hasDiscrepancy =
    discrepancy &&
    ((discrepancy.missing && discrepancy.missing.length > 0) ||
      (discrepancy.extra && discrepancy.extra.length > 0));

  const overshootCounts = analysisResult ? buildCountsFromOvershoot(analysisResult) : null;
  const roboPostTotal = postCounts ? Object.values(postCounts).reduce((sum, v) => sum + v, 0) : null;
  const overshootTotal = overshootCounts ? Object.values(overshootCounts).reduce((sum, v) => sum + v, 0) : null;

  const incisionCount = counts.incision || 0;
  const incisionItems = trackedItems.filter(item => item.zone === 'incision');
  const incisionSummaryByType = incisionItems.reduce((acc, item) => {
    if (!item.type) {
      return acc;
    }
    acc[item.type] = (acc[item.type] || 0) + 1;
    return acc;
  }, {});
  const hasRetainedInIncision = incisionCount > 0;

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] gap-4 text-slate-100">
      {showIncisionPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70">
          <div className="bg-slate-900 border border-rose-500/50 rounded-xl shadow-xl p-4 max-w-sm w-full">
            <div className="font-semibold text-rose-200 mb-2 text-sm">
              Items still in incision zone
            </div>
            <div className="text-xs text-slate-200 mb-3 space-y-1">
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
            <div className="flex justify-end">
              <button
                onClick={() => setShowIncisionPopup(false)}
                className="px-4 py-1.5 rounded-lg bg-rose-500 text-slate-950 text-xs font-medium hover:bg-rose-400"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1">
        <div className="lg:col-span-2 flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => onVideoModeChange('camera')}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                videoMode === 'camera'
                  ? 'bg-sky-500 text-slate-950 border-sky-400 shadow'
                  : 'bg-slate-900 text-slate-100 border-slate-700 hover:border-sky-400/60'
              }`}
            >
              Live camera
            </button>
            <label className="px-3 py-1 rounded-full text-xs font-medium border bg-slate-900 text-slate-100 border-slate-700 hover:border-sky-400/60 cursor-pointer transition-colors">
              Upload video
              <input
                type="file"
                accept="video/*"
                onChange={handleVideoFileChange}
                className="hidden"
              />
            </label>
            {videoMode === 'file' && videoFileUrl && (
              <span className="text-[11px] text-slate-400">
                Using uploaded video
              </span>
            )}
          </div>

          <div className="bg-slate-900 rounded-2xl overflow-hidden shadow-lg border border-slate-800 relative">
            <div className="relative bg-black/90">
              <div className="aspect-video">
                <CameraPreview
                  forwardedRef={videoRef}
                  externalStream={externalStream}
                  videoFileUrl={videoFileUrl}
                  videoMode={videoMode}
                />
              </div>
            </div>

           <div className="absolute inset-0 pointer-events-none">
             {videoMode === 'camera' && (
               <div className="absolute inset-0 cctv-overlay">
                 <div className="absolute top-3 left-3 w-8 h-8 border-t border-l border-slate-500/60" />
                 <div className="absolute top-3 right-3 w-8 h-8 border-t border-r border-slate-500/60" />
                 <div className="absolute bottom-3 left-3 w-8 h-8 border-b border-l border-slate-500/60" />
                 <div className="absolute bottom-3 right-3 w-8 h-8 border-b border-r border-slate-500/60" />

                 <div className="absolute left-1/2 top-6 bottom-6 w-px -translate-x-1/2 bg-slate-700/40" />
                 <div className="absolute top-1/2 left-6 right-6 h-px -translate-y-1/2 bg-slate-700/40" />

                 <div className="absolute top-3 left-4 text-[11px] font-mono tracking-[0.18em] text-slate-200 uppercase">
                   CAM 01 · OR SUITE
                 </div>
                 <div className="absolute top-3 right-4 flex items-center gap-4 text-[11px] font-mono text-slate-200">
                   <div className="flex items-center gap-1">
                     <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-sm" />
                     <span>REC</span>
                   </div>
                   {osdTime && (
                     <span>{osdTime}</span>
                   )}
                 </div>
                 <div className="absolute bottom-3 left-4 flex items-center gap-3 text-[11px] font-mono text-slate-200">
                   <span className="px-1.5 py-0.5 border border-slate-500/80 rounded bg-black/60 tracking-[0.18em]">
                     VIGILOR
                   </span>
                   <span className="text-slate-400">AI MONITOR</span>
                 </div>
                 <div className="absolute bottom-3 right-4 flex items-center gap-3 text-[11px] font-mono text-slate-200">
                   <span className="text-slate-400">1080P</span>
                   <span className="text-slate-400">30 FPS</span>
                 </div>
               </div>
             )}
             {trackedItems.filter(item => item.zone === 'tray' || item.zone === 'incision').map((item) => (
               <div 
                 key={item.id}
                   className={`absolute w-6 h-6 rounded-full border-2 border-slate-900 shadow-sm transition-all duration-300 ${
                   item.zone === 'incision' ? 'bg-rose-500' : 'bg-emerald-400'
                 }`}
                 style={{ 
                   left: item.x * displaySize.width, 
                   top: item.y * displaySize.height, 
                   transform: 'translate(-50%, -50%)',
                   opacity: (Date.now() - item.lastSeen) > 300 ? 0.5 : 1
                 }}
               >
                 <span className="absolute -top-7 left-1/2 -translate-x-1/2 bg-slate-950/80 text-slate-100 text-[11px] px-2 py-0.5 rounded-md whitespace-nowrap">
                   {item.type}
                 </span>
               </div>
             ))}

            {videoMode === 'file' && rfPredictions.map(pred => {
              const currentVideo = videoRef.current;
              const baseWidth = currentVideo ? (currentVideo.videoWidth || currentVideo.clientWidth || 640) : 640;
              const baseHeight = currentVideo ? (currentVideo.videoHeight || currentVideo.clientHeight || 480) : 480;
              const scaleX = baseWidth ? displaySize.width / baseWidth : 1;
              const scaleY = baseHeight ? displaySize.height / baseHeight : 1;
              const left = (pred.x - pred.width / 2) * scaleX;
              const top = (pred.y - pred.height / 2) * scaleY;
              const width = pred.width * scaleX;
              const height = pred.height * scaleY;
              let color = 'border-slate-400';
              if (pred.class === 'scissor') color = 'border-sky-400';
              else if (pred.class === 'retractor') color = 'border-emerald-400';
              else if (pred.class === 'mallet') color = 'border-amber-300';
              else if (pred.class === 'elevator') color = 'border-violet-400';
              else if (pred.class === 'forceps') color = 'border-pink-400';
              else if (pred.class === 'syringe') color = 'border-rose-400';
              return (
                <div
                  key={pred.id}
                  className={`absolute border-2 ${color} bg-slate-950/10 rounded`}
                  style={{
                    left,
                    top,
                    width,
                    height,
                  }}
                >
                  <span className="absolute -top-5 left-0 bg-slate-950/90 text-slate-50 text-[11px] px-2 py-0.5 rounded">
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
                     className="absolute border border-emerald-400/40 bg-emerald-500/10 pointer-events-none rounded"
                     style={{
                         left: zonesToRender.tray.x1 * displaySize.width,
                         top: zonesToRender.tray.y1 * displaySize.height,
                         width: (zonesToRender.tray.x2 - zonesToRender.tray.x1) * displaySize.width,
                         height: (zonesToRender.tray.y2 - zonesToRender.tray.y1) * displaySize.height
                     }}
                   />
                   <div 
                     className="absolute border border-rose-400/40 bg-rose-500/10 pointer-events-none rounded"
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
           
           <div className="absolute top-4 right-4 bg-slate-950/70 text-slate-50 px-3 py-1 rounded-full text-[11px] flex items-center gap-2 border border-slate-700">
             <div className={`w-1.5 h-1.5 rounded-full ${isProcessing ? 'bg-emerald-400' : 'bg-amber-300'}`} />
             {isProcessing ? 'Active' : 'Initializing...'}
           </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <button
              onClick={() => handleScan('baseline')}
              disabled={scanLoading}
              className="px-4 py-2 rounded-lg bg-sky-500 text-slate-950 hover:bg-sky-400 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium shadow"
            >
              {scanPhase === 'baseline' && scanLoading ? 'Capturing baseline...' : 'Capture Baseline Scan'}
            </button>
            <button
              onClick={() => handleScan('post')}
              disabled={scanLoading || !baselineCounts}
              className="px-4 py-2 rounded-lg bg-indigo-500 text-slate-950 hover:bg-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium shadow"
            >
              {scanPhase === 'post' && scanLoading ? 'Capturing post-surgery...' : 'Capture Post-Surgery Scan'}
            </button>
            {baselineCounts && (
              <div className="text-xs text-slate-400">
                Baseline saved
              </div>
            )}
          </div>

          {scanError && (
            <div className="mt-2 text-xs text-rose-200 bg-rose-950/40 border border-rose-500/40 rounded px-3 py-2">
              Roboflow error: {scanError}
            </div>
          )}

          {baselineCounts && postCounts && (
            <div
              className={`mt-4 text-xs rounded-xl px-3 py-2 border ${
                hasRetainedInIncision || hasDiscrepancy
                  ? 'bg-rose-950/40 border-rose-500/40 text-rose-100'
                  : 'bg-emerald-950/40 border-emerald-500/40 text-emerald-100'
              }`}
            >
              <div className="font-medium mb-1">
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
                <div className="mt-3 text-xs rounded px-3 py-2 border bg-rose-950/40 border-rose-500/50 text-rose-100">
                  <div className="font-medium mb-1">
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
      return () => {
      };
    }

    if (externalStream && video) {
      video.srcObject = externalStream;
      video.play().catch(() => {});
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
          forwardedRef.current.play().catch(() => {});
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

  const videoClassName =
    videoMode === 'camera'
      ? 'w-full h-full block object-cover brightness-110 contrast-125'
      : 'w-full h-full block object-contain';

  return (
    <video 
      ref={forwardedRef}
      playsInline 
      muted 
      className={videoClassName}
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

  const allowedClasses = ['scissor', 'retractor', 'mallet', 'elevator', 'forceps', 'syringe'];
  const minConfidence = 0.7;

  const predictions = predictionsArray
    .map((p, idx) => ({
      id: p.id || idx,
      class: p.class || p.name || 'unknown',
      confidence: typeof p.confidence === 'number' ? p.confidence : 0,
      x: p.x,
      y: p.y,
      width: p.width,
      height: p.height,
    }))
    .filter(p => allowedClasses.includes(p.class) && p.confidence >= minConfidence);
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
