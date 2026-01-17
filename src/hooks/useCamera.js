import { useState, useEffect, useRef, useCallback } from 'react';

export const useCamera = (interval = 2000) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [stream, setStream] = useState(null);
  const [error, setError] = useState(null);
  const [frame, setFrame] = useState(null);

  useEffect(() => {
    const startCamera = async () => {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'environment' } 
        });
        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      } catch (err) {
        setError(err);
        console.error("Error accessing camera:", err);
      }
    };

    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const captureFrame = useCallback(() => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      // Set canvas dimensions to match video
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Convert to base64
      const base64 = canvas.toDataURL('image/jpeg');
      setFrame(base64);
      return base64;
    }
    return null;
  }, []);

  // Setup interval for capturing frames
  useEffect(() => {
    const intervalId = setInterval(() => {
      captureFrame();
    }, interval);

    return () => clearInterval(intervalId);
  }, [interval, captureFrame]);

  return { videoRef, canvasRef, error, frame, captureFrame };
};
