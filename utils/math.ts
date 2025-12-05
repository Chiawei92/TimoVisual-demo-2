import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ShapeType, ParticleData } from '../types';

export const PARTICLE_COUNT = 4000;

// Generate positions for different shapes
export const generateParticles = (shape: ShapeType, count: number = PARTICLE_COUNT): Float32Array => {
  const positions = new Float32Array(count * 3);
  const vec = new THREE.Vector3();

  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    const ratio = i / count;

    if (shape === 'sphere') {
      const phi = Math.acos(-1 + (2 * i) / count);
      const theta = Math.sqrt(count * Math.PI) * phi;
      vec.setFromSphericalCoords(5, phi, theta);
    } 
    else if (shape === 'cube') {
      const side = Math.cbrt(count);
      const x = (i % side) - side / 2;
      const y = (Math.floor(i / side) % side) - side / 2;
      const z = (Math.floor(i / (side * side))) - side / 2;
      vec.set(x, y, z).multiplyScalar(10 / side); 
    } 
    else if (shape === 'torus') {
      const u = ratio * Math.PI * 2;
      const v = (i % 100) / 100 * Math.PI * 2; 
      const R = 4;
      const r = 1.5;
      vec.x = (R + r * Math.cos(v)) * Math.cos(u);
      vec.y = (R + r * Math.cos(v)) * Math.sin(u);
      vec.z = r * Math.sin(v);
      const x = vec.x;
      const z = vec.z;
      vec.x = x * Math.cos(ratio * 10) - z * Math.sin(ratio * 10);
      vec.z = x * Math.sin(ratio * 10) + z * Math.cos(ratio * 10);
    } 
    else if (shape === 'spiral') {
      const angle = ratio * Math.PI * 20; 
      const radius = ratio * 5;
      vec.x = Math.cos(angle) * radius;
      vec.z = Math.sin(angle) * radius;
      vec.y = (ratio - 0.5) * 10;
    } 
    else if (shape === 'wave' || shape === 'network' || shape === 'traces') {
      // Fallback grid for lines placeholders
      const x = (ratio - 0.5) * 12;
      const z = ((i % 50) / 50 - 0.5) * 12;
      vec.set(x, 0, z);
    }
    else if (shape === 'mesh' || shape === 'shard') {
       // Fallback sphere for surfaces placeholders
       const phi = Math.acos(-1 + (2 * i) / count);
       const theta = Math.sqrt(count * Math.PI) * phi;
       vec.setFromSphericalCoords(6, phi, theta); // Slightly larger sphere
    }
    // Fallback for any unknown shape
    else {
       const phi = Math.acos(-1 + (2 * i) / count);
       const theta = Math.sqrt(count * Math.PI) * phi;
       vec.setFromSphericalCoords(5, phi, theta);
    }

    positions[i3] = vec.x;
    positions[i3 + 1] = vec.y;
    positions[i3 + 2] = vec.z;
  }

  return positions;
};

export const processImageToParticles = (file: File): Promise<ParticleData> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.src = url;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject("No Canvas Context");
                return;
            }

            const MAX_SIZE = 120; 
            let width = img.width;
            let height = img.height;
            
            if (width > height) {
                if (width > MAX_SIZE) {
                    height *= MAX_SIZE / width;
                    width = MAX_SIZE;
                }
            } else {
                if (height > MAX_SIZE) {
                    width *= MAX_SIZE / height;
                    height = MAX_SIZE;
                }
            }
            
            canvas.width = Math.floor(width);
            canvas.height = Math.floor(height);
            
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            
            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const pixels = imgData.data;
            const totalPixels = canvas.width * canvas.height;
            
            const tempPositions: number[] = [];
            const tempColors: number[] = [];
            
            for (let i = 0; i < totalPixels; i++) {
                const i4 = i * 4; 
                const a = pixels[i4 + 3];
                
                if (a < 20) continue;

                const r = pixels[i4] / 255;
                const g = pixels[i4 + 1] / 255;
                const b = pixels[i4 + 2] / 255;
                
                const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
                
                const col = i % canvas.width;
                const row = Math.floor(i / canvas.width);
                
                const x = (col / canvas.width - 0.5) * 10;
                const y = -(row / canvas.height - 0.5) * 10 * (canvas.height / canvas.width);
                const z = (brightness - 0.5) * 3.0; 

                tempPositions.push(x, y, z);
                tempColors.push(r, g, b);
            }
            
            URL.revokeObjectURL(url);
            resolve({ 
                positions: new Float32Array(tempPositions), 
                colors: new Float32Array(tempColors), 
                count: tempPositions.length / 3 
            });
        };
        img.onerror = reject;
    });
};

