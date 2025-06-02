"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  SlidersHorizontal,
  Zap,
  Maximize,
  Minimize,
  Trash,
  Aperture,
  Minus,
  ChevronsLeftRight,
} from "lucide-react";

const fontStyles = `
  @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&display=swap');
  @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700&display=swap');
  
  .rajdhani {
    font-family: 'Rajdhani', sans-serif;
  }
  
  .orbitron {
    font-family: 'Orbitron', sans-serif;
  }
`;

// --- Constants and Configuration ---
const BENCH_WIDTH = 800;
const BENCH_HEIGHT = 400;
const LASER_ORIGIN_X = 50;
const LASER_ORIGIN_Y = BENCH_HEIGHT / 2;
const ELEMENT_WIDTH = 40;
const ELEMENT_HEIGHT = 160;
const FOCAL_POINT_RADIUS = 8;

// --- Types ---
interface Point {
  x: number;
  y: number;
}

type OpticalElementType =
  | "convex-lens"
  | "concave-lens"
  | "plane-mirror"
  | "convex-mirror"
  | "concave-mirror";

interface OpticalElement {
  id: string;
  type: OpticalElementType;
  x: number; // Center x position on the bench
  focalLength: number; // Positive for convex lens/concave mirror, negative for concave lens/convex mirror
  // y position is fixed to center of bench for simplicity
}

interface RaySegment {
  start: Point;
  end: Point;
  color: string;
}

// --- Helper Functions ---
const degToRad = (degrees: number): number => degrees * (Math.PI / 180);
const radToDeg = (radians: number): number => radians * (180 / Math.PI);

const wavelengthToColor = (wavelength: number): string => {
  // Approximate RGB values for wavelengths (nm)
  // This is a simplified conversion
  let r = 0,
    g = 0,
    b = 0;
  if (wavelength >= 380 && wavelength < 440) {
    r = -(wavelength - 440) / (440 - 380);
    g = 0;
    b = 1;
  } else if (wavelength >= 440 && wavelength < 490) {
    r = 0;
    g = (wavelength - 440) / (490 - 440);
    b = 1;
  } else if (wavelength >= 490 && wavelength < 510) {
    r = 0;
    g = 1;
    b = -(wavelength - 510) / (510 - 490);
  } else if (wavelength >= 510 && wavelength < 580) {
    r = (wavelength - 510) / (580 - 510);
    g = 1;
    b = 0;
  } else if (wavelength >= 580 && wavelength < 645) {
    r = 1;
    g = -(wavelength - 645) / (645 - 580);
    b = 0;
  } else if (wavelength >= 645 && wavelength <= 780) {
    r = 1;
    g = 0;
    b = 0;
  }

  // Intensity falloff at edges
  let factor = wavelength >= 380 && wavelength <= 780 ? 1 : 0;
  if (wavelength > 700) factor = (780 - wavelength) / (780 - 700);
  else if (wavelength < 420) factor = (wavelength - 380) / (420 - 380);

  const gamma = 0.8;
  const adjust = (color: number) =>
    Math.round(255 * Math.pow(color * factor, gamma));

  return `rgb(${adjust(r)}, ${adjust(g)}, ${adjust(b)})`;
};

