import { useRef, useEffect, useCallback, forwardRef, useImperativeHandle, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  generateWheelMesh,
  updateWheelMaterials,
  addLisereRing,
  removeLisere,
  addGravureText,
  applyPhotoTexture,
  removePhotoTexture,
  DEFAULT_WHEEL_PARAMS,
  type WheelParams,
  type WheelMaterialParams,
} from "@/lib/wheel-generator";

export interface Wheel3DViewerProps {
  wheelParams?: WheelParams;
  materialParams?: WheelMaterialParams;
  lisereEnabled?: boolean;
  lisereColor?: string;
  lisereThickness?: number;
  gravureText?: string;
  className?: string;
  backgroundImage?: string;
  photoTexture?: string | null;
  photoTextureOpacity?: number;
}

export interface Wheel3DViewerHandle {
  exportPNG: (width?: number) => string | null;
  exportGLB: () => Promise<Blob | null>;
  getScene: () => THREE.Scene | null;
}

const Wheel3DViewer = forwardRef<Wheel3DViewerHandle, Wheel3DViewerProps>(
  (
    {
      wheelParams = DEFAULT_WHEEL_PARAMS,
      materialParams = { color: "#c0c0c0", metalness: 0.8, roughness: 0.2, clearcoat: 0.5, clearcoatRoughness: 0.1 },
      lisereEnabled = false,
      lisereColor = "#ff0000",
      lisereThickness = 3,
      gravureText = "",
      className = "",
      backgroundImage,
      photoTexture = null,
      photoTextureOpacity = 0.85,
    },
    ref
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const wheelGroupRef = useRef<THREE.Group | null>(null);
    const animFrameRef = useRef<number>(0);
    const wheelParamsRef = useRef(wheelParams);
    const needsRebuild = useRef(true);
    const [webglError, setWebglError] = useState<string | null>(null);

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

      const newWheel = generateWheelMesh(wheelParamsRef.current);
      wheelGroupRef.current = newWheel;
      scene.add(newWheel);

      updateWheelMaterials(newWheel, materialParams);

      if (lisereEnabled) {
        addLisereRing(newWheel, wheelParamsRef.current.outerRadius, wheelParamsRef.current.rimDepth, lisereColor, lisereThickness);
      }
      if (gravureText) {
        addGravureText(newWheel, gravureText, wheelParamsRef.current.outerRadius);
      }
      if (photoTexture) {
        applyPhotoTexture(
          newWheel,
          photoTexture,
          wheelParamsRef.current.outerRadius,
          wheelParamsRef.current.hubRadius,
          wheelParamsRef.current.dishDepth,
          photoTextureOpacity
        );
      }
    }, [materialParams, lisereEnabled, lisereColor, lisereThickness, gravureText, photoTexture, photoTextureOpacity]);

    useEffect(() => {
      if (JSON.stringify(wheelParams) !== JSON.stringify(wheelParamsRef.current)) {
        wheelParamsRef.current = wheelParams;
        needsRebuild.current = true;
      }
    }, [wheelParams]);

    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const w = container.clientWidth || 300;
      const h = container.clientHeight || 200;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x1a1a2e);
      sceneRef.current = scene;

      const camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 100);
      camera.position.set(0, 0, 3.5);
      cameraRef.current = camera;

      let renderer: THREE.WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      } catch (e) {
        setWebglError("WebGL non disponible sur cet appareil");
        return;
      }
      renderer.setSize(w, h);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.3;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      container.appendChild(renderer.domElement);
      rendererRef.current = renderer;

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.enablePan = false;
      controls.minDistance = 1.5;
      controls.maxDistance = 8;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 1.2;
      controlsRef.current = controls;

      const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
      scene.add(ambientLight);

      const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
      keyLight.position.set(3, 4, 5);
      keyLight.castShadow = true;
      scene.add(keyLight);

      const fillLight = new THREE.DirectionalLight(0x9999ff, 0.35);
      fillLight.position.set(-3, 2, -2);
      scene.add(fillLight);

      const rimLight = new THREE.DirectionalLight(0xffffee, 0.7);
      rimLight.position.set(0, -1, 4);
      scene.add(rimLight);

      const backLight = new THREE.DirectionalLight(0xffffff, 0.3);
      backLight.position.set(0, 0, -5);
      scene.add(backLight);

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

      renderer.domElement.addEventListener("webglcontextlost", (e) => {
        e.preventDefault();
        cancelAnimationFrame(animFrameRef.current);
        ro.disconnect();
        controls.dispose();
        renderer.dispose();
        if (container.contains(renderer.domElement)) {
          container.removeChild(renderer.domElement);
        }
        setWebglError("Le contexte graphique a été perdu. Réouvrez le simulateur.");
      });

      const animate = () => {
        animFrameRef.current = requestAnimationFrame(animate);
        if (needsRebuild.current) {
          needsRebuild.current = false;
          rebuildWheel();
        }
        controls.update();
        renderer.render(scene, camera);
      };
      animate();

      const handleResize = () => {
        if (!container || !renderer || !camera) return;
        const w = container.clientWidth || 1;
        const h = container.clientHeight || 1;
        if (w < 10 || h < 10) return;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      };
      const ro = new ResizeObserver(handleResize);
      ro.observe(container);

      return () => {
        cancelAnimationFrame(animFrameRef.current);
        ro.disconnect();
        controls.dispose();
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
      if (wheelGroupRef.current) {
        updateWheelMaterials(wheelGroupRef.current, materialParams);
      }
    }, [materialParams]);

    useEffect(() => {
      if (!wheelGroupRef.current) return;
      if (lisereEnabled) {
        addLisereRing(wheelGroupRef.current, wheelParamsRef.current.outerRadius, wheelParamsRef.current.rimDepth, lisereColor, lisereThickness);
      } else {
        removeLisere(wheelGroupRef.current);
      }
    }, [lisereEnabled, lisereColor, lisereThickness]);

    useEffect(() => {
      if (!wheelGroupRef.current) return;
      addGravureText(wheelGroupRef.current, gravureText, wheelParamsRef.current.outerRadius);
    }, [gravureText]);

    useEffect(() => {
      needsRebuild.current = true;
    }, [wheelParams]);

    useEffect(() => {
      if (!wheelGroupRef.current) return;
      if (photoTexture) {
        applyPhotoTexture(
          wheelGroupRef.current,
          photoTexture,
          wheelParamsRef.current.outerRadius,
          wheelParamsRef.current.hubRadius,
          wheelParamsRef.current.dishDepth,
          photoTextureOpacity
        );
      } else {
        removePhotoTexture(wheelGroupRef.current);
      }
    }, [photoTexture, photoTextureOpacity]);

    useEffect(() => {
      const scene = sceneRef.current;
      const renderer = rendererRef.current;
      if (!scene) return;

      if (backgroundImage) {
        scene.background = null;
        if (renderer) renderer.setClearColor(0x000000, 0);
      } else {
        scene.background = new THREE.Color(0x1a1a2e);
      }
    }, [backgroundImage]);

    useImperativeHandle(ref, () => ({
      exportPNG: (width = 2048) => {
        const renderer = rendererRef.current;
        const scene = sceneRef.current;
        const camera = cameraRef.current;
        if (!renderer || !scene || !camera) return null;

        const currentSize = new THREE.Vector2();
        renderer.getSize(currentSize);

        const aspect = currentSize.x / currentSize.y;
        const height = Math.round(width / aspect);
        renderer.setSize(width, height);
        camera.aspect = aspect;
        camera.updateProjectionMatrix();
        renderer.render(scene, camera);

        if (backgroundImage) {
          try {
            const compositeCanvas = document.createElement("canvas");
            compositeCanvas.width = width;
            compositeCanvas.height = height;
            const ctx = compositeCanvas.getContext("2d")!;
            const bgImg = new window.Image();
            bgImg.src = backgroundImage;
            if (bgImg.complete && bgImg.naturalWidth > 0) {
              ctx.filter = "brightness(0.5)";
              ctx.drawImage(bgImg, 0, 0, width, height);
              ctx.filter = "none";
            }
            ctx.drawImage(renderer.domElement, 0, 0);
            const dataUrl = compositeCanvas.toDataURL("image/png");
            renderer.setSize(currentSize.x, currentSize.y);
            camera.aspect = currentSize.x / currentSize.y;
            camera.updateProjectionMatrix();
            return dataUrl;
          } catch {
            // fallback
          }
        }

        const dataUrl = renderer.domElement.toDataURL("image/png");

        renderer.setSize(currentSize.x, currentSize.y);
        camera.aspect = currentSize.x / currentSize.y;
        camera.updateProjectionMatrix();

        return dataUrl;
      },
      exportGLB: async () => {
        const scene = sceneRef.current;
        if (!scene) return null;
        const { GLTFExporter } = await import("three/examples/jsm/exporters/GLTFExporter.js");
        const exporter = new GLTFExporter();
        return new Promise<Blob>((resolve) => {
          exporter.parse(
            scene,
            (result) => {
              const blob = new Blob([result as ArrayBuffer], { type: "application/octet-stream" });
              resolve(blob);
            },
            (error) => {
              console.error("GLB export error:", error);
              resolve(new Blob());
            },
            { binary: true }
          );
        });
      },
      getScene: () => sceneRef.current,
    }));

    if (webglError) {
      return (
        <div className={`w-full flex items-center justify-center ${className}`} style={{ minHeight: 200 }}>
          <div className="text-center p-4">
            <p className="text-sm text-destructive font-medium mb-1">{webglError}</p>
            <p className="text-xs text-muted-foreground">Essayez de recharger la page</p>
          </div>
        </div>
      );
    }

    return (
      <div
        className={`w-full relative ${className}`}
        style={{ minHeight: 200 }}
      >
        {backgroundImage && (
          <div
            className="absolute inset-0 z-0"
            style={{
              backgroundImage: `url(${backgroundImage})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              filter: "brightness(0.5)",
            }}
          />
        )}
        <div
          ref={containerRef}
          className="absolute inset-0 z-10 touch-none"
          data-testid="viewer-3d-canvas"
        />
      </div>
    );
  }
);

Wheel3DViewer.displayName = "Wheel3DViewer";

export default Wheel3DViewer;

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
