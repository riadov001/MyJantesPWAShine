import { useRef, useEffect, useCallback } from "react";
import * as THREE from "three";
import {
  generateWheelMesh,
  updateWheelMaterials,
  type WheelParams,
  type WheelMaterialParams,
  DEFAULT_WHEEL_PARAMS,
} from "@/lib/wheel-generator";

interface ARWheelRendererProps {
  wheelParams?: WheelParams;
  materialParams?: WheelMaterialParams;
  onImageGenerated: (dataUrl: string) => void;
  size?: number;
}

export default function ARWheelRenderer({
  wheelParams = DEFAULT_WHEEL_PARAMS,
  materialParams = { color: "#c0c0c0", metalness: 0.8, roughness: 0.2, clearcoat: 0.5, clearcoatRoughness: 0.1 },
  onImageGenerated,
  size = 512,
}: ARWheelRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const wheelGroupRef = useRef<THREE.Group | null>(null);
  const paramsRef = useRef({ wheelParams, materialParams });
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const renderAndCapture = useCallback(() => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (!renderer || !scene || !camera) return;

    renderer.render(scene, camera);
    const dataUrl = renderer.domElement.toDataURL("image/png");
    onImageGenerated(dataUrl);
  }, [onImageGenerated]);

  const rebuildWheel = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (wheelGroupRef.current) {
      scene.remove(wheelGroupRef.current);
      wheelGroupRef.current.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (child.material instanceof THREE.Material) child.material.dispose();
        }
      });
    }

    const newWheel = generateWheelMesh(paramsRef.current.wheelParams);
    wheelGroupRef.current = newWheel;
    scene.add(newWheel);
    updateWheelMaterials(newWheel, paramsRef.current.materialParams);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(renderAndCapture, 100);
  }, [renderAndCapture]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = null;
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    camera.position.set(0, 0, 3.2);
    cameraRef.current = camera;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    } catch {
      return;
    }
    renderer.setSize(size, size);
    renderer.setPixelRatio(1);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.3;
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
    keyLight.position.set(3, 4, 5);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x9999ff, 0.35);
    fillLight.position.set(-3, 2, -2);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffffee, 0.7);
    rimLight.position.set(0, -1, 4);
    scene.add(rimLight);

    const envTexture = new THREE.CubeTextureLoader().load([
      generateEnvFace(0.92, 0.94, 0.97),
      generateEnvFace(0.87, 0.90, 0.94),
      generateEnvFace(1.0, 1.0, 1.0),
      generateEnvFace(0.3, 0.32, 0.35),
      generateEnvFace(0.72, 0.77, 0.82),
      generateEnvFace(0.78, 0.80, 0.85),
    ]);
    scene.environment = envTexture;

    rebuildWheel();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      scene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (child.material instanceof THREE.Material) child.material.dispose();
        }
      });
    };
  }, []);

  useEffect(() => {
    paramsRef.current = { wheelParams, materialParams };
    rebuildWheel();
  }, [wheelParams, materialParams, rebuildWheel]);

  return <div ref={containerRef} className="w-0 h-0 overflow-hidden" aria-hidden="true" />;
}

function generateEnvFace(r: number, g: number, b: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 45);
  gradient.addColorStop(0, `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},1)`);
  gradient.addColorStop(1, `rgba(${Math.round(r * 200)},${Math.round(g * 200)},${Math.round(b * 200)},1)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  return canvas.toDataURL();
}
