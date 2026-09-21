import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { activeLocale, localizeDigits } from "../lib/i18n";

/**
 * Interactive 3D bar chart rendered with Three.js.
 * - Drag horizontally to spin the chart (with inertia), release to ease back.
 * - Hover a bar to highlight it and show its label + formatted value.
 * - Bars animate up when the data changes (period switch).
 * - Axis labels are real HTML (projected each frame), so they stay crisp and
 *   follow dark mode via Tailwind classes.
 * - Respects prefers-reduced-motion, pauses off-screen / hidden tab.
 */
export default function Bar3DChart({
  data,
  formatValue,
  height = 260,
  color = "#1f6a4c",
}: {
  data: { label: string; value: number }[];
  formatValue?: (v: number) => string;
  height?: number;
  color?: string;
}) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fmt = (v: number) =>
      formatValue
        ? formatValue(v)
        : localizeDigits(v.toLocaleString(activeLocale(), { maximumFractionDigits: 0 }));

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, Math.max(mount.clientHeight, 1));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.style.display = "block";
    renderer.domElement.style.touchAction = "pan-y";
    renderer.domElement.style.cursor = "grab";
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, mount.clientWidth / Math.max(mount.clientHeight, 1), 0.1, 100);
    const CAM = new THREE.Vector3(0, 4.6, 9.2);
    camera.position.copy(CAM);
    camera.lookAt(0, 1.15, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(5, 9, 4);
    scene.add(key);
    const accent = new THREE.PointLight(new THREE.Color(color), 14, 30);
    accent.position.set(-6, 5, -4);
    scene.add(accent);

    const world = new THREE.Group();
    scene.add(world);

    const max = Math.max(...data.map((d) => d.value), 0.0001);
    const MAX_H = 2.9;
    const STEP = Math.min(0.92, 7.6 / Math.max(data.length, 1));
    const startX = -((data.length - 1) * STEP) / 2;

    // Base plate + subtle grid
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(Math.max(data.length * STEP + 1.1, 3), 0.12, 2.1),
      new THREE.MeshStandardMaterial({ color: 0xeef1f5, roughness: 0.9, metalness: 0.02 }),
    );
    plate.position.y = -0.06;
    world.add(plate);

    /* ---------------- Bars ---------------- */
    interface Bar {
      mesh: THREE.Mesh;
      target: number; // target scale.y
      baseColor: THREE.Color;
      mat: THREE.MeshStandardMaterial;
    }
    let bars: Bar[] = [];
    const barGeo = new RoundedBoxGeometry(Math.min(STEP * 0.62, 0.62), 1, 0.62, 2, 0.07);
    barGeo.translate(0, 0.5, 0); // pivot at the base

    const buildColor = (ratio: number) => {
      const c = new THREE.Color(color);
      const hsl = { h: 0, s: 0, l: 0 };
      c.getHSL(hsl);
      // Lighter/warmer for taller bars
      return new THREE.Color().setHSL(hsl.h, Math.min(hsl.s + ratio * 0.12, 1), hsl.l + ratio * 0.16);
    };

    const buildBars = () => {
      bars.forEach((b) => {
        world.remove(b.mesh);
        b.mat.dispose();
      });
      bars = data.map((d, i) => {
        const ratio = Math.max(d.value / max, 0.02);
        const c = buildColor(ratio);
        const mat = new THREE.MeshStandardMaterial({
          color: c,
          roughness: 0.35,
          metalness: 0.08,
          emissive: c.clone().multiplyScalar(0.16),
        });
        const mesh = new THREE.Mesh(barGeo, mat);
        mesh.position.set(startX + i * STEP, 0, 0);
        mesh.userData = { label: d.label, value: d.value, ratio };
        mesh.scale.y = reduced ? ratio * MAX_H : 0.001;
        world.add(mesh);
        return { mesh, target: ratio * MAX_H, baseColor: c, mat };
      });
      // Reset camera orbit + hover when data changes
      spin = 0;
      vel = 0;
      setHover(null);
    };

    /* ---------------- HTML axis labels ---------------- */
    const labelHost = document.createElement("div");
    labelHost.className = "pointer-events-none absolute inset-0 overflow-hidden";
    labelHost.setAttribute("aria-hidden", "true");
    mount.appendChild(labelHost);
    const labelEls: HTMLSpanElement[] = data.map((d) => {
      const s = document.createElement("span");
      s.textContent = d.label;
      s.className = "absolute -translate-x-1/2 whitespace-nowrap text-[10px] font-medium text-ink-500";
      labelHost.appendChild(s);
      return s;
    });

    /* ---------------- Interaction ---------------- */
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let spin = 0;
    let vel = 0;
    let dragging = false;
    let lastX = 0;
    let hovered: THREE.Mesh | null = null;

    const pick = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(bars.map((b) => b.mesh), false);
      const next = (hits[0]?.object as THREE.Mesh) ?? null;
      if (next !== hovered) {
        if (hovered) {
          const prev = bars.find((b) => b.mesh === hovered);
          if (prev) prev.mat.emissive.copy(prev.baseColor).multiplyScalar(0.16);
        }
        hovered = next;
        if (hovered) {
          const b = bars.find((x) => x.mesh === hovered)!;
          b.mat.emissive.copy(b.baseColor).multiplyScalar(0.55);
          setHover(`${b.mesh.userData.label}|${b.mesh.userData.value}`);
        } else {
          setHover(null);
        }
        renderer.domElement.style.cursor = hovered ? "pointer" : dragging ? "grabbing" : "grab";
      }
    };

    const el = renderer.domElement;
    const onDown = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* synthetic or already-released pointer — drag still works */
      }
      el.style.cursor = "grabbing";
    };
    const onMove = (e: PointerEvent) => {
      if (dragging) {
        const dx = e.clientX - lastX;
        lastX = e.clientX;
        spin += dx * 0.006;
        vel = dx * 0.0022;
      }
      pick(e);
    };
    const onUp = (e: PointerEvent) => {
      dragging = false;
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      el.style.cursor = hovered ? "pointer" : "grab";
    };
    const onLeave = () => {
      if (hovered) {
        const b = bars.find((x) => x.mesh === hovered);
        if (b) b.mat.emissive.copy(b.baseColor).multiplyScalar(0.16);
      }
      hovered = null;
      setHover(null);
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointerleave", onLeave);

    /* ---------------- Data updates ---------------- */
    buildBars();

    /* ---------------- Resize / visibility ---------------- */
    const resize = () => {
      if (!mount.clientWidth || !mount.clientHeight) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    let visible = true;
    const io = new IntersectionObserver((entries) => {
      visible = entries[0]?.isIntersecting ?? true;
    });
    io.observe(mount);
    let docVisible = !document.hidden;
    const onVis = () => {
      docVisible = !document.hidden;
    };
    document.addEventListener("visibilitychange", onVis);

    /* ---------------- Loop ---------------- */
    const t0 = performance.now();
    let raf = 0;
    const anchor = new THREE.Vector3();

    const placeLabels = () => {
      const rect = mount.getBoundingClientRect();
      data.forEach((d, i) => {
        const elLabel = labelEls[i];
        if (!elLabel) return;
        anchor.set(startX + i * STEP, -0.02, 1.35);
        world.localToWorld(anchor);
        anchor.project(camera);
        const x = (anchor.x * 0.5 + 0.5) * rect.width;
        const y = (-anchor.y * 0.5 + 0.5) * rect.height;
        // Hide labels that rotate behind the chart
        const behind = anchor.z > 1;
        elLabel.style.opacity = behind ? "0" : "1";
        elLabel.style.transform = `translate(${x}px, ${y}px) translateX(-50%)`;
      });
    };

    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!visible || !docVisible) return;
      const t = (performance.now() - t0) / 1000;

      if (!dragging) {
        if (Math.abs(spin) > 0.0001 || Math.abs(vel) > 0.0001) {
          spin += vel;
          vel *= 0.92;
          // Ease back toward the front view when idle
          spin *= 0.985;
        }
      }
      world.rotation.y = spin;

      for (const b of bars) {
        // Grow-in + gentle shimmer
        b.mesh.scale.y += (b.target - b.mesh.scale.y) * 0.12;
        if (!reduced) {
          const s = 1 + Math.sin(t * 1.4 + b.mesh.position.x * 2.1) * 0.012;
          b.mesh.scale.x = s;
          b.mesh.scale.z = s;
        }
      }

      if (!reduced) {
        camera.position.y = CAM.y + Math.sin(t * 0.55) * 0.14;
        camera.lookAt(0, 1.15, 0);
        accent.intensity = 12 + Math.sin(t * 1.7) * 3.5;
      }

      renderer.render(scene, camera);
      placeLabels();
    };
    if (reduced) {
      // Single static frame with fully grown bars
      bars.forEach((b) => (b.mesh.scale.y = b.target));
      renderer.render(scene, camera);
      placeLabels();
    } else {
      tick();
    }

    /* ---------------- Cleanup ---------------- */
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointerleave", onLeave);
      labelEls.forEach((s) => s.remove());
      labelHost.remove();
      bars.forEach((b) => b.mat.dispose());
      barGeo.dispose();
      plate.geometry.dispose();
      (plate.material as THREE.Material).dispose();
      renderer.dispose();
      if (el.parentNode) el.parentNode.removeChild(el);
    };
    // Rebuild the whole scene when the dataset changes (period switch).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(data), color, height]);

  return (
    <div
      ref={mountRef}
      className="relative w-full select-none"
      style={{ height }}
      role="img"
      aria-label={
        "3D bar chart: " +
        data.map((d) => `${d.label} ${formatValue ? formatValue(d.value) : d.value}`).join(", ")
      }
    >
      {hover ? (
        (() => {
          const [label, value] = hover.split("|");
          return (
            <div className="pointer-events-none absolute left-1/2 top-2 z-10 -translate-x-1/2 rounded-lg bg-ink-900/92 px-3 py-1.5 text-xs font-semibold text-white shadow-pop">
              {label}: {formatValue ? formatValue(Number(value)) : value}
            </div>
          );
        })()
      ) : null}
      {!hover && data.length > 0 ? (
        <span className="pointer-events-none absolute bottom-1.5 right-2 z-10 rounded bg-white/70 px-1.5 py-0.5 text-[10px] text-ink-400 ring-1 ring-ink-200/70 dark:bg-ink-900/60">
          drag to rotate · hover bars
        </span>
      ) : null}
    </div>
  );
}
