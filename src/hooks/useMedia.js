import { useRef, useState, useCallback, useEffect } from "react";

export function useMedia() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const objectUrlRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);

  const [videoSource, setVideoSource] = useState(null); // null | 'webcam' | 'file' | 'blank'
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  const stopCurrentStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  const startWebcam = useCallback(async () => {
    stopCurrentStream();
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.onloadedmetadata = () => {
        setIsVideoReady(true);
        videoRef.current?.play().catch(() => {});
      };
    }
    setVideoSource("webcam");
  }, [stopCurrentStream]);

  const loadVideoFile = useCallback((file) => {
    stopCurrentStream();
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.src = url;
      videoRef.current.loop = true;
      videoRef.current.onloadedmetadata = () => {
        setIsVideoReady(true);
        videoRef.current?.play().catch(() => {});
      };
    }
    setVideoSource("file");
  }, [stopCurrentStream]);

  const startBlank = useCallback(() => {
    stopCurrentStream();
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 480;
    canvas.getContext("2d").fillRect(0, 0, 640, 480);
    const stream = canvas.captureStream(1);
    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.onloadedmetadata = () => {
        setIsVideoReady(true);
        videoRef.current?.play().catch(() => {});
      };
      setTimeout(() => setIsVideoReady(true), 300);
    }
    setVideoSource("blank");
  }, [stopCurrentStream]);

  const captureFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return null;
    const w = video.videoWidth || 640;
    const h = video.videoHeight || 480;
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return null;
    const scale = Math.min(1, 960 / Math.max(w, h));
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.8);
  }, []);

  const startRecording = useCallback(async () => {
    chunksRef.current = [];
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    recorderRef.current = recorder;
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.start();
    setIsRecording(true);
  }, []);

  // Float32Array (PCM 16kHz mono) を返す — Gemma 4 audio encoder 用
  const stopRecording = useCallback(
    () =>
      new Promise((resolve) => {
        const recorder = recorderRef.current;
        if (!recorder || recorder.state === "inactive") {
          setIsRecording(false);
          resolve(null);
          return;
        }
        recorder.onstop = async () => {
          recorder.stream.getTracks().forEach((t) => t.stop());
          setIsRecording(false);
          const blob = new Blob(chunksRef.current, { type: "audio/webm" });
          try {
            const ab = await blob.arrayBuffer();
            const ctx = new AudioContext({ sampleRate: 16000 });
            const audioBuffer = await ctx.decodeAudioData(ab);
            await ctx.close();
            resolve(audioBuffer.getChannelData(0)); // Float32Array
          } catch (e) {
            console.error("Audio decode error:", e);
            resolve(null);
          }
        };
        recorder.stop();
      }),
    []
  );

  return {
    videoRef,
    canvasRef,
    videoSource,
    isVideoReady,
    isRecording,
    startWebcam,
    loadVideoFile,
    startBlank,
    captureFrame,
    startRecording,
    stopRecording,
  };
}
