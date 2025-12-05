import React, { useRef, useState } from 'react';
import { ShapeType, VisualMode } from '../types';
import { Play, Pause, Upload, Music, Palette, Activity, Grid3X3, Circle, Component, Disc, Zap, Waves, Mic, Monitor, ArrowDownToLine, Image as ImageIcon, Box, Droplets, Aperture, Hexagon, Triangle, Network, Share2, ChevronUp, ChevronDown } from 'lucide-react';

interface AudioFeatures {
  bass: boolean;
  high: boolean;
}

interface Intensities {
    bass: number;
    high: number;
}

interface VisualParams {
    size: number;
    brightness: number;
}

interface ControlsProps {
  isPlaying: boolean;
  togglePlay: () => void;
  onFileChange: (file: File) => void;
  currentShape: ShapeType;
  setShape: (s: ShapeType) => void;
  changePalette: () => void;
  fileName?: string;
  onGenerate: () => void;
  onSystemAudio: (type: 'mic' | 'sys') => void;
  intensities: Intensities;
  setIntensity: (type: 'bass'|'high', val: number) => void;
  visualParams: VisualParams;
  setVisualParam: (param: 'size'|'brightness', val: number) => void;
  bpm: number;
  features: AudioFeatures;
  toggleFeature: (f: keyof AudioFeatures) => void;
  synthStyle: 'minimal' | 'hard';
  setSynthStyle: (s: 'minimal' | 'hard') => void;
  onTriggerDrop: () => void;
  isDropActive: boolean;
  onImageUpload: (file: File) => void;
  onModelUpload: (file: File) => void;
  acidSpeed: number;
  setAcidSpeed: (val: number) => void;
  acidPattern: 'silk' | 'blob';
  setAcidPattern: (p: 'silk' | 'blob') => void;
  visualMode: VisualMode;
  setVisualMode: (m: VisualMode) => void;
}

