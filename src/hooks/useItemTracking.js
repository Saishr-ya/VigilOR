import { useState, useEffect, useRef } from 'react';

const ZONE_STABLE_FRAMES = 2;

export const useItemTracking = (analysisResult) => {
  const [trackedItems, setTrackedItems] = useState([]);
  const [events, setEvents] = useState([]);
  const [counts, setCounts] = useState({ tray: 0, incision: 0 });

  const itemsRef = useRef([]);
  const inPatientRef = useRef(new Set());

  useEffect(() => {
    if (!analysisResult || !analysisResult.items) {
      return;
    }

    console.log("[useItemTracking] New analysis result", analysisResult);

    const timestamp = Date.now();
    const newDetections = analysisResult.items;
    console.log("[useItemTracking] Detections count", newDetections.length);
    
    let currentItems = [...itemsRef.current];
    
    const matchedIndices = new Set();
    
    newDetections.forEach(detection => {
      let bestMatchIndex = -1;
      let minDist = Infinity;
      
      currentItems.forEach((item, idx) => {
        if (matchedIndices.has(idx)) {
          return;
        }
        if (item.type !== detection.type) {
          return;
        }

        const dist = Math.sqrt(
          Math.pow(item.x - detection.x, 2) + 
          Math.pow(item.y - detection.y, 2)
        );
        
        // Threshold for normalized coordinates (0.1 = 10% of screen)
        if (dist < 0.1 && dist < minDist) {
          minDist = dist;
          bestMatchIndex = idx;
        }
      });
      
      if (bestMatchIndex !== -1) {
        matchedIndices.add(bestMatchIndex);
        const item = currentItems[bestMatchIndex];

        const nextZone = detection.zone;
        const prevStableZone = item.stableZone != null ? item.stableZone : item.zone;

        let stableZone = prevStableZone;
        let pendingZone = item.pendingZone != null ? item.pendingZone : prevStableZone;
        let pendingCount = item.pendingCount != null ? item.pendingCount : 0;

        if (nextZone === stableZone) {
          pendingZone = stableZone;
          pendingCount = 0;
        } else {
          if (nextZone === pendingZone) {
            pendingCount += 1;
          } else {
            pendingZone = nextZone;
            pendingCount = 1;
          }

          if (pendingCount >= ZONE_STABLE_FRAMES && nextZone !== stableZone) {
            const eventType = nextZone === 'incision' ? 'entry' : 'exit';
            const newEvent = {
              id: Date.now() + Math.random(),
              timestamp: Date.now(),
              type: eventType,
              itemType: item.type,
              from: stableZone,
              to: nextZone
            };
            setEvents(prev => [newEvent, ...prev]);
            console.log("[useItemTracking] Zone change", newEvent);

            const key = item.type + ":" + item.id;
            if (nextZone === "incision" && !inPatientRef.current.has(key)) {
              inPatientRef.current.add(key);
              console.log("[useItemTracking] Added to itemsInPatient", key);
            }
            if (nextZone !== "incision" && inPatientRef.current.has(key)) {
              inPatientRef.current.delete(key);
              console.log("[useItemTracking] Removed from itemsInPatient", key);
            }

            stableZone = nextZone;
            pendingZone = nextZone;
            pendingCount = 0;
          }
        }

        currentItems[bestMatchIndex] = {
          ...item,
          x: detection.x,
          y: detection.y,
          zone: stableZone,
          stableZone,
          pendingZone,
          pendingCount,
          lastSeen: timestamp
        };
      } else {
        const initialZone = detection.zone;
        const newItem = {
          id: Date.now() + Math.random(),
          type: detection.type,
          x: detection.x,
          y: detection.y,
          zone: initialZone,
          stableZone: initialZone,
          pendingZone: initialZone,
          pendingCount: 0,
          lastSeen: timestamp,
          firstSeen: timestamp
        };

        currentItems.push(newItem);
        console.log("[useItemTracking] New item detected", newItem);

        const key = newItem.type + ":" + newItem.id;
        if (newItem.zone === "incision") {
          inPatientRef.current.add(key);
          console.log("[useItemTracking] Added to itemsInPatient", key);
        }
      }
    });
    
    currentItems = currentItems.filter(item => {
      return (timestamp - item.lastSeen) < 3000;
    });
    
    // Update ref and state
    itemsRef.current = currentItems;
    setTrackedItems(currentItems);
    
    const newCounts = currentItems.reduce((acc, item) => {
      if (item.zone === 'tray') acc.tray++;
      if (item.zone === 'incision') acc.incision++;
      return acc;
    }, { tray: 0, incision: 0 });
    
    setCounts(newCounts);

  }, [analysisResult]);

  return { trackedItems, events, counts };
};
