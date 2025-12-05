import { Vector3 } from 'three';
import React from 'react';

export type VisualMode = 'points' | 'lines' | 'surfaces';

export type ShapeType = 
  // Points
  'sphere' | 'cube' | 'torus' | 'spiral' | 'wave' | 'image' | 'model' |
  // Lines (Placeholders)
  'network' | 'traces' |
  // Surfaces (Placeholders)
  'mesh' | 'shard';

export interface VisualizerState {
  isPlaying: boolean;
  audioContext: AudioContext | null;
  analyser: AnalyserNode | null;
  dataArray: Uint8Array | null;
  volume: number;
}

export interface ColorPalette {
  primary: string;
  secondary: string;
  accent: string;
}

export interface ParticleData {
  positions: Float32Array;
  colors?: Float32Array; // Optional RGB colors for image/model mode
  normals?: Float32Array; // Optional Normals for 3D model breathing
  count: number;
}

// Augment global JSX namespace
declare global {
  namespace JSX {
    interface IntrinsicElements {
      points: any;
      bufferGeometry: any;
      bufferAttribute: any;
      shaderMaterial: any;
      color: any;
    }
  }
}

// Augment React module's JSX namespace
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      points: any;
      bufferGeometry: any;
      bufferAttribute: any;
      shaderMaterial: any;
      color: any;
    }
  }
}
