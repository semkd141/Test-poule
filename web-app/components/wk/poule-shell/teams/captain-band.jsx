"use client";

import React from "react";
export function CaptainBand(props) {
  var sz = props.size || 28;
  var h = Math.round(sz * 0.65);
  var active = props.active !== false;
  var fill = active ? "#FF6B00" : "#888";
  var dark = active ? "#E85D00" : "#666";
  var stripe = Math.round(h * 0.22);
  return (
    <svg width={sz} height={h} viewBox={"0 0 " + sz + " " + h} style={{display:"block",flexShrink:0}} aria-label="Captain">
      <rect x="0" y="0" width={sz} height={h} rx="3" fill={fill}/>
      <rect x="0" y="0" width={sz} height={stripe} rx="2" fill={dark}/>
      <rect x="0" y={h - stripe} width={sz} height={stripe} rx="2" fill={dark}/>
      <text x={sz/2} y={h * 0.72} textAnchor="middle" fontFamily="Georgia, serif" fontSize={Math.round(h * 0.52)} fontWeight="900" fill="#1a1a1a">C</text>
    </svg>
  );
}
