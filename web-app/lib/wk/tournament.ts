// @ts-nocheck
export const GROUPS = {
  A:["Mexico","Zuid-Afrika","Zuid-Korea","Tsjechië"],
  B:["Canada","Bosnië en Herzegovina","Qatar","Zwitserland"],
  C:["Brazilië","Marokko","Haïti","Schotland"],
  D:["USA","Paraguay","Australië","Turkije"],
  E:["Duitsland","Curaçao","Ivoorkust","Ecuador"],
  F:["Nederland","Japan","Zweden","Tunesië"],
  G:["België","Egypte","Iran","Nieuw-Zeeland"],
  H:["Spanje","Kaapverdië","Saoedi-Arabië","Uruguay"],
  I:["Frankrijk","Senegal","Irak","Noorwegen"],
  J:["Argentinië","Algerije","Oostenrijk","Jordanië"],
  K:["Portugal","DR Congo","Oezbekistan","Colombia"],
  L:["Engeland","Kroatië","Ghana","Panama"]
};
export const ALL_COUNTRIES = Object.values(GROUPS).flat().sort();

// Country flag emoji map for WC 2026 teams
export const COUNTRY_FLAGS = {
  "Mexico":"🇲🇽","Zuid-Afrika":"🇿🇦","Zuid-Korea":"🇰🇷","Tsjechië":"🇨🇿",
  "Canada":"🇨🇦","Bosnië en Herzegovina":"🇧🇦","Qatar":"🇶🇦","Zwitserland":"🇨🇭",
  "Brazilië":"🇧🇷","Marokko":"🇲🇦","Haïti":"🇭🇹","Schotland":"🏴󠁧󠁢󠁳󠁣󠁴󠁿",
  "USA":"🇺🇸","Paraguay":"🇵🇾","Australië":"🇦🇺","Turkije":"🇹🇷",
  "Duitsland":"🇩🇪","Curaçao":"🇨🇼","Ivoorkust":"🇨🇮","Ecuador":"🇪🇨",
  "Nederland":"🇳🇱","Japan":"🇯🇵","Zweden":"🇸🇪","Tunesië":"🇹🇳",
  "België":"🇧🇪","Egypte":"🇪🇬","Iran":"🇮🇷","Nieuw-Zeeland":"🇳🇿",
  "Spanje":"🇪🇸","Kaapverdië":"🇨🇻","Saoedi-Arabië":"🇸🇦","Uruguay":"🇺🇾",
  "Frankrijk":"🇫🇷","Senegal":"🇸🇳","Irak":"🇮🇶","Noorwegen":"🇳🇴",
  "Argentinië":"🇦🇷","Algerije":"🇩🇿","Oostenrijk":"🇦🇹","Jordanië":"🇯🇴",
  "Portugal":"🇵🇹","DR Congo":"🇨🇩","Oezbekistan":"🇺🇿","Colombia":"🇨🇴",
  "Engeland":"🏴󠁧󠁢󠁥󠁮󠁧󠁿","Kroatië":"🇭🇷","Ghana":"🇬🇭","Panama":"🇵🇦"
};
export function flag(country) { return COUNTRY_FLAGS[country] || "🏳️"; }

export const CITIES = {
  mex:"Mexico City",gdl:"Guadalajara",mty:"Monterrey",
  tor:"Toronto",van:"Vancouver",
  atl:"Atlanta",bos:"Boston",dal:"Dallas",hou:"Houston",
  kc:"Kansas City",la:"Los Angeles",mia:"Miami",
  ny:"New York/NJ",phi:"Philadelphia",sf:"San Francisco Bay",sea:"Seattle"
};

/** Wall-clock times in GROUP_MATCHES use this offset (CEST in June/July). DB `fixture_mappings.kickoff_at` matches. */
export const WC2026_SCHEDULE_UTC_OFFSET = "+02:00";

/** First group-stage kickoff; aligns with `competitions.starts_at` for slug `wc2026`. */
export const WC2026_TOURNAMENT_START = Object.freeze({
  date:"2026-06-11",
  time:"18:00",
  isoOffset:"2026-06-11T18:00:00+02:00",
});

