import React, { useState } from 'react';
import { useMetrics } from '../hooks/useMetrics';

const MetricsDisplay = () => {
  const { getMetrics, clearMetrics, exportMetrics } = useMetrics();
  const [showMetrics, setShowMetrics] = useState(false);
  const [exportFormat, setExportFormat] = useState('json');
  
  const metrics = getMetrics();
  
  const handleExport = () => {
    const data = exportMetrics(exportFormat);
    if (data) {
      const blob = new Blob([data], { type: exportFormat === 'json' ? 'application/json' : 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vigilor-metrics-${new Date().toISOString().split('T')[0]}.${exportFormat}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };
  
  return (
    <div className="fixed bottom-4 right-4 z-50">
      <button
        onClick={() => setShowMetrics(!showMetrics)}
        className="bg-slate-800 hover:bg-slate-700 text-slate-100 px-4 py-2 rounded-lg border border-slate-600 transition-colors"
      >
        {showMetrics ? 'Hide Metrics' : 'Show Metrics'}
      </button>
      
      {showMetrics && (
        <div className="absolute bottom-12 right-0 bg-slate-900 border border-slate-700 rounded-lg p-4 w-80 shadow-xl">
          <h3 className="text-lg font-semibold text-slate-100 mb-3">Session Metrics</h3>
          
          {metrics.currentSession && (
            <div className="mb-4 p-3 bg-slate-800 rounded border border-slate-600">
              <h4 className="text-sm font-medium text-slate-200 mb-2">Current Session</h4>
              <div className="text-xs text-slate-300 space-y-1">
                <div>Items Detected: {metrics.currentSession.itemsDetected}</div>
                <div>Items in Patient: {metrics.currentSession.itemsInPatient}</div>
                <div>Safety Alerts: {metrics.currentSession.safetyAlerts}</div>
                <div>Start Time: {new Date(metrics.currentSession.startTime).toLocaleTimeString()}</div>
              </div>
            </div>
          )}
          
          <div className="mb-4">
            <h4 className="text-sm font-medium text-slate-200 mb-2">All Sessions Summary</h4>
            <div className="text-xs text-slate-300 space-y-1">
              <div>Total Sessions: {metrics.totalSessions}</div>
              <div>Total Safety Alerts: {metrics.totalSafetyAlerts}</div>
              <div>Total Items Detected: {metrics.totalItemsDetected}</div>
              <div>Total Discrepancies: {metrics.totalDiscrepancies}</div>
            </div>
          </div>
          
          <div className="mb-4">
            <label className="block text-xs text-slate-300 mb-2">Export Format:</label>
            <select
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value)}
              className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200"
            >
              <option value="json">JSON</option>
              <option value="csv">CSV</option>
            </select>
          </div>
          
          <div className="flex gap-2">
            <button
              onClick={handleExport}
              className="flex-1 bg-sky-600 hover:bg-sky-500 text-slate-950 px-3 py-2 rounded text-xs font-medium transition-colors"
            >
              Export
            </button>
            <button
              onClick={() => {
                if (confirm('Are you sure you want to clear all metrics? This cannot be undone.')) {
                  clearMetrics();
                }
              }}
              className="flex-1 bg-rose-600 hover:bg-rose-500 text-slate-100 px-3 py-2 rounded text-xs font-medium transition-colors"
            >
              Clear All
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MetricsDisplay;