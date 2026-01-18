import React, { useState } from 'react';
import { Lock, AlertTriangle } from 'lucide-react';

const SafetyLock = ({ incisionCount, onLock }) => {
  const [showConfirm, setShowConfirm] = useState(false);

  const handleClick = () => {
    if (incisionCount > 0) {
      // Trigger alarm
      const audio = new Audio('/alarm.mp3'); // We don't have this file, but logic is here
      // Alternatively use browser alert for now
      alert("WARNING: ITEMS STILL IN PATIENT! CANNOT CLOSE.");
      // In a real app, we might play a sound or flash the screen
    } else {
      setShowConfirm(true);
    }
  };

  const handleConfirm = () => {
    onLock();
    setShowConfirm(false);
  };

  return (
    <div className="mt-6">
      {!showConfirm ? (
        <button
          onClick={handleClick}
          className={`w-full py-4 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-colors shadow ${
            incisionCount > 0
              ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg animate-pulse'
              : 'bg-sky-500 hover:bg-sky-400 text-slate-950'
          }`}
        >
          {incisionCount > 0 ? (
            <>
              <AlertTriangle size={24} />
              WARNING: {incisionCount} ITEMS IN PATIENT
            </>
          ) : (
            <>
              <Lock size={24} />
              CLOSE PATIENT
            </>
          )}
        </button>
      ) : (
        <div className="bg-slate-900 border border-sky-500/60 rounded-xl p-4 shadow-lg">
          <p className="text-center font-medium mb-4 text-sm text-slate-100">Confirm patient closure?</p>
          <div className="flex gap-4 justify-center">
            <button
              onClick={() => setShowConfirm(false)}
              className="px-4 py-2 text-xs rounded border border-slate-600 text-slate-100 hover:bg-slate-800/80"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              className="px-4 py-2 text-xs rounded bg-sky-500 text-slate-950 hover:bg-sky-400"
            >
              Confirm Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SafetyLock;
