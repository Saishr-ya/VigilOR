import React, { useState, useRef, useEffect } from 'react';
import { MousePointer2, Check, RotateCcw } from 'lucide-react';

const ZoneCalibration = ({ onSave, initialZones }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    let stream = null;

    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error("Error accessing camera for calibration:", err);
      }
    };

    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);
  
  const [activeZone, setActiveZone] = useState('tray'); // 'tray' or 'incision'
  const [isDrawing, setIsDrawing] = useState(false);
  const [zones, setZones] = useState(initialZones || {
    tray: null,
    incision: null
  });
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentRect, setCurrentRect] = useState(null);

  const getNormalizedCoordinates = (e) => {
    if (!containerRef.current) return { x: 0, y: 0 };

    const rect = containerRef.current.getBoundingClientRect();
    const border = 2; // border-2 is 2px

    // Calculate relative to the content box (inside border)
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left - border) / (rect.width - 2 * border)));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top - border) / (rect.height - 2 * border)));

    return { x, y };
  };

  const handleMouseDown = (e) => {
    const coords = getNormalizedCoordinates(e);
    setStartPos(coords);
    setIsDrawing(true);
    setCurrentRect({ x: coords.x, y: coords.y, w: 0, h: 0 });
  };

  const handleMouseMove = (e) => {
    if (!isDrawing) return;
    
    const coords = getNormalizedCoordinates(e);
    const w = coords.x - startPos.x;
    const h = coords.y - startPos.y;
    
    setCurrentRect({
      x: startPos.x,
      y: startPos.y,
      w,
      h
    });
  };

  const handleMouseUp = () => {
    if (!isDrawing || !currentRect) return;
    
    // Normalize rect (handle negative width/height)
    const normalizedRect = {
      x1: Math.min(startPos.x, startPos.x + currentRect.w),
      y1: Math.min(startPos.y, startPos.y + currentRect.h),
      x2: Math.max(startPos.x, startPos.x + currentRect.w),
      y2: Math.max(startPos.y, startPos.y + currentRect.h)
    };

    setZones(prev => ({
      ...prev,
      [activeZone]: normalizedRect
    }));
    
    setIsDrawing(false);
    setCurrentRect(null);
  };

  // Draw zones on canvas
  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    if (video && canvas) {
      const render = () => {
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d');
          
          // Clear canvas
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          
          // Helper to draw rect
          const drawZone = (rect, color, label) => {
            if (!rect) return;
            // Convert normalized to pixel coordinates for drawing
            const x1 = rect.x1 * canvas.width;
            const y1 = rect.y1 * canvas.height;
            const w = (rect.x2 - rect.x1) * canvas.width;
            const h = (rect.y2 - rect.y1) * canvas.height;

            ctx.strokeStyle = color;
            ctx.lineWidth = 4;
            ctx.strokeRect(x1, y1, w, h);
            
            ctx.fillStyle = color;
            ctx.globalAlpha = 0.2;
            ctx.fillRect(x1, y1, w, h);
            ctx.globalAlpha = 1.0;
            
            ctx.font = '24px Arial';
            ctx.fillText(label, x1, y1 - 10);
          };

          drawZone(zones.tray, '#22c55e', 'Tray Zone');
          drawZone(zones.incision, '#ef4444', 'Incision Zone');

          // Draw current drawing rect
          if (isDrawing && currentRect) {
            const color = activeZone === 'tray' ? '#22c55e' : '#ef4444';
            // Convert normalized currentRect to pixels
            const x = currentRect.x * canvas.width;
            const y = currentRect.y * canvas.height;
            const w = currentRect.w * canvas.width;
            const h = currentRect.h * canvas.height;

            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, w, h);
          }
        }
        requestAnimationFrame(render);
      };
      render();
    }
  }, [zones, isDrawing, currentRect, activeZone]);

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex gap-4 mb-4">
        <button
          onClick={() => setActiveZone('tray')}
          className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
            activeZone === 'tray' 
              ? 'bg-green-600 text-white' 
              : 'bg-gray-200 text-gray-700'
          }`}
        >
          <MousePointer2 size={20} />
          Draw Tray Zone
        </button>
        <button
          onClick={() => setActiveZone('incision')}
          className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
            activeZone === 'incision' 
              ? 'bg-red-600 text-white' 
              : 'bg-gray-200 text-gray-700'
          }`}
        >
          <MousePointer2 size={20} />
          Draw Incision Zone
        </button>
      </div>

      <div 
        ref={containerRef}
        className="relative rounded-lg overflow-hidden border-2 border-gray-300 shadow-lg cursor-crosshair w-full"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <video 
          ref={videoRef} 
          autoPlay 
          playsInline 
          muted 
          className="w-full h-auto block"
        />
        <canvas 
          ref={canvasRef} 
          className="absolute inset-0 pointer-events-none"
        />
      </div>

      <div className="flex gap-4 mt-4">
        <button
          onClick={() => setZones({ tray: null, incision: null })}
          className="px-6 py-2 rounded-lg border border-gray-300 hover:bg-gray-100 flex items-center gap-2"
        >
          <RotateCcw size={20} />
          Reset
        </button>
        <button
          onClick={() => onSave(zones)}
          disabled={!zones.tray || !zones.incision}
          className="px-6 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <Check size={20} />
          Save & Continue
        </button>
      </div>
      
      <p className="text-gray-500 text-sm">
        Draw a box around the instrument tray (green) and the surgical site (red).
      </p>
    </div>
  );
};

export default ZoneCalibration;
