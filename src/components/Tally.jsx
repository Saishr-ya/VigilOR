import React from 'react';
import { AlertCircle, CheckCircle } from 'lucide-react';

const Tally = ({ items }) => {
  // items is { tray: [], incision: [] } or counts
  // Let's assume we pass the full state
  
  const trayCount = items.tray.length;
  const incisionCount = items.incision.length;

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex flex-col items-center">
        <h3 className="text-green-800 font-semibold mb-2">Tray Zone</h3>
        <div className="text-4xl font-bold text-green-600">{trayCount}</div>
        <p className="text-sm text-green-700 mt-1">Items Safe</p>
      </div>
      
      <div className={`border rounded-lg p-4 flex flex-col items-center ${
        incisionCount > 0 
          ? 'bg-red-50 border-red-200' 
          : 'bg-gray-50 border-gray-200'
      }`}>
        <h3 className={`${
          incisionCount > 0 ? 'text-red-800' : 'text-gray-800'
        } font-semibold mb-2`}>Incision Zone</h3>
        <div className={`text-4xl font-bold ${
          incisionCount > 0 ? 'text-red-600' : 'text-gray-600'
        }`}>{incisionCount}</div>
        <p className={`text-sm mt-1 flex items-center gap-1 ${
          incisionCount > 0 ? 'text-red-700' : 'text-gray-600'
        }`}>
          {incisionCount > 0 ? (
            <>
              <AlertCircle size={16} />
              Items in Patient
            </>
          ) : (
            <>
              <CheckCircle size={16} />
              Clear
            </>
          )}
        </p>
      </div>
    </div>
  );
};

export default Tally;
