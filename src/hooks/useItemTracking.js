import { useState, useEffect, useRef } from 'react';

const MATCH_THRESHOLD = 0.08;
const MERGE_THRESHOLD = 0.08;
const ZONE_STABLE_FRAMES = 2;
const ITEM_STALE_MS = 2000;

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
    let newDetections = analysisResult.items || [];
    console.log("[useItemTracking] Detections count", newDetections.length);
    newDetections = newDetections.filter((detection, index) => {
      return !newDetections.slice(0, index).some(other => {
        if (other.type !== detection.type) {
          return false;
        }
        const dist = Math.sqrt(
          Math.pow(other.x - detection.x, 2) +
          Math.pow(other.y - detection.y, 2)
        );
        return dist < 0.08;
      });
    });
    
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
        
        if (dist < MATCH_THRESHOLD && dist < minDist) {
          minDist = dist;
          bestMatchIndex = idx;
        }
      });

      if (bestMatchIndex === -1) {
        let fallbackIndex = -1;
        let fallbackDist = Infinity;
        currentItems.forEach((item, idx) => {
          if (matchedIndices.has(idx)) {
            return;
          }
          if (item.type !== detection.type) {
            return;
          }
          if ((timestamp - item.lastSeen) >= 500) {
            return;
          }
          const dx = item.x - detection.x;
          const dy = item.y - detection.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 0.15 && d < fallbackDist) {
            fallbackDist = d;
            fallbackIndex = idx;
          }
        });
        if (fallbackIndex !== -1) {
          bestMatchIndex = fallbackIndex;
        }
      }
      
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
            // Determine effective source zone (handling null transitions)
            const effectiveFrom = stableZone || item.lastNonNullZone;
            
            // Only log if we are entering a valid zone (tray or incision)
            // and coming from a different valid zone (or effective one)
            if (nextZone && effectiveFrom && nextZone !== effectiveFrom) {
                const eventType = nextZone === 'incision' ? 'entry' : 'exit';
                const newEvent = {
                  id: Date.now() + Math.random(),
                  timestamp: Date.now(),
                  type: eventType,
                  itemType: item.type,
                  from: effectiveFrom,
                  to: nextZone
                };
                setEvents(prev => [newEvent, ...prev]);
                console.log("[useItemTracking] Zone change", newEvent);
            }

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

        // Update lastNonNullZone if we have a valid stable zone
        const lastNonNullZone = stableZone || item.lastNonNullZone;

        currentItems[bestMatchIndex] = {
          ...item,
          x: detection.x,
          y: detection.y,
          zone: stableZone,
          stableZone,
          pendingZone,
          pendingCount,
          lastSeen: timestamp,
          lastNonNullZone
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
          firstSeen: timestamp,
          lastNonNullZone: initialZone
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
    
    const mergedItems = [];
    currentItems
      .sort((a, b) => b.lastSeen - a.lastSeen)
      .forEach(item => {
        const exists = mergedItems.some(other => {
          if (other.type !== item.type) {
            return false;
          }
          const dx = other.x - item.x;
          const dy = other.y - item.y;
          return Math.sqrt(dx * dx + dy * dy) < MERGE_THRESHOLD;
        });
        if (!exists) {
          mergedItems.push(item);
        }
      });
    
    currentItems = mergedItems.filter(item => {
      return (timestamp - item.lastSeen) < ITEM_STALE_MS;
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