export const process3DModel = (file: File): Promise<ParticleData> => {
    return new Promise((resolve, reject) => {
        const loader = new GLTFLoader();
        const url = URL.createObjectURL(file);

        loader.load(url, (gltf) => {
            const meshes: THREE.Mesh[] = [];
            gltf.scene.traverse((child) => {
                if ((child as THREE.Mesh).isMesh) {
                    meshes.push(child as THREE.Mesh);
                }
            });

            if (meshes.length === 0) {
                reject("No meshes found in model");
                return;
            }

            // Calculate total surface area for weighted sampling
            let totalArea = 0;
            const weights: number[] = [];
            const faces: { mesh: THREE.Mesh; a: number; b: number; c: number; area: number }[] = [];

            meshes.forEach(mesh => {
                const geometry = mesh.geometry;
                if (!geometry.index) {
                    // Skip non-indexed geometry for simplicity in this prototype
                    return; 
                }
                
                const posAttr = geometry.attributes.position;
                const indexAttr = geometry.index;
                const triCount = indexAttr.count / 3;
                
                // Apply world transform to get correct scaling/rotation
                mesh.updateMatrixWorld();
                const matrix = mesh.matrixWorld;

                const vA = new THREE.Vector3();
                const vB = new THREE.Vector3();
                const vC = new THREE.Vector3();

                for (let i = 0; i < triCount; i++) {
                    const i3 = i * 3;
                    vA.fromBufferAttribute(posAttr as THREE.BufferAttribute, indexAttr.getX(i3)).applyMatrix4(matrix);
                    vB.fromBufferAttribute(posAttr as THREE.BufferAttribute, indexAttr.getX(i3 + 1)).applyMatrix4(matrix);
                    vC.fromBufferAttribute(posAttr as THREE.BufferAttribute, indexAttr.getX(i3 + 2)).applyMatrix4(matrix);

                    // Area = 0.5 * |AB x AC|
                    const subA = new THREE.Vector3().subVectors(vB, vA);
                    const subB = new THREE.Vector3().subVectors(vC, vA);
                    const area = subA.cross(subB).length() * 0.5;
                    
                    if (area > 0) {
                        totalArea += area;
                        faces.push({ mesh, a: indexAttr.getX(i3), b: indexAttr.getX(i3+1), c: indexAttr.getX(i3+2), area });
                    }
                }
            });

            // Generate Particles
            const targetCount = 8000; // Higher fidelity for 3D models
            const positions: number[] = [];
            const normals: number[] = [];
            const colors: number[] = [];
            
            // Texture Color Map Helper
            const colorMaps = new Map<THREE.Texture, { ctx: CanvasRenderingContext2D, width: number, height: number }>();
            
            const getTexturePixel = (mesh: THREE.Mesh, uv: THREE.Vector2): {r:number, g:number, b:number} | null => {
                const mat = mesh.material as THREE.MeshStandardMaterial;
                if (mat.map) {
                    if (!colorMaps.has(mat.map)) {
                        const img = mat.map.image as HTMLImageElement;
                        if (img && img.width > 0) {
                           const c = document.createElement('canvas');
                           c.width = img.width;
                           c.height = img.height;
                           const ctx = c.getContext('2d', { willReadFrequently: true });
                           if(ctx) {
                               ctx.drawImage(img, 0, 0);
                               colorMaps.set(mat.map, { ctx, width: img.width, height: img.height });
                           }
                        }
                    }
                    
                    const mapData = colorMaps.get(mat.map);
                    if (mapData) {
                        const x = Math.floor((uv.x % 1) * mapData.width);
                        const y = Math.floor((1 - (uv.y % 1)) * mapData.height); // Flip Y for texture lookup
                        const p = mapData.ctx.getImageData(x, y, 1, 1).data;
                        return { r: p[0]/255, g: p[1]/255, b: p[2]/255 };
                    }
                }
                if (mat.color) {
                    return { r: mat.color.r, g: mat.color.g, b: mat.color.b };
                }
                return null;
            };

            const _vA = new THREE.Vector3();
            const _vB = new THREE.Vector3();
            const _vC = new THREE.Vector3();
            const _nA = new THREE.Vector3();
            const _nB = new THREE.Vector3();
            const _nC = new THREE.Vector3();
            const _uvA = new THREE.Vector2();
            const _uvB = new THREE.Vector2();
            const _uvC = new THREE.Vector2();
            
            for(let i=0; i<targetCount; i++) {
                // Weighted Face Selection
                let r = Math.random() * totalArea;
                let faceIdx = 0;
                for(let j=0; j<faces.length; j++) {
                    r -= faces[j].area;
                    if(r <= 0) {
                        faceIdx = j;
                        break;
                    }
                }
                const face = faces[faceIdx];
                const geo = face.mesh.geometry;
                const posAttr = geo.attributes.position as THREE.BufferAttribute;
                const normAttr = geo.attributes.normal as THREE.BufferAttribute | undefined;
                const uvAttr = geo.attributes.uv as THREE.BufferAttribute | undefined;

                // Random Barycentric Coords
                const r1 = Math.sqrt(Math.random());
                const r2 = Math.random();
                const u = 1 - r1;
                const v = r1 * (1 - r2);
                const w = r1 * r2;

                // Interpolate Position
                _vA.fromBufferAttribute(posAttr, face.a).applyMatrix4(face.mesh.matrixWorld);
                _vB.fromBufferAttribute(posAttr, face.b).applyMatrix4(face.mesh.matrixWorld);
                _vC.fromBufferAttribute(posAttr, face.c).applyMatrix4(face.mesh.matrixWorld);
                const px = _vA.x * u + _vB.x * v + _vC.x * w;
                const py = _vA.y * u + _vB.y * v + _vC.y * w;
                const pz = _vA.z * u + _vB.z * v + _vC.z * w;

                positions.push(px, py, pz);

                // Interpolate Normal
                const normalMatrix = new THREE.Matrix3().getNormalMatrix(face.mesh.matrixWorld);
                
                if (normAttr) {
                    _nA.fromBufferAttribute(normAttr, face.a).applyMatrix3(normalMatrix);
                    _nB.fromBufferAttribute(normAttr, face.b).applyMatrix3(normalMatrix);
                    _nC.fromBufferAttribute(normAttr, face.c).applyMatrix3(normalMatrix);
                    const nx = _nA.x * u + _nB.x * v + _nC.x * w;
                    const ny = _nA.y * u + _nB.y * v + _nC.y * w;
                    const nz = _nA.z * u + _nB.z * v + _nC.z * w;
                    const len = Math.sqrt(nx*nx + ny*ny + nz*nz);
                    normals.push(nx/len, ny/len, nz/len);
                } else {
                    const subA = new THREE.Vector3().subVectors(_vB, _vA);
                    const subB = new THREE.Vector3().subVectors(_vC, _vA);
                    subA.cross(subB).normalize();
                    normals.push(subA.x, subA.y, subA.z);
                }

                // Interpolate Color
                let cr = 1, cg = 1, cb = 1;
                if (uvAttr) {
                    _uvA.fromBufferAttribute(uvAttr, face.a);
                    _uvB.fromBufferAttribute(uvAttr, face.b);
                    _uvC.fromBufferAttribute(uvAttr, face.c);
                    const uvx = _uvA.x * u + _uvB.x * v + _uvC.x * w;
                    const uvy = _uvA.y * u + _uvB.y * v + _uvC.y * w;
                    const col = getTexturePixel(face.mesh, new THREE.Vector2(uvx, uvy));
                    if (col) { cr = col.r; cg = col.g; cb = col.b; }
                } else {
                    const mat = face.mesh.material as THREE.MeshStandardMaterial;
                    if (mat && mat.color) { cr = mat.color.r; cg = mat.color.g; cb = mat.color.b; }
                }
                colors.push(cr, cg, cb);
            }
            
            // Normalize Scale
            let minX=Infinity, minY=Infinity, minZ=Infinity;
            let maxX=-Infinity, maxY=-Infinity, maxZ=-Infinity;
            for(let i=0; i<positions.length; i+=3) {
                minX = Math.min(minX, positions[i]);
                minY = Math.min(minY, positions[i+1]);
                minZ = Math.min(minZ, positions[i+2]);
                maxX = Math.max(maxX, positions[i]);
                maxY = Math.max(maxY, positions[i+1]);
                maxZ = Math.max(maxZ, positions[i+2]);
            }
            
            const centerX = (minX + maxX) / 2;
            const centerY = (minY + maxY) / 2;
            const centerZ = (minZ + maxZ) / 2;
            const maxDim = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
            const scale = 8.0 / maxDim; // Target size approx 8 units

            for(let i=0; i<positions.length; i+=3) {
                positions[i] = (positions[i] - centerX) * scale;
                positions[i+1] = (positions[i+1] - centerY) * scale;
                positions[i+2] = (positions[i+2] - centerZ) * scale;
            }

            URL.revokeObjectURL(url);
            resolve({
                positions: new Float32Array(positions),
                colors: new Float32Array(colors),
                normals: new Float32Array(normals),
                count: targetCount
            });

        }, undefined, (err) => reject(err));
    });
};

const CYBER_HUES = [
    '#ff0055', '#ff4400', '#ffaa00', '#ffd500', '#ccff00', 
    '#00ff00', '#00ff66', '#00ffcc', '#00ffff', '#0099ff', 
    '#0044ff', '#4400ff', '#8800ff', '#cc00ff', '#ff00ff', 
    '#ff0099', '#ffffff', '#000000',
];

export const getRandomPalette = () => {
  const len = CYBER_HUES.length;
  const idx1 = Math.floor(Math.random() * len);
  let idx2 = Math.floor(Math.random() * len);
  
  const getDistance = (a: number, b: number) => {
      const dist = Math.abs(a - b);
      return Math.min(dist, len - dist);
  };

  while (getDistance(idx1, idx2) < 3) {
      idx2 = Math.floor(Math.random() * len);
  }

  const accentCandidates = ['#ffffff', '#00ffff', '#ccff00'];
  const accent = accentCandidates[Math.floor(Math.random() * accentCandidates.length)];

  return { 
      p: CYBER_HUES[idx1], 
      s: CYBER_HUES[idx2], 
      a: accent 
  };
};