import React from 'react';
import { Clock, ArrowRight, ArrowLeft } from 'lucide-react';

const EventLog = ({ events }) => {
  return (
    <div className="bg-white rounded-lg shadow h-full flex flex-col">
      <div className="p-4 border-b">
        <h3 className="font-semibold flex items-center gap-2">
          <Clock size={20} />
          Event Log
        </h3>
      </div>
      <div className="flex-1 overflow-auto p-4 space-y-3 max-h-[400px]">
        {events.length === 0 ? (
          <p className="text-gray-500 text-center text-sm py-4">No events recorded yet</p>
        ) : (
          events.map((event) => (
            <div key={event.id} className="flex items-start gap-3 text-sm border-b border-gray-100 pb-2 last:border-0">
              <span className="text-gray-400 text-xs whitespace-nowrap mt-1">
                {new Date(event.timestamp).toLocaleTimeString()}
              </span>
              <div className="flex-1">
                <div className="font-medium text-gray-900">{event.itemType}</div>
                <div className={`flex items-center gap-1 text-xs ${
                  event.type === 'entry' ? 'text-red-600' : 'text-green-600'
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
