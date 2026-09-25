"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { PerspectiveCamera } from "@react-three/drei";
import { useReducedMotion } from "framer-motion";
import * as THREE from "three";
import type { BinderListItem } from "@/lib/binders";
import { binderCoverUrl, binderSpineColor } from "@/lib/binder-cover";
import { Panel } from "@/components/ui/Panel";

const BOOK_HEIGHT = 1.42;
const BOOK_DEPTH = 0.82;
const BOOK_GAP = 0.05;

function booksPerShelf(width: number) {
  if (width < 520) return 4;
  if (width < 900) return 6;
  return 8;
}

function bookWidth(totalPages: number) {
  return 0.2 + Math.min(Math.max(totalPages, 1), 18) * 0.012;
}

function chunk<T>(items: T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let i = 0; i < items.length; i += size) groups.push(items.slice(i, i + size));
  return groups;
}

function displayFont() {
  const family = getComputedStyle(document.documentElement)
    .getPropertyValue("--font-bricolage")
    .trim();
  return family || "sans-serif";
}

function makeSpineTexture(name: string, color: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 384;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(255,255,255,0.16)";
  ctx.fillRect(0, 0, 8, canvas.height);
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.fillRect(canvas.width - 8, 0, 8, canvas.height);
  ctx.fillStyle = "#e8a317";
  ctx.fillRect(14, 28, canvas.width - 28, 6);
  ctx.fillRect(14, canvas.height - 36, canvas.width - 28, 6);
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = "#f4efe6";
  ctx.font = `600 34px ${displayFont()}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const label = name.length > 18 ? `${name.slice(0, 17)}…` : name;
  ctx.fillText(label, 0, 0);
  ctx.restore();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function useCoverTexture(url: string | null) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    if (!url) return;
    let disposed = false;
    let current: THREE.Texture | null = null;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    loader.load(
      url,
      (next) => {
        if (disposed) {
          next.dispose();
          return;
        }
        next.colorSpace = THREE.SRGBColorSpace;
        next.anisotropy = 4;
        current = next;
        setTexture(next);
      },
      undefined,
      () => {
        if (!disposed) setTexture(null);
      },
    );
    return () => {
      disposed = true;
      current?.dispose();
      setTexture(null);
    };
  }, [url]);

  return texture;
}

function BinderBook({
  binder,
  x,
  reduceMotion,
  onOpen,
  onHover,
}: {
  binder: BinderListItem;
  x: number;
  reduceMotion: boolean;
  onOpen: (binder: BinderListItem) => void;
  onHover: (name: string | null) => void;
}) {
  const group = useRef<THREE.Group>(null);
  const pull = useRef(0);
  const hovered = useRef(false);
  const color = binderSpineColor(binder);
  const cover = useCoverTexture(binderCoverUrl(binder));
  const width = bookWidth(binder.totalPages);
  const spine = useMemo(() => makeSpineTexture(binder.name, color), [binder.name, color]);

  useEffect(() => () => spine?.dispose(), [spine]);

  useFrame((_, delta) => {
    const node = group.current;
    if (!node || reduceMotion) return;
    const target = hovered.current ? 1 : 0;
    pull.current = THREE.MathUtils.damp(pull.current, target, 8, delta);
    node.position.z = pull.current * 0.38;
    node.rotation.y = pull.current * 0.28;
    node.position.y = pull.current * 0.05;
  });

  const pageColor = "#efe6d6";
  const coverColor = color;

  return (
    <group ref={group} position={[x, 0, 0]}>
      <mesh
        castShadow={false}
        onClick={(event) => {
          event.stopPropagation();
          onOpen(binder);
        }}
        onPointerOver={(event) => {
          event.stopPropagation();
          hovered.current = true;
          onHover(binder.name);
          const canvas = event.nativeEvent.target as HTMLElement | null;
          if (canvas) canvas.style.cursor = "pointer";
        }}
        onPointerOut={(event) => {
          hovered.current = false;
          onHover(null);
          const canvas = event.nativeEvent.target as HTMLElement | null;
          if (canvas) canvas.style.cursor = "";
        }}
      >
        <boxGeometry args={[width, BOOK_HEIGHT, BOOK_DEPTH]} />
        <meshStandardMaterial attach="material-0" color={coverColor} map={cover} roughness={0.55} />
        <meshStandardMaterial attach="material-1" color={coverColor} roughness={0.72} />
        <meshStandardMaterial attach="material-2" color={pageColor} roughness={0.9} />
        <meshStandardMaterial attach="material-3" color="#c9b89a" roughness={0.9} />
        <meshStandardMaterial attach="material-4" map={spine ?? undefined} color={color} roughness={0.62} />
        <meshStandardMaterial attach="material-5" color={coverColor} roughness={0.72} />
      </mesh>
    </group>
  );
}

function Shelf({
  binders,
  pageIndex,
  reduceMotion,
  onOpen,
  onHover,
}: {
  binders: BinderListItem[];
  pageIndex: number;
  reduceMotion: boolean;
  onOpen: (binder: BinderListItem) => void;
  onHover: (name: string | null) => void;
}) {
  const viewport = useThree((state) => state.viewport);
  const widths = binders.map((binder) => bookWidth(binder.totalPages));
  const row =
    widths.reduce((sum, width) => sum + width, 0) + BOOK_GAP * Math.max(widths.length - 1, 0);
  const shelfWidth = row + 1.05;
  const contentHeight = BOOK_HEIGHT + 0.5;
  const fit = Math.min(
    (viewport.width * 0.86) / shelfWidth,
    (viewport.height * 0.7) / contentHeight,
  );
  let cursor = -row / 2;

  return (
    <group position={[0, -pageIndex * viewport.height, 0]}>
      <group scale={fit} rotation={[0.14, 0, 0]}>
        <mesh position={[0, BOOK_HEIGHT / 2 + 0.16, -0.08]}>
          <boxGeometry args={[shelfWidth, 0.07, 1.05]} />
          <meshStandardMaterial color="#4a3426" roughness={0.82} />
        </mesh>
        <mesh position={[0, -0.02, -0.46]}>
          <boxGeometry args={[shelfWidth, BOOK_HEIGHT + 0.28, 0.08]} />
          <meshStandardMaterial color="#3a291c" roughness={0.9} />
        </mesh>
        <mesh position={[0, -BOOK_HEIGHT / 2 - 0.05, 0]}>
          <boxGeometry args={[shelfWidth, 0.09, 1.15]} />
          <meshStandardMaterial color="#5c4030" roughness={0.78} metalness={0.04} />
        </mesh>
        {binders.map((binder, index) => {
          const width = widths[index];
          const x = cursor + width / 2;
          cursor += width + BOOK_GAP;
          return (
            <BinderBook
              key={binder.id}
              binder={binder}
              x={x}
              reduceMotion={reduceMotion}
              onOpen={onOpen}
              onHover={onHover}
            />
          );
        })}
      </group>
    </group>
  );
}

function ShelfTrack({
  shelves,
  scrollRef,
  reduceMotion,
  onOpen,
  onHover,
}: {
  shelves: BinderListItem[][];
  scrollRef: RefObject<HTMLDivElement | null>;
  reduceMotion: boolean;
  onOpen: (binder: BinderListItem) => void;
  onHover: (name: string | null) => void;
}) {
  const group = useRef<THREE.Group>(null);
  const viewport = useThree((state) => state.viewport);
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => invalidate();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [invalidate, scrollRef]);

  useFrame((_, delta) => {
    const node = group.current;
    const el = scrollRef.current;
    if (!node || !el) return;
    const max = el.scrollHeight - el.clientHeight;
    const offset = max > 0 ? el.scrollTop / max : 0;
    const target = offset * viewport.height * Math.max(shelves.length - 1, 0);
    node.position.y = reduceMotion
      ? target
      : THREE.MathUtils.damp(node.position.y, target, 7, delta);
  });

  return (
    <group ref={group}>
      {shelves.map((shelf, index) => (
        <Shelf
          key={shelf.map((binder) => binder.id).join("-")}
          binders={shelf}
          pageIndex={index}
          reduceMotion={reduceMotion}
          onOpen={onOpen}
          onHover={onHover}
        />
      ))}
    </group>
  );
}

function PauseOffscreen({ reduceMotion }: { reduceMotion: boolean }) {
  const set = useThree((state) => state.set);
  useEffect(() => {
    const apply = () => {
      if (reduceMotion) {
        set({ frameloop: "demand" });
        return;
      }
      set({ frameloop: document.hidden ? "never" : "always" });
    };
    apply();
    document.addEventListener("visibilitychange", apply);
    return () => document.removeEventListener("visibilitychange", apply);
  }, [reduceMotion, set]);
  return null;
}

export function BinderLibrary({
  binders,
  onOpen,
}: {
  binders: BinderListItem[];
  onOpen: (binder: BinderListItem) => void;
}) {
  const reduceMotion = useReducedMotion() ?? false;
  const [perShelf, setPerShelf] = useState(8);
  const [hoveredName, setHoveredName] = useState<string | null>(null);

  useEffect(() => {
    const update = () => setPerShelf(booksPerShelf(window.innerWidth));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const shelves = useMemo(() => chunk(binders, perShelf), [binders, perShelf]);
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <div className="flex flex-col gap-3">
      <Panel
        className="relative h-[min(68dvh,640px)] min-h-[22rem] overflow-hidden p-0"
        onWheel={(event) => {
          const el = scrollRef.current;
          if (!el || shelves.length < 2) return;
          el.scrollTop += event.deltaY;
        }}
      >
        <Canvas
          className="absolute inset-0 h-full w-full"
          dpr={[1, 1.5]}
          frameloop={reduceMotion ? "demand" : "always"}
          gl={{
            antialias: true,
            alpha: false,
            powerPreference: "high-performance",
            toneMapping: THREE.NoToneMapping,
          }}
        >
          <PerspectiveCamera makeDefault position={[0, 0.2, 5.5]} fov={38} />
          <color attach="background" args={["#07111f"]} />
          <ambientLight intensity={0.72} />
          <directionalLight position={[1.5, 3.2, 4.5]} intensity={1.15} />
          <PauseOffscreen reduceMotion={reduceMotion} />
          <ShelfTrack
            shelves={shelves}
            scrollRef={scrollRef}
            reduceMotion={reduceMotion}
            onOpen={onOpen}
            onHover={setHoveredName}
          />
        </Canvas>
        <div
          ref={scrollRef}
          aria-hidden
          className={`absolute inset-y-0 right-0 z-10 w-3 ${shelves.length > 1 ? "overflow-y-auto" : "overflow-hidden"}`}
        >
          <div style={{ height: `${Math.max(shelves.length, 1) * 100}%` }} />
        </div>
        <ul className="sr-only">
          {binders.map((binder) => (
            <li key={binder.id}>
              <button type="button" onClick={() => onOpen(binder)}>
                Apri {binder.name}
              </button>
            </li>
          ))}
        </ul>
      </Panel>
      <p className="min-h-5 text-sm text-foreground-muted">
        {hoveredName ?? "Scorri gli scaffali e apri un raccoglitore."}
      </p>
    </div>
  );
}
