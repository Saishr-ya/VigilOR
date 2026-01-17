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
    alert("Patient Closed Successfully. Surgery Complete.");
  };

  return (
    <div className="mt-6">
      {!showConfirm ? (
        <button
          onClick={handleClick}
          className={`w-full py-4 rounded-lg font-bold text-lg flex items-center justify-center gap-2 transition-colors ${
            incisionCount > 0
              ? 'bg-red-600 hover:bg-red-700 text-white shadow-lg animate-pulse'
              : 'bg-blue-600 hover:bg-blue-700 text-white shadow'
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
        <div className="bg-white border-2 border-blue-500 rounded-lg p-4 shadow-lg">
          <p className="text-center font-semibold mb-4">Confirm patient closure?</p>
          <div className="flex gap-4 justify-center">
            <button
              onClick={() => setShowConfirm(false)}
              className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
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