/**
 * One group-stage row: team1 vs team2, venue `location`, letter `group`.
 * `home` / `away` / `city` are aliases for older UI (neutral order — not literal home/away).
 */
export function mk(date, time, team1, team2, group, location) {
  return {
    date, time, team1, team2, group, location,
    home: team1, away: team2, city: location,
  };
}

export const GROUP_MATCHES = [
  mk("2026-06-11","18:00","Mexico","Zuid-Afrika","A",CITIES.mex),
  mk("2026-06-11","21:00","Zuid-Korea","Tsjechië","A",CITIES.gdl),
  mk("2026-06-12","18:00","Canada","Bosnië en Herzegovina","B",CITIES.tor),
  mk("2026-06-12","21:00","Qatar","Zwitserland","B",CITIES.van),
  mk("2026-06-13","18:00","Brazilië","Marokko","C",CITIES.mia),
  mk("2026-06-13","21:00","Haïti","Schotland","C",CITIES.atl),
  mk("2026-06-14","19:00","USA","Paraguay","D",CITIES.la),
  mk("2026-06-14","22:00","Nederland","Japan","F",CITIES.dal),
  mk("2026-06-15","19:00","Australië","Turkije","D",CITIES.sea),
  mk("2026-06-15","22:00","Zweden","Tunesië","F",CITIES.kc),
  mk("2026-06-16","18:00","Duitsland","Curaçao","E",CITIES.ny),
  mk("2026-06-16","21:00","Ivoorkust","Ecuador","E",CITIES.phi),
  mk("2026-06-17","19:00","België","Egypte","G",CITIES.bos),
  mk("2026-06-17","22:00","Iran","Nieuw-Zeeland","G",CITIES.hou),
  mk("2026-06-17","21:00","Spanje","Kaapverdië","H",CITIES.sf),
  mk("2026-06-18","19:00","Saoedi-Arabië","Uruguay","H",CITIES.mty),
  mk("2026-06-18","22:00","Frankrijk","Senegal","I",CITIES.ny),
  mk("2026-06-18","18:00","Irak","Noorwegen","I",CITIES.gdl),
  mk("2026-06-19","19:00","Argentinië","Algerije","J",CITIES.mia),
  mk("2026-06-19","22:00","Oostenrijk","Jordanië","J",CITIES.atl),
  mk("2026-06-20","18:00","Portugal","DR Congo","K",CITIES.dal),
  mk("2026-06-20","21:00","Oezbekistan","Colombia","K",CITIES.hou),
  mk("2026-06-20","19:00","Zweden","Nederland","F",CITIES.hou),
  mk("2026-06-20","22:00","Engeland","Kroatië","L",CITIES.la),
  mk("2026-06-21","19:00","Ghana","Panama","L",CITIES.sea),
  mk("2026-06-21","21:00","Zuid-Afrika","Zuid-Korea","A",CITIES.mex),
  mk("2026-06-22","18:00","Tsjechië","Mexico","A",CITIES.gdl),
  mk("2026-06-22","21:00","Bosnië en Herzegovina","Qatar","B",CITIES.van),
  mk("2026-06-23","18:00","Zwitserland","Canada","B",CITIES.tor),
  mk("2026-06-23","21:00","Marokko","Haïti","C",CITIES.mia),
  mk("2026-06-24","18:00","Schotland","Brazilië","C",CITIES.atl),
  mk("2026-06-24","21:00","Paraguay","Australië","D",CITIES.la),
  mk("2026-06-25","19:00","Turkije","USA","D",CITIES.sea),
  mk("2026-06-25","22:00","Curaçao","Ivoorkust","E",CITIES.ny),
  mk("2026-06-26","01:00","Tunesië","Nederland","F",CITIES.kc),
  mk("2026-06-26","19:00","Japan","Zweden","F",CITIES.dal),
  mk("2026-06-26","22:00","Ecuador","Duitsland","E",CITIES.phi),
  mk("2026-06-27","19:00","Egypte","Iran","G",CITIES.bos),
  mk("2026-06-27","22:00","Nieuw-Zeeland","België","G",CITIES.hou),
  mk("2026-06-28","18:00","Kaapverdië","Saoedi-Arabië","H",CITIES.sf),
  mk("2026-06-28","21:00","Uruguay","Spanje","H",CITIES.mty),
  mk("2026-06-29","18:00","Senegal","Irak","I",CITIES.gdl),
  mk("2026-06-29","21:00","Noorwegen","Frankrijk","I",CITIES.ny),
  mk("2026-06-30","19:00","Algerije","Oostenrijk","J",CITIES.mia),
  mk("2026-06-30","22:00","Jordanië","Argentinië","J",CITIES.atl),
  mk("2026-07-01","18:00","DR Congo","Oezbekistan","K",CITIES.dal),
  mk("2026-07-01","21:00","Colombia","Portugal","K",CITIES.hou),
  mk("2026-07-02","19:00","Kroatië","Ghana","L",CITIES.la),
  mk("2026-07-02","22:00","Panama","Engeland","L",CITIES.sea),
  mk("2026-07-03","20:00","Mexico","Zuid-Korea","A",CITIES.mex),
  mk("2026-07-03","20:00","Zuid-Afrika","Tsjechië","A",CITIES.gdl),
  mk("2026-07-04","20:00","Canada","Qatar","B",CITIES.tor),
  mk("2026-07-04","20:00","Bosnië en Herzegovina","Zwitserland","B",CITIES.van),
  mk("2026-07-05","20:00","Brazilië","Haïti","C",CITIES.mia),
  mk("2026-07-05","20:00","Marokko","Schotland","C",CITIES.atl),
  mk("2026-07-06","21:00","USA","Australië","D",CITIES.la),
  mk("2026-07-06","21:00","Paraguay","Turkije","D",CITIES.sea),
  mk("2026-07-07","18:00","Duitsland","Ivoorkust","E",CITIES.ny),
  mk("2026-07-07","18:00","Curaçao","Ecuador","E",CITIES.phi),
  mk("2026-07-07","21:00","Nederland","Tunesië","F",CITIES.dal),
  mk("2026-07-07","21:00","Japan","Zweden","F",CITIES.kc),
  mk("2026-07-08","18:00","België","Nieuw-Zeeland","G",CITIES.bos),
  mk("2026-07-08","18:00","Egypte","Iran","G",CITIES.hou),
  mk("2026-07-08","21:00","Spanje","Uruguay","H",CITIES.sf),
  mk("2026-07-08","21:00","Kaapverdië","Saoedi-Arabië","H",CITIES.mty),
  mk("2026-07-09","18:00","Frankrijk","Irak","I",CITIES.gdl),
  mk("2026-07-09","18:00","Senegal","Noorwegen","I",CITIES.ny),
  mk("2026-07-09","21:00","Argentinië","Jordanië","J",CITIES.mia),
  mk("2026-07-09","21:00","Algerije","Oostenrijk","J",CITIES.atl),
  mk("2026-07-10","18:00","Portugal","Colombia","K",CITIES.dal),
  mk("2026-07-10","18:00","DR Congo","Oezbekistan","K",CITIES.hou),
  mk("2026-07-10","21:00","Engeland","Ghana","L",CITIES.la),
  mk("2026-07-10","21:00","Kroatië","Panama","L",CITIES.sea)
];

export const KNOCKOUT = [
  { stage:"r16", matches:16 },
  { stage:"qf", matches:8 },
  { stage:"sf", matches:4 },
  { stage:"thirdp", matches:1 },
  { stage:"final", matches:1 }
];

export const FORMATIONS = {
  "4-3-3":{keeper:1,def:4,mid:3,att:3},
  "4-4-2":{keeper:1,def:4,mid:4,att:2},
  "3-4-3":{keeper:1,def:3,mid:4,att:3}
};
