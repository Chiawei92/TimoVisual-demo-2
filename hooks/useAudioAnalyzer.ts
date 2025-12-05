import { useEffect, useRef, useState, useCallback } from 'react';

// Global cache for MediaElementSourceNodes to prevent "can only be used once" error.
const sourceCache = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>();

export const useAudioAnalyzer = () => {
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<AudioNode | null>(null);
  const outputGainRef = useRef<GainNode | null>(null);
  const [isReady, setIsReady] = useState(false);
  
  // Adaptive Gain State
  const maxVolumeRef = useRef<number>(100); 
  const gainRef = useRef<number>(1.0);

  // Transient Detection State (Previous Frames)
  const historyRef = useRef({
    bass: 0,
    high: 0,
    mid: 0
  });

  // Beat Detection State
  const beatRef = useRef({
    lastBeatTime: 0,
    intervals: [] as number[],
    threshold: 0,
    minThreshold: 80
  });

  const initAudio = useCallback(() => {
    if (audioContextRef.current) return;

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioContextClass();
    const analyser = ctx.createAnalyser();
    // Increased FFT size for better frequency resolution to separate Kick (40-100Hz) from Snare/Vocals
    analyser.fftSize = 512; 
    analyser.smoothingTimeConstant = 0.5; // Faster response for transients

    const outputGain = ctx.createGain();
    
    // Routing: Source -> Analyser -> OutputGain -> Destination
    analyser.connect(outputGain);
    outputGain.connect(ctx.destination);

    audioContextRef.current = ctx;
    analyserRef.current = analyser;
    outputGainRef.current = outputGain;
    setIsReady(true);
  }, []);

  const disconnectCurrentSource = useCallback(() => {
      if (sourceRef.current) {
          try {
            sourceRef.current.disconnect();
          } catch (e) {
            // Ignore
          }
          sourceRef.current = null;
      }
  }, []);

  const connectSource = useCallback((audioElement: HTMLAudioElement) => {
    if (!audioContextRef.current || !analyserRef.current) return;
    disconnectCurrentSource();
    let source = sourceCache.get(audioElement);
    if (!source) {
        source = audioContextRef.current.createMediaElementSource(audioElement);
        sourceCache.set(audioElement, source);
    }
    source.connect(analyserRef.current);
    sourceRef.current = source;
    if (outputGainRef.current) outputGainRef.current.gain.value = 1.0;
  }, [disconnectCurrentSource]);

  const connectAudioNode = useCallback((node: AudioNode) => {
    if (!audioContextRef.current || !analyserRef.current) return;
    disconnectCurrentSource();
    node.connect(analyserRef.current);
    sourceRef.current = node;
    if (outputGainRef.current) outputGainRef.current.gain.value = 1.0;
  }, [disconnectCurrentSource]);

  const connectMicrophone = useCallback(async () => {
      if (!audioContextRef.current || !analyserRef.current) return;
      disconnectCurrentSource();
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
            video: false
        });
        const source = audioContextRef.current.createMediaStreamSource(stream);
        source.connect(analyserRef.current);
        sourceRef.current = source;
        if (outputGainRef.current) outputGainRef.current.gain.value = 0.0;
        stream.getAudioTracks()[0].onended = () => disconnectCurrentSource();
        return true;
      } catch (err) {
          console.error("Microphone access failed:", err);
          alert("Microphone access denied or not available.");
          return false;
      }
  }, [disconnectCurrentSource]);

  const connectSystemAudio = useCallback(async () => {
    if (!audioContextRef.current || !analyserRef.current) return;
    disconnectCurrentSource();
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      if (stream.getAudioTracks().length === 0) {
          alert("No audio track detected! Did you check 'Share System Audio'?");
          stream.getTracks().forEach(t => t.stop());
          return false;
      }
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);
      sourceRef.current = source;
      if (outputGainRef.current) outputGainRef.current.gain.value = 0.0;
      stream.getVideoTracks()[0].onended = () => {
           disconnectCurrentSource();
           stream.getTracks().forEach(t => t.stop());
      };
      return true;
    } catch (err) {
        console.error("System audio capture failed:", err);
        alert("System audio capture failed. Requires 'display-capture' permission.");
        return false;
    }
  }, [disconnectCurrentSource]);

  const getFrequencyData = useCallback(() => {
    if (!analyserRef.current) return new Uint8Array(0);
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);
    return dataArray;
  }, []);

  const updateAutoGain = useCallback((data: Uint8Array) => {
      let frameMax = 0;
      // Scan full spectrum
      for(let i = 0; i < data.length; i++) {
          if (data[i] > frameMax) frameMax = data[i];
      }

      // Fast attack, slow release envelope follower for max volume
      if (frameMax > maxVolumeRef.current) {
          maxVolumeRef.current = frameMax;
      } else {
          maxVolumeRef.current *= 0.995; 
      }

      const safeMax = Math.max(maxVolumeRef.current, 50.0);
      // Normalize 255 against the safeMax
      const targetGain = 255.0 / safeMax;
      // Smooth the gain change
      gainRef.current += (targetGain - gainRef.current) * 0.1;
  }, []);

  const detectBpm = useCallback((bassEnergy: number) => {
    const now = performance.now();
    const state = beatRef.current;
    state.threshold *= 0.95;
    if (state.threshold < state.minThreshold) state.threshold = state.minThreshold;

    if (bassEnergy > state.threshold && bassEnergy > state.minThreshold) {
        if (now - state.lastBeatTime > 250) {
            const interval = now - state.lastBeatTime;
            state.lastBeatTime = now;
            if (interval > 300 && interval < 1000) {
                state.intervals.push(interval);
                if (state.intervals.length > 8) state.intervals.shift();
            }
        }
        state.threshold = bassEnergy * 1.1;
    }
    if (state.intervals.length >= 4) {
        const avg = state.intervals.reduce((a,b)=>a+b,0) / state.intervals.length;
        return Math.round(60000 / avg);
    }
    return null;
  }, []);
  
  // --- TRANSIENT DETECTION ---
  // Instead of just returning raw energy, we calculate flux (Current - Previous).
  // This isolates the "Hit" from the "Hum".

  const getBassEnergy = useCallback(() => {
    if (!analyserRef.current) return 0;
    const data = getFrequencyData();
    updateAutoGain(data);

    // Focus on Kick range (approx 40Hz - 120Hz)
    // FFT Size 512, Sample Rate 44.1k => Bin size ~86Hz.
    // Let's look at bins 0, 1, 2, 3.
    let sum = 0;
    const bassBins = 4; 
    for (let i = 0; i < bassBins; i++) sum += data[i];
    
    const currentAvg = (sum / bassBins) * gainRef.current;
    
    // 1. Calculate Kick Transient (The "Punch")
    // If current is significantly louder than last frame, it's a hit.
    const prevBass = historyRef.current.bass;
    let kickTransient = Math.max(0, currentAvg - prevBass);
    
    // Scale up the transient to make it snappy
    kickTransient = Math.min(kickTransient * 2.5, 255);
    
    // Update history
    historyRef.current.bass = currentAvg;
    
    // Return the Transient value primarily, but blend in a little raw bass
    // so it's not completely empty when there's just a sub-bass line.
    // 80% Transient (Punch), 20% Body.
    return (kickTransient * 0.8) + (currentAvg * 0.2);

  }, [getFrequencyData, updateAutoGain]);

  const getMidEnergy = useCallback(() => {
    if (!analyserRef.current) return 0;
    const data = getFrequencyData();
    // Mids: Vocals, Synths (approx 300Hz - 2kHz)
    // Bins 5 to 30
    let sum = 0;
    let count = 0;
    for (let i = 5; i < 30; i++) {
        sum += data[i];
        count++;
    }
    const currentAvg = count > 0 ? (sum / count) * gainRef.current : 0;
    
    // Smooth mids (we want atmosphere here, not necessarily transients)
    historyRef.current.mid = (historyRef.current.mid * 0.8) + (currentAvg * 0.2);
    return Math.min(historyRef.current.mid, 255);
  }, [getFrequencyData]);

  const getHighEnergy = useCallback(() => {
    if (!analyserRef.current) return 0;
    const data = getFrequencyData();
    
    // Highs: Hi-hats, Clicks (approx 4kHz+)
    // Bins 50+
    let sum = 0;
    let count = 0;
    for (let i = 50; i < Math.min(data.length, 150); i++) {
      sum += data[i];
      count++;
    }
    const currentAvg = count > 0 ? (sum / count) * gainRef.current * 1.8 : 0;
    
    // Transient Detection for Highs (Snare/Hat Hits)
    // We want to ignore steady noise (hiss) and capture the "Click"
    const prevHigh = historyRef.current.high;
    let highTransient = Math.max(0, currentAvg - prevHigh);
    
    historyRef.current.high = currentAvg;

    // Return mostly transient for highs to get that "sparkle"
    return Math.min(highTransient * 4.0, 255); 
  }, [getFrequencyData]);

  return {
    initAudio,
    connectSource,
    connectAudioNode,
    connectMicrophone,
    connectSystemAudio,
    getBassEnergy, // Now returns KICK-focused energy
    getMidEnergy,  // Returns smooth ATMOSPHERE
    getHighEnergy, // Returns SNAP-focused energy
    detectBpm,
    audioContext: audioContextRef.current,
    isReady
  };
};