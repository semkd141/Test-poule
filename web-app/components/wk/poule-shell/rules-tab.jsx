"use client";

import React from "react";
import { useApp } from "../poule-context.jsx";
import { CaptainBand } from "./teams/captain-band.jsx";

export function RulesTab() {
  const { t, config } = useApp();
  const r = t.rulesContent || {};

  return (
    <React.Fragment>
      <div className="card">
        <div className="card-title">📋 {r.title || "Spelregels"}</div>
        <p style={{lineHeight:1.6, color:"var(--fg)", marginBottom:14}}>
          {r.intro || "Welkom bij de WK 2026 Poule! Hieronder lees je hoe het spel werkt, hoe je punten verdient en wat de belangrijkste regels zijn."}
        </p>
      </div>

      {/* HOW IT WORKS */}
      <div className="card">
        <div className="card-title" style={{fontSize:18}}>{r.howTitle || "Hoe werkt het?"}</div>
        <ol style={{paddingLeft:20, lineHeight:1.7}}>
          <li>{r.how1 || "Schrijf je in vóór de inschrijfdeadline."}</li>
          <li>{r.how2 || "Kies een spelsysteem (4-3-3, 4-4-2 of 3-4-3)."}</li>
          <li>{r.how3 || "Selecteer voor elke positie een land. Per persoon mag je elk land maar één keer kiezen."}</li>
          <li>{r.how4 || "Vul de naam van de bondscoach in."}</li>
          <li>{r.how5 || "Tijdens het toernooi krijg je punten op basis van prestaties van de gekozen landen en spelers."}</li>
          <li>{r.how6 || "Wie aan het einde de meeste punten heeft, wint!"}</li>
        </ol>
      </div>

      {/* DEADLINE */}
      <div className="card" style={{borderLeft:"3px solid var(--orange)"}}>
        <div className="card-title" style={{fontSize:18}}>⏰ {r.deadlineTitle || "Inschrijfdeadline"}</div>
        <p style={{lineHeight:1.6}}>
          {r.deadlineText || "Inschrijven kan tot:"} <strong style={{color:"var(--orange)"}}>{config.deadlineLabel}</strong>.
          {" "}{r.deadlineNote || "Daarna is inschrijven niet meer mogelijk en kun je je team niet meer wijzigen."}
        </p>
      </div>

      {/* POINTS SYSTEM */}
      <div className="card">
        <div className="card-title" style={{fontSize:18}}>{r.pointsTitle || "Puntentelling"}</div>
        <p style={{fontSize:13, color:"var(--fg-muted)", marginBottom:14}}>
          {r.pointsIntro || "Punten verschillen per positie. Aanvallers krijgen meer punten voor doelpunten, verdedigers voor cleansheets, enz."}
        </p>

        <div style={{overflowX:"auto", marginBottom:18}}>
          <table style={{width:"100%", borderCollapse:"collapse", fontSize:13, minWidth:520}}>
            <thead>
              <tr style={{background:"var(--bg-3)"}}>
                <th style={{padding:"10px 12px", textAlign:"left", fontFamily:"var(--wk-heading-font)", fontSize:14, letterSpacing:"0.05em", color:"var(--orange)"}}>{r.eventCol || "Gebeurtenis"}</th>
                <th style={{padding:"10px 8px", textAlign:"center", fontSize:11, color:"var(--orange)"}}>🥅 {t.pos.keeper}</th>
                <th style={{padding:"10px 8px", textAlign:"center", fontSize:11, color:"var(--orange)"}}>🛡 {t.pos.def}</th>
                <th style={{padding:"10px 8px", textAlign:"center", fontSize:11, color:"var(--orange)"}}>🎯 {t.pos.mid}</th>
                <th style={{padding:"10px 8px", textAlign:"center", fontSize:11, color:"var(--orange)"}}>⚽ {t.pos.att}</th>
                <th style={{padding:"10px 8px", textAlign:"center", fontSize:11, color:"var(--orange)"}}>👔 {t.pos.coach}</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{borderTop:"1px solid var(--border)"}}>
                <td style={{padding:"8px 12px"}}>{r.evWin || "Wedstrijd gewonnen (land)"}</td>
                <td style={{padding:"8px", textAlign:"center"}}>+3</td><td style={{padding:"8px", textAlign:"center"}}>+3</td><td style={{padding:"8px", textAlign:"center"}}>+3</td><td style={{padding:"8px", textAlign:"center"}}>+3</td><td style={{padding:"8px", textAlign:"center"}}>+3</td>
              </tr>
              <tr style={{borderTop:"1px solid var(--border)"}}>
                <td style={{padding:"8px 12px"}}>{r.evDraw || "Gelijkspel (land)"}</td>
                <td style={{padding:"8px", textAlign:"center"}}>+1</td><td style={{padding:"8px", textAlign:"center"}}>+1</td><td style={{padding:"8px", textAlign:"center"}}>+1</td><td style={{padding:"8px", textAlign:"center"}}>+1</td><td style={{padding:"8px", textAlign:"center"}}>+1</td>
              </tr>
              <tr style={{borderTop:"1px solid var(--border)"}}>
                <td style={{padding:"8px 12px"}}>{r.evGoal || "Doelpunt"}</td>
                <td style={{padding:"8px", textAlign:"center"}}>+10</td><td style={{padding:"8px", textAlign:"center"}}>+5</td><td style={{padding:"8px", textAlign:"center"}}>+4</td><td style={{padding:"8px", textAlign:"center"}}>+3</td><td style={{padding:"8px", textAlign:"center"}}>—</td>
              </tr>
              <tr style={{borderTop:"1px solid var(--border)"}}>
                <td style={{padding:"8px 12px"}}>{r.evAssist || "Assist"}</td>
                <td style={{padding:"8px", textAlign:"center"}}>+5</td><td style={{padding:"8px", textAlign:"center"}}>+4</td><td style={{padding:"8px", textAlign:"center"}}>+3</td><td style={{padding:"8px", textAlign:"center"}}>+2</td><td style={{padding:"8px", textAlign:"center"}}>—</td>
              </tr>
              <tr style={{borderTop:"1px solid var(--border)"}}>
                <td style={{padding:"8px 12px"}}>{r.evClean || "Wedstrijd zonder tegendoelpunten"}</td>
                <td style={{padding:"8px", textAlign:"center"}}>+3</td><td style={{padding:"8px", textAlign:"center"}}>+1</td><td style={{padding:"8px", textAlign:"center"}}>—</td><td style={{padding:"8px", textAlign:"center"}}>—</td><td style={{padding:"8px", textAlign:"center"}}>—</td>
              </tr>
              <tr style={{borderTop:"1px solid var(--border)"}}>
                <td style={{padding:"8px 12px"}}>{r.evPenalty || "Penalty gestopt"}</td>
                <td style={{padding:"8px", textAlign:"center"}}>+3</td><td style={{padding:"8px", textAlign:"center"}}>—</td><td style={{padding:"8px", textAlign:"center"}}>—</td><td style={{padding:"8px", textAlign:"center"}}>—</td><td style={{padding:"8px", textAlign:"center"}}>—</td>
              </tr>
              <tr style={{borderTop:"1px solid var(--border)"}}>
                <td style={{padding:"8px 12px"}}>{r.evOg || "Eigen doelpunt"}</td>
                <td style={{padding:"8px", textAlign:"center", color:"#EF4444"}}>−3</td><td style={{padding:"8px", textAlign:"center", color:"#EF4444"}}>−3</td><td style={{padding:"8px", textAlign:"center"}}>—</td><td style={{padding:"8px", textAlign:"center"}}>—</td><td style={{padding:"8px", textAlign:"center"}}>—</td>
              </tr>
              <tr style={{borderTop:"1px solid var(--border)"}}>
                <td style={{padding:"8px 12px"}}>{r.evYellow || "Gele kaart"}</td>
                <td style={{padding:"8px", textAlign:"center", color:"#EF4444"}}>−1</td><td style={{padding:"8px", textAlign:"center", color:"#EF4444"}}>−1</td><td style={{padding:"8px", textAlign:"center", color:"#EF4444"}}>−1</td><td style={{padding:"8px", textAlign:"center", color:"#EF4444"}}>−1</td><td style={{padding:"8px", textAlign:"center", color:"#EF4444"}}>−1</td>
              </tr>
              <tr style={{borderTop:"1px solid var(--border)"}}>
                <td style={{padding:"8px 12px"}}>{r.ev2Yellow || "2x geel = rood"}</td>
                <td style={{padding:"8px", textAlign:"center", color:"#EF4444"}}>−2</td><td style={{padding:"8px", textAlign:"center", color:"#EF4444"}}>−2</td><td style={{padding:"8px", textAlign:"center", color:"#EF4444"}}>−2</td><td style={{padding:"8px", textAlign:"center", color:"#EF4444"}}>−2</td><td style={{padding:"8px", textAlign:"center", color:"#EF4444"}}>−2</td>
              </tr>
              <tr style={{borderTop:"1px solid var(--border)"}}>
                <td style={{padding:"8px 12px"}}>{r.evRed || "Directe rode kaart"}</td>
                <td style={{padding:"8px", textAlign:"center", color:"#EF4444"}}>−4</td><td style={{padding:"8px", textAlign:"center", color:"#EF4444"}}>−4</td><td style={{padding:"8px", textAlign:"center", color:"#EF4444"}}>−4</td><td style={{padding:"8px", textAlign:"center", color:"#EF4444"}}>−4</td><td style={{padding:"8px", textAlign:"center", color:"#EF4444"}}>−4</td>
              </tr>
              <tr style={{borderTop:"1px solid var(--border)"}}>
                <td style={{padding:"8px 12px"}}>{r.evSub || "Geslaagde wissel (doelpunt na wissel)"}</td>
                <td style={{padding:"8px", textAlign:"center"}}>—</td><td style={{padding:"8px", textAlign:"center"}}>—</td><td style={{padding:"8px", textAlign:"center"}}>—</td><td style={{padding:"8px", textAlign:"center"}}>—</td><td style={{padding:"8px", textAlign:"center"}}>+1</td>
              </tr>
              <tr style={{borderTop:"1px solid var(--border)", background:"var(--orange-soft)"}}>
                <td style={{padding:"8px 12px", fontWeight:700}}>🏆 {r.evChampion || "World Champion"}</td>
                <td style={{padding:"8px", textAlign:"center", color:"var(--fg-muted)"}}>—</td>
                <td style={{padding:"8px", textAlign:"center", color:"var(--fg-muted)"}}>—</td>
                <td style={{padding:"8px", textAlign:"center", color:"var(--fg-muted)"}}>—</td>
                <td style={{padding:"8px", textAlign:"center", color:"var(--fg-muted)"}}>—</td>
                <td style={{padding:"8px", textAlign:"center", color:"var(--fg-muted)"}}>—</td>
              </tr>
              <tr style={{background:"rgba(255,215,0,0.08)", borderTop:"2px solid #FFD700"}}>
                <td style={{padding:"8px 12px", fontWeight:700, display:"flex", alignItems:"center", gap:8}}>
                  <CaptainBand size={28}/> {r.captainTitle || "Captain"} — {r.evChampion || "World Champion"}
                </td>
                <td style={{padding:"8px", textAlign:"center", fontWeight:700, color:"#FF6B00"}}>+3</td>
                <td style={{padding:"8px", textAlign:"center", fontWeight:700, color:"#FF6B00"}}>+3</td>
                <td style={{padding:"8px", textAlign:"center", fontWeight:700, color:"#FF6B00"}}>+3</td>
                <td style={{padding:"8px", textAlign:"center", fontWeight:700, color:"#FF6B00"}}>+3</td>
                <td style={{padding:"8px", textAlign:"center", color:"var(--fg-muted)"}}>—</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* RULES */}
      <div className="card">
        <div className="card-title" style={{fontSize:18}}>{r.rulesTitle || "Belangrijke regels"}</div>
        <ul style={{paddingLeft:20, lineHeight:1.8}}>
          <li>{r.rule1 || "Je kunt je inschrijven met één e-mailadres — één team per persoon."}</li>
          <li>{r.rule2 || "Binnen jouw team mag elk land maar één keer voorkomen."}</li>
          <li>{r.rule3 || "Andere deelnemers mogen wel hetzelfde land kiezen — er is geen exclusiviteit tussen teams."}</li>
          <li>{r.rule4 || "Na de inschrijfdeadline kun je je team niet meer wijzigen."}</li>
          <li>{r.rule5 || "Punten worden continu bijgewerkt door de beheerder tijdens het toernooi."}</li>
          <li>{r.rule6 || "Bij gelijke eindstand wint degene met de meeste doelpunten van zijn aanvallers."}</li>
        </ul>
      </div>

      {/* CAPTAIN */}
      <div className="card" style={{borderLeft:"3px solid #FFD700"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
          <CaptainBand size={32}/>
          <div className="card-title" style={{fontSize:18,margin:0}}>{r.captainTitle || "Captain"}</div>
        </div>
        <p style={{lineHeight:1.6, marginBottom:10}}>
          {r.captainText || "You choose one player from your team as captain. If that player's country becomes world champion, your captain earns the champion bonus points — just like all your other players from that country. The captain itself does not give extra bonus points on top."}
        </p>
        <div style={{background:"var(--bg-3)",borderRadius:10,padding:"12px 16px",fontSize:13}}>
          <strong>Example:</strong> You pick Virgil van Dijk (🇳🇱 Netherlands) as captain.
          Netherlands becomes world champion. Virgil then earns:
          <ul style={{marginTop:8,paddingLeft:20,lineHeight:1.8}}>
            <li>+3 pt (champion bonus for defender — same as all your other Netherlands players)</li>
            <li>The captain badge is a visual marker only — it does not add extra points</li>
          </ul>
          <div style={{marginTop:8,padding:"8px 12px",background:"rgba(255,107,0,0.08)",borderRadius:8,borderLeft:"3px solid var(--orange)"}}>
            💡 <strong>Strategy tip:</strong> Pick a player from a country you think will go far — the champion bonus is worth +3 pt for every player from that country in your team.
          </div>
        </div>
        <p style={{fontSize:13,color:"var(--fg-muted)",marginTop:10,lineHeight:1.6}}>
          {r.captainNote || "Your captain is shown with a orange armband on your team board. Choose wisely — a favourite country gives the best chance of earning the bonus!"}
        </p>
      </div>

      {/* EXAMPLE TEAM */}
      <div className="card">
        <div className="card-title" style={{fontSize:18}}>📋 {r.exampleTitle || "Example team (4-3-3)"}</div>
        <p style={{fontSize:13,color:"var(--fg-muted)",marginBottom:14,lineHeight:1.6}}>
          {r.exampleIntro || "A valid team example. Each country used only once, captain marked with the armband."}
        </p>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,minWidth:360}}>
            <thead>
              <tr style={{background:"var(--bg-3)"}}>
                <th style={{padding:"8px 12px",textAlign:"left",color:"var(--orange)",fontFamily:"var(--wk-heading-font)",fontSize:14}}>Position</th>
                <th style={{padding:"8px 12px",textAlign:"left",color:"var(--orange)",fontFamily:"var(--wk-heading-font)",fontSize:14}}>Player</th>
                <th style={{padding:"8px 12px",textAlign:"left",color:"var(--orange)",fontFamily:"var(--wk-heading-font)",fontSize:14}}>Country</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Goalkeeper","Bart Verbruggen","🇳🇱 Netherlands"],
                ["Defender","Achraf Hakimi","🇲🇦 Morocco"],
                ["Defender","Alejandro Grimaldo","🇪🇸 Spain"],
                ["Defender","Joško Gvardiol","🇭🇷 Croatia"],
                ["Defender","William Saliba","🇫🇷 France"],
                ["Midfielder ⚽ Captain","Jude Bellingham","🏴󠁧󠁢󠁥󠁮󠁧󠁿 England"],
                ["Midfielder","Florian Wirtz","🇩🇪 Germany"],
                ["Midfielder","Tijjani Reijnders","🇮🇹 Italy"],
                ["Forward","Vinícius Júnior","🇧🇷 Brazil"],
                ["Forward","Lautaro Martínez","🇦🇷 Argentina"],
                ["Forward","Erling Haaland","🇳🇴 Norway"],
                ["Coach","Lionel Scaloni","🇦🇷 ⛔"],
              ].map(function(row, i) {
                const isBad = row[2].indexOf("⛔") !== -1;
                const isCap = row[0].indexOf("Captain") !== -1;
                return (
                  <tr key={i} style={{borderTop:"1px solid var(--border)",background:isBad?"rgba(239,68,68,0.08)":isCap?"rgba(255,215,0,0.06)":"transparent"}}>
                    <td style={{padding:"8px 12px",fontWeight:600,display:"flex",alignItems:"center",gap:6}}>
                      {isCap && <CaptainBand size={22}/>}
                      {row[0].replace(" ⚽ Captain","")}
                    </td>
                    <td style={{padding:"8px 12px"}}>{row[1]}</td>
                    <td style={{padding:"8px 12px",color:isBad?"#EF4444":"var(--fg)"}}>{isBad ? row[2].replace("⛔","") : row[2]}{isBad ? " ← ERROR: Argentina already used!" : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p style={{fontSize:12,color:"#EF4444",marginTop:10}}>
          ⚠️ {r.exampleNote || "In this example, Argentina is used twice — Lautaro Martínez as forward AND Scaloni as coach. That's not allowed. Each country only once per team."}
        </p>
      </div>

      {/* COMMON MISTAKES */}
      <div className="card">
        <div className="card-title" style={{fontSize:18}}>{r.mistakesTitle || "Common mistakes"}</div>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {[
            ["Same country twice", "You pick Mbappé (🇫🇷 France) as forward AND Deschamps (🇫🇷 France) as coach. Not allowed — each country may appear only once in your team."],
            ["Forgetting the coach", "Without a head coach your team cannot be submitted. The coach is required."],
            ["Picking a country but forgetting the player", "After selecting a country, you must also select a player. The slot stays highlighted until you complete the selection."],
            ["Forgetting to pick a captain", "Click the armband icon next to a player after selecting them. Without a captain you miss out on the champion bonus if your country wins."],
            ["Registering too late", "After the deadline registration is no longer possible. Make sure you sign up on time!"],
          ].map(function(item, i) {
            return (
              <div key={i} style={{display:"flex",gap:12,padding:"12px 14px",background:"var(--bg-3)",borderRadius:10,borderLeft:"3px solid var(--orange)"}}>
                <div style={{flexShrink:0,width:28,height:28,borderRadius:"50%",background:"var(--orange)",color:"white",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:13}}>{i+1}</div>
                <div>
                  <div style={{fontWeight:700,marginBottom:4}}>{item[0]}</div>
                  <div style={{fontSize:13,color:"var(--fg-muted)",lineHeight:1.5}}>{item[1]}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* CONTACT */}
      <div className="card" style={{background:"var(--bg-3)", border:"none"}}>
        <div style={{fontSize:13, color:"var(--fg-muted)", lineHeight:1.6}}>
          💬 <strong>{r.contactText || "Heb je vragen of zie je een fout in de puntentelling? Neem contact op met de organisator van de poule."}</strong>
        </div>
        <div style={{fontSize:13, color:"var(--fg-muted)", lineHeight:1.6, marginTop:8}}>
          🔒 <strong>{r.privacyTitle || "Privacy"}:</strong> {r.privacyText || "Je e-mailadres wordt alleen gebruikt om dubbele inschrijvingen te voorkomen en wordt niet gedeeld met derden."}
        </div>
      </div>
    </React.Fragment>
  );
}