// --- Main Component ---
export default function OpticsLabPage() {
  const [laserAngle, setLaserAngle] = useState<number>(0);
  const [startAngle, setStartAngle] = useState<number>(0);
  const [startRotation, setStartRotation] = useState<number>(0);
  const [laserWavelength, setLaserWavelength] = useState<number>(550); // nm (green)
  const [elements, setElements] = useState<OpticalElement[]>([]);
  const [draggingElement, setDraggingElement] = useState<string | null>(null); // id of element or 'focal-elementId-side'
  const [draggingLaser, setDraggingLaser] = useState<boolean>(false);
  const [isMobile, setIsMobile] = useState<boolean>(false);

  const benchRef = useRef<SVGSVGElement>(null);
  const laserControlRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const addElement = (type: OpticalElementType) => {
    const newElement: OpticalElement = {
      id: `elem-${Date.now()}`,
      type,
      x: BENCH_WIDTH / 2 + elements.length * 30,
      focalLength:
        type === "concave-lens" || type === "convex-mirror" ? -100 : 100,
    };
    setElements([...elements, newElement]);
  };

  const removeElement = (id: string) => {
    setElements(elements.filter((el) => el.id !== id));
  };

  const updateElement = useCallback(
    (id: string, updates: Partial<OpticalElement>) => {
      setElements((prev) =>
        prev.map((el) => (el.id === id ? { ...el, ...updates } : el))
      );
    },
    []
  );

  const getSVGPoint = (clientX: number, clientY: number): Point | null => {
    if (!benchRef.current) return null;
    const svg = benchRef.current;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const svgPoint = pt.matrixTransform(svg.getScreenCTM()?.inverse());
    return { x: svgPoint.x, y: svgPoint.y };
  };

  const handleMouseDown = (
    e: React.MouseEvent<SVGElement>,
    id: string,
    type: "element" | "focal-left" | "focal-right"
  ) => {
    e.preventDefault();
    if (type === "element") {
      setDraggingElement(id);
    } else {
      // Use : as delimiter instead of - to avoid conflicts with element IDs
      setDraggingElement(`focal:${id}`);
    }
  };

  const handleTouchStart = (
    e: React.TouchEvent<SVGElement>,
    id: string,
    type: "element" | "focal-left" | "focal-right"
  ) => {
    if (e.touches.length !== 1) return;
    e.preventDefault();
    if (type === "element") {
      setDraggingElement(id);
    } else {
      // Use : as delimiter instead of - to avoid conflicts with element IDs
      setDraggingElement(`focal:${id}`);
    }
  };

  const handleLaserTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 1) return;
    const rect = laserControlRef.current?.getBoundingClientRect();
    if (!rect) return;

    const touch = e.touches[0];
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const startAngleRad = Math.atan2(
      touch.clientY - centerY,
      touch.clientX - centerX
    );

    setStartAngle(radToDeg(startAngleRad));
    setStartRotation(laserAngle);
    setDraggingLaser(true);
  };

  const handleLaserInteraction = useCallback(
    (clientX: number, clientY: number) => {
      if (!laserControlRef.current) return;
      const rect = laserControlRef.current.getBoundingClientRect();
      const controlCenterX = rect.left + rect.width / 2;
      const controlCenterY = rect.top + rect.height / 2;

      const currentAngleRad = Math.atan2(
        clientY - controlCenterY,
        clientX - controlCenterX
      );
      const currentAngleDeg = radToDeg(currentAngleRad);

      // Calculate the difference from the start angle
      let deltaDeg = currentAngleDeg - startAngle;

      // Normalize the delta to handle the -180/180 boundary
      if (deltaDeg > 180) deltaDeg -= 360;
      if (deltaDeg < -180) deltaDeg += 360;

      // Apply the delta to the starting rotation
      let newAngle = startRotation + deltaDeg;

      // Keep the final angle in the -180 to 180 range
      if (newAngle > 180) newAngle -= 360;
      if (newAngle < -180) newAngle += 360;

      setLaserAngle(newAngle);
    },
    [startAngle, startRotation]
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!draggingElement && !draggingLaser) return;
      const svgPoint = getSVGPoint(e.clientX, e.clientY);
      if (!svgPoint) return;

      if (draggingLaser && isMobile) {
        // Desktop uses slider for laser control
      } else if (draggingElement) {
        const parts = draggingElement.split(":");

        if (parts[0] === "focal") {
          // Dragging a focal point
          const elementId = parts[1]; // Now this will be the full element ID
          const element = elements.find((el) => el.id === elementId);
          if (element) {
            // Calculate distance from element center to mouse position
            const distance = Math.abs(svgPoint.x - element.x);
            const clampedDistance = Math.max(10, Math.min(300, distance));

            // Determine sign based on element type
            let newFocalLength = clampedDistance;
            if (
              element.type === "concave-lens" ||
              element.type === "convex-mirror"
            ) {
              newFocalLength = -newFocalLength;
            }

            updateElement(elementId, { focalLength: newFocalLength });
          }
        } else {
          // Dragging whole element
          updateElement(draggingElement, {
            x: Math.max(
              ELEMENT_WIDTH / 2,
              Math.min(BENCH_WIDTH - ELEMENT_WIDTH / 2, svgPoint.x)
            ),
          });
        }
      }
    },
    [draggingElement, draggingLaser, elements, isMobile, updateElement]
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      if (draggingLaser && isMobile) {
        handleLaserInteraction(e.touches[0].clientX, e.touches[0].clientY);
      } else if (draggingElement) {
        const svgPoint = getSVGPoint(
          e.touches[0].clientX,
          e.touches[0].clientY
        );
        if (!svgPoint) return;

        const parts = draggingElement.split(":");

        if (parts[0] === "focal") {
          // Dragging a focal point
          const elementId = parts[1]; // Now this will be the full element ID
          const element = elements.find((el) => el.id === elementId);
          if (element) {
            // Calculate distance from element center to touch position
            const distance = Math.abs(svgPoint.x - element.x);
            const clampedDistance = Math.max(10, Math.min(300, distance));

            // Determine sign based on element type
            let newFocalLength = clampedDistance;
            if (
              element.type === "concave-lens" ||
              element.type === "convex-mirror"
            ) {
              newFocalLength = -newFocalLength;
            }

            updateElement(elementId, { focalLength: newFocalLength });
          }
        } else {
          // Dragging whole element
          updateElement(draggingElement, {
            x: Math.max(
              ELEMENT_WIDTH / 2,
              Math.min(BENCH_WIDTH - ELEMENT_WIDTH / 2, svgPoint.x)
            ),
          });
        }
      }
    },
    [
      draggingElement,
      draggingLaser,
      elements,
      isMobile,
      updateElement,
      handleLaserInteraction,
    ]
  );

  const handleMouseUp = useCallback(() => {
    setDraggingElement(null);
    setDraggingLaser(false);
  }, []);

  const handleTouchEnd = useCallback(() => {
    setDraggingElement(null);
    setDraggingLaser(false);
  }, []);

  useEffect(() => {
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("touchmove", handleTouchMove);
    document.addEventListener("touchend", handleTouchEnd);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, [handleMouseMove, handleMouseUp, handleTouchMove, handleTouchEnd]);

  // --- Ray Tracing Logic ---
  const traceRays = (): RaySegment[] => {
    const segments: RaySegment[] = [];
    let currentRayOrigin: Point = { x: LASER_ORIGIN_X, y: LASER_ORIGIN_Y };
    let currentRayAngleRad = degToRad(laserAngle);
    const rayColor = wavelengthToColor(laserWavelength);

    const sortedElements = [...elements].sort((a, b) => a.x - b.x);

    for (let i = 0; i < sortedElements.length + 1; i++) {
      let interactionOccurred = false;
      const element = sortedElements[i]; // Might be undefined if it's the last segment to edge of screen

      // Calculate intersection point with the current element or screen edge
      let nextBoundaryX: number;
      if (element) {
        nextBoundaryX = element.x;
      } else {
        // If no more elements, ray goes to edge of screen or backwards if angle points left
        nextBoundaryX = Math.cos(currentRayAngleRad) > 0 ? BENCH_WIDTH : 0;
      }

      // Avoid division by zero if ray is vertical
      if (Math.abs(Math.cos(currentRayAngleRad)) < 1e-6) {
        // Ray is nearly vertical
        if (
          (element &&
            currentRayOrigin.x < element.x &&
            Math.cos(currentRayAngleRad) > 0) || // Moving right towards element
          (element &&
            currentRayOrigin.x > element.x &&
            Math.cos(currentRayAngleRad) < 0)
        ) {
          // Moving left towards element
          // This case is tricky with vertical rays and elements defined by x. Assume it hits if x matches.
        }
        // For simplicity, let vertical rays extend to top/bottom
        const endY = Math.sin(currentRayAngleRad) > 0 ? BENCH_HEIGHT : 0;
        segments.push({
          start: currentRayOrigin,
          end: { x: currentRayOrigin.x, y: endY },
          color: rayColor,
        });
        currentRayOrigin = { x: currentRayOrigin.x, y: endY };
        if (currentRayOrigin.y <= 0 || currentRayOrigin.y >= BENCH_HEIGHT)
          break; // Ray off screen
        // No interaction with vertical elements handled in this simplified case
        continue;
      }

      const t =
        (nextBoundaryX - currentRayOrigin.x) / Math.cos(currentRayAngleRad);
      let intersectionY = currentRayOrigin.y + t * Math.sin(currentRayAngleRad);
      let intersectionX = nextBoundaryX;

      if (t < 0 && element) {
        // Intersection is behind the ray's direction relative to the element
        // This means the ray is pointed away from this element, skip to next or screen edge
        if (i === sortedElements.length - 1) {
          // last element, ray goes to edge
          nextBoundaryX = Math.cos(currentRayAngleRad) > 0 ? BENCH_WIDTH : 0;
          const t_edge =
            (nextBoundaryX - currentRayOrigin.x) / Math.cos(currentRayAngleRad);
          intersectionY =
            currentRayOrigin.y + t_edge * Math.sin(currentRayAngleRad);
          intersectionX = nextBoundaryX;
        } else {
          continue; // Try next element
        }
      }

      // Check if ray hits the element's vertical extent
      const elementTopY = BENCH_HEIGHT / 2 - ELEMENT_HEIGHT / 2;
      const elementBottomY = BENCH_HEIGHT / 2 + ELEMENT_HEIGHT / 2;

      if (
        element &&
        intersectionX >= element.x &&
        intersectionX <= element.x + ELEMENT_WIDTH / 10 && // approximately at element's line
        intersectionY >= elementTopY &&
        intersectionY <= elementBottomY
      ) {
        segments.push({
          start: currentRayOrigin,
          end: { x: intersectionX, y: intersectionY },
          color: rayColor,
        });
        currentRayOrigin = { x: intersectionX, y: intersectionY };
        interactionOccurred = true;

        const yRel = intersectionY - BENCH_HEIGHT / 2; // y relative to optical axis

        if (element.type.includes("mirror")) {
          // For all mirror types
          if (element.type === "plane-mirror") {
            // Existing plane mirror logic
            currentRayAngleRad = Math.PI - currentRayAngleRad;
          } else {
            // Curved mirror logic
            const deltaAngleRad = (-2 * yRel) / element.focalLength; // Factor of 2 because reflection involves double the angle change
            currentRayAngleRad = Math.PI - currentRayAngleRad + deltaAngleRad;
          }
          // Normalize angle
          currentRayAngleRad =
            ((currentRayAngleRad % (2 * Math.PI)) + 2 * Math.PI) %
            (2 * Math.PI);
        } else if (
          element.type === "convex-lens" ||
          element.type === "concave-lens"
        ) {
          if (Math.abs(element.focalLength) < 1e-6) {
            // Infinite focal length (like plane glass)
            // No change in angle (simplification)
          } else {
            const deltaAngleRad = -yRel / element.focalLength;
            currentRayAngleRad += deltaAngleRad;
          }
        }
      } else {
        // No interaction or ray missed element, extends to boundary
        // If element exists but ray misses it, or no element, extend to calculated boundary
        segments.push({
          start: currentRayOrigin,
          end: { x: intersectionX, y: intersectionY },
          color: rayColor,
        });
        currentRayOrigin = { x: intersectionX, y: intersectionY };
      }

      // Stop if ray goes off screen or exceeds max length (implicitly handled by boundary calc)
      if (
        currentRayOrigin.x < 0 ||
        currentRayOrigin.x > BENCH_WIDTH ||
        currentRayOrigin.y < 0 ||
        currentRayOrigin.y > BENCH_HEIGHT
      ) {
        break;
      }
      if (interactionOccurred) {
        // After interaction, if ray points "backwards" into processed elements, it might get stuck.
        // For simplicity, we just let it continue. A more robust system would handle this.
      }
    }
    // Add a final segment if the last ray didn't terminate exactly on a boundary
    if (segments.length > 0) {
      const lastSeg = segments[segments.length - 1];
      if (
        lastSeg.end.x > 0 &&
        lastSeg.end.x < BENCH_WIDTH &&
        lastSeg.end.y > 0 &&
        lastSeg.end.y < BENCH_HEIGHT
      ) {
        // Extend the last ray segment to the edge of the bench
        const lastAngle = Math.atan2(
          lastSeg.end.y - lastSeg.start.y,
          lastSeg.end.x - lastSeg.start.x
        );
        let finalX, finalY;
        if (Math.abs(Math.cos(lastAngle)) < 1e-6) {
          // Vertical
          finalX = lastSeg.end.x;
          finalY = Math.sin(lastAngle) > 0 ? BENCH_HEIGHT : 0;
        } else if (Math.abs(Math.sin(lastAngle)) < 1e-6) {
          // Horizontal
          finalX = Math.cos(lastAngle) > 0 ? BENCH_WIDTH : 0;
          finalY = lastSeg.end.y;
        } else {
          const tx =
            ((Math.cos(lastAngle) > 0 ? BENCH_WIDTH : 0) - lastSeg.end.x) /
            Math.cos(lastAngle);
          const ty =
            ((Math.sin(lastAngle) > 0 ? BENCH_HEIGHT : 0) - lastSeg.end.y) /
            Math.sin(lastAngle);
          if (tx < ty && tx > 0) {
            finalX = Math.cos(lastAngle) > 0 ? BENCH_WIDTH : 0;
            finalY = lastSeg.end.y + tx * Math.sin(lastAngle);
          } else if (ty > 0) {
            finalY = Math.sin(lastAngle) > 0 ? BENCH_HEIGHT : 0;
            finalX = lastSeg.end.x + ty * Math.cos(lastAngle);
          } else {
            // If both are negative, something is wrong, ray is already outside
            finalX = lastSeg.end.x; // Don't extend
            finalY = lastSeg.end.y;
          }
        }
        // Ensure final point is within bounds if extended
        finalX = Math.max(0, Math.min(BENCH_WIDTH, finalX));
        finalY = Math.max(0, Math.min(BENCH_HEIGHT, finalY));

        segments.push({
          start: lastSeg.end,
          end: { x: finalX, y: finalY },
          color: rayColor,
        });
      }
    }

    return segments;
  };

  const rayPath = traceRays();

  // --- Render ---
  return (
    <>
      <style>{fontStyles}</style>
      <div
        className={`flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 to-black text-gray-200 p-4 rajdhani`}
      >
        <header className="w-full max-w-7xl mb-6 text-center">
          <h1
            className={`text-3xl sm:text-4xl lg:text-6xl font-extrabold text-cyan-400 tracking-wider drop-shadow-[0_0_8px_rgba(34,211,238,0.5)] animate-pulse flex items-center justify-center gap-4 orbitron`}
          >
            Optics Lab Simulator
          </h1>
        </header>

        {/* Main content container - flex row on desktop, column on mobile */}
        <div className="w-full max-w-7xl flex flex-col md:flex-row gap-6">
          {/* Optics Bench and Projection Screen */}
          <div className="w-full md:flex-1 bg-gray-900/50 p-1 rounded-lg shadow-[0_0_20px_rgba(34,211,238,0.3)] relative aspect-[2/1] border border-cyan-400/30">
            <svg
              ref={benchRef}
              viewBox={`0 0 ${BENCH_WIDTH} ${BENCH_HEIGHT}`}
              className="w-full h-full bg-black/80 rounded"
              onMouseMove={(e) =>
                isMobile ? undefined : handleMouseMove(e.nativeEvent)
              }
              onMouseUp={isMobile ? undefined : handleMouseUp}
            >
              {/* Optical Axis */}
              <line
                x1="0"
                y1={BENCH_HEIGHT / 2}
                x2={BENCH_WIDTH}
                y2={BENCH_HEIGHT / 2}
                stroke="rgba(34,211,238,0.3)"
                strokeDasharray="5,5"
              />

              {/* Laser Source Visual */}
              <g
                transform={`translate(${LASER_ORIGIN_X}, ${LASER_ORIGIN_Y}) rotate(${laserAngle})`}
              >
                <rect
                  x="-15"
                  y="-10"
                  width="30"
                  height="20"
                  fill="rgba(255,0,0,0.7)"
                  rx="3"
                />
                <rect
                  x="10"
                  y="-3"
                  width="20"
                  height="6"
                  fill="rgba(255,100,100,0.8)"
                  rx="2"
                />
              </g>

              {/* Ray Paths (Projection Screen Content) */}
              {rayPath.map((segment, idx) => (
                <line
                  key={`ray-${idx}`}
                  x1={segment.start.x}
                  y1={segment.start.y}
                  x2={segment.end.x}
                  y2={segment.end.y}
                  stroke={segment.color}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  opacity="0.8"
                />
              ))}

              {/* Optical Elements */}
              {elements.map((el) => {
                const elCenterY = BENCH_HEIGHT / 2;
                const elTopY = elCenterY - ELEMENT_HEIGHT / 2;
                const focalPointColor = "rgba(255, 255, 0, 0.7)";

                return (
                  <g
                    key={el.id}
                    onMouseDown={(e) => handleMouseDown(e, el.id, "element")}
                    onTouchStart={(e) => handleTouchStart(e, el.id, "element")}
                    className="cursor-grab active:cursor-grabbing"
                  >
                    {/* Element Body */}
                    <rect
                      x={el.x - ELEMENT_WIDTH / 2}
                      y={elTopY}
                      width={ELEMENT_WIDTH}
                      height={ELEMENT_HEIGHT}
                      fill={
                        el.type === "convex-lens"
                          ? "rgba(34,211,238,0.5)"
                          : el.type === "concave-lens"
                          ? "rgba(236,72,153,0.5)"
                          : el.type === "convex-mirror"
                          ? "rgba(34,211,238,0.5)"
                          : el.type === "concave-mirror"
                          ? "rgba(236,72,153,0.5)"
                          : "rgba(150, 150, 150, 0.7)"
                      }
                      stroke={
                        el.type === "convex-lens"
                          ? "rgba(34,211,238,0.8)"
                          : el.type === "concave-lens"
                          ? "rgba(236,72,153,0.8)"
                          : el.type === "convex-mirror"
                          ? "rgba(34,211,238,0.8)"
                          : el.type === "concave-mirror"
                          ? "rgba(236,72,153,0.8)"
                          : "rgba(200, 200, 200, 0.8)"
                      }
                      strokeWidth="1.5"
                      rx="3"
                    />
                    {/* Visual cues for element type */}
                    {el.type === "convex-lens" && (
                      <>
                        {/* Left curve */}
                        <path
                          d={`M ${el.x - ELEMENT_WIDTH / 8},${elTopY} Q ${
                            el.x -
                            ELEMENT_WIDTH / 8 -
                            Math.min(40, 5000 / Math.abs(el.focalLength))
                          },${elCenterY} ${el.x - ELEMENT_WIDTH / 8},${
                            elTopY + ELEMENT_HEIGHT
                          }`}
                          stroke="rgba(255,255,255,0.8)"
                          strokeWidth="3"
                          fill="none"
                        />
                        {/* Right curve */}
                        <path
                          d={`M ${el.x + ELEMENT_WIDTH / 8},${elTopY} Q ${
                            el.x +
                            ELEMENT_WIDTH / 8 +
                            Math.min(40, 5000 / Math.abs(el.focalLength))
                          },${elCenterY} ${el.x + ELEMENT_WIDTH / 8},${
                            elTopY + ELEMENT_HEIGHT
                          }`}
                          stroke="rgba(255,255,255,0.8)"
                          strokeWidth="3"
                          fill="none"
                        />
                      </>
                    )}
                    {el.type === "concave-lens" && (
                      <>
                        {/* Left curve */}
                        <path
                          d={`M ${el.x - ELEMENT_WIDTH / 2.2},${elTopY} Q ${
                            el.x -
                            ELEMENT_WIDTH / 2.2 +
                            Math.min(40, 5000 / Math.abs(el.focalLength))
                          },${elCenterY} ${el.x - ELEMENT_WIDTH / 2.2},${
                            elTopY + ELEMENT_HEIGHT
                          }`}
                          stroke="rgba(255,255,255,0.8)"
                          strokeWidth="3"
                          fill="none"
                        />
                        {/* Right curve */}
                        <path
                          d={`M ${el.x + ELEMENT_WIDTH / 2.2},${elTopY} Q ${
                            el.x +
                            ELEMENT_WIDTH / 2.2 -
                            Math.min(40, 5000 / Math.abs(el.focalLength))
                          },${elCenterY} ${el.x + ELEMENT_WIDTH / 2.2},${
                            elTopY + ELEMENT_HEIGHT
                          }`}
                          stroke="rgba(255,255,255,0.8)"
                          strokeWidth="3"
                          fill="none"
                        />
                      </>
                    )}
                    {el.type === "plane-mirror" && (
                      <line
                        x1={el.x}
                        y1={elTopY}
                        x2={el.x}
                        y2={elTopY + ELEMENT_HEIGHT}
                        stroke="rgba(255,255,255,0.8)"
                        strokeWidth="3"
                      />
                    )}
                    {el.type === "convex-mirror" && (
                      <path
                        d={`M ${el.x},${elTopY} Q ${
                          el.x + Math.min(40, 5000 / Math.abs(el.focalLength))
                        },${elCenterY} ${el.x},${elTopY + ELEMENT_HEIGHT}`}
                        stroke="rgba(255,255,255,0.8)"
                        strokeWidth="3"
                        fill="none"
                      />
                    )}
                    {el.type === "concave-mirror" && (
                      <path
                        d={`M ${el.x},${elTopY} Q ${
                          el.x - Math.min(40, 5000 / Math.abs(el.focalLength))
                        },${elCenterY} ${el.x},${elTopY + ELEMENT_HEIGHT}`}
                        stroke="rgba(255,255,255,0.8)"
                        strokeWidth="3"
                        fill="none"
                      />
                    )}

                    {/* Show focal points for lenses and curved mirrors */}
                    {(el.type.includes("lens") || el.type.includes("mirror")) &&
                      el.type !== "plane-mirror" && (
                        <>
                          {/* Left Focal Point */}
                          <circle
                            cx={el.x - Math.abs(el.focalLength)}
                            cy={elCenterY}
                            r={FOCAL_POINT_RADIUS}
                            fill={focalPointColor}
                            stroke="white"
                            strokeWidth="1"
                            className="cursor-grab active:cursor-grabbing"
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              handleMouseDown(e, el.id, "focal-left");
                            }}
                            onTouchStart={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              handleTouchStart(e, el.id, "focal-left");
                            }}
                          />
                          <text
                            x={el.x - Math.abs(el.focalLength)}
                            y={elCenterY + FOCAL_POINT_RADIUS + 10}
                            fill="yellow"
                            fontSize="10"
                            textAnchor="middle"
                            pointerEvents="none"
                          >
                            F
                          </text>
                          {/* Right Focal Point */}
                          <circle
                            cx={el.x + Math.abs(el.focalLength)}
                            cy={elCenterY}
                            r={FOCAL_POINT_RADIUS}
                            fill={focalPointColor}
                            stroke="white"
                            strokeWidth="1"
                            className="cursor-grab active:cursor-grabbing"
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              handleMouseDown(e, el.id, "focal-right");
                            }}
                            onTouchStart={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              handleTouchStart(e, el.id, "focal-right");
                            }}
                          />
                          <text
                            x={el.x + Math.abs(el.focalLength)}
                            y={elCenterY + FOCAL_POINT_RADIUS + 10}
                            fill="yellow"
                            fontSize="10"
                            textAnchor="middle"
                            pointerEvents="none"
                          >
                            F
                          </text>
                        </>
                      )}

                    {/* Element label and remove button */}
                    <text
                      x={el.x}
                      y={elTopY - 5}
                      fill="gray"
                      fontSize="10"
                      textAnchor="middle"
                    >
                      {el.type}
                    </text>
                    <g
                      transform={`translate(${el.x + ELEMENT_WIDTH / 2 + 5}, ${
                        elCenterY - ELEMENT_HEIGHT / 2 - 15
                      })`}
                      onClick={() => removeElement(el.id)}
                      className="cursor-pointer"
                    >
                      <circle r="10" fill="rgba(255,50,50,0.7)" />
                      <Trash x="-7" y="-7" size={14} color="white" />
                    </g>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Controls Panel */}
          <div className="w-full md:w-96 bg-gray-900/50 p-4 md:p-6 rounded-lg shadow-2xl border border-cyan-400/30 flex flex-col gap-6">
            {/* Laser Controls */}
            <div className="space-y-3">
              <h2 className="text-xl font-semibold text-cyan-400 flex items-center drop-shadow-[0_0_8px_rgba(34,211,238,0.5)] animate-pulse">
                <Zap className="mr-2" />
                Laser Settings
              </h2>
              <div>
                <label
                  htmlFor="laserAngle"
                  className="block text-sm font-medium text-gray-300"
                >
                  Angle:{" "}
                  <span className="text-cyan-400 drop-shadow-[0_0_5px_rgba(34,211,238,0.3)]">
                    {laserAngle.toFixed(1)}°
                  </span>
                </label>
                {isMobile ? (
                  <div className="flex flex-col items-center gap-2">
                    <div
                      ref={laserControlRef}
                      onTouchStart={handleLaserTouchStart}
                      className="w-24 h-24 bg-gray-800/50 rounded-full flex items-center justify-center text-cyan-400 select-none relative border-2 border-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.3)]"
                      style={{ touchAction: "none" }}
                    >
                      <div
                        className="w-1 h-[45%] bg-fuchsia-500 rounded absolute left-1/2 top-1/2 origin-bottom shadow-[0_0_10px_rgba(236,72,153,0.5)]"
                        style={{
                          transform: `translate(-50%, -100%) rotate(${laserAngle}deg)`,
                        }}
                      />
                      <div className="w-2 h-2 rounded-full bg-cyan-400 absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 shadow-[0_0_10px_rgba(34,211,238,0.5)]" />
                    </div>
                    <span className="text-cyan-400/80 text-sm font-medium flex items-center gap-1">
                      <ChevronsLeftRight size={16} /> Rotate
                    </span>
                  </div>
                ) : (
                  <input
                    type="range"
                    id="laserAngle"
                    min="-180"
                    max="180"
                    step="0.5"
                    value={laserAngle}
                    onChange={(e) => setLaserAngle(parseFloat(e.target.value))}
                    className="w-full h-3 bg-gray-800/50 rounded-lg appearance-none cursor-pointer mt-1 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-400 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:-mt-[5px] [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-cyan-400 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:border-0"
                  />
                )}
              </div>
              <div>
                <label
                  htmlFor="laserWavelength"
                  className="block text-sm font-medium text-gray-300"
                >
                  Wavelength: {laserWavelength} nm
                </label>
                <input
                  type="range"
                  id="laserWavelength"
                  min="380"
                  max="780"
                  step="1"
                  value={laserWavelength}
                  onChange={(e) => setLaserWavelength(parseInt(e.target.value))}
                  style={
                    {
                      "--thumb-color": wavelengthToColor(laserWavelength),
                    } as React.CSSProperties
                  }
                  className="w-full h-3 bg-gray-800/50 rounded-lg appearance-none cursor-pointer mt-1 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:-mt-[5px] [&::-webkit-slider-thumb]:bg-[var(--thumb-color)] [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-[var(--thumb-color)]"
                />
              </div>
            </div>

            {/* Element Selector */}
            <div className="space-y-3">
              <h2 className="text-xl font-semibold text-cyan-400 flex items-center drop-shadow-[0_0_8px_rgba(34,211,238,0.5)] animate-pulse">
                <Aperture className="mr-2" />
                Add Optical Element
              </h2>
              <div className="flex flex-col space-y-2">
                {/* Lenses */}
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-cyan-400/80 drop-shadow-[0_0_5px_rgba(34,211,238,0.3)]">
                    Lenses
                  </h3>
                  <button
                    onClick={() => addElement("convex-lens")}
                    className="w-full px-4 py-2 rounded-md text-black font-semibold bg-cyan-500 hover:bg-cyan-400 transition-colors duration-200 flex items-center justify-center cursor-pointer shadow-[0_0_15px_rgba(34,211,238,0.7)] hover:shadow-[0_0_25px_rgba(34,211,238,0.9)]"
                  >
                    <Maximize className="mr-1 inline-block" size={16} />
                    Convex Lens
                  </button>
                  <button
                    onClick={() => addElement("concave-lens")}
                    className="w-full px-4 py-2 rounded-md text-black font-semibold bg-fuchsia-500 hover:bg-fuchsia-400 transition-colors duration-200 flex items-center justify-center cursor-pointer shadow-[0_0_15px_rgba(236,72,153,0.7)] hover:shadow-[0_0_25px_rgba(236,72,153,0.9)]"
                  >
                    <Minimize className="mr-1 inline-block" size={16} />
                    Concave Lens
                  </button>
                </div>

                {/* Mirrors */}
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-cyan-400/80 drop-shadow-[0_0_5px_rgba(34,211,238,0.3)]">
                    Mirrors
                  </h3>
                  <button
                    onClick={() => addElement("plane-mirror")}
                    className="w-full px-4 py-2 rounded-md text-black font-semibold bg-cyan-500 hover:bg-cyan-400 transition-colors duration-200 flex items-center justify-center cursor-pointer shadow-[0_0_15px_rgba(34,211,238,0.7)] hover:shadow-[0_0_25px_rgba(34,211,238,0.9)]"
                  >
                    <Minus className="mr-1 inline-block" size={16} />
                    Plane Mirror
                  </button>
                  <button
                    onClick={() => addElement("convex-mirror")}
                    className="w-full px-4 py-2 rounded-md text-black font-semibold bg-cyan-500 hover:bg-cyan-400 transition-colors duration-200 flex items-center justify-center cursor-pointer shadow-[0_0_15px_rgba(34,211,238,0.7)] hover:shadow-[0_0_25px_rgba(34,211,238,0.9)]"
                  >
                    <Maximize className="mr-1 inline-block" size={16} />
                    Convex Mirror
                  </button>
                  <button
                    onClick={() => addElement("concave-mirror")}
                    className="w-full px-4 py-2 rounded-md text-black font-semibold bg-fuchsia-500 hover:bg-fuchsia-400 transition-colors duration-200 flex items-center justify-center cursor-pointer shadow-[0_0_15px_rgba(236,72,153,0.7)] hover:shadow-[0_0_25px_rgba(236,72,153,0.9)]"
                  >
                    <Minimize className="mr-1 inline-block" size={16} />
                    Concave Mirror
                  </button>
                </div>
              </div>
            </div>

            {/* Measurement Readouts */}
            <div className="space-y-3">
              <h2 className="text-xl font-semibold text-cyan-400 flex items-center drop-shadow-[0_0_8px_rgba(34,211,238,0.5)] animate-pulse">
                <SlidersHorizontal className="mr-2" />
                Measurements
              </h2>
              <div className="text-sm bg-gray-800/50 p-3 rounded">
                <p>
                  Laser Angle:{" "}
                  <span className="font-mono text-cyan-400 drop-shadow-[0_0_5px_rgba(34,211,238,0.3)]">
                    {laserAngle.toFixed(1)}°
                  </span>
                </p>
                <p>
                  Wavelength:{" "}
                  <span className="font-mono text-cyan-400 drop-shadow-[0_0_5px_rgba(34,211,238,0.3)]">
                    {laserWavelength} nm
                  </span>
                </p>
                <p>
                  Color:{" "}
                  <span
                    style={{ color: wavelengthToColor(laserWavelength) }}
                    className="font-bold drop-shadow-[0_0_5px_rgba(34,211,238,0.3)]"
                  >
                    ⬤ Sample
                  </span>
                </p>
                <p>
                  Elements on bench:{" "}
                  <span className="font-mono text-cyan-400 drop-shadow-[0_0_5px_rgba(34,211,238,0.3)]">
                    {elements.length}
                  </span>
                </p>
                {elements.map((el) => (
                  <p key={el.id} className="text-xs text-gray-400">
                    {el.type} @ x={el.x.toFixed(0)}
                    {el.type.includes("lens") &&
                      `, F=${el.focalLength.toFixed(0)}`}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