const Controls: React.FC<ControlsProps> = ({
  isPlaying,
  togglePlay,
  onFileChange,
  currentShape,
  setShape,
  changePalette,
  fileName,
  onGenerate,
  onSystemAudio,
  intensities,
  setIntensity,
  visualParams,
  setVisualParam,
  bpm,
  features,
  toggleFeature,
  synthStyle,
  setSynthStyle,
  onTriggerDrop,
  isDropActive,
  onImageUpload,
  onModelUpload,
  acidSpeed,
  setAcidSpeed,
  acidPattern,
  setAcidPattern,
  visualMode,
  setVisualMode
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const modelInputRef = useRef<HTMLInputElement>(null);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFileChange(e.target.files[0]);
    }
  };

  const handleImage = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          onImageUpload(e.target.files[0]);
      }
  };

  const handleModel = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          onModelUpload(e.target.files[0]);
      }
  };

  const shapesPoints: { id: ShapeType; icon: React.ReactNode; label: string }[] = [
    { id: 'sphere', icon: <Circle size={16} />, label: 'ORB' },
    { id: 'cube', icon: <Grid3X3 size={16} />, label: 'CUBE' },
    { id: 'torus', icon: <Disc size={16} />, label: 'RING' },
    { id: 'spiral', icon: <Activity size={16} />, label: 'HELIX' },
    { id: 'wave', icon: <Component size={16} />, label: 'WAVE' },
  ];

  const shapesLines: { id: ShapeType; icon: React.ReactNode; label: string }[] = [
      { id: 'network', icon: <Network size={16} />, label: 'NET' },
      { id: 'traces', icon: <Share2 size={16} />, label: 'TRACE' },
  ];

  const shapesSurfaces: { id: ShapeType; icon: React.ReactNode; label: string }[] = [
      { id: 'mesh', icon: <Hexagon size={16} />, label: 'MESH' },
      { id: 'shard', icon: <Triangle size={16} />, label: 'SHARD' },
  ];

  const renderShapeGrid = () => {
      let activeList = shapesPoints;
      if (visualMode === 'lines') activeList = shapesLines;
      if (visualMode === 'surfaces') activeList = shapesSurfaces;

      return (
          <div className="grid grid-cols-4 gap-2 mt-4">
              {activeList.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setShape(s.id)}
                    className={`aspect-square flex flex-col items-center justify-center gap-1 rounded-sm transition-all ${
                        currentShape === s.id 
                        ? 'bg-white/20 text-cyan-300 shadow-[inset_0_0_10px_rgba(0,255,255,0.2)]' 
                        : 'bg-white/5 text-white/40 hover:text-white hover:bg-white/10'
                    }`}
                    title={s.label}
                  >
                    {s.icon}
                    <span className="text-[9px] font-mono tracking-wider">{s.label}</span>
                  </button>
              ))}

              {visualMode === 'points' && (
                  <>
                    <button
                        onClick={() => imageInputRef.current?.click()}
                        className={`aspect-square flex flex-col items-center justify-center gap-1 rounded-sm transition-all ${
                            currentShape === 'image' 
                            ? 'bg-white/20 text-cyan-300' 
                            : 'bg-white/5 text-white/40 hover:text-white hover:bg-white/10'
                        }`}
                        title="Upload Image"
                    >
                        <ImageIcon size={16} />
                        <span className="text-[9px] font-mono tracking-wider">IMG</span>
                    </button>
                    <input type="file" accept="image/*" ref={imageInputRef} className="hidden" onChange={handleImage} />

                    <button
                        onClick={() => modelInputRef.current?.click()}
                        className={`aspect-square flex flex-col items-center justify-center gap-1 rounded-sm transition-all ${
                            currentShape === 'model' 
                            ? 'bg-white/20 text-cyan-300' 
                            : 'bg-white/5 text-white/40 hover:text-white hover:bg-white/10'
                        }`}
                        title="Upload 3D Model (GLB)"
                    >
                        <Box size={16} />
                        <span className="text-[9px] font-mono tracking-wider">3D</span>
                    </button>
                    <input type="file" accept=".glb,.gltf" ref={modelInputRef} className="hidden" onChange={handleModel} />
                  </>
              )}
          </div>
      );
  };

  return (
    <>
      {/* 1. Bottom Left: Music Controls */}
      <div className="absolute bottom-4 left-4 z-20 pointer-events-auto bg-black/80 backdrop-blur-md border border-white/10 p-3 rounded-sm min-w-[300px] shadow-[0_0_30px_rgba(0,0,0,0.5)] flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-cyan-400">
            <Music size={18} />
            <span className="font-mono text-xs uppercase tracking-widest opacity-80 truncate max-w-[180px]">
              {fileName || "Select Source"}
            </span>
          </div>
           <span className="font-mono text-xs text-white/50 bg-white/5 px-2 py-1 rounded">
             {Math.round(bpm)} BPM
           </span>
        </div>

        <div className="flex gap-2 h-8">
          <button
            onClick={togglePlay}
            className="flex-1 flex items-center justify-center gap-2 bg-white text-black font-bold font-mono uppercase hover:bg-cyan-400 hover:text-black transition-colors rounded-sm text-xs px-3"
          >
            {isPlaying ? <Pause size={14} /> : <Play size={14} />}
            {isPlaying ? 'PAUSE' : 'PLAY'}
          </button>
          
          <button
            onClick={onTriggerDrop}
            className={`px-3 flex items-center justify-center gap-2 font-bold font-mono text-xs border border-white/20 transition-all duration-75 rounded-sm
            ${isDropActive 
                ? 'bg-white text-black scale-95 shadow-[0_0_20px_rgba(255,255,255,0.8)]' 
                : 'text-white hover:bg-white/10'}`}
            title="Trigger Drop Effect (Spacebar)"
          >
             <ArrowDownToLine size={14} />
             DROP
          </button>

          <div className="w-[1px] bg-white/10 mx-1"></div>

          <div className="flex items-center bg-white/5 rounded-sm border border-white/10 overflow-hidden">
            <button 
                onClick={() => setSynthStyle(synthStyle === 'minimal' ? 'hard' : 'minimal')}
                className="px-2 h-full text-[10px] font-mono font-bold text-white/60 hover:text-white hover:bg-white/10 border-r border-white/10 w-12 transition-colors"
            >
                {synthStyle === 'minimal' ? 'MINI' : 'HARD'}
            </button>
            <button
                onClick={onGenerate}
                className="px-3 h-full flex items-center justify-center gap-2 text-cyan-400 hover:bg-cyan-500/10 transition-colors"
                title="Generate Techno Loop"
            >
                <Zap size={14} />
            </button>
          </div>
          
          <button
            onClick={() => onSystemAudio('sys')}
            className="px-3 flex items-center justify-center border border-white/20 text-white hover:bg-white/10 transition-colors rounded-sm"
            title="System Audio (Screen Share)"
          >
            <Monitor size={14} />
          </button>

          <button
            onClick={() => onSystemAudio('mic')}
            className="px-3 flex items-center justify-center border border-white/20 text-white hover:bg-white/10 transition-colors rounded-sm"
            title="Microphone / Line-in"
          >
            <Mic size={14} />
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-3 flex items-center justify-center border border-white/20 text-white hover:bg-white/10 transition-colors rounded-sm"
            title="Upload Audio"
          >
            <Upload size={14} />
          </button>
          <input type="file" accept="audio/*" ref={fileInputRef} className="hidden" onChange={handleFile} />
        </div>
      </div>

      {/* 2. Bottom Right Stack */}
      <div className="absolute bottom-4 right-4 z-20 pointer-events-auto flex flex-col gap-2 items-end">
        
        {/* Visual Library (Collapsible) */}
        <div className="bg-black/80 backdrop-blur-md border border-white/10 rounded-sm w-[280px] transition-all duration-300 overflow-hidden">
            <button 
                onClick={() => setIsLibraryOpen(!isLibraryOpen)}
                className="w-full flex items-center justify-between p-2 bg-white/5 hover:bg-white/10 text-[10px] font-mono text-white/50 uppercase tracking-widest cursor-pointer"
            >
                <span>Visual Library</span>
                {isLibraryOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
            </button>
            
            {isLibraryOpen && (
                <div className="p-3 border-t border-white/10 animate-in slide-in-from-bottom-2 fade-in duration-200">
                     {/* Mode Tabs */}
                     <div className="flex border-b border-white/10 mb-2">
                         {(['points', 'lines', 'surfaces'] as VisualMode[]).map(mode => (
                             <button
                                key={mode}
                                onClick={() => setVisualMode(mode)}
                                className={`flex-1 py-2 text-[10px] font-mono font-bold tracking-wider uppercase transition-colors
                                ${visualMode === mode ? 'text-cyan-400 bg-white/5' : 'text-white/30 hover:text-white hover:bg-white/5'}`}
                             >
                                 {mode}
                             </button>
                         ))}
                     </div>

                     {/* Shape Grid */}
                     {renderShapeGrid()}

                     {/* Specs Sliders (Moved from sidebar) */}
                     <div className="mt-4 pt-3 border-t border-white/10 flex flex-col gap-3">
                         <div className="flex flex-col gap-1">
                            <div className="flex justify-between font-mono text-[10px] text-white/40">
                                <span>SIZE</span>
                                <span>{visualParams.size.toFixed(1)}</span>
                            </div>
                            <input 
                                type="range" min="1" max="150" value={visualParams.size * 10}
                                onChange={(e) => setVisualParam('size', parseInt(e.target.value) / 10)}
                                className="w-full h-[2px] appearance-none cursor-pointer bg-white/10"
                            />
                        </div>
                        <div className="flex flex-col gap-1">
                            <div className="flex justify-between font-mono text-[10px] text-white/40">
                                <span>GLOW</span>
                                <span>{visualParams.brightness.toFixed(1)}</span>
                            </div>
                            <input 
                                type="range" min="0" max="300" value={visualParams.brightness * 100}
                                onChange={(e) => setVisualParam('brightness', parseInt(e.target.value) / 100)}
                                className="w-full h-[2px] appearance-none cursor-pointer bg-white/10"
                            />
                        </div>
                     </div>
                </div>
            )}
        </div>

        {/* Channel Mixer */}
        <div className="bg-black/80 backdrop-blur-md border border-white/10 p-2 rounded-sm flex flex-col gap-1 w-[280px]">
             <div className="text-[10px] font-mono text-white/30 uppercase tracking-widest text-center mb-1">Channels</div>
             <div className="flex items-center gap-2 h-8 bg-white/5 px-2 rounded-sm">
                <button onClick={() => toggleFeature('bass')} className={`w-16 flex items-center gap-1.5 font-mono text-[10px] font-bold ${features.bass ? 'text-cyan-300' : 'text-white/20'}`}><Activity size={12} /> BASS</button>
                <input type="range" min="0" max="100" value={intensities.bass} onChange={(e) => setIntensity('bass', parseInt(e.target.value))} disabled={!features.bass} className={`flex-1 h-[2px] appearance-none cursor-pointer outline-none ${features.bass ? 'bg-cyan-900/50' : 'bg-white/5'}`} />
             </div>
             <div className="flex items-center gap-2 h-8 bg-white/5 px-2 rounded-sm">
                <button onClick={() => toggleFeature('high')} className={`w-16 flex items-center gap-1.5 font-mono text-[10px] font-bold ${features.high ? 'text-fuchsia-300' : 'text-white/20'}`}><Zap size={12} /> HIGH</button>
                <input type="range" min="0" max="100" value={intensities.high} onChange={(e) => setIntensity('high', parseInt(e.target.value))} disabled={!features.high} className={`flex-1 h-[2px] appearance-none cursor-pointer outline-none ${features.high ? 'bg-fuchsia-900/50' : 'bg-white/5'}`} />
             </div>
        </div>

        {/* Color Engine */}
        <div className="bg-black/80 backdrop-blur-md border border-white/10 p-2 rounded-sm flex flex-col gap-1 w-[280px]">
            <div className="text-[10px] font-mono text-white/30 uppercase tracking-widest text-center mb-1">Color Engine</div>
            <div className="flex gap-2">
                <div className="flex-1 flex items-center gap-2 h-8 bg-white/5 px-2 rounded-sm">
                    <span className="w-16 flex items-center gap-1.5 font-mono text-[10px] font-bold text-yellow-300"><Droplets size={12} /> ACID</span>
                    <input type="range" min="0" max="50" value={acidSpeed * 10} onChange={(e) => setAcidSpeed(parseInt(e.target.value) / 10)} className="flex-1 h-[2px] appearance-none cursor-pointer outline-none bg-yellow-900/30" />
                </div>
                <button onClick={() => setAcidPattern(acidPattern === 'silk' ? 'blob' : 'silk')} className="w-10 flex items-center justify-center bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-sm hover:text-yellow-300">{acidPattern === 'silk' ? <Waves size={16} /> : <Aperture size={16} />}</button>
                <button onClick={changePalette} className="w-10 flex items-center justify-center bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-sm hover:text-fuchsia-400"><Palette size={16} /></button>
            </div>
        </div>
      </div>
    </>
  );
};

export default Controls;