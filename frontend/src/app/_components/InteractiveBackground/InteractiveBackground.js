"use client";

import React, { useEffect, useState } from "react";
import styles from "./InteractiveBackground.module.css";

export default function InteractiveBackground() {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e) => {
      // Normalize mouse coordinates to range [-1, 1] for parallax effect
      const x = (e.clientX / window.innerWidth) * 2 - 1;
      const y = (e.clientY / window.innerHeight) * 2 - 1;
      setMousePosition({ x, y });
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  return (
    <div 
      className={styles.parallaxContainer}
      style={{
        '--mouse-x': mousePosition.x,
        '--mouse-y': mousePosition.y
      }}
    >
      <div className={styles.layerSphere1}>
        <div className={styles.gradientSphere1}></div>
      </div>
      <div className={styles.layerSphere2}>
        <div className={styles.gradientSphere2}></div>
      </div>
      <div className={styles.layerSphere3}>
        <div className={styles.gradientSphere3}></div>
      </div>
      <div className={styles.layerGrid}>
        <div className={styles.gridOverlay}></div>
      </div>
    </div>
  );
}
