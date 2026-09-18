import { useEffect, useRef } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

/**
 * Managix 3D brand scene — a levelling "sales skyline" of glowing green bars,
 * orbiting gold coins and floating product parcels over a polar grid.
 * Drag anywhere to spin the scene (inertia included). Auto-pauses when the
 * tab is hidden or the element is off-screen, and renders a single static
 * frame when the user prefers reduced motion.
 */
export default function LoginHero3D({ className }: { className?: string }) {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.touchAction = "pan-y";

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x070d12, 0.055);

    const camera = new THREE.PerspectiveCamera(
      42,
      mount.clientWidth / mount.clientHeight,
      0.1,
      120,
    );
    camera.position.set(0, 5.4, 13.5);

    /* ---------------- Lights ---------------- */
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 1.15);
    key.position.set(6, 10, 6);
    scene.add(key);
    const rimA = new THREE.PointLight(0x34d399, 30, 40);
    rimA.position.set(-8, 4, -6);
    scene.add(rimA);
    const rimB = new THREE.PointLight(0x0ea5e9, 18, 40);
    rimB.position.set(8, 3, 8);
    scene.add(rimB);

    /* ---------------- World group (everything that spins) ---------------- */
    const world = new THREE.Group();
    scene.add(world);

    // Polar grid floor
    const grid = new THREE.PolarGridHelper(11, 12, 6, 48, 0x1d3a31, 0x122a22);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.5;
    world.add(grid);

    // Soft glowing disc under the skyline
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(6.4, 48),
      new THREE.MeshBasicMaterial({ color: 0x0f2c21, transparent: true, opacity: 0.85 }),
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.005;
    world.add(disc);

    /* ---------------- Sales skyline ---------------- */
    const COLS = 7;
    const ROWS = 4;
    const CELL = 1.28;
    const barGeo = new RoundedBoxGeometry(0.82, 1, 0.82, 3, 0.09);
    barGeo.translate(0, 0.5, 0); // grow upward
    const barMats: THREE.MeshStandardMaterial[] = [];
    const bars: { mesh: THREE.Mesh; base: number; phase: number }[] = [];

    const barColor = (h: number) =>
      new THREE.Color().setHSL(0.42 - h * 0.1, 0.55 + h * 0.18, 0.3 + h * 0.22);

    let bi = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const h =
          0.55 +
          Math.abs(Math.sin(bi * 1.7 + 1.3) * 0.9 + Math.cos(bi * 0.9) * 0.7) * 1.9;
        const mat = new THREE.MeshStandardMaterial({
          color: barColor(h / 2.6),
          roughness: 0.32,
          metalness: 0.12,
          emissive: barColor(h / 2.6).multiplyScalar(0.22),
        });
        barMats.push(mat);
        const mesh = new THREE.Mesh(barGeo, mat);
        const x = (c - (COLS - 1) / 2) * CELL + (r % 2 ? CELL / 2 : 0);
        const z = (r - (ROWS - 1) / 2) * CELL;
        mesh.position.set(x, 0.02, z);
        mesh.scale.y = h;
        bars.push({ mesh, base: h, phase: Math.random() * Math.PI * 2 });
        world.add(mesh);
        bi++;
      }
    }

    // Top caps: small glowing chips on the tallest bars
    const capGeo = new THREE.BoxGeometry(0.5, 0.1, 0.5);
    const capMat = new THREE.MeshBasicMaterial({ color: 0x8df0c4 });
    bars
      .filter((b) => b.base > 2.1)
      .forEach((b) => {
        const cap = new THREE.Mesh(capGeo, capMat);
        cap.position.y = b.base + 0.09;
        b.mesh.add(cap);
      });

    /* ---------------- Orbiting coins ---------------- */
    const coinGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.09, 28);
    const coinMat = new THREE.MeshStandardMaterial({
      color: 0xf5c451,
      roughness: 0.25,
      metalness: 0.85,
      emissive: 0x6b4c08,
      emissiveIntensity: 0.35,
    });
    interface Coin {
      mesh: THREE.Mesh;
      radius: number;
      speed: number;
      tilt: number;
      offset: number;
      bob: number;
    }
    const coins: Coin[] = [];
    for (let i = 0; i < 9; i++) {
      const mesh = new THREE.Mesh(coinGeo, coinMat);
      const radius = 6.6 + (i % 3) * 1.15;
      const coin: Coin = {
        mesh,
        radius,
        speed: 0.14 + Math.random() * 0.16,
        tilt: 0.28 + Math.random() * 0.42,
        offset: (i / 9) * Math.PI * 2,
        bob: Math.random() * Math.PI * 2,
      };
      coins.push(coin);
      world.add(mesh);
    }

    /* ---------------- Floating product parcels ---------------- */
    const parcelGeo = new RoundedBoxGeometry(0.72, 0.72, 0.72, 3, 0.12);
    const parcelColors = [0x2e8560, 0x0ea5e9, 0xf59e0b, 0x8b5cf6, 0xef4444];
    interface Parcel {
      mesh: THREE.Mesh;
      spin: number;
      bob: number;
      phase: number;
    }
    const parcels: Parcel[] = [];
    for (let i = 0; i < 5; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: parcelColors[i % parcelColors.length],
        roughness: 0.4,
        metalness: 0.1,
      });
      const mesh = new THREE.Mesh(parcelGeo, mat);
      const angle = (i / 5) * Math.PI * 2 + 0.6;
      mesh.position.set(Math.cos(angle) * 5.1, 2.4 + Math.sin(i * 2.1) * 0.7, Math.sin(angle) * 5.1);
      mesh.rotation.set(Math.random() * 0.8, Math.random() * Math.PI, Math.random() * 0.8);
      parcels.push({ mesh, spin: 0.25 + Math.random() * 0.3, bob: 0.5 + Math.random() * 0.4, phase: Math.random() * Math.PI * 2 });
      world.add(mesh);
    }

    /* ---------------- Interaction: drag to spin with inertia ---------------- */
    let spin = 0; // current world rotation (radians)
    let velocity = reduced ? 0 : 0.0016; // idle auto-rotation
    let dragging = false;
    let lastX = 0;
    let tilt = 0;

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
      if (!dragging) return;
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      velocity = dx * 0.0035;
      spin += dx * 0.005;
    };
    const onUp = (e: PointerEvent) => {
      dragging = false;
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      el.style.cursor = "grab";
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointerleave", onUp);
    el.style.cursor = "grab";

    /* ---------------- Resize ---------------- */
    const resize = () => {
      if (!mount.clientWidth || !mount.clientHeight) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    /* ---------------- Visibility gating ---------------- */
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
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!visible || !docVisible) return;
      const t = (performance.now() - t0) / 1000;

      if (!dragging) {
        spin += velocity;
        velocity *= 0.94; // inertia decay toward idle speed
        if (Math.abs(velocity) < 0.0016) velocity = 0.0016 * Math.sign(velocity || 1);
      }
      world.rotation.y = spin;

      if (!reduced) {
        // Gentle camera drift + tilt following pointer spin direction
        tilt += (velocity * 26 - tilt) * 0.04;
        camera.position.y = 5.4 + Math.sin(t * 0.5) * 0.18;
        camera.position.x = Math.sin(t * 0.22) * 0.9;
        camera.lookAt(0, 1.15, 0);
        camera.rotation.z = tilt * 0.25;

        // Bars breathe
        for (const b of bars) {
          b.mesh.scale.y = b.base + Math.sin(t * 0.9 + b.phase) * 0.14;
        }
        // Coins orbit and twirl
        for (const c of coins) {
          const a = t * c.speed + c.offset;
          c.mesh.position.set(
            Math.cos(a) * c.radius,
            1.1 + Math.sin(t * 1.1 + c.bob) * 0.5,
            Math.sin(a) * c.radius,
          );
          c.mesh.rotation.x = c.tilt + t * 0.8;
          c.mesh.rotation.y = t * 0.6;
        }
        // Parcels tumble
        for (const p of parcels) {
          p.mesh.rotation.y += 0.004 * p.spin * 10;
          p.mesh.rotation.x += 0.0018 * p.spin * 10;
          p.mesh.position.y = 2.4 + Math.sin(t * p.bob + p.phase) * 0.55;
        }
        rimA.intensity = 26 + Math.sin(t * 1.6) * 6;
      }
      renderer.render(scene, camera);
    };
    if (reduced) {
      // One static frame
      renderer.render(scene, camera);
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
      el.removeEventListener("pointerleave", onUp);
      barGeo.dispose();
      capGeo.dispose();
      coinGeo.dispose();
      parcelGeo.dispose();
      capMat.dispose();
      coinMat.dispose();
      barMats.forEach((m) => m.dispose());
      parcels.forEach((p) => (p.mesh.material as THREE.Material).dispose());
      disc.geometry.dispose();
      (disc.material as THREE.Material).dispose();
      grid.geometry.dispose();
      (grid.material as THREE.Material).dispose();
      renderer.dispose();
      if (el.parentNode) el.parentNode.removeChild(el);
    };
  }, []);

  return <div ref={mountRef} className={className} aria-hidden="true" />;
}
