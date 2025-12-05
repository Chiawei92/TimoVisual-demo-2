import React, { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ShapeType, ParticleData } from '../../../types';
import { generateParticles, PARTICLE_COUNT } from '../../../utils/math';
import { PointShaderMaterial } from './shaders';

interface PointsProps {
  shape: ShapeType;
  palette: { p: string; s: string; a: string };
  intensities: { bass: number; high: number };
  acidSpeed: number; 
  acidPattern: 'silk' | 'blob';
  visualParams: { size: number; brightness: number };
  bpm: number;
  customData?: ParticleData | null;
  // Direct refs for physics performance
  energyRef: React.MutableRefObject<{ bass: number; mid: number; high: number; total: number }>;
  dropRef: React.MutableRefObject<number>;
}

const Points: React.FC<PointsProps> = ({ shape, palette, intensities, acidSpeed, acidPattern, visualParams, bpm, customData, energyRef, dropRef }) => {
  const pointsRef = useRef<THREE.Points>(null);
  const geometryRef = useRef<THREE.BufferGeometry>(null);
  
  // Calculate the required particle count based on the current mode
  const isCustom = (shape === 'image' || shape === 'model') && !!customData;
  const targetCount = isCustom && customData ? customData.count : PARTICLE_COUNT;

  // We use this key to force a re-mount ONLY if the particle count changes.
  const meshKey = useMemo(() => `particles-${targetCount}`, [targetCount]);

  // Buffers
  // FIX: Use useMemo instead of useState. useState lazy init only runs once on mount.
  // When targetCount changes, we need NEW arrays immediately.
  const positions = useMemo(() => new Float32Array(targetCount * 3), [targetCount]);
  const colors = useMemo(() => new Float32Array(targetCount * 3), [targetCount]);
  const normals = useMemo(() => new Float32Array(targetCount * 3), [targetCount]);
  const randoms = useMemo(() => new Float32Array(targetCount * 3), [targetCount]);

  // Target Ref for Morphing
  // Ensure this ref is resized SYNCHRONOUSLY before any effects run.
  const targetPositions = useRef<Float32Array>(new Float32Array(targetCount * 3));
  if (targetPositions.current.length !== targetCount * 3) {
      targetPositions.current = new Float32Array(targetCount * 3);
  }
  
  const flowOffsetRef = useRef(0);

  // Effect 1: Initialization of Static Attributes
  // Runs when arrays are recreated (targetCount changes)
  useEffect(() => {
      // Randoms
      for(let i=0; i<targetCount*3; i++) randoms[i] = (Math.random() - 0.5) * 2;
      
      // Colors (Default White)
      colors.fill(1);

      // Normals (Default Up)
      for(let i=0; i<targetCount*3; i+=3) { normals[i]=0; normals[i+1]=1; normals[i+2]=0; }
      
      // Positions (Start at 0)
      positions.fill(0);
      
      // Note: We rely on the <bufferAttribute> 'array' prop to update the geometry
      // when these memoized arrays change.
  }, [targetCount, randoms, colors, normals, positions]); 

  // Effect 2: Update Targets (Shape Logic)
  // This runs whenever the shape changes.
  useEffect(() => {
    let newTargets: Float32Array | null = null;
    let newColors: Float32Array | null = null;
    let newNormals: Float32Array | null = null;

    if (isCustom && customData) {
        newTargets = customData.positions;
        if (customData.colors) newColors = customData.colors;
        if (customData.normals) newNormals = customData.normals;
    } else {
        newTargets = generateParticles(shape, targetCount);
    }

    // SAFE SET: Target Positions
    if (newTargets) {
        if (targetPositions.current.length >= newTargets.length) {
            targetPositions.current.set(newTargets);
        } else {
            // Extreme fallback
            const len = Math.min(targetPositions.current.length, newTargets.length);
            for(let i=0; i<len; i++) targetPositions.current[i] = newTargets[i];
        }
    }
    
    // SAFE SET: Geometry Attributes
    if (geometryRef.current) {
        // Colors
        const colorAttr = geometryRef.current.attributes.aColor;
        if (colorAttr) {
            const destArray = colorAttr.array as Float32Array;
            if (newColors) {
                if (destArray.length >= newColors.length) {
                    destArray.set(newColors);
                    colorAttr.needsUpdate = true;
                }
            } else if (!isCustom) {
                // Reset to default white for standard shapes
                const defaultColors = new Float32Array(targetCount * 3).fill(1);
                if (destArray.length >= defaultColors.length) {
                    destArray.set(defaultColors);
                    colorAttr.needsUpdate = true;
                }
            }
        }

        // Normals
        const normalAttr = geometryRef.current.attributes.aNormal;
        if (normalAttr) {
            const destArray = normalAttr.array as Float32Array;
            if (newNormals) {
                 if (destArray.length >= newNormals.length) {
                     destArray.set(newNormals);
                     normalAttr.needsUpdate = true;
                 }
            } else if (!isCustom) {
                 // Reset normals to up-vector for standard shapes
                 const defaultNormals = new Float32Array(targetCount * 3);
                 for(let i=0; i<targetCount*3; i+=3) { defaultNormals[i]=0; defaultNormals[i+1]=1; defaultNormals[i+2]=0; }
                 if (destArray.length >= defaultNormals.length) {
                     destArray.set(defaultNormals);
                     normalAttr.needsUpdate = true;
                 }
            }
        }
    }
  }, [shape, customData, targetCount, isCustom]);

  const shaderArgs = useMemo(() => ({
    uniforms: THREE.UniformsUtils.clone(PointShaderMaterial.uniforms),
    vertexShader: PointShaderMaterial.vertexShader,
    fragmentShader: PointShaderMaterial.fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), []);

  useFrame((state, delta) => {
    if (!pointsRef.current || !geometryRef.current) return;

    const { clock } = state;
    const material = pointsRef.current.material as THREE.ShaderMaterial;
    
    if (!material.uniforms) return;

    material.uniforms.uTime.value = clock.getElapsedTime();
    
    // --- PHYSICS LOGIC ---
    const energy = energyRef.current;
    
    if (material.uniforms.uBass) material.uniforms.uBass.value = THREE.MathUtils.lerp(material.uniforms.uBass.value, energy.bass, 0.3);
    if (material.uniforms.uMid) material.uniforms.uMid.value = THREE.MathUtils.lerp(material.uniforms.uMid.value, energy.mid, 0.1);
    if (material.uniforms.uHigh) material.uniforms.uHigh.value = THREE.MathUtils.lerp(material.uniforms.uHigh.value, energy.high, 0.4);
    if (material.uniforms.uTotalEnergy) material.uniforms.uTotalEnergy.value = THREE.MathUtils.lerp(material.uniforms.uTotalEnergy.value, energy.total, 0.1);
    if (material.uniforms.uDrop) material.uniforms.uDrop.value = dropRef.current;
    
    // --- ACID FLOW ---
    if (material.uniforms.uTotalEnergy) {
        const currentTotalEnergy = material.uniforms.uTotalEnergy.value;
        const baseSpeed = acidSpeed * 0.002; 
        const musicBoost = (currentTotalEnergy / 255.0) * acidSpeed * 0.002; 
        
        flowOffsetRef.current += delta * (baseSpeed + musicBoost);
    }
    
    if (material.uniforms.uFlowOffset) material.uniforms.uFlowOffset.value = flowOffsetRef.current;
    if (material.uniforms.uAcidLevel) material.uniforms.uAcidLevel.value = acidSpeed;
    if (material.uniforms.uAcidPattern) material.uniforms.uAcidPattern.value = acidPattern === 'silk' ? 0.0 : 1.0;

    if (material.uniforms.uIntensityBass) material.uniforms.uIntensityBass.value = intensities.bass / 20.0; 
    if (material.uniforms.uIntensityHigh) material.uniforms.uIntensityHigh.value = intensities.high / 20.0;
    
    if (material.uniforms.uSize) material.uniforms.uSize.value = visualParams.size;
    if (material.uniforms.uBrightness) material.uniforms.uBrightness.value = visualParams.brightness;

    if (material.uniforms.uColor1 && material.uniforms.uColor1.value && material.uniforms.uColor2 && material.uniforms.uColor2.value && palette) {
        material.uniforms.uColor1.value.lerp(new THREE.Color(palette.p), 0.05);
        material.uniforms.uColor2.value.lerp(new THREE.Color(palette.s), 0.05);
    }
    
    if (material.uniforms.uIsWave) material.uniforms.uIsWave.value = shape === 'wave' ? 1.0 : 0.0;
    if (material.uniforms.uIsImage) material.uniforms.uIsImage.value = shape === 'image' ? 1.0 : 0.0;
    if (material.uniforms.uIsModel) material.uniforms.uIsModel.value = shape === 'model' ? 1.0 : 0.0;

    // --- MORPHING INTERPOLATION ---
    if (geometryRef.current.attributes.position) {
        const currentPos = geometryRef.current.attributes.position.array as Float32Array;
        const targets = targetPositions.current;
        const lerpFactor = 0.05; 
        let needsUpdate = false;

        const len = Math.min(currentPos.length, targets.length);
        
        for (let i = 0; i < len; i++) {
            const diff = targets[i] - currentPos[i];
            if (Math.abs(diff) > 0.01) {
                currentPos[i] += diff * lerpFactor;
                needsUpdate = true;
            } else {
                currentPos[i] = targets[i];
            }
        }
        if (needsUpdate) geometryRef.current.attributes.position.needsUpdate = true;
    }
    
    const effectiveBpm = Math.max(bpm, 60);
    const rotationSpeed = (effectiveBpm / 60) * 0.05; 
    if (shape !== 'image' && shape !== 'model') {
        pointsRef.current.rotation.y += rotationSpeed * delta;
    } else {
        pointsRef.current.rotation.y = Math.sin(clock.getElapsedTime() * 0.2) * 0.1;
    }
  });

  return (
    <points ref={pointsRef} key={meshKey}>
      <bufferGeometry ref={geometryRef}>
        <bufferAttribute
          attach="attributes-position"
          count={targetCount}
          array={positions}
          itemSize={3}
          usage={THREE.DynamicDrawUsage}
        />
        <bufferAttribute 
            attach="attributes-aRandomness"
            count={targetCount}
            array={randoms}
            itemSize={3}
        />
        <bufferAttribute 
            attach="attributes-aColor"
            count={targetCount}
            array={colors}
            itemSize={3}
        />
        <bufferAttribute 
            attach="attributes-aNormal"
            count={targetCount}
            array={normals}
            itemSize={3}
        />
      </bufferGeometry>
      <shaderMaterial args={[shaderArgs]} />
    </points>
  );
};

export default Points;