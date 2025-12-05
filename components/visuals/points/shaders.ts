import * as THREE from 'three';

export const PointShaderMaterial = {
  uniforms: {
    uTime: { value: 0 },
    uFlowOffset: { value: 0 }, 
    uBass: { value: 0 },
    uMid: { value: 0 }, 
    uHigh: { value: 0 },
    uTotalEnergy: { value: 0 }, 
    uDrop: { value: 0.0 }, 
    uIntensityBass: { value: 1.0 },
    uIntensityHigh: { value: 1.0 },
    uAcidLevel: { value: 0.0 }, 
    uAcidPattern: { value: 0.0 }, // 0.0 = Silk, 1.0 = Blob
    uColor1: { value: new THREE.Color() },
    uColor2: { value: new THREE.Color() },
    uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
    uSize: { value: 4.0 },
    uBrightness: { value: 1.0 },
    uIsWave: { value: 0.0 },
    uIsImage: { value: 0.0 },
    uIsModel: { value: 0.0 },
  },
  vertexShader: `
    uniform float uTime;
    uniform float uBass; 
    uniform float uMid; 
    uniform float uHigh; 
    uniform float uIntensityBass;
    uniform float uIntensityHigh;
    uniform float uPixelRatio;
    uniform float uSize;
    uniform float uIsWave;
    uniform float uIsImage;
    uniform float uIsModel;
    uniform float uDrop;
    
    attribute vec3 aRandomness;
    attribute vec3 aColor; 
    attribute vec3 aNormal; 
    
    varying vec3 vPosition;
    varying float vDistance;
    varying float vHigh;
    varying float vMid;
    varying float vBass;
    varying float vIntensityHigh;
    varying float vDrop;
    varying float vIsHighGroup;
    varying vec3 vColor;

    void main() {
      vec3 pos = position;
      
      // --- Group Selection ---
      float isHighGroup = step(0.4, aRandomness.y); 
      float isBassGroup = 1.0 - isHighGroup;

      // --- DIRECTION ---
      vec3 radialDir = normalize(pos);
      if (length(pos) < 0.001) radialDir = vec3(0.0, 1.0, 0.0);
      
      vec3 direction = radialDir;
      if (uIsWave > 0.5) direction = vec3(0.0, 1.0, 0.0);
      if (uIsImage > 0.5) direction = vec3(0.0, 0.0, 1.0);
      if (uIsModel > 0.5) direction = normalize(aNormal);

      // --- PHYSICS ---
      float randomWeight = mix(0.5, 3.0, abs(aRandomness.x));
      
      float bassForce = max(0.0, uBass - 10.0); 
      float bassDisplacement = bassForce * 0.03 * uIntensityBass;
      // Atmosphere breath (subtle)
      float atmosphere = sin(uTime * 0.5) * 0.1 + (uMid * 0.005);
      float dropExpansion = uDrop * 2.0 * randomWeight;

      float totalPulse = (bassDisplacement + atmosphere + dropExpansion) * randomWeight;

      vec3 bassOffset = direction * totalPulse * isBassGroup;
      
      // High particles follow bass trend when idle
      vec3 highIdleOffset = direction * totalPulse * 0.3 * isHighGroup;

      // High Spikes (Active)
      float highRandomWeight = mix(0.5, 6.0, abs(aRandomness.y));
      float highForce = max(0.0, uHigh - 15.0);
      float highDisplacement = highForce * 0.02 * uIntensityHigh;
      
      vec3 highActiveOffset = direction * highDisplacement * highRandomWeight * isHighGroup;

      vec3 finalPos = pos + bassOffset + highIdleOffset + highActiveOffset;
      
      vec4 modelPosition = modelMatrix * vec4(finalPos, 1.0);
      vec4 viewPosition = viewMatrix * modelPosition;
      vec4 projectedPosition = projectionMatrix * viewPosition;

      gl_Position = projectedPosition;
      
      gl_PointSize = uSize * uPixelRatio;
      gl_PointSize *= (10.0 / -viewPosition.z);
      gl_PointSize *= (1.0 + uDrop);

      vPosition = pos;
      vDistance = distance(pos, vec3(0.0));
      vHigh = highForce;
      vMid = uMid; 
      vBass = bassForce;
      vIntensityHigh = uIntensityHigh;
      vDrop = uDrop;
      vIsHighGroup = isHighGroup;
      vColor = aColor;
    }
  `,
  fragmentShader: `
    uniform vec3 uColor1;
    uniform vec3 uColor2;
    uniform float uTime;
    uniform float uFlowOffset;
    uniform float uIsImage;
    uniform float uIsModel;
    uniform float uIsWave;
    uniform float uBrightness;
    uniform float uTotalEnergy;
    uniform float uAcidLevel; // 0.0 = OFF, >0.0 = ON
    uniform float uAcidPattern; // 0.0 = Silk, 1.0 = Blob

    varying vec3 vPosition;
    varying float vDistance;
    varying float vHigh;
    varying float vMid;
    varying float vBass;
    varying float vIntensityHigh;
    varying float vDrop;
    varying float vIsHighGroup;
    varying vec3 vColor;

    // --- STANDARD NOISE ---
    vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }

    float snoise(vec2 v){
      const vec4 C = vec4(0.211324865405187, 0.366025403784439,
               -0.577350269189626, 0.024390243902439);
      vec2 i  = floor(v + dot(v, C.yy) );
      vec2 x0 = v -   i + dot(i, C.xx);
      vec2 i1;
      i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
      vec4 x12 = x0.xyxy + C.xxzz;
      x12.xy -= i1;
      i = mod(i, 289.0);
      vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
      + i.x + vec3(0.0, i1.x, 1.0 ));

      vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
      m = m*m ;
      m = m*m ;

      vec3 x = 2.0 * fract(p * C.www) - 1.0;
      vec3 h = abs(x) - 0.5;
      vec3 ox = floor(x + 0.5);
      vec3 a0 = x - ox;

      m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );

      vec3 g;
      g.x  = a0.x  * x0.x  + h.x  * x0.y;
      g.yz = a0.yz * x12.xz + h.yz * x12.yw;
      return 130.0 * dot(m, g);
    }

    float fbm(vec2 n) {
        float total = 0.0, amplitude = 1.0;
        for (int i = 0; i < 4; i++) {
            total += snoise(n) * amplitude;
            n += n;
            amplitude *= 0.5;
        }
        return total;
    }

    // Rotation matrix
    vec2 rot(vec2 uv, float a) {
        return vec2(uv.x * cos(a) - uv.y * sin(a), uv.x * sin(a) + uv.y * cos(a));
    }

    // Cosine based palette (Holographic for Drop)
    vec3 holoPalette(float t) {
        vec3 a = vec3(0.5, 0.5, 0.5);
        vec3 b = vec3(0.5, 0.5, 0.5);
        vec3 c = vec3(1.0, 1.0, 1.0);
        vec3 d = vec3(0.263,0.416,0.557);
        return a + b*cos( 6.28318*(c*t+d) );
    }

    void main() {
      vec2 coordCenter = gl_PointCoord - vec2(0.5);
      float distanceToCenter = length(coordCenter);
      if (distanceToCenter > 0.5) discard;
      
      float strength = 0.05 / distanceToCenter - 0.1;

      // --- CHECK FOR CUSTOM SHAPE ---
      float isCustom = max(uIsImage, uIsModel);

      // --- BASE GRADIENT (Default Mode) ---
      float mixStrength = (vPosition.y + 8.0) / 16.0; 
      mixStrength = clamp(mixStrength, 0.0, 1.0);
      vec3 baseGradient = mix(uColor1, uColor2, mixStrength);
      
      // --- ACID FLUID EFFECT ---
      vec3 acidColor = baseGradient;
      
      // Use XZ for Wave, XY for others
      vec2 noiseCoord = vPosition.xy;
      if (uIsWave > 0.5) {
          noiseCoord = vPosition.xz; 
      }
      
      float f = 0.0;
      float complexThreshold = 0.5;

      if (uAcidPattern < 0.5) {
          // --- MODE 0: SILK (Ridged, Linear, Highly Distorted) ---
          vec2 p = noiseCoord * 0.003;
          vec2 q = vec2(0.);
          q.x = fbm( p + 0.01 * uTime );
          q.y = fbm( p + vec2(1.0));

          vec2 r = vec2(0.);
          r.x = fbm( p + 1.0*q + vec2(1.7,9.2) + 0.15*uFlowOffset + vec2(sin(q.y*2.0), cos(q.x*2.0)) );
          r.y = fbm( p + 1.0*q + vec2(8.3,2.8) + 0.126*uFlowOffset );

          f = fbm( p + r );
          complexThreshold = 0.5 + 0.1 * sin(length(r) * 5.0);

      } else {
          // --- MODE 1: BLOB (Cellular, Rotational, Clumped) ---
          // Less distortion, more rotational flow, larger scale
          vec2 p = noiseCoord * 0.0025; // Slightly larger scale
          
          // Rotation based flow instead of linear translation
          vec2 flowVec = vec2(cos(uFlowOffset * 0.2), sin(uFlowOffset * 0.2));
          
          vec2 q = vec2(0.);
          q.x = fbm( p + flowVec );
          q.y = fbm( p + vec2(5.2, 1.3) );

          // Less aggressive warping multiplier (1.0 -> 0.5) to prevent shredding
          vec2 r = vec2(0.);
          r.x = fbm( p + 0.5*q + vec2(1.7,9.2) + 0.1*uTime ); 
          r.y = fbm( p + 0.5*q + vec2(8.3,2.8) - 0.1*uTime );

          // Use turbulence (abs) or straight noise? Straight noise creates rounder hills.
          f = fbm( p + 2.0*r );
          
          // Simpler threshold for rounder blobs
          complexThreshold = 0.5;
      }
      
      // --- FIGHTING LIQUIDS LOGIC (Common to both patterns) ---
      
      float interaction = smoothstep(complexThreshold - 0.02, complexThreshold + 0.02, f); 
      
      // Depth Calculation
      float depth = abs(f - complexThreshold) * 2.0; 
      
      vec3 c1Deep = uColor1 * 0.7; 
      vec3 c1Light = mix(uColor1, vec3(1.0), 0.5); 
      
      vec3 c2Deep = uColor2 * 0.7;
      vec3 c2Light = mix(uColor2, vec3(1.0), 0.5);
      
      vec3 liquid1 = mix(c1Light, c1Deep, depth);
      vec3 liquid2 = mix(c2Light, c2Deep, depth);
      
      vec3 liquidBase = mix(liquid1, liquid2, interaction);
      
      // Interface Highlight
      float interfaceGlow = 1.0 - abs(f - complexThreshold) * 40.0; 
      interfaceGlow = clamp(interfaceGlow, 0.0, 1.0);
      interfaceGlow = pow(interfaceGlow, 2.0);
      
      acidColor = mix(liquidBase, vec3(1.0), interfaceGlow);

      // --- FINAL SELECTION ---
      float acidActive = smoothstep(0.01, 0.1, uAcidLevel);
      
      vec3 procColor = mix(baseGradient, acidColor, acidActive);
      vec3 finalBase = mix(procColor, vColor, isCustom);

      // --- HOLOGRAPHIC DROP EFFECT ---
      vec3 holoColor = holoPalette(vPosition.y * 0.2 + uTime * 3.0);
      holoColor += 0.4; 
      
      vec3 combinedColor = mix(finalBase, holoColor, vDrop); 
      
      // --- LED STROBE ---
      float strobeEnergy = vHigh * vIntensityHigh * 0.01; 
      float electricScan = step(0.9, fract(uTime * 2.0 + vPosition.y * 0.5)); 
      float electricGlow = vIsHighGroup * 0.15 * electricScan; 

      vec3 strobeColor = vec3(1.0, 1.0, 1.0) * (strobeEnergy + electricGlow);
      
      vec3 finalColor = combinedColor + vec3(strength * 0.5);
      finalColor += strobeColor;

      finalColor *= uBrightness;

      gl_FragColor = vec4(finalColor, 1.0);
    }
  `
};