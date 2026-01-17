import React, { useEffect, useState } from 'react';
import { useCamera } from '../hooks/useCamera';
import { analyzeFrame } from '../utils/overshootClient';
import ZoneCalibration from './ZoneCalibration';

const CameraFeed = ({ zones, isCalibrating, onSaveZones, onCancelCalibration }) => {
  const { videoRef, canvasRef, frame, error } = useCamera(2000);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    // Only analyze if not calibrating and we have zones
    if (frame && !isProcessing && !isCalibrating && zones.tray && zones.incision) {
      const processFrame = async () => {
        setIsProcessing(true);
        const result = await analyzeFrame(frame, zones);
        if (result) {
          setAnalysisResult(result);
        }
        setIsProcessing(false);
      };
      processFrame();
    }
  }, [frame, isCalibrating, zones]);

  return (
    <div className="relative w-full max-w-4xl mx-auto">
      {error && <div className="text-red-500">Error: {error.message}</div>}
      <div className="relative aspect-video bg-black rounded-lg overflow-hidden shadow-xl">
        <video 
          ref={videoRef} 
          autoPlay 
          playsInline 
          muted 
          className="w-full h-full object-cover"
        />
        {/* Hidden canvas for capturing frames */}
        <canvas ref={canvasRef} className="hidden" />
        
        {/* Calibration Overlay */}
        {isCalibrating && (
          <ZoneCalibration 
            initialZones={zones}
            onSave={onSaveZones}
            onCancel={onCancelCalibration}
          />
        )}

        {/* Overlay for visualizing detection (only when not calibrating) */}
        {!isCalibrating && zones.tray && zones.incision && (
          <>
            {/* Draw Zone Boundaries lightly */}
            <div className="absolute border border-green-500/30 pointer-events-none" 
              style={{ left: zones.tray.x1, top: zones.tray.y1, width: zones.tray.x2 - zones.tray.x1, height: zones.tray.y2 - zones.tray.y1 }} />
            <div className="absolute border border-red-500/30 pointer-events-none"
              style={{ left: zones.incision.x1, top: zones.incision.y1, width: zones.incision.x2 - zones.incision.x1, height: zones.incision.y2 - zones.incision.y1 }} />

            {/* Detected Items */}
            {analysisResult && analysisResult.items && (
              <div className="absolute inset-0 pointer-events-none">
                {analysisResult.items.map((item, idx) => (
                  <div 
                    key={idx}
                    className={`absolute w-4 h-4 rounded-full border-2 border-white ${item.zone === 'incision' ? 'bg-red-500' : 'bg-green-500'}`}
                    style={{ 
                      left: item.x, 
                      top: item.y, 
                      transform: 'translate(-50%, -50%)' 
                    }}
                  >
                    <span className="absolute -top-6 left-1/2 -translate-x-1/2 bg-black/70 text-white text-xs px-2 py-0.5 rounded whitespace-nowrap">
                      {item.type}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      
      {!isCalibrating && (
        <div className="mt-4 p-4 bg-white shadow rounded border border-gray-200">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-bold text-lg">Live Analysis</h3>
            <span className={`px-2 py-1 rounded text-xs font-medium ${isProcessing ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>
              {isProcessing ? 'Processing...' : 'Active'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4">
             <div>
               <p className="text-sm text-gray-500">Items on Tray</p>
               <p className="text-2xl font-bold text-green-600">{analysisResult?.tray_count || 0}</p>
             </div>
             <div>
               <p className="text-sm text-gray-500">Items in Patient</p>
               <p className="text-2xl font-bold text-red-600">{analysisResult?.incision_count || 0}</p>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CameraFeed;
