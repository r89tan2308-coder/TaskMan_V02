import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent
} from 'react';
import {
  PET_ANIMATIONS,
  PET_ATLAS_COLUMNS,
  PET_ATLAS_ROWS,
  type PetVisualState
} from './petAnimations';
import { onPetEvent } from './petEvents';
import {
  getPetPosition,
  setPetPosition,
  type PetMotionMode,
  type PetPosition
} from './petPreferences';

const LONG_PRESS_MS = 420;
const DRAG_CANCEL_DISTANCE_PX = 8;
const MOUSE_DRAG_START_DISTANCE_PX = 3;
const DRAG_DIRECTION_THRESHOLD_PX = 2;
const PET_EDGE_GUTTER_PX = 10;

const TRANSIENT_STATE_TIMEOUTS: Partial<Record<PetVisualState, number>> = {
  celebrating: 1250,
  jumping: 2300,
  waving: 950,
  failed: 2600,
  running: 1050
};
const vexaSpritesheetUrl = new URL('../../assets/pets/vexa/spritesheet.webp', import.meta.url).href;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const getStaticFrame = (state: PetVisualState) => {
  if (state === 'celebrating' || state === 'jumping') return 2;
  if (state === 'waving') return 1;
  if (state === 'failed') return 5;
  if (state === 'review') return 1;
  return 0;
};

const getDirectionalRunState = (
  deltaX: number,
  fallback: PetVisualState = 'running'
): PetVisualState => {
  if (deltaX > DRAG_DIRECTION_THRESHOLD_PX) return 'running-right';
  if (deltaX < -DRAG_DIRECTION_THRESHOLD_PX) return 'running-left';
  return fallback;
};

const clampPetPosition = (
  left: number,
  top: number,
  width: number,
  height: number
): PetPosition => {
  if (typeof window === 'undefined') return { left, top };
  const maxLeft = Math.max(PET_EDGE_GUTTER_PX, window.innerWidth - width - PET_EDGE_GUTTER_PX);
  const maxTop = Math.max(PET_EDGE_GUTTER_PX, window.innerHeight - height - PET_EDGE_GUTTER_PX);
  return {
    left: Math.min(Math.max(PET_EDGE_GUTTER_PX, left), maxLeft),
    top: Math.min(Math.max(PET_EDGE_GUTTER_PX, top), maxTop)
  };
};

function useSystemReducedMotion() {
  const [reduced, setReduced] = useState(prefersReducedMotion);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = () => setReduced(media.matches);
    handleChange();
    media.addEventListener?.('change', handleChange);
    return () => {
      media.removeEventListener?.('change', handleChange);
    };
  }, []);

  return reduced;
}

