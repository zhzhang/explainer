"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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

/**
 * Opens the user's microphone and exposes a continuously-updated audio level.
 *
 * The audio samples themselves are discarded — only an RMS level is read out
 * of an AnalyserNode for visualization. Nothing is recorded or transmitted.
 */
export function useMicrophoneLevel(): UseMicrophoneLevelResult {
  const [isActive, setIsActive] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);

  const teardown = useCallback(() => {
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
  }, []);

  const stop = useCallback(() => {
    teardown();
    setIsActive(false);
    setLevel(0);
  }, [teardown]);

  const start = useCallback(async () => {
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
      teardown();
      const message =
        err instanceof Error ? err.message : "Microphone permission denied.";
      setError(message);
      setIsActive(false);
      setLevel(0);
    } finally {
      setIsStarting(false);
    }
  }, [isActive, isStarting, teardown]);

  const toggle = useCallback(() => {
    if (isActive) {
      stop();
    } else {
      void start();
    }
  }, [isActive, start, stop]);

  useEffect(() => {
    return () => {
      teardown();
    };
  }, [teardown]);

  return { isActive, isStarting, level, error, start, stop, toggle };
}
