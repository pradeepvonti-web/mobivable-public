import { useEffect, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, MeshDistortMaterial, Environment, ContactShadows } from "@react-three/drei";
import { motion } from "framer-motion";
import { Link } from "@tanstack/react-router";
import * as THREE from "three";

function FloatingPhone() {
  const group = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!group.current) return;
    const t = state.clock.getElapsedTime();
    group.current.rotation.y = Math.sin(t * 0.4) * 0.35;
    group.current.rotation.x = Math.cos(t * 0.3) * 0.12;
  });
  return (
    <group ref={group}>
      {/* Phone body */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[1.5, 3, 0.18]} />
        <meshStandardMaterial color="#0a0a0a" metalness={0.9} roughness={0.25} />
      </mesh>
      {/* Screen */}
      <mesh position={[0, 0, 0.095]}>
        <planeGeometry args={[1.35, 2.8]} />
        <meshStandardMaterial
          color="#ff3b1f"
          emissive="#ff3b1f"
          emissiveIntensity={0.6}
          metalness={0.2}
          roughness={0.3}
        />
      </mesh>
      {/* Notch */}
      <mesh position={[0, 1.28, 0.1]}>
        <boxGeometry args={[0.5, 0.1, 0.02]} />
        <meshStandardMaterial color="#000" />
      </mesh>
    </group>
  );
}

function Blob({ position, color, scale = 1 }: { position: [number, number, number]; color: string; scale?: number }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.getElapsedTime();
    ref.current.position.y = position[1] + Math.sin(t + position[0]) * 0.3;
  });
  return (
    <Float speed={2} rotationIntensity={1} floatIntensity={1.5}>
      <mesh ref={ref} position={position} scale={scale}>
        <icosahedronGeometry args={[0.7, 32]} />
        <MeshDistortMaterial
          color={color}
          speed={2}
          distort={0.45}
          roughness={0.15}
          metalness={0.7}
        />
      </mesh>
    </Float>
  );
}

function Scene() {
  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 5, 5]} intensity={1.2} castShadow />
      <pointLight position={[-3, -2, 2]} color="#ff3b1f" intensity={2} />
      <pointLight position={[3, 2, -2]} color="#3b82f6" intensity={1.5} />

      <Float speed={1.5} rotationIntensity={0.5} floatIntensity={0.8}>
        <FloatingPhone />
      </Float>

      <Blob position={[-2.5, 1, -1]} color="#ff3b1f" scale={0.9} />
      <Blob position={[2.6, -0.8, -0.5]} color="#3b82f6" scale={1.1} />
      <Blob position={[2, 1.6, -2]} color="#a855f7" scale={0.6} />
      <Blob position={[-2, -1.4, -2]} color="#10b981" scale={0.5} />

      <ContactShadows position={[0, -2.2, 0]} opacity={0.5} scale={10} blur={2.5} far={4} />
      <Environment preset="city" />
    </>
  );
}

export function Hero3D() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <header className="relative pt-20 pb-32 border-b border-border overflow-hidden">
      {/* Animated grid bg */}
      <div className="absolute inset-0 opacity-[0.08] pointer-events-none">
        <div className="absolute inset-0 [background-image:linear-gradient(var(--primary)_1px,transparent_1px),linear-gradient(90deg,var(--primary)_1px,transparent_1px)] [background-size:64px_64px]" />
      </div>
      <motion.div
        className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-primary/20 blur-3xl pointer-events-none"
        animate={{ x: [0, 100, 0], y: [0, 60, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -bottom-32 -right-32 h-[28rem] w-[28rem] rounded-full bg-blue-500/15 blur-3xl pointer-events-none"
        animate={{ x: [0, -80, 0], y: [0, -50, 0] }}
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center relative">
        <motion.div
          className="lg:col-span-6 z-10"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="inline-block px-2 py-1 border border-primary text-primary text-[10px] font-mono uppercase tracking-[0.2em] mb-6"
          >
            AI Development Protocol v4.0 · 3D
          </motion.div>

          <h1 className="font-display text-7xl md:text-9xl uppercase leading-[0.85] tracking-tighter text-balance mb-8">
            {["Chat.", "Ship.", "Dominate."].map((word, i) => (
              <motion.span
                key={word}
                className={`inline-block mr-4 ${i === 1 ? "text-primary" : ""}`}
                initial={{ opacity: 0, y: 60, rotateX: -90 }}
                animate={{ opacity: 1, y: 0, rotateX: 0 }}
                transition={{ delay: 0.3 + i * 0.15, duration: 0.8, ease: "easeOut" }}
                style={{ transformOrigin: "50% 100%" }}
              >
                {word}
                {i < 2 && <br />}
              </motion.span>
            ))}
          </h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.9 }}
            className="text-xl text-muted-foreground max-w-[45ch] text-pretty leading-relaxed mb-10"
          >
            Democratize mobile app creation with AI. Transform raw ideas into native iOS and
            Android binaries through a single conversational thread.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.1 }}
            className="flex flex-wrap gap-4"
          >
            <div className="flex flex-col gap-1">
              <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
                <Link
                  to="/dashboard"
                  className="px-8 py-4 bg-primary text-background font-display text-lg uppercase tracking-wider hover:invert transition-all inline-block"
                >
                  Start Generating
                </Link>
              </motion.div>
              <span className="text-[10px] font-mono text-muted-foreground uppercase text-center mt-2">
                Free during beta
              </span>
            </div>
          </motion.div>
        </motion.div>

        <motion.div
          className="lg:col-span-6 relative h-[480px] md:h-[560px]"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, delay: 0.4 }}
        >
          {mounted && (
            <Canvas
              camera={{ position: [0, 0, 6], fov: 45 }}
              dpr={[1, 2]}
              gl={{ antialias: true, alpha: true }}
            >
              <Scene />
            </Canvas>
          )}
        </motion.div>
      </div>
    </header>
  );
}
