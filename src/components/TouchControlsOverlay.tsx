import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  resolveMultiTouchJoystick,
  combineDpadDirections,
  type MultiTouchJoystickState,
  type TouchPointInput,
} from '../game/rules';

export interface TouchControlsOverlayProps {
  visible: boolean;
  dashCooldown: number;
  novaCooldown: number;
  potionCount: number;
  nearbyPrompt: string | null;
  attackDamage: number;
  novaDamage: number;
  cameraPresetLabel: string;
  cameraYawDeg: number;
  sprintEnabled: boolean;
  cameraAutoFollow: boolean;
  onMoveVectorChange: (vec: { moveX: number; moveZ: number }) => void;
  onCameraRotateChange: (dir: number) => void;
  onCycleCameraPreset: () => void;
  onResetCamera: () => void;
  onToggleSprint: () => void;
  onToggleCameraAutoFollow: () => void;
  onAttack: () => void;
  onDash: () => void;
  onNova: () => void;
  onHeal: () => void;
  onInteract: () => void;
}

type DpadDir = 'up' | 'down' | 'left' | 'right';
type ActionKey = 'attack' | 'dash' | 'nova' | 'heal' | 'interact';
type CamRotKey = 'left' | 'right';

const INITIAL_JOYSTICK_STATE: MultiTouchJoystickState = {
  activeTouchId: null,
  originX: 0,
  originY: 0,
  knobX: 0,
  knobY: 0,
  moveX: 0,
  moveZ: 0,
  magnitude: 0,
};

function touchListToArray(list: React.TouchList | TouchList): TouchPointInput[] {
  const arr: TouchPointInput[] = [];
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    arr.push({
      identifier: t.identifier,
      clientX: t.clientX,
      clientY: t.clientY,
    });
  }
  return arr;
}

