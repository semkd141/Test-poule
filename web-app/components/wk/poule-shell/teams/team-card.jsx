"use client";

import React from "react";
import { FormationField } from "./formation-field.jsx";
export function TeamCard(props) {
  let spelers = props.participant.spelers;
  if (typeof spelers === "string") { try { spelers = JSON.parse(spelers); } catch { spelers = []; } }
  if (!Array.isArray(spelers)) spelers = [];
  return (
    <div className="card">
      <div className="card-title" style={{justifyContent:"space-between",display:"flex"}}>
        <span>{props.participant.teamnaam}</span>
        <span className="badge">{props.participant.systeem}</span>
      </div>
      <div style={{fontSize:13,color:"var(--fg-muted)",marginBottom:10}}>{props.participant.naam}</div>
      <FormationField spelers={spelers} system={props.participant.systeem} />
    </div>
  );
}
