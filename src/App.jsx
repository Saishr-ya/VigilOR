import React, { useState } from 'react';
import LiveMonitoring from './components/LiveMonitoring';
import ZoneCalibration from './components/ZoneCalibration';

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
    // Keep zones as they are, don't reset them
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <header className="mb-8 flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">VigilOR Surgical Tracking</h1>
        {mode === 'monitoring' && (
          <button 
            onClick={() => setMode('calibration')}
            className="text-blue-600 hover:text-blue-800 underline"
          >
            Recalibrate Zones
          </button>
        )}
      </header>
      
      <main>
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
    </div>
  );
}

export default App;
