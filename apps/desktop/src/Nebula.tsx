import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Memory, MemoryStatus } from "./api";

const STATUS_COLORS: Record<MemoryStatus, number> = {
  confirmed: 0x94ead2,
  proposed: 0x99bced,
  disputed: 0xe9ba7b,
  superseded: 0x72808e,
};

type SceneController = {
  setMemories: (memories: Memory[]) => void;
  setGreen: (green: boolean) => void;
};

// Positions only organize the view; they do not imply similarity or relevance.
function hash(value: string) {
  let result = 2166136261;
  for (const character of value) {
    result = Math.imul(result ^ character.charCodeAt(0), 16777619);
  }
  return (result >>> 0) / 4294967296;
}

export default function Nebula({
  memories,
  green,
  onSelect,
}: {
  memories: Memory[];
  green: boolean;
  onSelect: (memory: Memory) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<SceneController | null>(null);
  const select = useRef(onSelect);
  select.current = onSelect;
  const [unsupported, setUnsupported] = useState(false);
  const [preview, setPreview] = useState<Memory | null>(null);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: "low-power",
      });
    } catch {
      setUnsupported(true);
      return;
    }
    setUnsupported(false);
    // A transparent single pass keeps the card's graphite background intact.
    // Glow belongs to each point, so it cannot lift the whole canvas to gray.
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const canvas = renderer.domElement;
    canvas.style.outlineOffset = "-3px";
    canvas.setAttribute("role", "group");
    element.appendChild(canvas);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 0.35, 13);
    const controls = new OrbitControls(camera, canvas);
    canvas.style.touchAction = "pan-y";
    controls.enablePan = false;
    controls.enableDamping = false;
    // Preserve page scrolling; keyboard +/- provides explicit zoom.
    controls.enableZoom = false;
    controls.autoRotateSpeed = 0.13;
    controls.maxPolarAngle = Math.PI * 0.72;
    controls.minPolarAngle = Math.PI * 0.28;
    const constellation = new THREE.Group();
    scene.add(constellation);
    const dots = new THREE.Group();
    constellation.add(dots);
    const geometry = new THREE.SphereGeometry(0.075, 12, 10);
    const materials = new Map<MemoryStatus, THREE.MeshBasicMaterial>();
    const glows = new Map<MemoryStatus, THREE.SpriteMaterial>();
    const glowCanvas = document.createElement("canvas");
    glowCanvas.width = glowCanvas.height = 64;
    const context = glowCanvas.getContext("2d");
    if (context) {
      const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
      gradient.addColorStop(0, "rgba(255,255,255,0.6)");
      gradient.addColorStop(0.12, "rgba(255,255,255,0.32)");
      gradient.addColorStop(0.4, "rgba(255,255,255,0.08)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      context.fillStyle = gradient;
      context.fillRect(0, 0, 64, 64);
    }
    const glowTexture = new THREE.CanvasTexture(glowCanvas);
    for (const status of Object.keys(STATUS_COLORS) as MemoryStatus[]) {
      materials.set(
        status,
        new THREE.MeshBasicMaterial({ color: STATUS_COLORS[status] }),
      );
      glows.set(
        status,
        new THREE.SpriteMaterial({
          map: glowTexture,
          color: STATUS_COLORS[status],
          transparent: true,
          opacity: status === "superseded" ? 0.35 : 0.85,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
    }
    const coreGeometry = new THREE.OctahedronGeometry(0.115);
    const coreMaterial = new THREE.MeshBasicMaterial({ color: 0xe5c695 });
    const core = new THREE.Mesh(coreGeometry, coreMaterial);
    core.rotation.z = Math.PI / 4;
    constellation.add(core);
    const coreGlowMaterial = new THREE.SpriteMaterial({
      map: glowTexture,
      color: 0xe5c695,
      opacity: 0.7,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const coreGlow = new THREE.Sprite(coreGlowMaterial);
    coreGlow.scale.setScalar(0.85);
    constellation.add(coreGlow);

    const orbitGeometry = new THREE.BufferGeometry().setFromPoints(
      new THREE.EllipseCurve(0, 0, 4.5, 2.7)
        .getPoints(180)
        .map((point) => new THREE.Vector3(point.x, point.y, -0.8)),
    );
    const orbitMaterial = new THREE.LineBasicMaterial({
      color: 0x6eada0,
      transparent: true,
      opacity: 0.13,
      depthWrite: false,
    });
    const orbit = new THREE.LineLoop(orbitGeometry, orbitMaterial);
    orbit.rotation.z = -0.19;
    constellation.add(orbit);
    const ringGeometry = new THREE.RingGeometry(0.18, 0.197, 40);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xe4fff6,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
    });
    const selectionRing = new THREE.Mesh(ringGeometry, ringMaterial);
    selectionRing.visible = false;
    selectionRing.renderOrder = 2;
    scene.add(selectionRing);
    const lineMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
    });
    let links: THREE.LineSegments | null = null;
    let nodes: { id: string; position: THREE.Vector3 }[] = [];
    let memoryById = new Map<string, Memory>();
    let signature = "";
    let highlighted: string | null = null;
    let keyboardFocus = false;
    let disposed = false;
    let contextLost = false;
    let onscreen = true;
    let lowEnergy = false;
    let interacted = false;
    let frame = 0;
    let lastFrame = 0;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const world = new THREE.Vector3();
    const projected = new THREE.Vector3();
    const visible = () =>
      !disposed && !contextLost && onscreen && !document.hidden;
    const rotating = () =>
      nodes.length > 0 && !lowEnergy && !reducedMotion.matches && !interacted;

    const highlight = (id: string | null) => {
      if (highlighted === id) return;
      highlighted = id;
      setPreview(id ? (memoryById.get(id) ?? null) : null);
      requestDraw();
    };
    const render = (now: number) => {
      frame = 0;
      if (!visible()) return;
      const elapsed = now - lastFrame;
      if (rotating() && elapsed < 1000 / 30) {
        requestDraw();
        return;
      }
      controls.autoRotate = rotating();
      controls.update(Math.min(elapsed / 1000, 0.1));
      lastFrame = now;
      const selected = nodes.find((node) => node.id === highlighted);
      selectionRing.visible = Boolean(selected);
      if (selected) {
        selectionRing.position.copy(selected.position);
        constellation.localToWorld(selectionRing.position);
        selectionRing.quaternion.copy(camera.quaternion);
      }
      renderer.render(scene, camera);
      if (rotating()) requestDraw();
    };
    function requestDraw() {
      if (!frame && visible()) frame = requestAnimationFrame(render);
    }
    const pause = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      lastFrame = 0;
      requestDraw();
    };
    const setMemories = (items: Memory[]) => {
      memoryById = new Map(items.map((memory) => [memory.id, memory]));
      const ordered = [...items].sort((a, b) => a.id.localeCompare(b.id));
      const nextSignature = JSON.stringify(
        ordered.map(({ id, status }) => [id, status]),
      );
      canvas.tabIndex = items.length ? 0 : -1;
      canvas.setAttribute(
        "aria-label",
        items.length
          ? `Local constellation of ${items.length} stored memories. Arrow keys browse memories; Enter opens one. Plus and minus zoom. Positions do not indicate relationships. The memory list offers the same content.`
          : "Your local vault has no memories yet. Add a memory to begin your constellation.",
      );
      if (highlighted) {
        if (!memoryById.has(highlighted)) highlight(null);
        else setPreview(memoryById.get(highlighted)!);
      }
      if (signature === nextSignature) return;
      signature = nextSignature;
      dots.clear();
      if (links) {
        constellation.remove(links);
        links.geometry.dispose();
      }
      const positions: number[] = [];
      const colors: number[] = [];
      nodes = ordered.map((memory, index) => {
        const angle = (index / ordered.length) * Math.PI * 2 + 0.32;
        const radius = 2.8 + hash(memory.id) * 0.95;
        const position = new THREE.Vector3(
          Math.cos(angle) * radius * 1.25,
          Math.sin(angle) * radius * 0.77,
          (hash(`${memory.id}:depth`) - 0.5) * 2.2,
        );
        const point = new THREE.Mesh(geometry, materials.get(memory.status));
        point.position.copy(position);
        point.scale.x = 1 / constellation.scale.x;
        dots.add(point);
        const glow = new THREE.Sprite(glows.get(memory.status));
        glow.position.copy(position);
        glow.scale.set(0.7 / constellation.scale.x, 0.7, 0.7);
        dots.add(glow);
        const curve = new THREE.QuadraticBezierCurve3(
          new THREE.Vector3(),
          position
            .clone()
            .multiplyScalar(0.5)
            .add(new THREE.Vector3(-0.3, 0.32, 0)),
          position,
        ).getPoints(20);
        const color = new THREE.Color(STATUS_COLORS[memory.status]);
        for (let i = 1; i < curve.length; i++) {
          for (const point of [curve[i - 1], curve[i]]) {
            positions.push(point.x, point.y, point.z);
            colors.push(color.r, color.g, color.b);
          }
        }
        return { id: memory.id, position };
      });
      const linkGeometry = new THREE.BufferGeometry();
      linkGeometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3),
      );
      linkGeometry.setAttribute(
        "color",
        new THREE.Float32BufferAttribute(colors, 3),
      );
      links = new THREE.LineSegments(linkGeometry, lineMaterial);
      constellation.add(links);
      requestDraw();
    };
    let lastWidth = 0;
    let lastHeight = 0;
    const resize = () => {
      const { width, height } = element.getBoundingClientRect();
      if (!width || !height) return;
      renderer.setPixelRatio(
        Math.min(window.devicePixelRatio || 1, lowEnergy ? 1 : 1.5),
      );
      renderer.setSize(width, height, false);
      const layoutChanged = width !== lastWidth || height !== lastHeight;
      lastWidth = width;
      lastHeight = height;
      camera.aspect = width / height;
      constellation.scale.x = Math.min(1, camera.aspect / 1.05);
      for (const dot of dots.children) {
        dot.scale.x =
          (dot instanceof THREE.Sprite ? 0.7 : 1) / constellation.scale.x;
      }
      core.scale.x = 1 / constellation.scale.x;
      coreGlow.scale.x = 0.85 / constellation.scale.x;
      const verticalFov = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const distance = Math.max(
        (7 / (2 * verticalFov)) * (height / Math.max(height - 130, 160)),
        ((10.4 * constellation.scale.x) / (2 * verticalFov * camera.aspect)) *
          1.12,
      );
      const direction = camera.position
        .clone()
        .sub(controls.target)
        .normalize();
      if (layoutChanged) {
        camera.position
          .copy(controls.target)
          .addScaledVector(direction, distance);
      }
      controls.minDistance = distance * 0.62;
      controls.maxDistance = distance * 1.65;
      camera.updateProjectionMatrix();
      controls.update();
      requestDraw();
    };
    const stopRotation = () => {
      interacted = true;
      controls.autoRotate = false;
      requestDraw();
    };
    const pick = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect();
      let nearest: string | null = null;
      let distance = event.pointerType === "touch" ? 26 : 16;
      scene.updateMatrixWorld();
      camera.updateMatrixWorld();
      for (const node of nodes) {
        world.copy(node.position);
        constellation.localToWorld(world);
        projected.copy(world).project(camera);
        if (projected.z < -1 || projected.z > 1) continue;
        const dx =
          ((projected.x + 1) / 2) * bounds.width + bounds.left - event.clientX;
        const dy =
          ((1 - projected.y) / 2) * bounds.height + bounds.top - event.clientY;
        const separation = Math.hypot(dx, dy);
        if (separation < distance) {
          distance = separation;
          nearest = node.id;
        }
      }
      return nearest;
    };
    let down: { x: number; y: number; pointer: number } | null = null;
    const pointerDown = (event: PointerEvent) => {
      down = { x: event.clientX, y: event.clientY, pointer: event.pointerId };
      stopRotation();
    };
    const pointerMove = (event: PointerEvent) => {
      if (event.buttons || event.pointerType === "touch") return;
      const id = pick(event);
      highlight(id);
      canvas.style.cursor = id ? "pointer" : "grab";
    };
    const pointerUp = (event: PointerEvent) => {
      if (!down || down.pointer !== event.pointerId) return;
      const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y);
      down = null;
      if (moved > 8) return;
      const id = pick(event);
      highlight(id);
      const memory = id && memoryById.get(id);
      if (memory) select.current(memory);
    };
    const pointerLeave = () => {
      down = null;
      if (!keyboardFocus) highlight(null);
      canvas.style.cursor = "grab";
    };
    const focus = () => {
      keyboardFocus = true;
      stopRotation();
      if (!highlighted && nodes.length) highlight(nodes[0].id);
    };
    const blur = () => {
      keyboardFocus = false;
      highlight(null);
    };
    const keydown = (event: KeyboardEvent) => {
      if (!nodes.length) return;
      const backward = event.key === "ArrowLeft" || event.key === "ArrowUp";
      if (backward || event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        const current = nodes.findIndex((node) => node.id === highlighted);
        highlight(
          nodes[(current + (backward ? -1 : 1) + nodes.length) % nodes.length]
            .id,
        );
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        const memory = highlighted && memoryById.get(highlighted);
        if (memory) select.current(memory);
      } else if (["+", "=", "-"].includes(event.key)) {
        event.preventDefault();
        const offset = camera.position.clone().sub(controls.target);
        const distance = THREE.MathUtils.clamp(
          offset.length() * (event.key === "-" ? 1.15 : 0.87),
          controls.minDistance,
          controls.maxDistance,
        );
        camera.position.copy(controls.target).add(offset.setLength(distance));
        controls.update();
        requestDraw();
      } else if (event.key === "Escape") {
        highlight(null);
      }
    };
    const lost = (event: Event) => {
      event.preventDefault();
      contextLost = true;
      setUnsupported(true);
      pause();
    };
    const restored = () => {
      contextLost = false;
      setUnsupported(false);
      resize();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(element);
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      onscreen = entry.isIntersecting;
      pause();
    });
    intersectionObserver.observe(element);
    const policyChanged = () => {
      controls.autoRotate = rotating();
      pause();
    };
    reducedMotion.addEventListener("change", policyChanged);
    document.addEventListener("visibilitychange", pause);
    controls.addEventListener("change", requestDraw);
    controls.addEventListener("start", stopRotation);
    canvas.addEventListener("pointerdown", pointerDown);
    canvas.addEventListener("pointermove", pointerMove);
    canvas.addEventListener("pointerup", pointerUp);
    canvas.addEventListener("pointercancel", pointerLeave);
    canvas.addEventListener("pointerleave", pointerLeave);
    canvas.addEventListener("focus", focus);
    canvas.addEventListener("blur", blur);
    canvas.addEventListener("keydown", keydown);
    canvas.addEventListener("webglcontextlost", lost);
    canvas.addEventListener("webglcontextrestored", restored);
    controller.current = {
      setMemories,
      setGreen: (enabled) => {
        lowEnergy = enabled;
        resize();
        policyChanged();
      },
    };
    resize();
    return () => {
      disposed = true;
      controller.current = null;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      reducedMotion.removeEventListener("change", policyChanged);
      document.removeEventListener("visibilitychange", pause);
      controls.removeEventListener("change", requestDraw);
      controls.removeEventListener("start", stopRotation);
      controls.dispose();
      canvas.removeEventListener("pointerdown", pointerDown);
      canvas.removeEventListener("pointermove", pointerMove);
      canvas.removeEventListener("pointerup", pointerUp);
      canvas.removeEventListener("pointercancel", pointerLeave);
      canvas.removeEventListener("pointerleave", pointerLeave);
      canvas.removeEventListener("focus", focus);
      canvas.removeEventListener("blur", blur);
      canvas.removeEventListener("keydown", keydown);
      canvas.removeEventListener("webglcontextlost", lost);
      canvas.removeEventListener("webglcontextrestored", restored);
      for (const resource of [
        geometry,
        coreGeometry,
        coreMaterial,
        coreGlowMaterial,
        glowTexture,
        orbitGeometry,
        orbitMaterial,
        ringGeometry,
        ringMaterial,
        lineMaterial,
        ...materials.values(),
        ...glows.values(),
      ])
        resource.dispose();
      links?.geometry.dispose();
      renderer.dispose();
      canvas.remove();
    };
  }, []);

  useEffect(() => controller.current?.setMemories(memories), [memories]);
  useEffect(() => controller.current?.setGreen(green), [green]);

  return (
    <div className="nebula-canvas" ref={host}>
      {preview && !unsupported && (
        <div
          className="nebula-preview"
          role="status"
          style={{
            position: "absolute",
            left: "50%",
            bottom: 58,
            transform: "translateX(-50%)",
            width: "min(300px, calc(100% - 40px))",
            padding: "9px 13px",
            border: "1px solid #a4d3c530",
            borderRadius: 9,
            background: "#101a1ef2",
            color: "#d4e7df",
            pointerEvents: "none",
            zIndex: 3,
            fontSize: 11,
            boxShadow: "0 8px 24px #0004",
          }}
        >
          <span
            style={{
              display: "block",
              fontSize: 9,
              color: "#95b4a8",
              marginBottom: 4,
            }}
          >
            {preview.status[0].toUpperCase() + preview.status.slice(1)} · Click
            or press Enter to open
          </span>
          <span
            style={{
              display: "block",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {preview.content}
          </span>
        </div>
      )}
      {unsupported && (
        <div className="graph-fallback" role="status">
          <div className="fallback-orbit" />
          <p>3D is unavailable on this device.</p>
          <span>Your memories remain available in the list.</span>
        </div>
      )}
    </div>
  );
}
