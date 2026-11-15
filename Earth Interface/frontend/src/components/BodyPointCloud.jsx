import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

// Clickable areas of the body. Add or rename regions here.
export const REGIONS = [
  { id: "head", label: "Head" },
  { id: "chest", label: "Chest (heart and lungs)" },
  { id: "abdomen", label: "Abdomen" },
  { id: "left-arm", label: "Left arm" },
  { id: "right-arm", label: "Right arm" },
  { id: "left-leg", label: "Left leg" },
  { id: "right-leg", label: "Right leg" },
];

// A rough body built from ellipsoids. Each one is drawn as a cloud of points.
// position = [x, y, z], radii = [x, y, z], count = number of points.
const PARTS = [
  { region: "head", position: [0, 1.68, 0], radii: [0.17, 0.2, 0.17], count: 700 },
  { region: "chest", position: [0, 1.25, 0], radii: [0.3, 0.3, 0.16], count: 1400 },
  { region: "abdomen", position: [0, 0.85, 0], radii: [0.25, 0.22, 0.14], count: 900 },
  { region: "abdomen", position: [0, 0.55, 0], radii: [0.26, 0.16, 0.14], count: 600 },
  { region: "left-arm", position: [-0.45, 1.1, 0], radii: [0.07, 0.38, 0.07], count: 500 },
  { region: "right-arm", position: [0.45, 1.1, 0], radii: [0.07, 0.38, 0.07], count: 500 },
  { region: "left-leg", position: [-0.14, 0, 0], radii: [0.11, 0.5, 0.11], count: 800 },
  { region: "right-leg", position: [0.14, 0, 0], radii: [0.11, 0.5, 0.11], count: 800 },
];

// Random points on the surface of an ellipsoid.
function ellipsoidPoints([rx, ry, rz], count) {
  const data = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const u = Math.random() * 2 - 1;
    const angle = Math.random() * Math.PI * 2;
    const ring = Math.sqrt(1 - u * u);
    data[i * 3] = rx * ring * Math.cos(angle);
    data[i * 3 + 1] = ry * u;
    data[i * 3 + 2] = rz * ring * Math.sin(angle);
  }
  return data;
}

function Part({ part, color, onSelect }) {
  const positions = useMemo(
    () => ellipsoidPoints(part.radii, part.count),
    [part.radii, part.count]
  );

  return (
    <points
      position={part.position}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(part.region);
      }}
      onPointerOver={() => (document.body.style.cursor = "pointer")}
      onPointerOut={() => (document.body.style.cursor = "auto")}
    >
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.014}
        color={color}
        transparent
        opacity={0.9}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

export default function BodyPointCloud({ selected, onSelect }) {
  return (
    <Canvas
      camera={{ position: [0, 1, 3.4], fov: 45 }}
      // Larger threshold makes thin point clouds easier to click.
      raycaster={{ params: { Points: { threshold: 0.04 } } }}
      onPointerMissed={() => onSelect(null)}
    >
      {PARTS.map((part, index) => (
        <Part
          key={index}
          part={part}
          color={part.region === selected ? "#ffd166" : "#5ad1e6"}
          onSelect={onSelect}
        />
      ))}
      <OrbitControls
        target={[0, 0.85, 0]}
        autoRotate
        autoRotateSpeed={1.2}
        enablePan={false}
        minDistance={1.5}
        maxDistance={6}
      />
    </Canvas>
  );
}
