import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { OrbitControls } from '@react-three/drei';
import Particles from './components/Particles';
import Controls from './components/Controls';
import { useAudioAnalyzer } from './hooks/useAudioAnalyzer';
import { ShapeType, ParticleData, VisualMode } from './types';
import { getRandomPalette, processImageToParticles, process3DModel } from './utils/math';
import { TechnoSynth } from './utils/audioSynth';

const EditableText = () => {
  const [text, setText] = useState("");
  const [isHovered, setIsHovered] = useState(false);
  const [scale, setScale] = useState(1);

  const handleWheel = (e: React.WheelEvent) => {
      e.stopPropagation();
      const delta = -e.deltaY * 0.001;
      setScale(prev => Math.min(Math.max(0.5, prev + delta), 5.0));
  };

  return (
    <div 
        className="absolute top-6 right-6 md:right-10 z-30 flex flex-col items-end origin-top-right"
        style={{ transform: `scale(${scale})` }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onWheel={handleWheel}
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="EDIT TEXT"
        spellCheck={false}
        className={`
            w-[300px] bg-transparent text-right font-mono font-bold text-2xl tracking-tighter outline-none resize-none overflow-hidden
            transition-all duration-300
            ${!text && !isHovered ? 'opacity-0' : 'opacity-100'}
            text-white
            placeholder:text-white/20
            ${isHovered ? 'drop-shadow-[0_0_10px_rgba(255,255,255,0.8)]' : 'drop-shadow-none'}
        `}
        style={{ textShadow: isHovered ? '0 0 10px rgba(255,255,255,0.5)' : 'none' }}
        rows={Math.max(1, text.split('\n').length)}
      />
    </div>
  );
};

const App: React.FC = () => {
  const [visualMode, setVisualMode] = useState<VisualMode>('points');
  const [shape, setShape] = useState<ShapeType>('sphere');
  const [palette, setPalette] = useState(getRandomPalette());
  const [isPlaying, setIsPlaying] = useState(false);
  const [fileName, setFileName] = useState<string>('');
  
  // Intensity configuration - Reverted to 50/50 defaults
  const [intensities, setIntensities] = useState({ bass: 50, high: 50 });
  const [acidSpeed, setAcidSpeed] = useState(1.0);
  const [acidPattern, setAcidPattern] = useState<'silk' | 'blob'>('blob');
  
  // Global Visual Parameters
  const [visualParams, setVisualParams] = useState({ size: 4.0, brightness: 1.2 });

  const [bpm, setBpm] = useState<number>(120);
  const [features, setFeatures] = useState({ bass: true, high: true }); 
  
  const [mode, setMode] = useState<'file' | 'synth' | 'system'>('file');
  const [synthStyle, setSynthStyle] = useState<'minimal' | 'hard'>('hard');
  
  const [isDropActive, setIsDropActive] = useState(false);
  const [customParticles, setCustomParticles] = useState<ParticleData | null>(null);

  const audioRef = useRef<HTMLAudioElement>(new Audio());
  const synthRef = useRef<TechnoSynth | null>(null);
  const { initAudio, connectSource, connectAudioNode, connectMicrophone, connectSystemAudio, getBassEnergy, getMidEnergy, getHighEnergy, detectBpm, isReady, audioContext } = useAudioAnalyzer();
  const rafRef = useRef<number>(0);
  const lastBpmUpdate = useRef<number>(0);
  
  const energyState = useRef({ bass: 0, mid: 0, high: 0, total: 0 });
  const dropImpulse = useRef<number>(0);

  useEffect(() => {
    const audio = audioRef.current;
    audio.loop = true;
    audio.crossOrigin = "anonymous";

    const handleEnded = () => setIsPlaying(false);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('ended', handleEnded);
      audio.pause();
      if (synthRef.current) synthRef.current.stop();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);
  
  const triggerDrop = useCallback(() => {
      dropImpulse.current = 1.0;
      setPalette(getRandomPalette());
      setIsDropActive(true);
      setTimeout(() => setIsDropActive(false), 200);
  }, []);
  
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          const target = e.target as HTMLElement;
          if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') {
              return;
          }

          if (e.code === 'Space') {
              e.preventDefault(); 
              triggerDrop();
          }

          switch (e.key) {
              case '1': setShape('sphere'); break;
              case '2': setShape('cube'); break;
              case '3': setShape('torus'); break;
              case '4': setShape('spiral'); break;
              case '5': setShape('wave'); break;
          }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [triggerDrop, setShape]);

  useEffect(() => {
    const loop = () => {
      if (isPlaying && isReady) {
        const bass = features.bass ? getBassEnergy() : 0;
        const high = features.high ? getHighEnergy() : 0;
        const mid = getMidEnergy(); 

        energyState.current.bass = bass;
        energyState.current.mid = mid;
        energyState.current.high = high;
        energyState.current.total = (bass * 0.5 + mid * 0.3 + high * 0.2);
        
        if (mode !== 'synth') {
            const detectedBpm = detectBpm(bass);
            const now = performance.now();
            if (detectedBpm && now - lastBpmUpdate.current > 1000) {
                setBpm(prev => {
                    if (Math.abs(prev - detectedBpm) > 5) return detectedBpm;
                    return prev;
                });
                lastBpmUpdate.current = now;
            }
        }
      } else {
        energyState.current.bass = THREE.MathUtils.lerp(energyState.current.bass, 0, 0.1);
        energyState.current.mid = THREE.MathUtils.lerp(energyState.current.mid, 0, 0.1);
        energyState.current.high = THREE.MathUtils.lerp(energyState.current.high, 0, 0.1);
        energyState.current.total = THREE.MathUtils.lerp(energyState.current.total, 0, 0.1);
      }
      
      // Decay drop impulse
      if (dropImpulse.current > 0) {
         dropImpulse.current -= 0.02; 
         if (dropImpulse.current < 0) dropImpulse.current = 0;
      }
      
      rafRef.current = requestAnimationFrame(loop);
    };
    loop();
    return () => {
      if(rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying, isReady, getBassEnergy, getMidEnergy, getHighEnergy, detectBpm, features, mode]);

  const stopAll = () => {
      if (audioRef.current) audioRef.current.pause();
      if (synthRef.current) synthRef.current.stop();
      setIsPlaying(false);
  };

  const togglePlay = async () => {
    if (!isReady) initAudio();

    if (mode === 'synth') {
        if (isPlaying) {
            synthRef.current?.stop();
            setIsPlaying(false);
        } else {
            if (!synthRef.current && audioContext) {
                synthRef.current = new TechnoSynth(audioContext, synthStyle);
                connectAudioNode(synthRef.current.masterGain);
                setBpm(synthRef.current.tempo);
            }
            if (synthRef.current && synthRef.current.style !== synthStyle) {
                 synthRef.current.regenerate(synthStyle);
                 setBpm(synthRef.current.tempo);
            }
            synthRef.current?.play();
            setIsPlaying(true);
        }
        return;
    }
    
    if (mode === 'system') {
        setIsPlaying(!isPlaying);
        return;
    }

    const audio = audioRef.current;
    if (!audio.src) {
        alert("Please upload an audio file, use Mic/System Input, or click 'Generate' for a loop.");
        return;
    }

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      if (audioContext?.state === 'suspended') {
        await audioContext.resume();
      }
      try {
        connectSource(audio);
        await audio.play();
        setIsPlaying(true);
      } catch (e) {
        console.error("Audio play failed", e);
      }
    }
  };

  const handleFileChange = (file: File) => {
    stopAll();
    setMode('file');
    const url = URL.createObjectURL(file);
    audioRef.current.src = url;
    setFileName(file.name);
    setBpm(120); 
  };

  const handleImageUpload = async (file: File) => {
      try {
          const data = await processImageToParticles(file);
          setCustomParticles(data);
          setShape('image');
      } catch (e) {
          console.error("Failed to process image", e);
          alert("Failed to process image.");
      }
  };

  const handleModelUpload = async (file: File) => {
      try {
          const data = await process3DModel(file);
          setCustomParticles(data);
          setShape('model');
      } catch (e) {
          console.error("Failed to process model", e);
          alert("Failed to process 3D Model. Check console for details.");
      }
  };

  const handleGenerate = () => {
      if (!isReady) initAudio();
      stopAll();
      setMode('synth');
      setFileName(`Procedural (${synthStyle.toUpperCase()})`);
      
      setTimeout(() => {
          if (!audioContext) return;
          if (!synthRef.current) {
              synthRef.current = new TechnoSynth(audioContext, synthStyle);
              connectAudioNode(synthRef.current.masterGain);
          } else {
              synthRef.current.regenerate(synthStyle);
          }
          setBpm(synthRef.current.tempo);
          if (!synthRef.current.isPlaying) {
              synthRef.current.play();
          }
          setIsPlaying(true);
      }, 50);
  };
  
  const handleSystemAudio = async (type: 'mic' | 'sys') => {
      if (!isReady) initAudio();
      stopAll();
      setMode('system');
      setBpm(128); 
      
      let success = false;
      if (type === 'mic') {
          setFileName("Microphone / Line-In");
          success = await connectMicrophone();
      } else {
          setFileName("System Audio (Screen Share)");
          success = await connectSystemAudio();
      }

      if (success) {
          setIsPlaying(true);
      } else {
          setMode('file');
          setFileName('');
      }
  };

  const handlePaletteChange = () => {
    setPalette(getRandomPalette());
  };

  const toggleFeature = (f: 'bass' | 'high') => {
      setFeatures(prev => ({ ...prev, [f]: !prev[f] }));
  };

  const handleIntensityChange = (type: 'bass' | 'high', val: number) => {
      setIntensities(prev => ({ ...prev, [type]: val }));
  };

  const handleVisualParamChange = (param: 'size' | 'brightness', val: number) => {
      setVisualParams(prev => ({ ...prev, [param]: val }));
  };

  return (
    <div className="w-full h-screen bg-black text-white overflow-hidden relative">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_#1a1a1a_0%,_#000000_100%)] -z-10" />

      <Canvas camera={{ position: [0, 0, 12], fov: 45 }} dpr={[1, 2]}>
        <color attach="background" args={['#000000']} />
        
        <OrbitControls 
            enablePan={false} 
            enableZoom={true} 
            minDistance={5} 
            maxDistance={50}
            autoRotate={!isPlaying}
            autoRotateSpeed={0.5}
        />
        
        <Particles 
            visualMode={visualMode}
            shape={shape} 
            palette={palette} 
            energyRef={energyState}
            dropRef={dropImpulse}
            intensities={intensities}
            acidSpeed={acidSpeed} 
            acidPattern={acidPattern} 
            visualParams={visualParams}
            bpm={bpm}
            customData={customParticles}
        />
      </Canvas>

      <div className="absolute top-6 left-6 md:left-10 z-10 pointer-events-none select-none">
        <h1 className="text-2xl md:text-4xl font-bold font-mono tracking-tighter text-white mb-1">
          TECHNOGRID
        </h1>
        <p className="text-[10px] md:text-xs text-white/40 uppercase tracking-[0.2em]">
          Audio Reactive Topologies // v1.6
        </p>
      </div>

      <EditableText />

      <Controls 
        isPlaying={isPlaying}
        togglePlay={togglePlay}
        onFileChange={handleFileChange}
        currentShape={shape}
        setShape={setShape}
        changePalette={handlePaletteChange}
        fileName={fileName}
        onGenerate={handleGenerate}
        onSystemAudio={handleSystemAudio}
        intensities={intensities}
        setIntensity={handleIntensityChange}
        visualParams={visualParams}
        setVisualParam={handleVisualParamChange}
        bpm={bpm}
        features={features}
        toggleFeature={toggleFeature}
        synthStyle={synthStyle}
        setSynthStyle={setSynthStyle}
        onTriggerDrop={triggerDrop}
        isDropActive={isDropActive}
        onImageUpload={handleImageUpload}
        onModelUpload={handleModelUpload}
        acidSpeed={acidSpeed}
        setAcidSpeed={setAcidSpeed}
        acidPattern={acidPattern}
        setAcidPattern={setAcidPattern}
        visualMode={visualMode}
        setVisualMode={setVisualMode}
      />
    </div>
  );
};

export default App;