export function AppPet({
  enabled,
  baseState,
  motionMode,
  positionResetKey
}: {
  enabled: boolean;
  baseState: PetVisualState;
  motionMode: PetMotionMode;
  positionResetKey: number;
}) {
  const [transientState, setTransientState] = useState<PetVisualState | null>(null);
  const [dragState, setDragState] = useState<PetVisualState | null>(null);
  const [frameIndex, setFrameIndex] = useState(0);
  const [position, setPosition] = useState<PetPosition | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pressing, setPressing] = useState(false);
  const systemReducedMotion = useSystemReducedMotion();
  const petRef = useRef<HTMLDivElement | null>(null);
  const positionRef = useRef<PetPosition | null>(null);
  const transientTimerRef = useRef<number | null>(null);
  const frameTimerRef = useRef<number | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const dragOffsetRef = useRef<{ x: number; y: number } | null>(null);
  const lastDragClientXRef = useRef<number | null>(null);

  const activeState = dragState ?? transientState ?? baseState;
  const animation = PET_ANIMATIONS[activeState];
  const animationPaused = systemReducedMotion || motionMode === 'static';
  const reducedAnimation = motionMode === 'reduced';
  const celebrating = activeState === 'celebrating' && !animationPaused;

  const clearTransientTimer = () => {
    if (transientTimerRef.current !== null) {
      window.clearTimeout(transientTimerRef.current);
      transientTimerRef.current = null;
    }
  };

  const showTransientState = (state: PetVisualState, timeoutMs?: number) => {
    if (!enabled) return;
    clearTransientTimer();
    setTransientState(state);
    const duration = timeoutMs ?? TRANSIENT_STATE_TIMEOUTS[state] ?? 1500;
    transientTimerRef.current = window.setTimeout(() => {
      transientTimerRef.current = null;
      setTransientState((current) => (current === state ? null : current));
    }, duration);
  };

  useEffect(() => {
    if (!enabled) return;
    let mounted = true;
    void getPetPosition().then((savedPosition) => {
      if (!mounted) return;
      if (!savedPosition) {
        setPosition(null);
        return;
      }

      const pet = petRef.current;
      if (!pet) {
        setPosition(savedPosition);
        return;
      }

      const rect = pet.getBoundingClientRect();
      const next = clampPetPosition(savedPosition.left, savedPosition.top, rect.width, rect.height);
      setPosition(next);
      if (next.left !== savedPosition.left || next.top !== savedPosition.top) {
        void setPetPosition(next);
      }
    });
    return () => {
      mounted = false;
    };
  }, [enabled, positionResetKey]);

  useEffect(() => {
    if (!enabled) return;
    return onPetEvent((event) => {
      if (event.type === 'task-completed') {
        showTransientState('celebrating');
        return;
      }
      if (event.type === 'operation-started') {
        showTransientState('running');
        return;
      }
      if (event.type === 'operation-failed') {
        showTransientState('failed');
        return;
      }
      if (event.type === 'route-changed') {
        showTransientState('running', 900);
        return;
      }
    });
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const handleResize = () => {
      const pet = petRef.current;
      if (!pet || !position) return;
      const rect = pet.getBoundingClientRect();
      const next = clampPetPosition(position.left, position.top, rect.width, rect.height);
      if (next.left !== position.left || next.top !== position.top) {
        setPosition(next);
        void setPetPosition(next);
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [enabled, position]);

  useEffect(() => {
    if (frameTimerRef.current !== null) {
      window.clearTimeout(frameTimerRef.current);
      frameTimerRef.current = null;
    }

    if (!enabled || animationPaused) {
      setFrameIndex(getStaticFrame(activeState));
      return;
    }

    let cancelled = false;
    const durations = reducedAnimation
      ? animation.durations.map(() => 900)
      : animation.durations;

    const scheduleFrame = (nextFrame: number) => {
      if (cancelled) return;
      setFrameIndex(nextFrame);
      if (animation.loop === false && nextFrame >= animation.frames - 1) return;
      frameTimerRef.current = window.setTimeout(() => {
        const followingFrame = nextFrame + 1;
        scheduleFrame(followingFrame >= animation.frames ? 0 : followingFrame);
      }, durations[nextFrame] ?? durations[0] ?? 180);
    };

    scheduleFrame(0);

    return () => {
      cancelled = true;
      if (frameTimerRef.current !== null) {
        window.clearTimeout(frameTimerRef.current);
        frameTimerRef.current = null;
      }
    };
  }, [activeState, animation, animationPaused, enabled, reducedAnimation]);

  useEffect(() => {
    return () => {
      clearTransientTimer();
      if (frameTimerRef.current !== null) window.clearTimeout(frameTimerRef.current);
      if (longPressTimerRef.current !== null) window.clearTimeout(longPressTimerRef.current);
    };
  }, []);

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  const setClampedPosition = (next: PetPosition) => {
    positionRef.current = next;
    setPosition(next);
  };

  const startDragging = (event: PointerEvent<HTMLDivElement>) => {
    const pet = petRef.current;
    if (!pet || !pointerStartRef.current) return;
    const rect = pet.getBoundingClientRect();
    dragOffsetRef.current = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
    setClampedPosition(clampPetPosition(rect.left, rect.top, rect.width, rect.height));
    lastDragClientXRef.current = event.clientX;
    clearTransientTimer();
    setTransientState(null);
    setDragState(getDirectionalRunState(event.clientX - pointerStartRef.current.x));
    setDragging(true);
    setPressing(false);
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    pointerStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      pointerId: event.pointerId
    };
    setPressing(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    clearLongPressTimer();
    longPressTimerRef.current = window.setTimeout(() => {
      startDragging(event);
      longPressTimerRef.current = null;
    }, LONG_PRESS_MS);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = pointerStartRef.current;
    if (!start) return;

    if (!dragging) {
      const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y);
      if (event.pointerType === 'mouse' && distance > MOUSE_DRAG_START_DISTANCE_PX) {
        clearLongPressTimer();
        startDragging(event);
        return;
      }
      if (distance > DRAG_CANCEL_DISTANCE_PX) {
        clearLongPressTimer();
        setPressing(false);
      }
      return;
    }

    const pet = petRef.current;
    const offset = dragOffsetRef.current;
    if (!pet || !offset) return;
    event.preventDefault();
    const lastClientX = lastDragClientXRef.current ?? event.clientX;
    setDragState((current) => getDirectionalRunState(event.clientX - lastClientX, current ?? 'running'));
    lastDragClientXRef.current = event.clientX;
    const rect = pet.getBoundingClientRect();
    setClampedPosition(
      clampPetPosition(event.clientX - offset.x, event.clientY - offset.y, rect.width, rect.height)
    );
  };

  const endPointerInteraction = (event: PointerEvent<HTMLDivElement>) => {
    clearLongPressTimer();
    setPressing(false);
    pointerStartRef.current = null;
    dragOffsetRef.current = null;
    lastDragClientXRef.current = null;

    if (dragging && positionRef.current) {
      void setPetPosition(positionRef.current);
    } else {
      showTransientState('waving');
    }
    petRef.current?.releasePointerCapture(event.pointerId);
    setDragState(null);
    setDragging(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    showTransientState('waving');
  };

  const spriteStyle = useMemo(
    () =>
      ({
        backgroundImage: `url("${vexaSpritesheetUrl}")`,
        backgroundPosition: `${(frameIndex / (PET_ATLAS_COLUMNS - 1)) * 100}% ${
          (animation.row / (PET_ATLAS_ROWS - 1)) * 100
        }%`
      } as CSSProperties),
    [animation.row, frameIndex]
  );

  if (!enabled) return null;

  const petStyle = position
    ? ({
        left: `${position.left}px`,
        top: `${position.top}px`
      } as CSSProperties)
    : undefined;

  return (
    <div
      ref={petRef}
      className={`tm-pet ${position ? 'tm-pet-positioned' : ''} ${
        dragging ? 'tm-pet-dragging' : ''
      } ${pressing ? 'tm-pet-pressing' : ''} ${
        celebrating ? 'tm-pet-celebrating' : ''
      }`}
      style={petStyle}
      role="button"
      tabIndex={0}
      aria-label="Vexa companion pet. Long press and drag to move."
      title="Vexa: long press to move"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endPointerInteraction}
      onPointerCancel={endPointerInteraction}
      onKeyDown={handleKeyDown}
    >
      <div className="tm-pet-sprite" style={spriteStyle} />
    </div>
  );
}
