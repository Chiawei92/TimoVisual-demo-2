import React from 'react';
import { ShapeType, ParticleData, VisualMode } from '../types';
import Points from './visuals/points/Points';
import Lines from './visuals/lines/Lines';
import Surfaces from './visuals/surfaces/Surfaces';

interface ParticlesProps {
  visualMode?: VisualMode;
  shape: ShapeType;
  palette: { p: string; s: string; a: string };
  intensities: { bass: number; high: number };
  acidSpeed: number; 
  acidPattern: 'silk' | 'blob';
  visualParams: { size: number; brightness: number };
  bpm: number;
  customData?: ParticleData | null;
  energyRef: React.MutableRefObject<{ bass: number; mid: number; high: number; total: number }>;
  dropRef: React.MutableRefObject<number>;
}

const Particles: React.FC<ParticlesProps> = (props) => {
  const mode = props.visualMode || 'points';

  // Dispatcher logic
  switch (mode) {
      case 'points':
          return <Points {...props} />;
      case 'lines':
          return <Lines />;
      case 'surfaces':
          return <Surfaces />;
      default:
          return <Points {...props} />;
  }
};

export default Particles;