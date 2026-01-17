import { useState, useEffect, useRef } from 'react';

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
        
        if (dist < 100 && dist < minDist) {
          minDist = dist;
          bestMatchIndex = idx;
        }
      });
      
      if (bestMatchIndex !== -1) {
        matchedIndices.add(bestMatchIndex);
        const item = currentItems[bestMatchIndex];
        
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
          console.log("[useItemTracking] Zone change", newEvent);

          const key = item.type + ":" + item.id;
          if (detection.zone === "incision" && !inPatientRef.current.has(key)) {
            inPatientRef.current.add(key);
            console.log("[useItemTracking] Added to itemsInPatient", key);
          }
          if (detection.zone !== "incision" && inPatientRef.current.has(key)) {
            inPatientRef.current.delete(key);
            console.log("[useItemTracking] Removed from itemsInPatient", key);
          }
        }
        
        currentItems[bestMatchIndex] = {
          ...item,
          x: detection.x,
          y: detection.y,
          zone: detection.zone,
          lastSeen: timestamp
        };
      } else {
        const newItem = {
          id: Date.now() + Math.random(), // Temporary ID
          type: detection.type,
          x: detection.x,
          y: detection.y,
          zone: detection.zone,
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
