import React, { useState } from 'react';
import LiveMonitoring from './components/LiveMonitoring';
import ZoneCalibration from './components/ZoneCalibration';
import MetricsDisplay from './components/MetricsDisplay';

function App() {
  const [mode, setMode] = useState('calibration');
  const [zones, setZones] = useState({
    tray: null,
    incision: null
  });
  const [videoMode, setVideoMode] = useState('camera');
  const [videoFileUrl, setVideoFileUrl] = useState(null);
  const [videoFile, setVideoFile] = useState(null);

  const handleSaveZones = (newZones) => {
    setZones(newZones);
    setMode('monitoring');
  };

  const handleClosePatient = () => {
    setMode('calibration');
    // Reset zones so they can be redrawn
    setZones({
      tray: null,
      incision: null
    });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 px-8 py-6">
      <header className="mb-8 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div 
            onClick={() => {
              setMode('calibration');
              // Reset zones so they can be redrawn
              setZones({
                tray: null,
                incision: null
              });
            }}
            className="h-9 w-9 rounded-2xl bg-slate-950 border border-sky-500/60 shadow-lg flex items-center justify-center relative overflow-hidden cursor-pointer hover:border-sky-400 transition-colors"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-sky-500/25 via-emerald-400/15 to-cyan-300/20 opacity-80" />
            <div className="relative z-10 flex items-center justify-center">
              {/* Clean Eye Icon */}
              <svg className="w-7 h-7 text-sky-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                {/* Eye outline */}
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                {/* Iris/Pupil */}
                <circle cx="12" cy="12" r="3" fill="currentColor" opacity="0.7" />
                <circle cx="12" cy="12" r="1.5" fill="currentColor" />
              </svg>
            </div>
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-50">
              VigilOR
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              the AI that doesn't blink.
            </p>
          </div>
        </div>
        <div className="flex-1 flex justify-center">
          <p className="text-sm sm:text-base text-slate-200 font-semibold italic">
            Your Smart Surgery Monitor
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300 border border-emerald-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-2" />
            Monitoring ready
          </span>
          {mode === 'monitoring' && (
            <button 
              onClick={() => {
                setMode('calibration');
                // Reset zones so they can be redrawn
                setZones({
                  tray: null,
                  incision: null
                });
              }}
              className="text-xs font-medium text-slate-200 px-3 py-1 rounded-full border border-slate-600 hover:border-slate-400 hover:bg-slate-800/60 transition-colors"
            >
              Recalibrate zones
            </button>
          )}
        </div>
      </header>
      
      <main className="max-w-6xl mx-auto">
        {mode === 'calibration' ? (
          <ZoneCalibration 
            initialZones={zones} 
            onSave={handleSaveZones} 
            videoMode={videoMode}
            videoFileUrl={videoFileUrl}
            onVideoModeChange={setVideoMode}
            onVideoFileChange={(file) => {
              setVideoFile(file);
              if (file) {
                const url = URL.createObjectURL(file);
                setVideoFileUrl(url);
              } else {
                setVideoFileUrl(null);
              }
            }}
          />
        ) : (
          <LiveMonitoring 
            zones={zones} 
            onClosePatient={handleClosePatient} 
            videoMode={videoMode}
            videoFileUrl={videoFileUrl}
            videoFile={videoFile}
            onVideoModeChange={setVideoMode}
            onVideoFileChange={(file) => {
              setVideoFile(file);
              if (file) {
                const url = URL.createObjectURL(file);
                setVideoFileUrl(url);
              } else {
                setVideoFileUrl(null);
              }
            }}
          />
        )}
      </main>
      <MetricsDisplay />
    </div>
  );
}

export default App;
