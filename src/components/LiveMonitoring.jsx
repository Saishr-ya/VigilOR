import React, { useState, useEffect } from 'react';
import Tally from './Tally';
import SafetyLock from './SafetyLock';
import EventLog from './EventLog';
import { useItemTracking } from '../hooks/useItemTracking';
import { useCamera } from '../hooks/useCamera';
import { analyzeFrame } from '../utils/overshootClient';

const LiveMonitoring = ({ zones }) => {
  // We lift the state processing here to use the custom hook
  const { videoRef, canvasRef, frame, error } = useCamera(2000);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const { trackedItems, events, counts } = useItemTracking(analysisResult);

  useEffect(() => {
    if (frame && !isProcessing && zones) {
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
  }, [frame, zones]);

  // We need to pass trackedItems to CameraFeed for overlay?
  // CameraFeed currently computes its own analysis or expects result.
  // Actually, CameraFeed was doing the analysis internally.
  // I should refactor CameraFeed to be "dumb" (just display) or 
  // let it handle the display of tracked items.
  
  // Since I just rewrote CameraFeed to do analysis, I am duplicating logic if I do it here.
  // But useItemTracking needs the result.
  
  // Solution: CameraFeed should accept `onAnalysisComplete` prop?
  // Or I lift the analysis up to LiveMonitoring (here) and pass the items down to CameraFeed for overlay.
  // Yes, lifting up is better.
  
  // I will update CameraFeed to NOT do analysis if `items` prop is passed?
  // Or just use a specialized "VideoDisplay" component.
  // I'll reuse CameraFeed but modify it to accept `items` for overlay and NOT run analysis if provided.
  
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-140px)]">
      {/* Main Video Area */}
      <div className="lg:col-span-2 flex flex-col gap-6">
        <div className="bg-black rounded-lg overflow-hidden shadow-lg relative aspect-video">
           <video 
             ref={videoRef} 
             autoPlay 
             playsInline 
             muted 
             className="w-full h-full object-cover"
           />
           <canvas ref={canvasRef} className="hidden" />
           
           {/* Overlay for tracked items (smoothed/grace period items) */}
           <div className="absolute inset-0 pointer-events-none">
             {trackedItems.map((item) => (
               <div 
                 key={item.id}
                 className={`absolute w-6 h-6 rounded-full border-2 border-white shadow-sm transition-all duration-300 ${
                   item.zone === 'incision' ? 'bg-red-500' : 'bg-green-500'
                 }`}
                 style={{ 
                   left: item.x, 
                   top: item.y, 
                   transform: 'translate(-50%, -50%)',
                   opacity: (Date.now() - item.lastSeen) > 1000 ? 0.5 : 1 // Fade out if not seen recently
                 }}
               >
                 <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-black/70 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                   {item.type}
                 </span>
               </div>
             ))}
             
             {/* Zone Outlines (Visual Guide) */}
             {zones && (
                <>
                  <div 
                    className="absolute border-2 border-green-500/30 bg-green-500/10 pointer-events-none"
                    style={{
                        left: zones.tray.x1,
                        top: zones.tray.y1,
                        width: zones.tray.x2 - zones.tray.x1,
                        height: zones.tray.y2 - zones.tray.y1
                    }}
                  />
                  <div 
                    className="absolute border-2 border-red-500/30 bg-red-500/10 pointer-events-none"
                    style={{
                        left: zones.incision.x1,
                        top: zones.incision.y1,
                        width: zones.incision.x2 - zones.incision.x1,
                        height: zones.incision.y2 - zones.incision.y1
                    }}
                  />
                </>
             )}
           </div>
           
           {/* Status Indicator */}
           <div className="absolute top-4 right-4 bg-black/60 text-white px-3 py-1 rounded-full text-sm flex items-center gap-2">
             <div className={`w-2 h-2 rounded-full ${isProcessing ? 'bg-yellow-400 animate-pulse' : 'bg-green-400'}`} />
             {isProcessing ? 'Analyzing...' : 'Active'}
           </div>
        </div>
        
        <Tally items={{ tray: trackedItems.filter(i => i.zone === 'tray'), incision: trackedItems.filter(i => i.zone === 'incision') }} />
      </div>

      {/* Sidebar */}
      <div className="flex flex-col gap-6">
        <SafetyLock incisionCount={counts.incision} onLock={() => console.log('Locked')} />
        <EventLog events={events} />
      </div>
    </div>
  );
};

export default LiveMonitoring;
