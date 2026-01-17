import { useState, useEffect, useRef } from 'react';

export const useItemTracking = (analysisResult) => {
  const [trackedItems, setTrackedItems] = useState([]);
  const [events, setEvents] = useState([]);
  const [counts, setCounts] = useState({ tray: 0, incision: 0 });

  // Refs to keep track of state inside effect without triggering re-renders loop
  const itemsRef = useRef([]);

  useEffect(() => {
    if (!analysisResult || !analysisResult.items) return;

    const timestamp = Date.now();
    const newDetections = analysisResult.items;
    
    // Deep copy current items
    let currentItems = [...itemsRef.current];
    
    // 1. Match new detections to existing items
    // Simple greedy matching: find closest item of same type
    const matchedIndices = new Set();
    
    newDetections.forEach(detection => {
      let bestMatchIndex = -1;
      let minDist = Infinity;
      
      currentItems.forEach((item, idx) => {
        if (matchedIndices.has(idx)) return; // Already matched
        if (item.type !== detection.type) return; // Type mismatch
        
        // Calculate distance
        const dist = Math.sqrt(
          Math.pow(item.x - detection.x, 2) + 
          Math.pow(item.y - detection.y, 2)
        );
        
        // Threshold for matching (e.g., 100 pixels)
        if (dist < 100 && dist < minDist) {
          minDist = dist;
          bestMatchIndex = idx;
        }
      });
      
      if (bestMatchIndex !== -1) {
        // Update matched item
        matchedIndices.add(bestMatchIndex);
        const item = currentItems[bestMatchIndex];
        
        // Check for zone change
        if (item.zone !== detection.zone) {
          const eventType = detection.zone === 'incision' ? 'entry' : 'exit';
          const newEvent = {
            id: Date.now() + Math.random(),
            timestamp: Date.now(),
            type: eventType,
            itemType: item.type,
            from: item.zone,
            to: detection.zone
          };
          setEvents(prev => [newEvent, ...prev]);
        }
        
        currentItems[bestMatchIndex] = {
          ...item,
          x: detection.x,
          y: detection.y,
          zone: detection.zone,
          lastSeen: timestamp
        };
      } else {
        // New item detected
        currentItems.push({
          id: Date.now() + Math.random(), // Temporary ID
          type: detection.type,
          x: detection.x,
          y: detection.y,
          zone: detection.zone,
          lastSeen: timestamp,
          firstSeen: timestamp
        });
      }
    });
    
    // 2. Prune old items (Grace period: 3 seconds)
    // Filter out items that haven't been seen in 3000ms
    currentItems = currentItems.filter(item => {
      return (timestamp - item.lastSeen) < 3000;
    });
    
    // Update ref and state
    itemsRef.current = currentItems;
    setTrackedItems(currentItems);
    
    // Update counts based on tracked items (which includes grace period items)
    const newCounts = currentItems.reduce((acc, item) => {
      if (item.zone === 'tray') acc.tray++;
      if (item.zone === 'incision') acc.incision++;
      return acc;
    }, { tray: 0, incision: 0 });
    
    setCounts(newCounts);

  }, [analysisResult]);

  return { trackedItems, events, counts };
};
