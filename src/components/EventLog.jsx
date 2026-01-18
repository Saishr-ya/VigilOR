import React from 'react';
import { Clock, ArrowRight, ArrowLeft } from 'lucide-react';

const EventLog = ({ events }) => {
  return (
    <div className="bg-slate-900/70 border border-slate-700 rounded-2xl shadow h-full flex flex-col">
      <div className="px-4 py-3 border-b border-slate-800">
        <h3 className="font-semibold flex items-center gap-2 text-slate-100 text-sm">
          <Clock size={20} />
          Event Log
        </h3>
      </div>
      <div className="flex-1 overflow-auto p-4 space-y-3 max-h-[400px]">
        {events.length === 0 ? (
          <p className="text-slate-500 text-center text-xs py-4">No events recorded yet</p>
        ) : (
          events.map((event) => (
            <div key={event.id} className="flex items-start gap-3 text-xs border-b border-slate-800 pb-2 last:border-0">
              <span className="text-slate-500 text-[11px] whitespace-nowrap mt-1">
                {new Date(event.timestamp).toLocaleTimeString()}
              </span>
              <div className="flex-1">
                <div className="font-medium text-slate-100">{event.itemType}</div>
                <div className={`flex items-center gap-1 text-xs ${
                  event.type === 'entry' ? 'text-rose-400' : 'text-emerald-400'
                }`}>
                  {event.type === 'entry' ? (
                    <>
                      Tray <ArrowRight size={12} /> Incision
                    </>
                  ) : (
                    <>
                      Incision <ArrowLeft size={12} /> Tray
                    </>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default EventLog;
