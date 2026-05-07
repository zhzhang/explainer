"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface UseMicrophoneLevelOptions {
  /** Called once after PTT release with the recorded audio (WebM/Opus when supported). */
  onRecording?: (blob: Blob) => void;
}

export interface UseMicrophoneLevelResult {
  isActive: boolean;
  isStarting: boolean;
  /** Smoothed RMS amplitude in [0, 1]. */
  level: number;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
  toggle: () => void;
}

interface WindowWithWebkitAudio extends Window {
  webkitAudioContext?: typeof AudioContext;
}

function pickRecorderMimeType(): string | undefined {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
  ];
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const t of candidates) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return undefined;
}

/**
 * Opens the user's microphone, shows level via AnalyserNode, and optionally
 * records a clip for STT while the mic is held open.
 */
export function useMicrophoneLevel(
  opts: UseMicrophoneLevelOptions = {},
): UseMicrophoneLevelResult {
  const { onRecording } = opts;
  const onRecordingRef = useRef(onRecording);
  useEffect(() => {
    onRecordingRef.current = onRecording;
  }, [onRecording]);

  const [isActive, setIsActive] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const wantsActiveRef = useRef(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recorderChunksRef = useRef<Blob[]>([]);

  const teardownAudioGraph = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    try {
      sourceRef.current?.disconnect();
    } catch {
      // ignore
    }
    sourceRef.current = null;
    analyserRef.current = null;
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      void audioContextRef.current.close().catch(() => {});
    }
    audioContextRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    mediaRecorderRef.current = null;
    recorderChunksRef.current = [];
  }, []);

  const finalizeStop = useCallback(() => {
    teardownAudioGraph();
    setIsActive(false);
    setLevel(0);
  }, [teardownAudioGraph]);

  const stop = useCallback(() => {
    wantsActiveRef.current = false;

    const rec = mediaRecorderRef.current;
    if (rec && rec.state === "recording") {
      rec.addEventListener(
        "stop",
        () => {
          const mime = rec.mimeType || "audio/webm";
          const chunks = recorderChunksRef.current;
          recorderChunksRef.current = [];
          mediaRecorderRef.current = null;
          if (chunks.length > 0 && onRecordingRef.current) {
            const blob = new Blob(chunks, { type: mime });
            try {
              onRecordingRef.current(blob);
            } catch {
              // ignore consumer errors
            }
          }
          finalizeStop();
        },
        { once: true },
      );
      try {
        rec.stop();
      } catch {
        finalizeStop();
      }
      return;
    }

    finalizeStop();
  }, [finalizeStop]);

  const start = useCallback(async () => {
    wantsActiveRef.current = true;
    if (isActive || isStarting) return;
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setError("Microphone is not available in this browser.");
      return;
    }

    setIsStarting(true);
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      if (!wantsActiveRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      const win = window as WindowWithWebkitAudio;
      const AudioCtor = window.AudioContext ?? win.webkitAudioContext;
      if (!AudioCtor) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error("Web Audio API is not supported in this browser.");
      }

      const audioContext = new AudioCtor();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.6;
      source.connect(analyser);

      streamRef.current = stream;
      audioContextRef.current = audioContext;
      sourceRef.current = source;
      analyserRef.current = analyser;

      if (typeof MediaRecorder !== "undefined" && onRecordingRef.current) {
        recorderChunksRef.current = [];
        const mime = pickRecorderMimeType();
        try {
          const mr = mime
            ? new MediaRecorder(stream, { mimeType: mime })
            : new MediaRecorder(stream);
          mr.addEventListener("dataavailable", (ev) => {
            if (ev.data && ev.data.size > 0) {
              recorderChunksRef.current.push(ev.data);
            }
          });
          mr.start(100);
          mediaRecorderRef.current = mr;
        } catch {
          wantsActiveRef.current = false;
          setError("Recording is not supported in this browser.");
          finalizeStop();
          return;
        }
      }

      const buffer = new Uint8Array(analyser.fftSize);
      const tick = () => {
        const node = analyserRef.current;
        if (!node) return;
        node.getByteTimeDomainData(buffer);
        let sumSquares = 0;
        for (let i = 0; i < buffer.length; i++) {
          const sample = (buffer[i] - 128) / 128;
          sumSquares += sample * sample;
        }
        const rms = Math.sqrt(sumSquares / buffer.length);
        setLevel(rms);
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();

      setIsActive(true);
    } catch (err) {
      wantsActiveRef.current = false;
      finalizeStop();
      const message =
        err instanceof Error ? err.message : "Microphone permission denied.";
      setError(message);
    } finally {
      setIsStarting(false);
    }
  }, [isActive, isStarting, finalizeStop]);

  const toggle = useCallback(() => {
    if (isActive) {
      stop();
    } else {
      void start();
    }
  }, [isActive, start, stop]);

  useEffect(() => {
    return () => {
      wantsActiveRef.current = false;
      const rec = mediaRecorderRef.current;
      if (rec && rec.state === "recording") {
        try {
          rec.stop();
        } catch {
          // ignore
        }
      }
      finalizeStop();
    };
  }, [finalizeStop]);

  return { isActive, isStarting, level, error, start, stop, toggle };
}