export const TouchControlsOverlay: React.FC<TouchControlsOverlayProps> = ({
  visible,
  dashCooldown,
  novaCooldown,
  potionCount,
  nearbyPrompt,
  attackDamage,
  novaDamage,
  cameraPresetLabel,
  cameraYawDeg,
  sprintEnabled,
  cameraAutoFollow,
  onMoveVectorChange,
  onCameraRotateChange,
  onCycleCameraPreset,
  onResetCamera,
  onToggleSprint,
  onToggleCameraAutoFollow,
  onAttack,
  onDash,
  onNova,
  onHeal,
  onInteract,
}) => {
  const padRef = useRef<HTMLDivElement | null>(null);
  const joyStateRef = useRef<MultiTouchJoystickState>(INITIAL_JOYSTICK_STATE);
  // Map of pointerId/touchId -> DpadDir for multi-touch D-Pad chording
  const dpadTouchesRef = useRef<Map<number, DpadDir>>(new Map());
  // Map of ActionKey -> Set of active touch/pointer IDs
  const actionTouchesRef = useRef<Record<ActionKey, Set<number>>>({
    attack: new Set(),
    dash: new Set(),
    nova: new Set(),
    heal: new Set(),
    interact: new Set(),
  });
  const camRotTouchesRef = useRef<Record<CamRotKey, Set<number>>>({
    left: new Set(),
    right: new Set(),
  });
  const lastActionFireTimeRef = useRef<Record<ActionKey, number>>({
    attack: -1000,
    dash: -1000,
    nova: -1000,
    heal: -1000,
    interact: -1000,
  });

  const [knobOffset, setKnobOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [activeDirectionLabel, setActiveDirectionLabel] = useState<string>('BEREIT');
  const [isMoving, setIsMoving] = useState<boolean>(false);
  const [pressedActions, setPressedActions] = useState<Record<ActionKey, boolean>>({
    attack: false,
    dash: false,
    nova: false,
    heal: false,
    interact: false,
  });
  const [pressedCamRot, setPressedCamRot] = useState<Record<CamRotKey, boolean>>({
    left: false,
    right: false,
  });

  const syncCameraRotation = useCallback(() => {
    const leftActive = camRotTouchesRef.current.left.size > 0;
    const rightActive = camRotTouchesRef.current.right.size > 0;
    setPressedCamRot((prev) =>
      prev.left === leftActive && prev.right === rightActive
        ? prev
        : { left: leftActive, right: rightActive },
    );
    const dir = (rightActive ? 1 : 0) - (leftActive ? 1 : 0);
    onCameraRotateChange(dir);
  }, [onCameraRotateChange]);

  const syncCombinedMovement = useCallback(() => {
    const js = joyStateRef.current;
    if (js.activeTouchId !== null) {
      setKnobOffset({ x: js.knobX, y: js.knobY });
      setIsMoving(js.magnitude >= 0.08);
      onMoveVectorChange({ moveX: js.moveX, moveZ: js.moveZ });

      if (js.magnitude < 0.08) {
        setActiveDirectionLabel('BEREIT');
      } else {
        const angleDeg = (Math.atan2(js.moveZ, js.moveX) * 180) / Math.PI;
        if (angleDeg >= -22.5 && angleDeg < 22.5) setActiveDirectionLabel('VORWÄRTS');
        else if (angleDeg >= 22.5 && angleDeg < 67.5) setActiveDirectionLabel('VORWÄRTS-RECHTS');
        else if (angleDeg >= 67.5 && angleDeg < 112.5) setActiveDirectionLabel('RECHTS');
        else if (angleDeg >= 112.5 && angleDeg < 157.5) setActiveDirectionLabel('RÜCKWÄRTS-RECHTS');
        else if (angleDeg >= 157.5 || angleDeg < -157.5) setActiveDirectionLabel('RÜCKWÄRTS');
        else if (angleDeg >= -157.5 && angleDeg < -112.5) setActiveDirectionLabel('RÜCKWÄRTS-LINKS');
        else if (angleDeg >= -112.5 && angleDeg < -67.5) setActiveDirectionLabel('LINKS');
        else setActiveDirectionLabel('VORWÄRTS-LINKS');
      }
      return;
    }

    // Otherwise check active D-Pad touches/pointers
    if (dpadTouchesRef.current.size > 0) {
      const combined = combineDpadDirections(dpadTouchesRef.current.values(), 38);
      setKnobOffset({ x: combined.knobX, y: combined.knobY });
      setActiveDirectionLabel(combined.label);
      setIsMoving(Math.hypot(combined.moveX, combined.moveZ) > 0.05);
      onMoveVectorChange({ moveX: combined.moveX, moveZ: combined.moveZ });
      return;
    }

    setKnobOffset({ x: 0, y: 0 });
    setActiveDirectionLabel('BEREIT');
    setIsMoving(false);
    onMoveVectorChange({ moveX: 0, moveZ: 0 });
  }, [onMoveVectorChange]);

  // Continuous Hold-to-Combo loop while the Attack button is held down (allows running + slashing simultaneously)
  useEffect(() => {
    if (!pressedActions.attack) return;
    const timer = window.setInterval(() => {
      onAttack();
    }, 180);
    return () => window.clearInterval(timer);
  }, [pressedActions.attack, onAttack]);

  // Reset all multi-touch states on window blur or visibility loss so touches never stick
  useEffect(() => {
    const clearAllTouches = () => {
      joyStateRef.current = INITIAL_JOYSTICK_STATE;
      dpadTouchesRef.current.clear();
      (Object.keys(actionTouchesRef.current) as ActionKey[]).forEach((k) =>
        actionTouchesRef.current[k].clear(),
      );
      camRotTouchesRef.current.left.clear();
      camRotTouchesRef.current.right.clear();
      setPressedActions({
        attack: false,
        dash: false,
        nova: false,
        heal: false,
        interact: false,
      });
      setPressedCamRot({ left: false, right: false });
      syncCombinedMovement();
      syncCameraRotation();
    };
    window.addEventListener('blur', clearAllTouches);
    return () => window.removeEventListener('blur', clearAllTouches);
  }, [syncCombinedMovement, syncCameraRotation]);

  const getPadCenter = () => {
    const rect = padRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  };

  // --- ANALOG JOYSTICK MULTI-TOUCH HANDLERS (TouchEvent + non-touch PointerEvent) ---
  const handleJoystickTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.stopPropagation();
    const center = getPadCenter();
    joyStateRef.current = resolveMultiTouchJoystick(
      joyStateRef.current,
      'start',
      touchListToArray(e.changedTouches),
      center,
      50,
    );
    syncCombinedMovement();
  };

  const handleJoystickTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (joyStateRef.current.activeTouchId === null) return;
    e.stopPropagation();
    joyStateRef.current = resolveMultiTouchJoystick(
      joyStateRef.current,
      'move',
      touchListToArray(e.changedTouches),
      undefined,
      50,
    );
    syncCombinedMovement();
  };

  const handleJoystickTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (joyStateRef.current.activeTouchId === null) return;
    e.stopPropagation();
    joyStateRef.current = resolveMultiTouchJoystick(
      joyStateRef.current,
      'end',
      touchListToArray(e.changedTouches),
      undefined,
      50,
    );
    syncCombinedMovement();
  };

  const handleJoystickPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') return; // Handled by native TouchEvent for full multi-touch
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    e.stopPropagation();
    const center = getPadCenter();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    joyStateRef.current = resolveMultiTouchJoystick(
      joyStateRef.current,
      'start',
      [{ identifier: e.pointerId, clientX: e.clientX, clientY: e.clientY }],
      center,
      50,
    );
    syncCombinedMovement();
  };

  const handleJoystickPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') return;
    if (joyStateRef.current.activeTouchId !== e.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    joyStateRef.current = resolveMultiTouchJoystick(
      joyStateRef.current,
      'move',
      [{ identifier: e.pointerId, clientX: e.clientX, clientY: e.clientY }],
      undefined,
      50,
    );
    syncCombinedMovement();
  };

  const handleJoystickPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') return;
    if (joyStateRef.current.activeTouchId !== e.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    joyStateRef.current = resolveMultiTouchJoystick(
      joyStateRef.current,
      'end',
      [{ identifier: e.pointerId, clientX: e.clientX, clientY: e.clientY }],
      undefined,
      50,
    );
    syncCombinedMovement();
  };

  // --- D-PAD DIRECTIONAL MULTI-TOUCH HANDLERS ---
  const bindDpadHandlers = (dir: DpadDir) => ({
    onTouchStart: (e: React.TouchEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      for (let i = 0; i < e.changedTouches.length; i++) {
        dpadTouchesRef.current.set(e.changedTouches[i].identifier, dir);
      }
      syncCombinedMovement();
    },
    onTouchEnd: (e: React.TouchEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      for (let i = 0; i < e.changedTouches.length; i++) {
        dpadTouchesRef.current.delete(e.changedTouches[i].identifier);
      }
      syncCombinedMovement();
    },
    onTouchCancel: (e: React.TouchEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      for (let i = 0; i < e.changedTouches.length; i++) {
        dpadTouchesRef.current.delete(e.changedTouches[i].identifier);
      }
      syncCombinedMovement();
    },
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.pointerType === 'touch') return;
      e.stopPropagation();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      dpadTouchesRef.current.set(e.pointerId, dir);
      syncCombinedMovement();
    },
    onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.pointerType === 'touch') return;
      e.stopPropagation();
      dpadTouchesRef.current.delete(e.pointerId);
      syncCombinedMovement();
    },
    onPointerCancel: (e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.pointerType === 'touch') return;
      e.stopPropagation();
      dpadTouchesRef.current.delete(e.pointerId);
      syncCombinedMovement();
    },
    onClick: (e: React.MouseEvent<HTMLButtonElement>) => {
      e.currentTarget.blur();
      // If triggered by accessibility/keyboard click where no touch/pointer hold is active, pulse for 260ms
      if (dpadTouchesRef.current.size === 0 && joyStateRef.current.activeTouchId === null) {
        const syntheticId = -999;
        dpadTouchesRef.current.set(syntheticId, dir);
        syncCombinedMovement();
        window.setTimeout(() => {
          dpadTouchesRef.current.delete(syntheticId);
          syncCombinedMovement();
        }, 260);
      }
    },
  });

  // --- RIGHT CLUSTER ACTION BUTTON MULTI-TOUCH HANDLERS ---
  const fireActionOnce = (key: ActionKey, callback: () => void) => {
    const now = performance.now();
    if (now - lastActionFireTimeRef.current[key] < 70) return;
    lastActionFireTimeRef.current[key] = now;
    callback();
  };

  const updateActionPressedState = (key: ActionKey) => {
    const isPressed = actionTouchesRef.current[key].size > 0;
    setPressedActions((prev) =>
      prev[key] === isPressed ? prev : { ...prev, [key]: isPressed },
    );
  };

  const bindActionButtonHandlers = (key: ActionKey, callback: () => void) => ({
    onTouchStart: (e: React.TouchEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      for (let i = 0; i < e.changedTouches.length; i++) {
        actionTouchesRef.current[key].add(e.changedTouches[i].identifier);
      }
      updateActionPressedState(key);
      fireActionOnce(key, callback);
    },
    onTouchEnd: (e: React.TouchEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      for (let i = 0; i < e.changedTouches.length; i++) {
        actionTouchesRef.current[key].delete(e.changedTouches[i].identifier);
      }
      updateActionPressedState(key);
    },
    onTouchCancel: (e: React.TouchEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      for (let i = 0; i < e.changedTouches.length; i++) {
        actionTouchesRef.current[key].delete(e.changedTouches[i].identifier);
      }
      updateActionPressedState(key);
    },
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.pointerType === 'touch') return;
      e.stopPropagation();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      actionTouchesRef.current[key].add(e.pointerId);
      updateActionPressedState(key);
      fireActionOnce(key, callback);
    },
    onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.pointerType === 'touch') return;
      e.stopPropagation();
      actionTouchesRef.current[key].delete(e.pointerId);
      updateActionPressedState(key);
    },
    onPointerCancel: (e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.pointerType === 'touch') return;
      e.stopPropagation();
      actionTouchesRef.current[key].delete(e.pointerId);
      updateActionPressedState(key);
    },
    onClick: (e: React.MouseEvent<HTMLButtonElement>) => {
      e.currentTarget.blur();
      fireActionOnce(key, callback);
    },
  });

  // --- MULTI-TOUCH CAMERA ORBIT HANDLERS ---
  const bindCamRotHandlers = (dir: CamRotKey) => ({
    onTouchStart: (e: React.TouchEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      for (let i = 0; i < e.changedTouches.length; i++) {
        camRotTouchesRef.current[dir].add(e.changedTouches[i].identifier);
      }
      syncCameraRotation();
    },
    onTouchEnd: (e: React.TouchEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      for (let i = 0; i < e.changedTouches.length; i++) {
        camRotTouchesRef.current[dir].delete(e.changedTouches[i].identifier);
      }
      syncCameraRotation();
    },
    onTouchCancel: (e: React.TouchEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      for (let i = 0; i < e.changedTouches.length; i++) {
        camRotTouchesRef.current[dir].delete(e.changedTouches[i].identifier);
      }
      syncCameraRotation();
    },
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.pointerType === 'touch') return;
      e.stopPropagation();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      camRotTouchesRef.current[dir].add(e.pointerId);
      syncCameraRotation();
    },
    onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.pointerType === 'touch') return;
      e.stopPropagation();
      camRotTouchesRef.current[dir].delete(e.pointerId);
      syncCameraRotation();
    },
    onPointerCancel: (e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.pointerType === 'touch') return;
      e.stopPropagation();
      camRotTouchesRef.current[dir].delete(e.pointerId);
      syncCameraRotation();
    },
    onClick: (e: React.MouseEvent<HTMLButtonElement>) => {
      e.currentTarget.blur();
      // If triggered by accessibility/keyboard click where no pointer hold is active, pulse for 220ms
      if (camRotTouchesRef.current.left.size === 0 && camRotTouchesRef.current.right.size === 0) {
        const syntheticId = -888;
        camRotTouchesRef.current[dir].add(syntheticId);
        syncCameraRotation();
        window.setTimeout(() => {
          camRotTouchesRef.current[dir].delete(syntheticId);
          syncCameraRotation();
        }, 220);
      }
    },
  });

  if (!visible) return null;

  const anyActionPressed =
    pressedActions.attack ||
    pressedActions.dash ||
    pressedActions.nova ||
    pressedActions.heal ||
    pressedActions.interact ||
    pressedCamRot.left ||
    pressedCamRot.right;
  const isSimultaneousMultiTouch = isMoving && anyActionPressed;

  return (
    <div
      data-testid="touch-controls-overlay"
      data-multitouch-active={isSimultaneousMultiTouch ? 'true' : 'false'}
      aria-label="Touch-Steuerung Overlay"
      className="pointer-events-none fixed inset-0 z-20 select-none"
    >
      {/* LEFT THUMB ZONE: Sprint Toggle + Multi-Touch 360° Virtual Analog Joystick + 4-Way D-Pad Segments */}
      <div className="pointer-events-auto fixed bottom-24 left-4 md:bottom-24 md:left-6 flex flex-col items-center gap-1.5">
        <button
          type="button"
          tabIndex={-1}
          aria-label={sprintEnabled ? 'Sprint deaktivieren [Shift]' : 'Sprint aktivieren [Shift]'}
          onClick={(e) => {
            e.currentTarget.blur();
            onToggleSprint();
          }}
          className={`flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[10px] font-mono font-bold tracking-wider shadow-lg touch-none transition-colors ${
            sprintEnabled
              ? 'border-amber-300 bg-amber-500 text-black'
              : 'border-amber-500/40 bg-[#120f1ae8] text-amber-200 hover:bg-[#1e182d]'
          }`}
        >
          <span>{sprintEnabled ? 'SPRINT · AKTIV (+38%)' : 'SPRINT · EIN [SHIFT]'}</span>
        </button>

        <div
          ref={padRef}
          data-testid="touch-joystick-zone"
          onTouchStart={handleJoystickTouchStart}
          onTouchMove={handleJoystickTouchMove}
          onTouchEnd={handleJoystickTouchEnd}
          onTouchCancel={handleJoystickTouchEnd}
          onPointerDown={handleJoystickPointerDown}
          onPointerMove={handleJoystickPointerMove}
          onPointerUp={handleJoystickPointerUp}
          onPointerCancel={handleJoystickPointerUp}
          className={`relative flex h-36 w-36 items-center justify-center rounded-full border-2 ${
            isMoving ? 'border-amber-400 bg-[#1a1528f0]' : 'border-amber-500/45 bg-[#120f1ae8]'
          } shadow-2xl touch-none transition-colors duration-100`}
        >
          {/* Decorative Engraved Compass Ring SVG */}
          <svg
            viewBox="0 0 120 120"
            className="pointer-events-none absolute inset-0 h-full w-full opacity-45"
          >
            <circle
              cx="60"
              cy="60"
              r="52"
              fill="none"
              stroke="#f59e0b"
              strokeWidth="1.2"
              strokeDasharray="6 4"
            />
            <circle cx="60" cy="60" r="26" fill="none" stroke="#fde68a" strokeWidth="0.8" />
            <line x1="60" y1="8" x2="60" y2="22" stroke="#f59e0b" strokeWidth="1.5" />
            <line x1="60" y1="98" x2="60" y2="112" stroke="#f59e0b" strokeWidth="1.5" />
            <line x1="8" y1="60" x2="22" y2="60" stroke="#f59e0b" strokeWidth="1.5" />
            <line x1="98" y1="60" x2="112" y2="60" stroke="#f59e0b" strokeWidth="1.5" />
          </svg>

          {/* 4 Accessible Multi-Touch Directional D-Pad Buttons (>= 44x44px hitboxes) */}
          <button
            type="button"
            tabIndex={-1}
            aria-label="Touch-Bewegung Vorwärts [W]"
            {...bindDpadHandlers('up')}
            className="absolute top-0.5 left-1/2 -translate-x-1/2 flex h-11 w-11 items-center justify-center rounded-full text-amber-300 hover:bg-amber-500/20 active:scale-95 touch-none"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
              <path d="M12 5l7 7H5l7-7z" />
            </svg>
          </button>

          <button
            type="button"
            tabIndex={-1}
            aria-label="Touch-Bewegung Rückwärts [S]"
            {...bindDpadHandlers('down')}
            className="absolute bottom-0.5 left-1/2 -translate-x-1/2 flex h-11 w-11 items-center justify-center rounded-full text-amber-300 hover:bg-amber-500/20 active:scale-95 touch-none"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
              <path d="M12 19l-7-7h14l-7 7z" />
            </svg>
          </button>

          <button
            type="button"
            tabIndex={-1}
            aria-label="Touch-Bewegung Links [A]"
            {...bindDpadHandlers('left')}
            className="absolute left-0.5 top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full text-amber-300 hover:bg-amber-500/20 active:scale-95 touch-none"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
              <path d="M5 12l7-7v14l-7-7z" />
            </svg>
          </button>

          <button
            type="button"
            tabIndex={-1}
            aria-label="Touch-Bewegung Rechts [D]"
            {...bindDpadHandlers('right')}
            className="absolute right-0.5 top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full text-amber-300 hover:bg-amber-500/20 active:scale-95 touch-none"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
              <path d="M19 12l-7 7V5l7 7z" />
            </svg>
          </button>

          {/* Movable Thumb Stick Knob */}
          <div
            data-testid="touch-joystick-knob"
            style={{
              transform: `translate3d(${knobOffset.x}px, ${knobOffset.y}px, 0)`,
            }}
            className="pointer-events-none flex h-14 w-14 items-center justify-center rounded-full border-2 border-amber-300 bg-[#271f3b] shadow-lg transition-transform duration-75"
          >
            <div className="h-5 w-5 rounded-full bg-amber-400 shadow-inner" />
          </div>
        </div>

        {/* Status Readout under Joystick */}
        <span className="font-mono text-[10px] font-bold tracking-wider text-stone-300 tabular-nums">
          360° STICK · {activeDirectionLabel}
        </span>
      </div>

      {/* RIGHT THUMB ZONE: Multi-Touch Camera Controls + Combat & Skill Action Cluster */}
      <div className="pointer-events-auto fixed bottom-24 right-4 md:bottom-24 md:right-6 flex flex-col items-end gap-2">
        {/* Multi-Touch Camera Control Strip (Orbit Left, Cycle Preset, Orbit Right, Auto-Follow, Reset Camera) */}
        <div
          aria-label="Touch-Kamera-Steuerung"
          className="flex items-center gap-1.5 rounded-xl border border-amber-500/35 bg-[#120f1ae8] p-1 shadow-xl"
        >
          <button
            type="button"
            tabIndex={-1}
            aria-label="Kamera Links drehen"
            {...bindCamRotHandlers('left')}
            className={`flex h-10 w-10 items-center justify-center rounded-lg border ${
              pressedCamRot.left
                ? 'border-amber-300 bg-amber-500/30 text-white scale-95'
                : 'border-white/10 bg-[#1c1729] text-amber-300'
            } hover:bg-[#2a223d] touch-none transition-transform duration-75`}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </button>

          <button
            type="button"
            tabIndex={-1}
            aria-label={`Kamera-Perspektive wechseln (${cameraPresetLabel}) [C]`}
            onClick={(e) => {
              e.currentTarget.blur();
              onCycleCameraPreset();
            }}
            className="flex h-10 items-center gap-1.5 rounded-lg border border-amber-500/35 bg-[#1c1729] px-2.5 text-[10px] font-mono font-bold text-amber-200 hover:bg-[#2a223d] whitespace-nowrap touch-none"
          >
            <span>{cameraPresetLabel}</span>
            <span className="text-amber-400 tabular-nums">{cameraYawDeg}°</span>
          </button>

          <button
            type="button"
            tabIndex={-1}
            aria-label="Kamera Rechts drehen"
            {...bindCamRotHandlers('right')}
            className={`flex h-10 w-10 items-center justify-center rounded-lg border ${
              pressedCamRot.right
                ? 'border-amber-300 bg-amber-500/30 text-white scale-95'
                : 'border-white/10 bg-[#1c1729] text-amber-300'
            } hover:bg-[#2a223d] touch-none transition-transform duration-75`}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
            </svg>
          </button>

          <button
            type="button"
            tabIndex={-1}
            aria-label="Kamera-Folgemodus umschalten [V]"
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleCameraAutoFollow();
            }}
            className={`flex h-10 items-center justify-center rounded-lg border px-2 font-mono text-[10px] font-bold touch-none ${
              cameraAutoFollow
                ? 'border-amber-300 bg-amber-500/30 text-amber-200'
                : 'border-white/10 bg-[#1c1729] text-stone-300 hover:text-white'
            }`}
          >
            {cameraAutoFollow ? 'AUTO' : 'FREI'}
          </button>

          <button
            type="button"
            tabIndex={-1}
            aria-label="Kamera Zentrieren [N]"
            onClick={(e) => {
              e.currentTarget.blur();
              onResetCamera();
            }}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-[#1c1729] text-stone-300 hover:bg-[#2a223d] hover:text-white touch-none"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
            </svg>
          </button>
        </div>

        {/* Contextual Interact Button when near Chest, Shrine, Secret Altar, or Exit Portal */}
        {nearbyPrompt && (
          <button
            type="button"
            tabIndex={-1}
            aria-label="Touch-Interaktion ausführen [E]"
            {...bindActionButtonHandlers('interact', onInteract)}
            className={`flex min-h-[48px] items-center gap-2 rounded-xl border-2 border-amber-300 ${
              pressedActions.interact ? 'bg-amber-400 text-black scale-95' : 'bg-[#251c38f5] text-amber-200'
            } px-4 py-2.5 font-['Cinzel'] text-xs font-extrabold shadow-2xl touch-none whitespace-nowrap transition-transform duration-75`}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M12 2l3 7h7l-5.5 4.5L18.5 21 12 16.5 5.5 21l2-7.5L2 9h7z" />
            </svg>
            <span>INTERAGIEREN [E]</span>
          </button>
        )}

        {/* Top Row of Right Cluster: Heal Vial + Arcane Nova AoE */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            tabIndex={-1}
            disabled={potionCount <= 0}
            aria-label={`Touch-Heilung: Lebensessenz (${potionCount} übrig)`}
            {...bindActionButtonHandlers('heal', onHeal)}
            className={`flex h-14 w-14 flex-col items-center justify-center rounded-2xl border-2 ${
              pressedActions.heal
                ? 'border-emerald-300 bg-emerald-800/90 scale-95'
                : 'border-emerald-400/60 bg-[#132620f0]'
            } text-emerald-200 shadow-xl hover:bg-[#1b362d] disabled:opacity-40 touch-none transition-transform duration-75`}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5 text-emerald-400" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M12 5v14M5 12h14" />
            </svg>
            <span className="font-mono text-[10px] font-bold tabular-nums">{potionCount}x HP</span>
          </button>

          <button
            type="button"
            tabIndex={-1}
            aria-label={`Touch-Skill: Arkane Nova (${novaDamage} AoE)`}
            {...bindActionButtonHandlers('nova', onNova)}
            className={`flex h-14 w-14 flex-col items-center justify-center rounded-2xl border-2 ${
              pressedActions.nova
                ? 'border-purple-300 bg-purple-800/90 scale-95'
                : 'border-purple-400/65 bg-[#211630f0]'
            } text-purple-200 shadow-xl hover:bg-[#2e1f42] touch-none transition-transform duration-75`}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5 text-purple-300" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="6" />
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
            </svg>
            <span className="font-mono text-[10px] font-bold tabular-nums">
              {novaCooldown > 0 ? `${novaCooldown.toFixed(1)}s` : 'NOVA'}
            </span>
          </button>
        </div>

        {/* Bottom Row of Right Cluster: Shadow Dash + Primary Melee Sword Strike (Hold-to-Combo) */}
        <div className="flex items-end gap-2.5">
          <button
            type="button"
            tabIndex={-1}
            aria-label="Touch-Dash: Schattenschritt"
            {...bindActionButtonHandlers('dash', onDash)}
            className={`flex h-14 w-14 flex-col items-center justify-center rounded-2xl border-2 ${
              pressedActions.dash
                ? 'border-sky-300 bg-sky-800/90 scale-95'
                : 'border-sky-400/65 bg-[#152033f0]'
            } text-sky-200 shadow-xl hover:bg-[#1e2e4a] touch-none transition-transform duration-75`}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5 text-sky-300" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
            <span className="font-mono text-[10px] font-bold tabular-nums">
              {dashCooldown > 0 ? `${dashCooldown.toFixed(1)}s` : 'DASH'}
            </span>
          </button>

          {/* Primary Large Sword Strike CTA (68x68px hitbox, supports simultaneous hold-to-combo while moving) */}
          <button
            type="button"
            tabIndex={-1}
            aria-label={`Touch-Angriff: Klingenstreich (${attackDamage} Schaden)`}
            {...bindActionButtonHandlers('attack', onAttack)}
            className={`flex h-[68px] w-[68px] flex-col items-center justify-center rounded-full border-2 ${
              pressedActions.attack
                ? 'border-white bg-amber-300 scale-95'
                : 'border-amber-300 bg-amber-500'
            } text-black shadow-2xl hover:bg-amber-400 touch-none transition-transform duration-75`}
          >
            <svg viewBox="0 0 24 24" className="h-7 w-7 text-black" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path d="M14.5 17.5L3 6V3h3l11.5 11.5" />
              <path d="M13 19l6-6" />
              <path d="M16 16l4 4" />
              <path d="M19 21l2-2" />
            </svg>
            <span className="font-['Cinzel'] text-[10px] font-extrabold tracking-tight">
              ANGRIFF
            </span>
          </button>
        </div>

        {/* Multi-Touch Status Readout */}
        <span className="font-mono text-[10px] font-bold tracking-wider text-stone-300 tabular-nums">
          {isSimultaneousMultiTouch ? 'MULTI-TOUCH · LAUFEN + AKTION' : 'MULTI-TOUCH BEREIT'}
        </span>
      </div>
    </div>
  );
};
