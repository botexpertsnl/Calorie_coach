"use client";

import { ReactNode, TouchEvent, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { MAIN_NAV_ITEMS } from "@/lib/main-navigation";

type MobileSwipePageProps = {
  children: ReactNode;
  className?: string;
};

type SwipeDirection = "left" | "right";

type SwipeState = {
  startX: number;
  startY: number;
  deltaX: number;
  lockedDirection: "x" | "y" | null;
};

const MOBILE_MEDIA_QUERY = "(max-width: 767px)";
const ACTIVATION_THRESHOLD_PX = 12;
const NAVIGATION_THRESHOLD_PX = 72;
const INTENT_RATIO = 1.2;
const NAVIGATION_ANIMATION_MS = 220;
const SNAPBACK_ANIMATION_MS = 200;

function isInteractiveElement(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;

  const interactiveSelector = [
    "input",
    "textarea",
    "select",
    "button",
    "a",
    "label",
    "summary",
    "[role='button']",
    "[role='slider']",
    "[contenteditable='true']",
    "[draggable='true']",
    "[data-swipe-ignore='true']"
  ].join(",");

  if (target.closest(interactiveSelector)) {
    return true;
  }

  const modalNode = target.closest("[role='dialog'], [aria-modal='true']");
  if (modalNode) {
    return true;
  }

  let current: HTMLElement | null = target;
  while (current) {
    const style = window.getComputedStyle(current);
    const overflowX = style.overflowX;
    if ((overflowX === "auto" || overflowX === "scroll") && current.scrollWidth > current.clientWidth) {
      return true;
    }
    current = current.parentElement;
  }

  return false;
}

export function MobileSwipePage({ children, className }: MobileSwipePageProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isMobile, setIsMobile] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [transitionMs, setTransitionMs] = useState(0);
  const [isNavigating, setIsNavigating] = useState(false);

  const swipeStateRef = useRef<SwipeState | null>(null);
  const navTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentIndex = useMemo(
    () => MAIN_NAV_ITEMS.findIndex((item) => item.href === pathname),
    [pathname]
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_MEDIA_QUERY);
    const onChange = () => setIsMobile(mediaQuery.matches);
    onChange();
    mediaQuery.addEventListener("change", onChange);

    return () => {
      mediaQuery.removeEventListener("change", onChange);
    };
  }, []);

  useEffect(() => {
    setDragX(0);
    setTransitionMs(0);
    setIsNavigating(false);
    swipeStateRef.current = null;

    if (navTimeoutRef.current) {
      clearTimeout(navTimeoutRef.current);
      navTimeoutRef.current = null;
    }
  }, [pathname]);

  useEffect(() => {
    return () => {
      if (navTimeoutRef.current) {
        clearTimeout(navTimeoutRef.current);
      }
    };
  }, []);

  const navigateByDirection = (direction: SwipeDirection) => {
    if (currentIndex < 0) return;

    const nextIndex = direction === "left" ? currentIndex + 1 : currentIndex - 1;
    const destination = MAIN_NAV_ITEMS[nextIndex];

    if (!destination) {
      setTransitionMs(SNAPBACK_ANIMATION_MS);
      setDragX(0);
      return;
    }

    const screenWidth = window.innerWidth;
    const directionMultiplier = direction === "left" ? -1 : 1;

    setTransitionMs(NAVIGATION_ANIMATION_MS);
    setIsNavigating(true);
    setDragX(directionMultiplier * Math.min(screenWidth * 0.28, 120));

    navTimeoutRef.current = setTimeout(() => {
      router.push(destination.href);
    }, NAVIGATION_ANIMATION_MS);
  };

  const handleTouchStart = (event: TouchEvent<HTMLElement>) => {
    if (!isMobile || currentIndex < 0 || isNavigating || event.touches.length !== 1) return;
    if (isInteractiveElement(event.target)) return;

    const touch = event.touches[0];
    swipeStateRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      deltaX: 0,
      lockedDirection: null
    };

    setTransitionMs(0);
  };

  const handleTouchMove = (event: TouchEvent<HTMLElement>) => {
    if (!isMobile || !swipeStateRef.current || isNavigating || event.touches.length !== 1) return;

    const touch = event.touches[0];
    const deltaX = touch.clientX - swipeStateRef.current.startX;
    const deltaY = touch.clientY - swipeStateRef.current.startY;

    if (swipeStateRef.current.lockedDirection === null) {
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      if (absX < ACTIVATION_THRESHOLD_PX && absY < ACTIVATION_THRESHOLD_PX) {
        return;
      }

      if (absX > absY * INTENT_RATIO) {
        swipeStateRef.current.lockedDirection = "x";
      } else {
        swipeStateRef.current.lockedDirection = "y";
      }
    }

    if (swipeStateRef.current.lockedDirection !== "x") {
      return;
    }

    const clampedX = Math.max(-140, Math.min(140, deltaX));
    swipeStateRef.current.deltaX = clampedX;
    setDragX(clampedX);
  };

  const handleTouchEnd = () => {
    if (!isMobile || !swipeStateRef.current || isNavigating) return;

    const { deltaX, lockedDirection } = swipeStateRef.current;
    swipeStateRef.current = null;

    if (lockedDirection !== "x") {
      setTransitionMs(0);
      setDragX(0);
      return;
    }

    if (Math.abs(deltaX) < NAVIGATION_THRESHOLD_PX) {
      setTransitionMs(SNAPBACK_ANIMATION_MS);
      setDragX(0);
      return;
    }

    navigateByDirection(deltaX < 0 ? "left" : "right");
  };

  const transitionStyle = transitionMs > 0 ? `transform ${transitionMs}ms cubic-bezier(0.22, 1, 0.36, 1)` : "none";

  return (
    <main
      className={className}
      style={{
        transform: `translate3d(${isMobile ? dragX : 0}px, 0, 0)`,
        transition: isMobile ? transitionStyle : "none",
        touchAction: "pan-y"
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      {children}
    </main>
  );
}
