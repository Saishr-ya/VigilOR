import React, { useState, useRef, useEffect } from 'react';
import { MousePointer2, Check, RotateCcw } from 'lucide-react';

const ZoneCalibration = ({ onSave, initialZones, videoMode, videoFileUrl, onVideoModeChange, onVideoFileChange }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    let stream = null;

    const video = videoRef.current;

    if (videoMode === 'file' && videoFileUrl && video) {
      video.srcObject = null;
      video.src = videoFileUrl;
      const handleLoadedMetadata = () => {
        setVideoDuration(video.duration || 0);
        video.pause();
        try {
          video.currentTime = 0;
        } catch (e) {}
        setVideoTime(0);
      };
      const handleTimeUpdate = () => {
        setVideoTime(video.currentTime || 0);
      };
      video.addEventListener('loadedmetadata', handleLoadedMetadata);
      video.addEventListener('timeupdate', handleTimeUpdate);
      return () => {
        video.removeEventListener('loadedmetadata', handleLoadedMetadata);
        video.removeEventListener('timeupdate', handleTimeUpdate);
      };
    }

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
  }, [videoMode, videoFileUrl]);

  const seekTo = (time) => {
    const video = videoRef.current;
    if (!video) return;
    if (!videoDuration) {
      video.currentTime = time;
      return;
    }
    const clamped = Math.max(0, Math.min(videoDuration, time));
    video.pause();
    video.currentTime = clamped;
  };
  
  const [activeZone, setActiveZone] = useState('tray'); // 'tray' or 'incision'
  const [isDrawing, setIsDrawing] = useState(false);
  const [zones, setZones] = useState(initialZones || {
    tray: null,
    incision: null
  });
  const [pathPoints, setPathPoints] = useState([]);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoTime, setVideoTime] = useState(0);

  const handleVideoFileChange = event => {
    const file = event.target.files && event.target.files[0];
    if (!file) {
      return;
    }
    onVideoFileChange(file);
    onVideoModeChange('file');
  };

  const getNormalizedCoordinates = (e) => {
    if (!videoRef.current) return { x: 0, y: 0 };
    const rect = videoRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    return { x, y };
  };

  const handleMouseDown = (e) => {
    const coords = getNormalizedCoordinates(e);
    setIsDrawing(true);
    setPathPoints([coords]);
  };

  const handleMouseMove = (e) => {
    if (!isDrawing) return;
    
    const coords = getNormalizedCoordinates(e);
    setPathPoints(prev => [...prev, coords]);
  };

  const handleMouseUp = () => {
    if (!isDrawing || pathPoints.length < 2) {
      setIsDrawing(false);
      setPathPoints([]);
      return;
    }

    const xs = pathPoints.map(p => p.x);
    const ys = pathPoints.map(p => p.y);
    const normalizedRect = {
      x1: Math.min(...xs),
      y1: Math.min(...ys),
      x2: Math.max(...xs),
      y2: Math.max(...ys)
    };

    setZones(prev => ({
      ...prev,
      [activeZone]: normalizedRect
    }));
    
    setIsDrawing(false);
    setPathPoints([]);
  };

  // Draw zones on canvas
  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    if (video && canvas) {
      const render = () => {
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
          const displayWidth = video.clientWidth || video.videoWidth;
          const displayHeight = video.clientHeight || video.videoHeight;
          canvas.width = displayWidth;
          canvas.height = displayHeight;
          const ctx = canvas.getContext('2d');
          
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          
          const drawZone = (rect, color, label) => {
            if (!rect) return;
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

          if (isDrawing && pathPoints.length > 1) {
            const color = activeZone === 'tray' ? '#22c55e' : '#ef4444';
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            const first = pathPoints[0];
            ctx.moveTo(first.x * canvas.width, first.y * canvas.height);
            for (let i = 1; i < pathPoints.length; i += 1) {
              const p = pathPoints[i];
              ctx.lineTo(p.x * canvas.width, p.y * canvas.height);
            }
            ctx.stroke();
          }
        }
        requestAnimationFrame(render);
      };
      render();
    }
  }, [zones, isDrawing, pathPoints, activeZone]);

  return (
    <div className="flex flex-col items-center gap-6">
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

      {videoMode === 'file' && videoFileUrl && videoDuration > 0 && (
        <div className="w-full mt-2 flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>{videoTime.toFixed(2)}s</span>
            <span>{videoDuration.toFixed(2)}s</span>
          </div>
          <input
            type="range"
            min="0"
            max={videoDuration}
            step={videoDuration / 500 || 0.01}
            value={videoTime}
            onChange={(e) => seekTo(parseFloat(e.target.value))}
            className="w-full"
          />
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => seekTo(videoTime - 1 / 30)}
              className="px-3 py-1 text-xs rounded border border-gray-300 hover:bg-gray-100"
            >
              Prev frame
            </button>
            <button
              type="button"
              onClick={() => seekTo(videoTime + 1 / 30)}
              className="px-3 py-1 text-xs rounded border border-gray-300 hover:bg-gray-100"
            >
              Next frame
            </button>
          </div>
        </div>
      )}

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
