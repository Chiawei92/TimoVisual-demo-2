import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import '../types';

const StarField = () => {
  const points = useRef<THREE.Points>(null);

  const count = 2000; // Reduced count slightly as they are more visible now
  const depth = -200; // Fixed distance from camera

  const [positions, sizes, randoms] = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const randoms = new Float32Array(count);

    // Calculate frustum coverage at depth 200
    // At FOV 45, height is approx 0.82 * depth. Width depends on aspect, assume wide.
    const widthSpread = 400; 
    const heightSpread = 250;

    for (let i = 0; i < count; i++) {
      // Planar distribution (Wall of stars) instead of Sphere
      const x = (Math.random() - 0.5) * widthSpread;
      const y = (Math.random() - 0.5) * heightSpread;
      const z = depth;

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      // Larger base sizes
      sizes[i] = 1.5 + Math.random() * 3.0; 
      
      // Random phase for twinkling
      randoms[i] = Math.random() * 10.0;
    }

    return [positions, sizes, randoms];
  }, []);

  const shaderArgs = useMemo(() => ({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
    },
    vertexShader: `
      uniform float uTime;
      uniform float uPixelRatio;
      attribute float aSize;
      attribute float aRandom;
      varying float vAlpha;

      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        
        // Simplified size calculation: Fixed depth means we don't need intense perspective division
        // Just scaling by pixel ratio
        gl_PointSize = aSize * uPixelRatio;
        
        // Twinkle logic
        float twinkle = sin(uTime * 3.0 + aRandom); // Faster twinkle
        vAlpha = 0.6 + 0.4 * twinkle; // Brighter range (0.6 to 1.0)
      }
    `,
    fragmentShader: `
      varying float vAlpha;

      void main() {
        // Sharp circle with soft edge
        vec2 uv = gl_PointCoord - 0.5;
        float d = length(uv);
        if (d > 0.5) discard;
        
        // Glow gradient
        float glow = 1.0 - smoothstep(0.1, 0.5, d);
        
        gl_FragColor = vec4(1.0, 1.0, 1.0, vAlpha * glow);
      }
    `,
    transparent: true,
    depthWrite: false, 
    blending: THREE.AdditiveBlending,
  }), []);

  useFrame((state) => {
    if (points.current) {
      // Lock position and rotation to the camera
      // effectively making this a "Heads-Up Display" in 3D space background
      points.current.position.copy(state.camera.position);
      points.current.quaternion.copy(state.camera.quaternion);

      (points.current.material as THREE.ShaderMaterial).uniforms.uTime.value = state.clock.getElapsedTime();
    }
  });

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-aSize"
          count={count}
          array={sizes}
          itemSize={1}
        />
        <bufferAttribute
          attach="attributes-aRandom"
          count={count}
          array={randoms}
          itemSize={1}
        />
      </bufferGeometry>
      <shaderMaterial args={[shaderArgs]} />
    </points>
  );
};

export default StarField;