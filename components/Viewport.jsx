"use client";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
const EMPTY_POINTS = [];
export default function Viewport({
  objects = [],
  captureRef,
  points = EMPTY_POINTS,
  onPointChange,
  disabled = false,
}) {
  const latest = useRef({ points, onPointChange, disabled });
  latest.current = { points, onPointChange, disabled };
  const [selectedPoint, setSelectedPoint] = useState(null);
  const host = useRef(),
    api = useRef(),
    [wire, setWire] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let r;
    try {
      r = new THREE.WebGLRenderer({
        antialias: true,
        preserveDrawingBuffer: true,
      });
    } catch {
      setError(
        "WebGL is unavailable in this browser. Try enabling hardware acceleration.",
      );
      return;
    }
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.setClearColor(0xf3f2eb);
    host.current.appendChild(r.domElement);
    const scene = new THREE.Scene(),
      camera = new THREE.PerspectiveCamera(38, 1, 0.01, 100000),
      model = new THREE.Group();
    camera.up.set(0, 0, 1);
    camera.position.set(35, -45, 30);
    const controls = new OrbitControls(camera, r.domElement);
    controls.enableDamping = true;
    const handles = new THREE.Group();
    scene.add(handles);
    const transform = new TransformControls(camera, r.domElement);
    transform.setMode("translate");
    transform.setSpace("world");
    transform.setSize(0.85);
    scene.add(transform.getHelper());
    let startingPosition = null;
    transform.addEventListener("dragging-changed", (e) => {
      controls.enabled = !e.value;
    });
    transform.addEventListener("mouseDown", () => {
      startingPosition = transform.object?.position.clone();
    });
    transform.addEventListener("objectChange", () => {
      if (!transform.object || latest.current.disabled) return;
      const p = transform.object.position;
      p.set(
        ...p
          .toArray()
          .map((v) => Math.max(-1e6, Math.min(1e6, Math.round(v * 1e6) / 1e6))),
      );
      latest.current.onPointChange?.(
        transform.object.userData.binding,
        p.toArray(),
      );
    });
    const escape = (e) => {
      if (e.key !== "Escape" || !transform.dragging || !startingPosition)
        return;
      transform.object.position.copy(startingPosition);
      latest.current.onPointChange?.(
        transform.object.userData.binding,
        startingPosition.toArray(),
      );
      transform.reset();
    };
    r.domElement.addEventListener("keydown", escape);
    r.domElement.tabIndex = 0;
    const ray = new THREE.Raycaster();
    const pick = (e) => {
      if (latest.current.disabled || transform.axis || e.button !== 0) return;
      const box = r.domElement.getBoundingClientRect();
      ray.setFromCamera(
        new THREE.Vector2(
          ((e.clientX - box.left) / box.width) * 2 - 1,
          (-(e.clientY - box.top) / box.height) * 2 + 1,
        ),
        camera,
      );
      const hit = ray.intersectObjects(handles.children)[0];
      if (hit) {
        setSelectedPoint(hit.object.userData.binding);
        r.domElement.focus();
      }
    };
    r.domElement.addEventListener("pointerdown", pick);
    scene.add(model, new THREE.HemisphereLight(0xffffff, 0x7e697a, 2.5));
    const light = new THREE.DirectionalLight(0xfff9e9, 3);
    light.position.set(30, -20, 50);
    scene.add(light);
    const grid = new THREE.GridHelper(120, 60, 0xc4c0b6, 0xe0ddd3);
    grid.rotation.x = Math.PI / 2;
    grid.position.z = -0.02;
    scene.add(grid);
    const fit = () => {
      if (!model.children.length && !handles.children.length) return;
      const box = new THREE.Box3().setFromObject(model);
      for (const h of handles.children) box.expandByPoint(h.position);
      const center = box.getCenter(new THREE.Vector3()),
        radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 1),
        distance =
          radius /
          Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) /
          Math.min(camera.aspect, 1);
      const dir = camera.position.clone().sub(controls.target).normalize();
      controls.target.copy(center);
      camera.position.copy(center).addScaledVector(dir, distance * 1.2);
      camera.near = Math.max(radius / 10000, 0.001);
      camera.far = Math.max(distance * 100, 1000);
      camera.updateProjectionMatrix();
      grid.scale.setScalar(Math.max(radius / 22, 0.1));
      grid.position.set(center.x, center.y, box.min.z - radius * 0.005);
      controls.update();
    };
    let visible = false,
      initializedSize = false;
    const resize = new ResizeObserver(() => {
      if (!host.current) return;
      const { width, height } = host.current.getBoundingClientRect();
      visible = width > 0 && height > 0;
      if (!visible) return;
      r.setSize(width, height, false);
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
      if (!initializedSize) {
        initializedSize = true;
        fit();
      }
    });
    resize.observe(host.current);
    r.setAnimationLoop(() => {
      if (!visible) return;
      controls.update();
      for (const h of handles.children)
        h.scale.setScalar(camera.position.distanceTo(h.position) * 0.008);
      r.render(scene, camera);
    });
    api.current = {
      r,
      scene,
      camera,
      model,
      fit,
      handles,
      transform,
      controls,
    };
    if (captureRef)
      captureRef.current = () => {
        r.render(scene, camera);
        return r.domElement.toDataURL("image/png");
      };
    return () => {
      resize.disconnect();
      r.setAnimationLoop(null);
      controls.dispose();
      transform.detach();
      transform.dispose();
      r.domElement.removeEventListener("pointerdown", pick);
      r.domElement.removeEventListener("keydown", escape);
      scene.traverse((x) => {
        x.geometry?.dispose();
        x.material?.dispose();
      });
      r.dispose();
      r.domElement.remove();
      api.current = null;
      if (captureRef) captureRef.current = null;
    };
  }, []);
  useEffect(() => {
    const a = api.current;
    if (!a) return;
    const first = !a.model.children.length;
    while (a.model.children.length) {
      const x = a.model.children[0];
      a.model.remove(x);
      x.geometry?.dispose();
      x.material?.dispose();
    }
    const loader = new THREE.BufferGeometryLoader();
    for (const item of objects) {
      let x;
      if (item.kind === "mesh") {
        const g = loader.parse(item.mesh);
        g.computeVertexNormals();
        x = new THREE.Mesh(
          g,
          new THREE.MeshStandardMaterial({
            color: 0xb891ab,
            roughness: 0.52,
            metalness: 0.08,
            side: THREE.DoubleSide,
            wireframe: wire,
          }),
        );
      } else if (item.kind === "curve")
        x = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(
            item.points.map((p) => new THREE.Vector3(...p)),
          ),
          new THREE.LineBasicMaterial({ color: 0xbc146e }),
        );
      else if (item.kind === "point")
        x = new THREE.Points(
          new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(...item.point),
          ]),
          new THREE.PointsMaterial({
            color: 0xe91b8c,
            size: 5,
            sizeAttenuation: false,
          }),
        );
      if (x) a.model.add(x);
    }
    if (first) a.fit();
  }, [objects, wire]);
  useEffect(() => {
    const a = api.current;
    if (!a) return;
    const firstPoints = !a.handles.children.length && points.length > 0;
    const names = new Set(points.map((p) => p.name));
    for (const h of [...a.handles.children])
      if (!names.has(h.userData.binding)) {
        if (a.transform.object === h) a.transform.detach();
        a.handles.remove(h);
        h.geometry.dispose();
        h.material.dispose();
      }
    for (const point of points) {
      let h = a.handles.children.find((h) => h.userData.binding === point.name);
      if (!h) {
        h = new THREE.Mesh(
          new THREE.SphereGeometry(1, 16, 12),
          new THREE.MeshBasicMaterial({ color: 0xec188e, depthTest: false }),
        );
        h.userData.binding = point.name;
        h.renderOrder = 1000;
        a.handles.add(h);
      }
      if (!a.transform.dragging || a.transform.object !== h)
        h.position.set(...point.position);
    }
    const active = points.some((p) => p.name === selectedPoint)
      ? selectedPoint
      : points[0]?.name;
    const handle = a.handles.children.find(
      (h) => h.userData.binding === active,
    );
    if (handle && !disabled && onPointChange) a.transform.attach(handle);
    else a.transform.detach();
    a.transform.enabled = !disabled;
    a.controls.enabled = !a.transform.dragging;
    if (firstPoints) a.fit();
  }, [points, selectedPoint, disabled, onPointChange]);
  function capture() {
    const a = api.current;
    if (!a) return;
    a.r.render(a.scene, a.camera);
    a.r.domElement.toBlob((blob) => {
      if (!blob) return;
      const u = URL.createObjectURL(blob),
        el = document.createElement("a");
      el.href = u;
      el.download = "modolouge-view.png";
      el.click();
      setTimeout(() => URL.revokeObjectURL(u), 1000);
    });
  }
  return (
    <div className={`viewport-wrap ${points.length ? "has-points" : ""}`}>
      {!!points.length && (
        <div className="viewport-points" aria-label="Point gumballs">
          <span className="eyebrow">MOVE A POINT</span>
          <div>
            {points.map((p, i) => (
              <button
                key={p.name}
                disabled={disabled}
                aria-pressed={(selectedPoint || points[0]?.name) === p.name}
                onClick={() => setSelectedPoint(p.name)}
              >
                {p.label} <span>{i + 1}</span>
              </button>
            ))}
          </div>
          <small>Drag an axis or plane · Update to apply</small>
        </div>
      )}

      <div
        ref={host}
        className="viewport"
        aria-label="Interactive 3D geometry viewport"
      />
      {(!objects.length || error) && (
        <div className="viewport-empty">
          <span className="orb">◎</span>
          <h2>{error || "Room for possibilities."}</h2>
          <p>{error ? "" : "Your geometry will appear here after a solve."}</p>
        </div>
      )}
      <div className="viewport-tools">
        <button onClick={() => api.current?.fit()}>Fit view</button>
        <button aria-pressed={wire} onClick={() => setWire(!wire)}>
          Wireframe
        </button>
        <button onClick={capture}>Save image ↗</button>
      </div>
      <span className="viewport-caption">
        PERSPECTIVE / Z UP / {objects.length} OBJECTS
      </span>
    </div>
  );
}
