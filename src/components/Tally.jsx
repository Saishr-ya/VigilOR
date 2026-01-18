import React from 'react';
import { AlertCircle, CheckCircle } from 'lucide-react';

const Tally = ({ items }) => {
  // items is { tray: [], incision: [] } or counts
  // Let's assume we pass the full state
  
  const trayCount = items.tray.length;
  const incisionCount = items.incision.length;

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="bg-emerald-500/10 border border-emerald-400/40 rounded-2xl px-4 py-3 flex flex-col items-center">
        <h3 className="text-emerald-200 font-medium mb-1 text-sm tracking-tight">Tray Zone</h3>
        <div className="text-3xl font-semibold text-emerald-300">{trayCount}</div>
        <p className="text-[11px] text-emerald-300/80 mt-1">Items safe</p>
      </div>
      
      <div className={`border rounded-lg p-4 flex flex-col items-center ${
        incisionCount > 0 
          ? 'bg-rose-500/10 border-rose-400/50' 
          : 'bg-slate-900/60 border-slate-700'
      }`}>
        <h3 className={`${
          incisionCount > 0 ? 'text-rose-200' : 'text-slate-200'
        } font-medium mb-1 text-sm tracking-tight`}>Incision Zone</h3>
        <div className={`text-3xl font-semibold ${
          incisionCount > 0 ? 'text-rose-300' : 'text-slate-300'
        }`}>{incisionCount}</div>
        <p className={`text-[11px] mt-1 flex items-center gap-1 ${
          incisionCount > 0 ? 'text-rose-300/90' : 'text-slate-400'
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
