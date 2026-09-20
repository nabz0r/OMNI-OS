import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import type { Memory } from "./api";

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
  const select = useRef(onSelect);
  select.current = onSelect;
  const [unsupported, setUnsupported] = useState(false);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "low-power",
      });
    } catch {
      setUnsupported(true);
      return;
    }
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const still = green || reduced;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setClearColor(0x10161b, 1);
    el.appendChild(renderer.domElement);
    renderer.domElement.setAttribute(
      "aria-label",
      `Interactive local vault containing ${memories.length} memories. Use the memory list for accessible editing.`,
    );
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 1, 13.8);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !still;
    controls.enablePan = false;
    controls.minDistance = 6;
    controls.maxDistance = 23;
    controls.autoRotate = !still;
    controls.autoRotateSpeed = 0.25;
    const group = new THREE.Group();
    scene.add(group);
    const geometries: THREE.BufferGeometry[] = [];
    const materials: THREE.Material[] = [];
    function sphere(radius: number, color: number, opacity = 1) {
      const g = new THREE.SphereGeometry(radius, 18, 18);
      const m = new THREE.MeshBasicMaterial({
        color,
        transparent: opacity < 1,
        opacity,
      });
      geometries.push(g);
      materials.push(m);
      return new THREE.Mesh(g, m);
    }
    const core = sphere(0.2, 0xf0c995);
    group.add(core);
    group.add(sphere(0.47, 0xd8b381, 0.07));
    const nodes: THREE.Mesh[] = [];
    const nodeVectors: THREE.Vector3[] = [];
    memories.forEach((memory, i) => {
      const phi = Math.acos(1 - (2 * (i + 0.5)) / Math.max(1, memories.length));
      const theta = Math.PI * (3 - Math.sqrt(5)) * i;
      const radius = 3.3 + Math.sin(i * 2.1) * 0.65;
      const position = new THREE.Vector3(
        radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.cos(phi) * 0.78,
        radius * Math.sin(phi) * Math.sin(theta),
      );
      const color =
        memory.status === "confirmed"
          ? 0x83dccc
          : memory.status === "disputed"
            ? 0xe3a174
            : 0x789bb8;
      const node = sphere(
        0.07 + Math.min(memory.content.length / 5000, 0.045),
        color,
      );
      node.position.copy(position);
      node.userData.memory = memory;
      group.add(node);
      nodes.push(node);
      nodeVectors.push(position);
      const halo = sphere(0.17, color, 0.065);
      halo.position.copy(position);
      group.add(halo);
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(),
        position
          .clone()
          .multiplyScalar(0.55)
          .add(new THREE.Vector3(0.25, 0.4, -0.3)),
        position,
      );
      const geometry = new THREE.BufferGeometry().setFromPoints(
        curve.getPoints(30),
      );
      const material = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.12,
      });
      geometries.push(geometry);
      materials.push(material);
      group.add(new THREE.Line(geometry, material));
    });
    // Ambient particles are decoration, never presented as memories or analytics.
    const dust = new Float32Array(480 * 3);
    for (let i = 0; i < 480; i++) {
      const a = i * 2.39996;
      const y = 1 - (2 * (i + 0.5)) / 480;
      const r = 4.7 + Math.sin(i * 17.37) * 0.9;
      dust[i * 3] = Math.cos(a) * Math.sqrt(1 - y * y) * r;
      dust[i * 3 + 1] = y * r * 0.68;
      dust[i * 3 + 2] = Math.sin(a) * Math.sqrt(1 - y * y) * r;
    }
    const dustGeometry = new THREE.BufferGeometry();
    dustGeometry.setAttribute("position", new THREE.BufferAttribute(dust, 3));
    const dustMaterial = new THREE.PointsMaterial({
      color: 0x96bdbb,
      size: 0.014,
      transparent: true,
      opacity: 0.35,
    });
    geometries.push(dustGeometry);
    materials.push(dustMaterial);
    group.add(new THREE.Points(dustGeometry, dustMaterial));
    for (let j = 0; j < 3; j++) {
      const ringGeometry = new THREE.TorusGeometry(
        4.45 + j * 0.04,
        0.004,
        3,
        160,
      );
      const ringMaterial = new THREE.MeshBasicMaterial({
        color: 0x688d8b,
        transparent: true,
        opacity: 0.13,
      });
      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      ring.rotation.set(1.1 + j * 0.5, 0.3 + j * 0.7, j * 0.8);
      group.add(ring);
      geometries.push(ringGeometry);
      materials.push(ringMaterial);
    }
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(800, 600),
      0.72,
      0.55,
      0.5,
    );
    composer.addPass(bloom);
    let frame = 0,
      last = 0,
      disposed = false;
    const draw = () => {
      if (disposed || document.hidden) return;
      controls.update();
      if (still) renderer.render(scene, camera);
      else composer.render();
    };
    const animate = (now: number) => {
      if (disposed || document.hidden) return;
      frame = requestAnimationFrame(animate);
      if (now - last < 1000 / 30) return;
      last = now;
      draw();
    };
    const resize = () => {
      const { width, height } = el.getBoundingClientRect();
      if (!width || !height) return;
      renderer.setSize(width, height);
      composer.setSize(width, height);
      camera.aspect = width / height;
      camera.position.z = width / height < 1 ? 18 : 13.8;
      camera.updateProjectionMatrix();
      draw();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    resize();
    const visibility = () => {
      cancelAnimationFrame(frame);
      if (!document.hidden) {
        if (still) draw();
        else frame = requestAnimationFrame(animate);
      }
    };
    document.addEventListener("visibilitychange", visibility);
    if (still) controls.addEventListener("change", draw);
    else frame = requestAnimationFrame(animate);
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let downX = 0,
      downY = 0;
    const down = (event: PointerEvent) => {
      downX = event.clientX;
      downY = event.clientY;
    };
    const click = (event: MouseEvent) => {
      if (Math.abs(event.clientX - downX) + Math.abs(event.clientY - downY) > 8)
        return;
      const rect = el.getBoundingClientRect();
      mouse.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        (-(event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(mouse, camera);
      const hit = raycaster.intersectObjects(nodes)[0];
      if (hit) select.current(hit.object.userData.memory as Memory);
    };
    renderer.domElement.addEventListener("pointerdown", down);
    renderer.domElement.addEventListener("click", click);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("visibilitychange", visibility);
      renderer.domElement.removeEventListener("pointerdown", down);
      renderer.domElement.removeEventListener("click", click);
      controls.dispose();
      bloom.dispose();
      composer.dispose();
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, [memories, green]);
  return (
    <div className="nebula-canvas" ref={host}>
      {unsupported && (
        <div className="graph-fallback">
          <div className="fallback-orbit" />
          <p>3D is unavailable on this device.</p>
          <span>Your memories remain available in the list.</span>
        </div>
      )}
    </div>
  );
}
