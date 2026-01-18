import { useState, useEffect, useCallback } from 'react';

const METRICS_STORAGE_KEY = 'vigilor_session_metrics';
const SESSION_STORAGE_KEY = 'vigilor_current_session';

export const useMetrics = () => {
  const [currentSession, setCurrentSession] = useState(null);
  const [metrics, setMetrics] = useState([]);

  // Load existing metrics from localStorage on mount
  useEffect(() => {
    const loadStoredMetrics = () => {
      try {
        const storedMetrics = localStorage.getItem(METRICS_STORAGE_KEY);
        const storedSession = localStorage.getItem(SESSION_STORAGE_KEY);
        
        if (storedMetrics) {
          setMetrics(JSON.parse(storedMetrics));
        }
        
        if (storedSession) {
          setCurrentSession(JSON.parse(storedSession));
        }
      } catch (error) {
        console.error('Error loading metrics from localStorage:', error);
      }
    };

    loadStoredMetrics();
  }, []);

  // Save metrics to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(METRICS_STORAGE_KEY, JSON.stringify(metrics));
    } catch (error) {
      console.error('Error saving metrics to localStorage:', error);
    }
  }, [metrics]);

  // Save current session to localStorage
  useEffect(() => {
    try {
      if (currentSession) {
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(currentSession));
      } else {
        localStorage.removeItem(SESSION_STORAGE_KEY);
      }
    } catch (error) {
      console.error('Error saving session to localStorage:', error);
    }
  }, [currentSession]);

  const startSession = useCallback((sessionData = {}) => {
    const newSession = {
      id: `session_${Date.now()}`,
      startTime: new Date().toISOString(),
      endTime: null,
      duration: 0,
      itemsDetected: 0,
      itemsInPatient: 0,
      safetyAlerts: 0,
      discrepancies: [],
      events: [],
      ...sessionData
    };
    
    setCurrentSession(newSession);
    return newSession;
  }, []);

  const endSession = useCallback(() => {
    if (!currentSession) return null;

    const endTime = new Date().toISOString();
    const startTime = new Date(currentSession.startTime);
    const endTimeDate = new Date(endTime);
    const duration = Math.round((endTimeDate - startTime) / 1000); // Duration in seconds

    const completedSession = {
      ...currentSession,
      endTime,
      duration
    };

    // Add to metrics history
    setMetrics(prev => [...prev, completedSession]);
    setCurrentSession(null);
    
    return completedSession;
  }, [currentSession]);

  const logEvent = useCallback((eventType, data = {}) => {
    if (!currentSession) return;

    const event = {
      timestamp: new Date().toISOString(),
      type: eventType,
      data
    };

    setCurrentSession(prev => ({
      ...prev,
      events: [...(prev.events || []), event]
    }));
  }, [currentSession]);

  const logItemDetection = useCallback((itemType, count, zone) => {
    if (!currentSession) return;

    setCurrentSession(prev => ({
      ...prev,
      itemsDetected: (prev.itemsDetected || 0) + count
    }));

    logEvent('item_detection', { itemType, count, zone });
  }, [currentSession, logEvent]);

  const logItemInPatient = useCallback((count) => {
    if (!currentSession) return;

    setCurrentSession(prev => ({
      ...prev,
      itemsInPatient: count
    }));

    logEvent('item_in_patient', { count });
  }, [currentSession, logEvent]);

  const logSafetyAlert = useCallback((alertType, details = {}) => {
    if (!currentSession) return;

    setCurrentSession(prev => ({
      ...prev,
      safetyAlerts: (prev.safetyAlerts || 0) + 1
    }));

    logEvent('safety_alert', { alertType, details });
  }, [currentSession, logEvent]);

  const logDiscrepancy = useCallback((type, expected, actual, details = {}) => {
    if (!currentSession) return;

    const discrepancy = {
      timestamp: new Date().toISOString(),
      type,
      expected,
      actual,
      details
    };

    setCurrentSession(prev => ({
      ...prev,
      discrepancies: [...(prev.discrepancies || []), discrepancy]
    }));

    logEvent('discrepancy_detected', { type, expected, actual, ...details });
  }, [currentSession, logEvent]);

  const getMetrics = useCallback(() => {
    return {
      currentSession,
      allSessions: metrics,
      totalSessions: metrics.length,
      totalSafetyAlerts: metrics.reduce((sum, session) => sum + (session.safetyAlerts || 0), 0),
      totalItemsDetected: metrics.reduce((sum, session) => sum + (session.itemsDetected || 0), 0),
      totalDiscrepancies: metrics.reduce((sum, session) => sum + (session.discrepancies?.length || 0), 0)
    };
  }, [currentSession, metrics]);

  const clearMetrics = useCallback(() => {
    setMetrics([]);
    setCurrentSession(null);
    localStorage.removeItem(METRICS_STORAGE_KEY);
    localStorage.removeItem(SESSION_STORAGE_KEY);
  }, []);

  const exportMetrics = useCallback((format = 'json') => {
    const data = getMetrics();
    
    if (format === 'json') {
      return JSON.stringify(data, null, 2);
    } else if (format === 'csv') {
      // Convert sessions to CSV format
      const headers = ['Session ID', 'Start Time', 'End Time', 'Duration (s)', 'Items Detected', 'Items in Patient', 'Safety Alerts', 'Discrepancies'];
      const rows = data.allSessions.map(session => [
        session.id,
        session.startTime,
        session.endTime || 'N/A',
        session.duration || 0,
        session.itemsDetected || 0,
        session.itemsInPatient || 0,
        session.safetyAlerts || 0,
        session.discrepancies?.length || 0
      ]);
      
      return [headers, ...rows].map(row => 
        Array.isArray(row) ? row.map(cell => `"${cell}"`).join(',') : row
      ).join('\n');
    }
    
    return null;
  }, [getMetrics]);

  return {
    currentSession,
    metrics,
    startSession,
    endSession,
    logEvent,
    logItemDetection,
    logItemInPatient,
    logSafetyAlert,
    logDiscrepancy,
    getMetrics,
    clearMetrics,
    exportMetrics
  };
};