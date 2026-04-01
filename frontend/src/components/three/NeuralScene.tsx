"use client";
// @ts-nocheck
import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Points, PointMaterial, Line } from "@react-three/drei";
import * as THREE from "three";

// ── Nodes ──────────────────────────────────────────────────────────────────
function NeuralNodes() {
  const pointsRef = useRef<THREE.Points>(null!);
  const count = 180;

  const { positions, colors } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // Spherical distribution
      const r = 2.5 + Math.random() * 1.5;
      const theta = Math.acos(2 * Math.random() - 1);
      const phi = Math.random() * Math.PI * 2;
      pos[i * 3] = r * Math.sin(theta) * Math.cos(phi);
      pos[i * 3 + 1] = r * Math.sin(theta) * Math.sin(phi);
      pos[i * 3 + 2] = r * Math.cos(theta);

      // Colors: plasma blue to cyan
      const t = Math.random();
      col[i * 3] = 0.3 + t * 0.14;     // R
      col[i * 3 + 1] = 0.42 + t * 0.6; // G
      col[i * 3 + 2] = 1.0;             // B
    }
    return { positions: pos, colors: col };
  }, []);

  useFrame(({ clock }) => {
    if (pointsRef.current) {
      pointsRef.current.rotation.y = clock.getElapsedTime() * 0.06;
      pointsRef.current.rotation.x = Math.sin(clock.getElapsedTime() * 0.04) * 0.15;
    }
  });

  return (
    <Points ref={pointsRef} positions={positions} colors={colors}>
      <PointMaterial
        vertexColors
        size={0.045}
        sizeAttenuation
        transparent
        opacity={0.85}
        depthWrite={false}
      />
    </Points>
  );
}

// ── Connections ────────────────────────────────────────────────────────────
function NeuralConnections() {
  const groupRef = useRef<THREE.Group>(null!);

  const lines = useMemo(() => {
    const result: [THREE.Vector3, THREE.Vector3][] = [];
    const nodeCount = 40;
    const nodes: THREE.Vector3[] = [];

    for (let i = 0; i < nodeCount; i++) {
      const r = 2.5 + Math.random() * 1.5;
      const theta = Math.acos(2 * Math.random() - 1);
      const phi = Math.random() * Math.PI * 2;
      nodes.push(
        new THREE.Vector3(
          r * Math.sin(theta) * Math.cos(phi),
          r * Math.sin(theta) * Math.sin(phi),
          r * Math.cos(theta)
        )
      );
    }

    for (let i = 0; i < nodeCount; i++) {
      for (let j = i + 1; j < nodeCount; j++) {
        const dist = nodes[i].distanceTo(nodes[j]);
        if (dist < 1.8 && result.length < 80) {
          result.push([nodes[i], nodes[j]]);
        }
      }
    }
    return result;
  }, []);

  useFrame(({ clock }) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = clock.getElapsedTime() * 0.06;
      groupRef.current.rotation.x = Math.sin(clock.getElapsedTime() * 0.04) * 0.15;
    }
  });

  return (
    <group ref={groupRef}>
      {lines.map(([start, end], i) => (
        <Line
          key={i}
          points={[start, end]}
          color={i % 3 === 0 ? "#00f5d4" : "#4d6bff"}
          lineWidth={0.5}
          transparent
          opacity={0.18}
        />
      ))}
    </group>
  );
}

// ── Pulse ring ─────────────────────────────────────────────────────────────
function PulseRing() {
  const meshRef = useRef<THREE.Mesh>(null!);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const scale = 1 + Math.sin(t * 0.8) * 0.06;
    meshRef.current.scale.setScalar(scale);
    (meshRef.current.material as THREE.MeshBasicMaterial).opacity =
      0.06 + Math.sin(t * 0.8) * 0.03;
  });

  return (
    <mesh ref={meshRef}>
      <torusGeometry args={[3.2, 0.008, 16, 120]} />
      <meshBasicMaterial color="#4d6bff" transparent opacity={0.08} />
    </mesh>
  );
}

// ── Main export ────────────────────────────────────────────────────────────
export default function NeuralScene() {
  return (
    <Canvas
      camera={{ position: [0, 0, 7], fov: 60 }}
      gl={{ antialias: true, alpha: true }}
      style={{ background: "transparent" }}
      dpr={[1, 1.5]}
    >
      <ambientLight intensity={0.3} />
      <NeuralNodes />
      <NeuralConnections />
      <PulseRing />
    </Canvas>
  );
}
