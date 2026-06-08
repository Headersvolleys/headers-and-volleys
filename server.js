const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3001;
const API_KEY = process.env.FOOTBALL_DATA_API_KEY || '';
const BASE = 'https://api.football-data.org/v4';

app.use(cors());
app.use(express.json());

// Cache
const cache = {};
async function fd(endpoint, ttl) {
  const now = Date.now();
  if (cache[endpoint] && now - cache[endpoint].ts < ttl) return cache[endpoint].data;
  const res = await fetch(`${BASE}${endpoint}`, { headers: { 'X-Auth-Token': API_KEY } });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  cache[endpoint] = { data, ts: now };
  return data;
}

const MIN = 60000;
app.get('/api/matches', async (req, res) => {
  try { res.json(await fd('/competitions/PL/matches?season=2025', 5*MIN)); }
  catch(e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/matches/live', async (req, res) => {
  try { res.json(await fd('/competitions/PL/matches?status=IN_PLAY,PAUSED,LIVE', MIN)); }
  catch(e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/matches/today', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    res.json(await fd(`/competitions/PL/matches?dateFrom=${today}&dateTo=${today}`, MIN));
  } catch(e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/standings', async (req, res) => {
  try { res.json(await fd('/competitions/PL/standings?season=2025', 5*MIN)); }
  catch(e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/scorers', async (req, res) => {
  try {
    const limit = req.query.limit || 50;
    res.json(await fd('/competitions/PL/scorers?season=2025&limit='+limit, 10*MIN));
  } catch(e) { res.status(500).json({ error: e.message }); }
});
// Single match with goals, cards, lineups
app.get('/api/match/:id', async (req, res) => {
  try { res.json(await fd(`/matches/${req.params.id}`, 2*MIN)); }
  catch(e) { res.status(500).json({ error: e.message }); }
});
// Team info + current season stats
app.get('/api/team/:id', async (req, res) => {
  try { res.json(await fd(`/teams/${req.params.id}`, 60*MIN)); }
  catch(e) { res.status(500).json({ error: e.message }); }
});
// Team matches for form
app.get('/api/team/:id/matches', async (req, res) => {
  try { res.json(await fd(`/teams/${req.params.id}/matches?competitions=PL&season=2025&status=FINISHED&limit=5`, 5*MIN)); }
  catch(e) { res.status(500).json({ error: e.message }); }
});
// Head to head
app.get('/api/h2h/:id', async (req, res) => {
  try { res.json(await fd(`/matches/${req.params.id}/head2head?limit=5`, 30*MIN)); }
  catch(e) { res.status(500).json({ error: e.message }); }
});
// All PL teams
app.get('/api/teams', async (req, res) => {
  try { res.json(await fd('/competitions/PL/teams?season=2025', 60*MIN)); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

// API-Football (v3.football.api-sports.io)
const AF_KEY = process.env.API_FOOTBALL_KEY || '';
const AF_BASE = 'https://v3.football.api-sports.io';
const afCache = {};

async function af(endpoint, ttl) {
  const now = Date.now();
  if (afCache[endpoint] && now - afCache[endpoint].ts < ttl) return afCache[endpoint].data;
  const r = await fetch(AF_BASE + endpoint, {
    headers: { 'x-apisports-key': AF_KEY }
  });
  if (!r.ok) throw new Error('AF API ' + r.status);
  const data = await r.json();
  afCache[endpoint] = { data, ts: now };
  return data;
}

// Match statistics - possession, shots, xG, corners etc
app.get('/api/af/stats/:fixtureId', async (req, res) => {
  try {
    const data = await af('/fixtures/statistics?fixture=' + req.params.fixtureId, 2*MIN);
    res.json(data);
  } catch(e) { res.status(500).json({error: e.message}); }
});

// Match lineups with formations and player positions
app.get('/api/af/lineups/:fixtureId', async (req, res) => {
  try {
    const data = await af('/fixtures/lineups?fixture=' + req.params.fixtureId, 5*MIN);
    res.json(data);
  } catch(e) { res.status(500).json({error: e.message}); }
});

// Match events - goals, cards, subs with minutes
app.get('/api/af/events/:fixtureId', async (req, res) => {
  try {
    const data = await af('/fixtures/events?fixture=' + req.params.fixtureId, 2*MIN);
    res.json(data);
  } catch(e) { res.status(500).json({error: e.message}); }
});

// Find API-Football fixture ID from date + team names
app.get('/api/af/fixture', async (req, res) => {
  try {
    const {date} = req.query;
    const data = await af('/fixtures?league=39&season=2025&date=' + date, 60*MIN);
    res.json(data);
  } catch(e) { res.status(500).json({error: e.message}); }
});

// Smart lookup - returns AF fixture ID for given date + team names
app.get('/api/af/lookup', async (req, res) => {
  try {
    const {home, away, date} = req.query;
    const data = await af('/fixtures?league=39&season=2025&date=' + date, 60*MIN);
    const fixtures = data.response || [];
    const norm = s => (s||'').toLowerCase().replace(/[^a-z0-9\s]/g,'').trim();
    const EXPAND = {
      'man utd':'manchester united','man united':'manchester united',
      'man city':'manchester city',
      'spurs':'tottenham hotspur','tottenham':'tottenham hotspur',
      'nottm forest':'nottingham forest','nottingham':'nottingham forest',
      'wolves':'wolverhampton wanderers','wolverhampton':'wolverhampton wanderers',
      'west ham':'west ham united',
      'newcastle':'newcastle united',
      'brighton':'brighton hove albion',
      'leeds':'leeds united',
    };
    const expand = s => { const n=norm(s); return EXPAND[n]||n; };
    const hn = expand(home), an = expand(away);
    // Score each fixture by how well it matches
    const score = (afName, ourName) => {
      const fn = expand(afName);
      if(fn===ourName) return 3;
      if(fn.includes(ourName.slice(0,6))||ourName.includes(fn.slice(0,6))) return 2;
      if(fn.includes(ourName.slice(0,4))||ourName.includes(fn.slice(0,4))) return 1;
      return 0;
    };
    const scored = fixtures.map(f=>({
      f,
      s: score(f.teams?.home?.name,hn) + score(f.teams?.away?.name,an)
    })).filter(x=>x.s>=2).sort((a,b)=>b.s-a.s);
    const found = scored[0]?.f || null;
    // Return debug info so we can diagnose mismatches
    res.json({
      fixtureId: found?.fixture?.id || null,
      debug: { home, away, hn, an, fixtures: fixtures.map(f=>f.teams?.home?.name+' v '+f.teams?.away?.name) }
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// All PL fixtures for 2025 season
app.get('/api/af/fixtures', async (req, res) => {
  try {
    const data = await af('/fixtures?league=39&season=2025', 60*MIN);
    res.json(data);
  } catch(e) { res.status(500).json({error: e.message}); }
});

// GK clean sheets - calculated from match results + team squads
app.get('/api/gk-cleansheets', async (req, res) => {
  try {
    const [matchesData, teamsData] = await Promise.all([
      fd('/competitions/PL/matches?season=2025&status=FINISHED', 5*MIN),
      fd('/competitions/PL/teams?season=2025', 60*MIN),
    ]);
    const matches = matchesData.matches || [];
    const teams = teamsData.teams || [];

    // Count clean sheets per team
    const teamCS = {};
    const teamGames = {};
    matches.forEach(m => {
      const hId = m.homeTeam?.id, aId = m.awayTeam?.id;
      const hg = m.score?.fullTime?.home, ag = m.score?.fullTime?.away;
      if (hg == null || ag == null) return;
      if (!teamCS[hId]) { teamCS[hId] = 0; teamGames[hId] = 0; }
      if (!teamCS[aId]) { teamCS[aId] = 0; teamGames[aId] = 0; }
      teamGames[hId]++; teamGames[aId]++;
      if (ag === 0) teamCS[hId]++;
      if (hg === 0) teamCS[aId]++;
    });

    // Get starting GK from squad for each team
    const gkList = [];
    teams.forEach(team => {
      const gk = (team.squad || []).find(p => p.position === 'Goalkeeper');
      if (gk && teamCS[team.id] != null) {
        gkList.push({
          name: gk.name,
          team: team.name,
          teamId: team.id,
          cleanSheets: teamCS[team.id] || 0,
          gamesPlayed: teamGames[team.id] || 0,
        });
      }
    });

    gkList.sort((a, b) => b.cleanSheets - a.cleanSheets);
    res.json({ goalkeepers: gkList });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GK clean sheets endpoint alias

async function fetchUnderstat(url) {
  const r = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-GB,en;q=0.5',
      'Referer': 'https://understat.com/',
    }
  });
  if (!r.ok) throw new Error('Understat ' + r.status);
  const html = await r.text();
  const out = {};
  const scriptRe = /<script>([\s\S]*?)<\/script>/g;
  let sm;
  while ((sm = scriptRe.exec(html)) !== null) {
    const src = sm[1];
    const pairs = [
      ['players', /var\s+playersData\s*=\s*JSON\.parse\('(.+?)'\)/],
      ['teams',   /var\s+teamsData\s*=\s*JSON\.parse\('(.+?)'\)/],
      ['dates',   /var\s+datesData\s*=\s*JSON\.parse\('(.+?)'\)/],
    ];
    for (const [key, re] of pairs) {
      const m = src.match(re);
      if (m) {
        try {
          const raw = m[1].replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h,16)))
                          .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h,16)));
          out[key] = JSON.parse(raw);
        } catch(e) {
          try { out[key] = JSON.parse(m[1]); } catch(e2) {}
        }
      }
    }
  }
  return out;
}

app.get('/api/xg/players', async (req, res) => {
  const key = 'us_players';
  const now = Date.now();
  if (cache[key] && now - cache[key].ts < 30*MIN) return res.json(cache[key].data);
  try {
    const d = await fetchUnderstat('https://understat.com/league/EPL/2025');
    const players = (d.players || []).map(p => ({
      id: p.id, name: p.player_name, team: p.team_title,
      games: +p.games, mins: +p.time, goals: +p.goals,
      assists: +p.assists, shots: +p.shots,
      xG: +parseFloat(p.xG).toFixed(2),
      xA: +parseFloat(p.xA).toFixed(2),
      npxG: +parseFloat(p.npxG).toFixed(2),
      xGChain: +parseFloat(p.xGChain).toFixed(2),
      keyPasses: +p.key_passes, position: p.position,
    })).sort((a,b) => b.xG - a.xG);
    cache[key] = { data: {players}, ts: now };
    res.json({players});
  } catch(e) { res.status(500).json({error: e.message}); }
});

app.get('/api/xg/teams', async (req, res) => {
  const key = 'us_teams';
  const now = Date.now();
  if (cache[key] && now - cache[key].ts < 30*MIN) return res.json(cache[key].data);
  try {
    const d = await fetchUnderstat('https://understat.com/league/EPL/2025');
    const teams = Object.values(d.teams || {}).map(t => ({
      name: t.title,
      xG: +parseFloat(t.xG||0).toFixed(2),
      xGA: +parseFloat(t.xGA||0).toFixed(2),
      npxG: +parseFloat(t.npxG||0).toFixed(2),
      npxGA: +parseFloat(t.npxGA||0).toFixed(2),
      xPts: +parseFloat(t.xpts||0).toFixed(2),
      ppda: t.ppda ? +parseFloat(t.ppda.att/t.ppda.def).toFixed(2) : null,
    })).sort((a,b) => b.xG - a.xG);
    cache[key] = { data: {teams}, ts: now };
    res.json({teams});
  } catch(e) { res.status(500).json({error: e.message}); }
});

// Understat - parse JSON embedded in page HTML
async function fetchUnderstat(url) {
  const r = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HaV/1.0)' }
  });
  const html = await r.text();
  // Understat embeds data as JSON.parse('...') inside script tags
  const matches = [...html.matchAll(/JSON\.parse\('([^']+)'/g)];
  const results = {};
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  for (const s of scripts) {
    const src = s[1];
    // playersData
    const pm = src.match(/var\s+playersData\s*=\s*JSON\.parse\('(.*?)'\)/);
    if (pm) { try { results.players = JSON.parse(pm[1]); } catch(e){} }
    // teamsData
    const tm = src.match(/var\s+teamsData\s*=\s*JSON\.parse\('(.*?)'\)/);
    if (tm) { try { results.teams = JSON.parse(tm[1]); } catch(e){} }
    // datesData (match results)
    const dm = src.match(/var\s+datesData\s*=\s*JSON\.parse\('(.*?)'\)/);
    if (dm) { try { results.dates = JSON.parse(dm[1]); } catch(e){} }
  }
  return results;
}

// Understat match xG by date - finds home/away xG for a specific match
app.get('/api/xg/match', async (req, res) => {
  try {
    const {home, away, date} = req.query;
    const d = await fetchUnderstat('https://understat.com/league/EPL/2025');
    const dates = d.dates || [];
    const norm = s => (s||'').toLowerCase().replace(/[^a-z]/g,'');
    const hn = norm(home), an = norm(away);
    // Filter by date if provided (YYYY-MM-DD)
    const candidates = date ? dates.filter(m => m.datetime && m.datetime.startsWith(date.replace(/-/g,'/'))) : dates;
    const pool = candidates.length > 0 ? candidates : dates;
    const match = pool.find(m => {
      const fh = norm(m.h?.title), fa = norm(m.a?.title);
      return (fh.includes(hn.slice(0,5))||hn.includes(fh.slice(0,5))) &&
             (fa.includes(an.slice(0,5))||an.includes(fa.slice(0,5)));
    });
    if (!match) return res.json({found:false});
    res.json({
      found: true,
      home: { xg: parseFloat(parseFloat(match.xg||0).toFixed(2)), team: match.h?.title },
      away: { xg: parseFloat(parseFloat(match.xga||0).toFixed(2)), team: match.a?.title },
    });
  } catch(e) { res.status(500).json({error: e.message}); }
});

// xG player stats for EPL 2025
app.get('/api/xg/players', async (req, res) => {
  const cacheKey = 'understat_players_2025';
  const now = Date.now();
  if (cache[cacheKey] && now - cache[cacheKey].ts < 30*MIN) {
    return res.json(cache[cacheKey].data);
  }
  try {
    const data = await fetchUnderstat('https://understat.com/league/EPL/2025');
    const players = (data.players || []).map(p => ({
      id: p.id,
      name: p.player_name,
      team: p.team_title,
      games: parseInt(p.games),
      mins: parseInt(p.time),
      goals: parseInt(p.goals),
      assists: parseInt(p.assists),
      shots: parseInt(p.shots),
      xG: parseFloat(parseFloat(p.xG).toFixed(2)),
      xA: parseFloat(parseFloat(p.xA).toFixed(2)),
      npxG: parseFloat(parseFloat(p.npxG).toFixed(2)),
      xGChain: parseFloat(parseFloat(p.xGChain).toFixed(2)),
      keyPasses: parseInt(p.key_passes),
      position: p.position,
      yellowCards: parseInt(p.yellow_cards),
      redCards: parseInt(p.red_cards),
    })).sort((a,b) => b.xG - a.xG);
    const result = { players };
    cache[cacheKey] = { data: result, ts: now };
    res.json(result);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// xG team table for EPL 2025
app.get('/api/xg/teams', async (req, res) => {
  const cacheKey = 'understat_teams_2025';
  const now = Date.now();
  if (cache[cacheKey] && now - cache[cacheKey].ts < 30*MIN) {
    return res.json(cache[cacheKey].data);
  }
  try {
    const data = await fetchUnderstat('https://understat.com/league/EPL/2025');
    const teams = data.teams || {};
    const result = { teams: Object.values(teams).map(t => ({
      id: t.id,
      name: t.title,
      xG: parseFloat(parseFloat(t.xG || 0).toFixed(2)),
      xGA: parseFloat(parseFloat(t.xGA || 0).toFixed(2)),
      npxG: parseFloat(parseFloat(t.npxG || 0).toFixed(2)),
      npxGA: parseFloat(parseFloat(t.npxGA || 0).toFixed(2)),
      ppda: t.ppda ? parseFloat(parseFloat(t.ppda.att / t.ppda.def).toFixed(2)) : null,
      xPts: parseFloat(parseFloat(t.xpts || 0).toFixed(2)),
    })).sort((a,b) => b.xG - a.xG) };
    cache[cacheKey] = { data: result, ts: now };
    res.json(result);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Proxy crest images to avoid CORS issues
app.get('/api/crest/:id', async (req, res) => {
  try {
    const url = 'https://crests.football-data.org/' + req.params.id;
    const r = await fetch(url, { headers: { 'X-Auth-Token': API_KEY } });
    if (!r.ok) { res.status(404).send('Not found'); return; }
    const buf = await r.arrayBuffer();
    const ct = r.headers.get('content-type') || 'image/png';
    res.set('Content-Type', ct);
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(Buffer.from(buf));
  } catch(e) { res.status(500).send(e.message); }
});


app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"/>
<title>Headers &amp; Volleys</title>
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;600;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0F2027;color:#E0FFFD;font-family:'DM Sans',sans-serif;max-width:520px;margin:0 auto}
::-webkit-scrollbar{width:4px;height:4px}::-webkit-scrollbar-thumb{background:#1E3545;border-radius:2px}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes blink{0%,100%{opacity:1}50%{opacity:.4}}
@keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
@keyframes slideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
input[type=number]::-webkit-outer-spin-button,input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}
input[type=number]{-moz-appearance:textfield}
</style>
</head>
<body><div id="root"></div>
<script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
<script type="text/babel">
const {useState,useEffect,useCallback,useRef} = React;
const C={dark:'#0F2027',d2:'#1A3340',d3:'#162D3A',d4:'#1E3545',white:'#fff',text:'#E0FFFD',muted:'#5A9AAA',teal:'#0ABFB8',green:'#00E676',red:'#FF3D3D',yellow:'#FFD600',orange:'#FF8000',blue:'#2979FF',gold:'#FFD700'};
const TCODE={
  'Arsenal':'ARS','Arsenal FC':'ARS',
  'Aston Villa':'AVL','Aston Villa FC':'AVL',
  'Brighton & Hove Albion':'BHA','Brighton & Hove Albion FC':'BHA',
  'AFC Bournemouth':'BOU','Bournemouth':'BOU',
  'Brentford':'BRE','Brentford FC':'BRE',
  'Burnley':'BUR','Burnley FC':'BUR',
  'Chelsea':'CHE','Chelsea FC':'CHE',
  'Crystal Palace':'CRY','Crystal Palace FC':'CRY',
  'Everton':'EVE','Everton FC':'EVE',
  'Fulham':'FUL','Fulham FC':'FUL',
  'Leeds United':'LEE','Leeds United FC':'LEE',
  'Liverpool':'LIV','Liverpool FC':'LIV',
  'Manchester City':'MCI','Manchester City FC':'MCI',
  'Manchester United':'MUN','Manchester United FC':'MUN',
  'Newcastle United':'NEW','Newcastle United FC':'NEW',
  'Nottingham Forest':'NFO','Nottingham Forest FC':'NFO',
  'Sunderland AFC':'SUN','Sunderland':'SUN','Sunderland AFC':'SUN',
  'Tottenham Hotspur':'TOT','Tottenham Hotspur FC':'TOT',
  'West Ham United':'WHU','West Ham United FC':'WHU',
  'Wolverhampton Wanderers':'WOL','Wolverhampton Wanderers FC':'WOL',
};
const TSHORT={
  'Arsenal':'Arsenal','Arsenal FC':'Arsenal',
  'Aston Villa':'Aston Villa','Aston Villa FC':'Aston Villa',
  'Brighton & Hove Albion':'Brighton','Brighton & Hove Albion FC':'Brighton',
  'AFC Bournemouth':'Bournemouth','Bournemouth':'Bournemouth',
  'Brentford':'Brentford','Brentford FC':'Brentford',
  'Burnley':'Burnley','Burnley FC':'Burnley',
  'Chelsea':'Chelsea','Chelsea FC':'Chelsea',
  'Crystal Palace':'Crystal Palace','Crystal Palace FC':'Crystal Palace',
  'Everton':'Everton','Everton FC':'Everton',
  'Fulham':'Fulham','Fulham FC':'Fulham',
  'Leeds United':'Leeds','Leeds United FC':'Leeds',
  'Liverpool':'Liverpool','Liverpool FC':'Liverpool',
  'Manchester City':'Man City','Manchester City FC':'Man City',
  'Manchester United':'Man Utd','Manchester United FC':'Man Utd',
  'Newcastle United':'Newcastle','Newcastle United FC':'Newcastle',
  'Nottingham Forest':'Nottm Forest','Nottingham Forest FC':'Nottm Forest',
  'Sunderland AFC':'Sunderland','Sunderland':'Sunderland',
  'Tottenham Hotspur':'Spurs','Tottenham Hotspur FC':'Spurs',
  'West Ham United':'West Ham','West Ham United FC':'West Ham',
  'Wolverhampton Wanderers':'Wolves','Wolverhampton Wanderers FC':'Wolves',
};
const CC={'ARS':['#EF0107','#FFD700'],'AVL':['#670E36','#95BFE5'],'BHA':['#0057B8','#fff'],'BOU':['#DA291C','#000'],'BRE':['#E30613','#fff'],'BUR':['#6C1D45','#97D700'],'CHE':['#034694','#FFD700'],'CRY':['#1B458F','#C4122E'],'EVE':['#003399','#FFD700'],'FUL':['#CC0000','#fff'],'LEE':['#FFCD00','#1D428A'],'LIV':['#C8102E','#FFD700'],'MCI':['#6CABDD','#1C2C5B'],'MUN':['#DA291C','#FFD700'],'NEW':['#241F20','#fff'],'NFO':['#DD0000','#fff'],'SUN':['#EB172B','#fff'],'TOT':['#132257','#fff'],'WHU':['#7A263A','#60CDFF'],'WOL':['#231F20','#FDB913']};

function teamCol(code) {
  const [bg, acc] = CC[code] || ['#333','#fff'];
  return bg;
}
function contrastCol(code) {
  const [bg, acc] = CC[code] || ['#333','#fff'];
  return acc;
}
function safeTeamCols(hCode, aCode) {
  let hc = teamCol(hCode), ac = teamCol(aCode);
  // If too similar (both dark or both same hue), use fallbacks
  const toRgb = hex => { const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16); return [r,g,b]; };
  const dist = (a,b) => { const [r1,g1,b1]=toRgb(a),[r2,g2,b2]=toRgb(b); return Math.abs(r1-r2)+Math.abs(g1-g2)+Math.abs(b1-b2); };
  try { if(dist(hc,ac)<120) { ac='#FF8000'; } } catch(e) {}
  return [hc, ac];
}

// Global crest cache
const CRESTS = {};
let CRESTS_LOADED = false;

function Badge({code,size=24}){
  const [bg,acc]=CC[code]||['#333','#fff'];
  const [err,setErr]=useState(false);
  const [loaded,setLoaded]=useState(false);
  const crest=CRESTS[code];

  useEffect(()=>{
    if(CRESTS_LOADED&&CRESTS[code]) setLoaded(true);
  },[code]);

  if(crest&&!err){
    return(
      <div style={{width:size,height:size,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',background:'transparent'}}>
        <img src={crest} width={size} height={size}
          style={{objectFit:'contain',display:'block',maxWidth:size,maxHeight:size}}
          onError={()=>setErr(true)}
          alt={code}/>
      </div>
    );
  }
  return React.createElement('svg',{width:size,height:size,viewBox:'0 0 40 40',style:{flexShrink:0,display:'block'}},
    React.createElement('circle',{cx:20,cy:20,r:19,fill:bg,stroke:acc,strokeWidth:2.5}),
    React.createElement('text',{x:20,y:26,textAnchor:'middle',fontSize:11,fontWeight:900,fontFamily:'Arial,sans-serif',fill:acc,letterSpacing:-0.5},(code||'?').slice(0,3))
  );
}

// Load crests once - stored in module-level cache
function useCrests(){
  const [,forceUpdate]=useState(0);
  useEffect(()=>{
    if(CRESTS_LOADED) return;
    fetch('/api/teams').then(r=>r.json()).then(d=>{
      (d.teams||[]).forEach(t=>{
        const code=TCODE[t.name]||TCODE[t.shortName]||TCODE[t.tla];
        if(code&&t.crest){
          // Extract just the filename from the crest URL and proxy it
          const filename=t.crest.split('/').pop();
          CRESTS[code]='/api/crest/'+filename;
        }
      });
      CRESTS_LOADED=true;
      forceUpdate(n=>n+1);
    }).catch(()=>{});
  },[]);
}
function Spinner({size=36}){return <div style={{width:size,height:size,border:'3px solid '+C.d4,borderTop:'3px solid '+C.teal,borderRadius:'50%',margin:'0 auto',animation:'spin 1s linear infinite'}}/>;}
function Tag({label,col}){const c=col==='teal'?C.teal:col==='green'?C.green:col==='red'?C.red:col==='orange'?C.orange:col==='gold'?C.gold:C.muted;return <span style={{fontSize:9,fontWeight:700,color:c,border:'1px solid '+c,borderRadius:5,padding:'2px 5px',letterSpacing:.4,whiteSpace:'nowrap'}}>{label}</span>;}

function useApi(url,interval=0){
  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState(null);
  const go=useCallback(async()=>{
    try{const r=await fetch(url);if(!r.ok)throw new Error('Error '+r.status);setData(await r.json());setError(null);}
    catch(e){setError(e.message);}
    finally{setLoading(false);}
  },[url]);
  useEffect(()=>{go();if(interval>0){const id=setInterval(go,interval);return()=>clearInterval(id);}},[go,interval]);
  return{data,loading,error,refresh:go};
}

// -- POINTS CALCULATION -------------------------------------

// -- MATCH DETAIL MODAL ------------------------------------
function TeamModal({team,onClose}){
  const code=TCODE[team?.name]||'???';
  const {data:td,loading}=useApi('/api/team/'+team?.id);
  const {data:fd2}=useApi('/api/team/'+team?.id+'/matches');
  const squad=td?.squad||[];
  const [pos,setPos]=useState('ALL');
  const positions=['ALL','Goalkeeper','Defence','Midfield','Offence'];
  const filtered=pos==='ALL'?squad:squad.filter(p=>p.position===pos);
  const form=(fd2?.matches||[]).slice(-5).reverse().map(m=>{
    const ih=m.homeTeam?.id===team?.id, mh=m.score?.fullTime?.home, ma=m.score?.fullTime?.away;
    if(mh==null) return null;
    return mh===ma?'D':(ih?mh>ma:ma>mh)?'W':'L';
  }).filter(Boolean);
  const tS={padding:'5px 10px',borderRadius:7,border:'1px solid '+C.d4,background:'transparent',color:C.muted,fontFamily:'DM Sans,sans-serif',fontSize:11,fontWeight:700,cursor:'pointer',flexShrink:0};
  const tA={...tS,borderColor:C.teal,color:C.teal,background:'rgba(0,255,212,.08)'};
  return(
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.85)',zIndex:500,display:'flex',alignItems:'flex-end',justifyContent:'center'}} onClick={onClose}>
      <div style={{background:C.d2,borderRadius:'18px 18px 0 0',width:'100%',maxWidth:520,maxHeight:'85vh',overflowY:'auto',animation:'slideUp .25s ease'}} onClick={e=>e.stopPropagation()}>
        <div style={{padding:16,borderBottom:'1px solid '+C.d4,display:'flex',alignItems:'center',gap:12}}>
          <Badge code={code} size={44}/>
          <div style={{flex:1}}>
            <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:22,color:C.white,letterSpacing:.5,lineHeight:1}}>{TSHORT[team?.name]||team?.name}</div>
            {td&&<div style={{fontSize:11,color:C.muted,marginTop:3}}>{td.venue} - Est. {td.founded}</div>}
            {form.length>0&&<div style={{display:'flex',gap:3,marginTop:5}}>{form.map((r,i)=><div key={i} style={{width:18,height:18,borderRadius:'50%',background:r==='W'?C.green:r==='D'?C.yellow:C.red,display:'flex',alignItems:'center',justifyContent:'center',fontSize:8,fontWeight:700,color:C.dark}}>{r}</div>)}</div>}
          </div>
          <button onClick={onClose} style={tS}>Close</button>
        </div>
        <div style={{padding:16}}>
          {loading&&<div style={{textAlign:'center',padding:20}}><Spinner size={24}/></div>}
          {td?.coach?.name&&<div style={{background:C.d3,borderRadius:9,padding:'10px 13px',marginBottom:12,display:'flex',alignItems:'center',gap:10}}>
            <div style={{fontSize:20}}></div>
            <div>
              <div style={{fontSize:10,fontWeight:700,color:C.muted,letterSpacing:.5,textTransform:'uppercase'}}>Manager</div>
              <div style={{fontWeight:700,fontSize:14,color:C.white,marginTop:1}}>{td.coach.name}</div>
              {td.coach.nationality&&<div style={{fontSize:11,color:C.muted}}>{td.coach.nationality}</div>}
            </div>
          </div>}
          {squad.length>0&&<>
            <div style={{display:'flex',gap:5,overflowX:'auto',paddingBottom:4,marginBottom:10}}>
              {positions.map(p=><button key={p} onClick={()=>setPos(p)} style={pos===p?tA:tS}>{p==='ALL'?'All':p==='Offence'?'Attack':p}</button>)}
            </div>
            {filtered.map((p,i)=>(
              <div key={i} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 10px',background:C.d3,borderRadius:8,marginBottom:3}}>
                <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:14,color:C.muted,width:24,flexShrink:0,textAlign:'center'}}>{p.shirtNumber||'-'}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:700,fontSize:13,color:C.white,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{p.name}</div>
                  <div style={{fontSize:10,color:C.muted,marginTop:1}}>{p.nationality}</div>
                </div>
                <div style={{fontSize:10,color:C.teal,fontWeight:700,flexShrink:0}}>{p.position}</div>
              </div>
            ))}
          </>}
        </div>
      </div>
    </div>
  );
}

function MatchRow({m,onClick}){
  const hc=TCODE[m.homeTeam?.name]||'???', ac=TCODE[m.awayTeam?.name]||'???';
  const hs=TSHORT[m.homeTeam?.name]||m.homeTeam?.name||'';
  const as2=TSHORT[m.awayTeam?.name]||m.awayTeam?.name||'';
  const hg=m.score?.fullTime?.home, ag=m.score?.fullTime?.away;
  const live=m.status==='IN_PLAY'||m.status==='PAUSED';
  const fin=m.status==='FINISHED';
  const col=live?C.orange:fin?(hg>ag?C.teal:ag>hg?C.red:C.yellow):C.d4;
  const dt=new Date(m.utcDate);
  const dateStr=dt.toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'});
  const timeStr=dt.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
  return(
    <div onClick={()=>onClick&&onClick(m)} style={{background:C.d2,borderLeft:'3px solid '+col,borderRadius:9,marginBottom:5,padding:'10px 12px',display:'flex',alignItems:'center',gap:8,cursor:onClick?'pointer':'default'}}>
      <div style={{flexShrink:0,minWidth:72}}>
        <div style={{fontSize:10,color:C.muted,lineHeight:1.3}}>{dateStr}</div>
        <div style={{fontSize:10,fontWeight:700,marginTop:1,color:live?C.orange:fin?C.muted:C.teal}}>
          {timeStr}
          {m.status==='PAUSED'?' HT':live&&m.minute?' '+m.minute+"'":fin?' FT':''}
        </div>
      </div>
      <Badge code={hc} size={20}/>
      <span style={{fontWeight:700,fontSize:13,flex:1,color:fin&&hg>ag?C.white:C.text,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{hs}</span>
      <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:22,color:live?C.orange:fin?C.white:C.muted,letterSpacing:3,flexShrink:0,minWidth:50,textAlign:'center'}}>{fin||live?hg+'-'+ag:'v'}</div>
      <span style={{fontWeight:700,fontSize:13,flex:1,textAlign:'right',color:fin&&ag>hg?C.white:C.text,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{as2}</span>
      <Badge code={ac} size={20}/>
    </div>
  );
}

// -- LIVE --------------------------------------------------
function Live(){
  const {data,loading}=useApi('/api/matches/today',60000);
  const {data:liveData}=useApi('/api/matches/live',30000);
  const [sel,setSel]=useState(null);
  const liveIds=new Set((liveData?.matches||[]).map(m=>m.id));
  const matches=(data?.matches||[]).map(m=>liveIds.has(m.id)?{...m,status:'IN_PLAY'}:m);
  const live=matches.filter(m=>m.status==='IN_PLAY'||m.status==='PAUSED');
  const upcoming=matches.filter(m=>m.status==='SCHEDULED'||m.status==='TIMED');
  const finished=matches.filter(m=>m.status==='FINISHED');
  return(
    <div style={{padding:16,paddingBottom:80}}>
      {sel&&<MatchModal match={sel} onClose={()=>setSel(null)}/>}
      <div style={{marginBottom:16}}>
        <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:28,color:C.white,letterSpacing:1.5}}>LIVE <span style={{color:C.orange}}>SCORES</span></div>
        <div style={{fontSize:11,color:C.muted}}>Tap a match for goals, cards, form and H2H</div>
      </div>
      {loading&&<div style={{textAlign:'center',padding:40}}><Spinner/></div>}
      {!loading&&!live.length&&!upcoming.length&&!finished.length&&<div style={{textAlign:'center',padding:40,color:C.muted,fontSize:13}}>No matches today</div>}
      {live.length>0&&<><div style={{fontSize:10,fontWeight:700,color:C.orange,letterSpacing:.8,marginBottom:8,textTransform:'uppercase'}}>* Live Now</div>{live.map(m=><MatchRow key={m.id} m={m} onClick={setSel}/>)}</>}
      {upcoming.length>0&&<><div style={{fontSize:10,fontWeight:700,color:C.muted,letterSpacing:.8,marginBottom:8,marginTop:12,textTransform:'uppercase'}}>Upcoming Today</div>{upcoming.map(m=><MatchRow key={m.id} m={m} onClick={setSel}/>)}</>}
      {finished.length>0&&<><div style={{fontSize:10,fontWeight:700,color:C.muted,letterSpacing:.8,marginBottom:8,marginTop:12,textTransform:'uppercase'}}>Full Time</div>{finished.map(m=><MatchRow key={m.id} m={m} onClick={setSel}/>)}</>}
    </div>
  );
}

// -- FIXTURES ----------------------------------------------
function Fixtures(){
  const {data,loading,error}=useApi('/api/matches',300000);
  const [filter,setFilter]=useState('ALL');
  const [openGW,setOpenGW]=useState(null);
  const [sel,setSel]=useState(null);
  const CLUBS=Object.keys(CC);
  const matches=data?.matches||[];
  const shown=filter==='ALL'?matches:matches.filter(m=>TCODE[m.homeTeam?.name]===filter||TCODE[m.awayTeam?.name]===filter);
  const byGW={};
  shown.forEach(m=>{const g=m.matchday;if(!byGW[g])byGW[g]=[];byGW[g].push(m);});
  const gws=Object.keys(byGW).map(Number).sort((a,b)=>b-a);
  useEffect(()=>{if(gws.length&&openGW===null)setOpenGW(gws[0]);},[gws.length]);
  if(loading)return<div style={{padding:40,textAlign:'center'}}><Spinner/></div>;
  if(error)return<div style={{padding:24,color:C.red,fontSize:13}}>{error}</div>;
  return(
    <div style={{padding:16,paddingBottom:80}}>
      {sel&&<MatchModal match={sel} onClose={()=>setSel(null)}/>}
      <div style={{marginBottom:14}}>
        <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:28,color:C.white,letterSpacing:1.5}}>FIXTURES <span style={{color:C.teal}}>2025-26</span></div>
        <div style={{fontSize:11,color:C.muted}}>{matches.length} matches - tap any result for details</div>
      </div>
      <div style={{display:'flex',gap:4,overflowX:'auto',paddingBottom:6,marginBottom:12,alignItems:'center'}}>
        <button onClick={()=>setFilter('ALL')} style={{flexShrink:0,padding:'4px 10px',borderRadius:7,cursor:'pointer',fontSize:11,fontWeight:700,border:'1px solid '+(filter==='ALL'?C.teal:C.d4),background:filter==='ALL'?'rgba(0,255,212,.1)':C.d2,color:filter==='ALL'?C.teal:C.muted}}>All</button>
        {CLUBS.map(s=><div key={s} onClick={()=>setFilter(s===filter?'ALL':s)} style={{flexShrink:0,borderRadius:6,padding:2,cursor:'pointer',border:'2px solid '+(filter===s?C.teal:C.d4),background:filter===s?'rgba(0,255,212,.08)':C.d2}}><Badge code={s} size={22}/></div>)}
      </div>
      {gws.map(gw=>(
        <div key={gw} style={{marginBottom:6}}>
          <div onClick={()=>setOpenGW(openGW===gw?null:gw)} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 12px',background:C.d3,borderRadius:8,cursor:'pointer',marginBottom:openGW===gw?4:0}}>
            <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:15,color:C.white,letterSpacing:.5}}>MATCHDAY {gw}</div>
            <div style={{color:C.muted,fontSize:13}}>{openGW===gw?'^':'v'}</div>
          </div>
          {openGW===gw&&byGW[gw].map(m=><MatchRow key={m.id} m={m} onClick={setSel}/>)}
        </div>
      ))}
    </div>
  );
}

// -- TABLE -------------------------------------------------
function Table(){
  const {data,loading,error}=useApi('/api/standings',300000);
  const [selTeam,setSelTeam]=useState(null);
  const table=data?.standings?.[0]?.table||[];
  const ZC={4:C.blue,5:C.orange,6:C.yellow,18:C.red,19:C.red,20:C.red};
  if(loading)return<div style={{padding:40,textAlign:'center'}}><Spinner/></div>;
  if(error)return<div style={{padding:24,color:C.red,fontSize:13}}>{error}</div>;
  return(
    <div style={{padding:16,paddingBottom:80}}>
      {selTeam&&<TeamModal team={selTeam} onClose={()=>setSelTeam(null)}/>}
      <div style={{marginBottom:14}}>
        <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:28,color:C.white,letterSpacing:1.5}}>PL <span style={{color:C.teal}}>TABLE</span></div>
        <div style={{fontSize:11,color:C.muted}}>Tap a team for squad and stats</div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'24px 1fr 28px 28px 28px 28px 36px 46px',gap:3,padding:'4px 10px',marginBottom:4}}>
        {['#','','P','W','D','L','GD','Pts'].map((h,i)=><div key={i} style={{fontSize:10,fontWeight:700,color:C.muted,textAlign:i>1?'center':'left'}}>{h}</div>)}
      </div>
      {table.map(row=>{
        const code=TCODE[row.team?.name]||'???', zc=ZC[row.position];
        return(
          <div key={row.position} onClick={()=>setSelTeam(row.team)} style={{display:'grid',gridTemplateColumns:'24px 1fr 28px 28px 28px 28px 36px 46px',gap:3,padding:'8px 10px',alignItems:'center',background:C.d2,borderRadius:8,marginBottom:3,borderLeft:'3px solid '+(zc||C.d4),cursor:'pointer'}}>
            <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:13,color:zc||C.muted}}>{row.position}</div>
            <div style={{display:'flex',alignItems:'center',gap:6,minWidth:0}}><Badge code={code} size={18}/><span style={{fontSize:12,fontWeight:700,color:C.text,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{TSHORT[row.team?.name]||row.team?.name}</span></div>
            <div style={{fontSize:11,color:C.muted,textAlign:'center'}}>{row.playedGames}</div>
            <div style={{fontSize:11,color:C.green,textAlign:'center',fontWeight:600}}>{row.won}</div>
            <div style={{fontSize:11,color:C.yellow,textAlign:'center',fontWeight:600}}>{row.draw}</div>
            <div style={{fontSize:11,color:C.red,textAlign:'center',fontWeight:600}}>{row.lost}</div>
            <div style={{fontSize:11,color:row.goalDifference>=0?C.text:C.red,textAlign:'center'}}>{row.goalDifference>0?'+':''}{row.goalDifference}</div>
            <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:18,color:C.white,textAlign:'center'}}>{row.points}</div>
          </div>
        );
      })}
      <div style={{marginTop:10,display:'flex',gap:10,flexWrap:'wrap'}}>
        {[['Champions League',C.blue],['Europa League',C.orange],['Conference League',C.yellow],['Relegation',C.red]].map(([l,c])=>(
          <div key={l} style={{display:'flex',alignItems:'center',gap:4,fontSize:10,color:C.muted}}><div style={{width:8,height:8,borderRadius:'50%',background:c}}/>{l}</div>
        ))}
      </div>
    </div>
  );
}

// -- STATS -------------------------------------------------
// -- PREDICTIONS & QUIZ (inserted)

//  PREDICTIONS 
function calcPoints(pred,actual){
  if(!pred||actual.hg==null||actual.ag==null) return null;
  const ph=parseInt(pred.h), pa=parseInt(pred.a);
  if(isNaN(ph)||isNaN(pa)) return null;
  if(ph===actual.hg && pa===actual.ag) return 3;
  const po=ph>pa?'H':pa>ph?'A':'D';
  const ao=actual.hg>actual.ag?'H':actual.ag>actual.hg?'A':'D';
  if(po===ao) return 1;
  return 0;
}

function Predictions(){
  const {data:allMatches,loading}=useApi('/api/matches',300000);
  const [preds,setPreds]=useState(()=>{try{return JSON.parse(localStorage.getItem('hav_preds')||'{}')}catch(e){return {}}});
  const [name,setName]=useState(()=>localStorage.getItem('hav_name')||'');
  const [nameInput,setNameInput]=useState('');
  const [view,setView]=useState('predict');
  const [gw,setGw]=useState(null);

  const matches=allMatches?.matches||[];
  const upcoming=matches.filter(m=>m.status==='SCHEDULED'||m.status==='TIMED');
  const finished=matches.filter(m=>m.status==='FINISHED');

  const upcomingGWs=[...new Set(upcoming.map(m=>m.matchday))].sort((a,b)=>a-b);
  const activeGW=gw||upcomingGWs[0]||null;
  const gwMatches=activeGW?upcoming.filter(m=>m.matchday===activeGW):[];

  const scored={};
  finished.forEach(m=>{
    const p=preds[m.id];
    if(p){
      const pts=calcPoints(p,{hg:m.score?.fullTime?.home,ag:m.score?.fullTime?.away});
      if(pts!==null) scored[m.id]=pts;
    }
  });

  const totalPoints=Object.values(scored).reduce((a,b)=>a+b,0);
  const exactScores=Object.values(scored).filter(p=>p===3).length;
  const correctOutcomes=Object.values(scored).filter(p=>p===1).length;

  function savePred(matchId,key,val){
    const next={...preds,[matchId]:{...preds[matchId],[key]:val}};
    setPreds(next);
    localStorage.setItem('hav_preds',JSON.stringify(next));
  }

  function saveName(){
    if(nameInput.trim()){
      setName(nameInput.trim());
      localStorage.setItem('hav_name',nameInput.trim());
    }
  }

  const tS={padding:'7px 14px',borderRadius:8,border:'1px solid '+C.d4,background:'transparent',color:C.muted,fontFamily:'DM Sans,sans-serif',fontSize:12,fontWeight:700,cursor:'pointer'};
  const tA={...tS,borderColor:C.teal,color:C.teal,background:'rgba(10,191,184,.08)'};

  if(!name){
    return(
      <div style={{padding:24,paddingBottom:80}}>
        <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:28,color:C.white,letterSpacing:1.5,marginBottom:6}}>PREDICTIONS</div>
        <div style={{background:C.d2,border:'1px solid '+C.d4,borderRadius:14,padding:20,marginTop:8}}>
          <div style={{fontWeight:700,fontSize:15,color:C.white,marginBottom:8}}>Enter your name to start</div>
          <div style={{fontSize:13,color:C.muted,marginBottom:16}}>Your predictions are scored automatically when matches finish using live data from football-data.org.</div>
          <input value={nameInput} onChange={e=>setNameInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&saveName()} placeholder="Your name" style={{width:'100%',background:C.d3,border:'1px solid '+C.d4,borderRadius:9,color:C.text,fontFamily:'DM Sans,sans-serif',fontSize:14,padding:'11px 13px',outline:'none',boxSizing:'border-box',marginBottom:10}}/>
          <button onClick={saveName} style={{width:'100%',padding:'12px 0',borderRadius:10,border:'none',background:nameInput.trim()?C.teal:C.d4,color:nameInput.trim()?C.dark:C.muted,fontFamily:'DM Sans,sans-serif',fontWeight:700,fontSize:14,cursor:nameInput.trim()?'pointer':'default'}}>Start Predicting</button>
        </div>
      </div>
    );
  }

  return(
    <div style={{padding:16,paddingBottom:80}}>
      <div style={{display:'flex',alignItems:'flex-end',justifyContent:'space-between',marginBottom:14}}>
        <div>
          <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:28,color:C.white,letterSpacing:1.5,lineHeight:1}}>PREDICTIONS</div>
          <div style={{fontSize:11,color:C.muted,marginTop:2}}>Scored live from football-data.org</div>
        </div>
        <div style={{textAlign:'right'}}>
          <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:24,color:C.teal,lineHeight:1}}>{totalPoints}</div>
          <div style={{fontSize:9,color:C.muted,fontWeight:700,letterSpacing:.5}}>POINTS</div>
        </div>
      </div>
      <div style={{display:'flex',gap:6,marginBottom:14}}>
        <button onClick={()=>setView('predict')} style={view==='predict'?tA:tS}>Predict</button>
        <button onClick={()=>setView('league')} style={view==='league'?tA:tS}>League</button>
        <button onClick={()=>setView('results')} style={view==='results'?tA:tS}>My Results</button>
      </div>

      {view==='predict'&&(
        <div>
          {loading&&<div style={{textAlign:'center',padding:40}}><Spinner/></div>}
          {!loading&&gwMatches.length===0&&<div style={{textAlign:'center',padding:32,color:C.muted,fontSize:13}}>No upcoming fixtures to predict</div>}
          {upcomingGWs.length>1&&(
            <div style={{display:'flex',gap:4,overflowX:'auto',paddingBottom:4,marginBottom:12}}>
              {upcomingGWs.map(g=>(
                <button key={g} onClick={()=>setGw(g)} style={{flexShrink:0,padding:'4px 10px',borderRadius:7,border:'1px solid '+(activeGW===g?C.teal:C.d4),background:activeGW===g?'rgba(10,191,184,.1)':C.d2,color:activeGW===g?C.teal:C.muted,fontSize:11,fontWeight:700,cursor:'pointer'}}>GW{g}</button>
              ))}
            </div>
          )}
          {gwMatches.map(m=>{
            const hc=TCODE[m.homeTeam?.name]||'???', ac=TCODE[m.awayTeam?.name]||'???';
            const p=preds[m.id]||{};
            const saved=p.saved;
            const dt=new Date(m.utcDate);
            return(
              <div key={m.id} style={{background:saved?'rgba(10,191,184,.04)':C.d2,border:'1px solid '+(saved?C.teal:C.d4),borderRadius:13,padding:'12px 14px',marginBottom:10}}>
                <div style={{fontSize:10,fontWeight:700,color:C.muted,marginBottom:8}}>
                  {dt.toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})} {dt.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}
                  {saved&&<span style={{marginLeft:8,color:C.teal}}>Saved</span>}
                </div>
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <div style={{flex:1,textAlign:'center'}}>
                    <div style={{display:'flex',justifyContent:'center',marginBottom:4}}><Badge code={hc} size={28}/></div>
                    <div style={{fontSize:12,fontWeight:700,color:C.white}}>{TSHORT[m.homeTeam?.name]||m.homeTeam?.name}</div>
                  </div>
                  <div style={{display:'flex',gap:6,alignItems:'center',flexShrink:0}}>
                    <input type="number" min="0" max="20" value={p.h!=null?p.h:''} disabled={saved}
                      onChange={e=>savePred(m.id,'h',e.target.value)}
                      style={{width:46,height:46,background:C.d3,border:'2px solid '+(p.h!=null&&p.h!==''?C.teal:C.d4),borderRadius:9,textAlign:'center',fontSize:20,fontWeight:700,color:C.teal,fontFamily:'Bebas Neue,sans-serif',outline:'none'}}/>
                    <span style={{fontFamily:'Bebas Neue,sans-serif',fontSize:16,color:C.d4}}>-</span>
                    <input type="number" min="0" max="20" value={p.a!=null?p.a:''} disabled={saved}
                      onChange={e=>savePred(m.id,'a',e.target.value)}
                      style={{width:46,height:46,background:C.d3,border:'2px solid '+(p.a!=null&&p.a!==''?C.teal:C.d4),borderRadius:9,textAlign:'center',fontSize:20,fontWeight:700,color:C.teal,fontFamily:'Bebas Neue,sans-serif',outline:'none'}}/>
                  </div>
                  <div style={{flex:1,textAlign:'center'}}>
                    <div style={{display:'flex',justifyContent:'center',marginBottom:4}}><Badge code={ac} size={28}/></div>
                    <div style={{fontSize:12,fontWeight:700,color:C.white}}>{TSHORT[m.awayTeam?.name]||m.awayTeam?.name}</div>
                  </div>
                </div>
                {!saved&&(
                  <button onClick={()=>{if(p.h!=null&&p.h!==''&&p.a!=null&&p.a!=='')savePred(m.id,'saved',true);}}
                    style={{width:'100%',marginTop:10,padding:'9px 0',borderRadius:9,border:'none',background:(p.h!=null&&p.h!==''&&p.a!=null&&p.a!=='')?C.teal:C.d4,color:(p.h!=null&&p.h!==''&&p.a!=null&&p.a!=='')?C.dark:C.muted,fontFamily:'DM Sans,sans-serif',fontWeight:700,fontSize:13,cursor:'pointer'}}>
                    Save Prediction
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {view==='league'&&(
        <div>
          <div style={{background:C.d3,borderRadius:12,padding:'14px 16px',marginBottom:14,textAlign:'center'}}>
            <div style={{fontSize:12,color:C.muted,marginBottom:4}}>{name}</div>
            <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:48,color:C.teal,lineHeight:1}}>{totalPoints}</div>
            <div style={{fontSize:11,color:C.muted,marginTop:4}}>pts</div>
            <div style={{display:'flex',justifyContent:'center',gap:20,marginTop:12}}>
              <div style={{textAlign:'center'}}>
                <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:22,color:C.gold,lineHeight:1}}>{exactScores}</div>
                <div style={{fontSize:10,color:C.muted}}>Exact scores (3pts)</div>
              </div>
              <div style={{textAlign:'center'}}>
                <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:22,color:C.green,lineHeight:1}}>{correctOutcomes}</div>
                <div style={{fontSize:10,color:C.muted}}>Correct results (1pt)</div>
              </div>
            </div>
          </div>
          <div style={{background:C.d2,border:'1px solid '+C.d4,borderRadius:12,padding:'12px 14px',marginBottom:10}}>
            <div style={{fontSize:12,color:C.muted,marginBottom:8,fontWeight:700}}>Your name</div>
            <div style={{display:'flex',gap:8}}>
              <input value={nameInput||name} onChange={e=>setNameInput(e.target.value)} style={{flex:1,background:C.d3,border:'1px solid '+C.d4,borderRadius:8,color:C.text,fontFamily:'DM Sans,sans-serif',fontSize:13,padding:'8px 11px',outline:'none'}}/>
              <button onClick={()=>{if(nameInput.trim()){setName(nameInput.trim());localStorage.setItem('hav_name',nameInput.trim());setNameInput('');}}} style={{padding:'8px 14px',borderRadius:8,border:'none',background:C.teal,color:C.dark,fontFamily:'DM Sans,sans-serif',fontWeight:700,fontSize:12,cursor:'pointer'}}>Save</button>
            </div>
          </div>
          <div style={{fontSize:11,color:C.muted,textAlign:'center',lineHeight:1.6}}>
            Points awarded automatically when matches finish.<br/>3pts exact score - 1pt correct result - 0pts wrong
          </div>
        </div>
      )}

      {view==='results'&&(
        <div>
          {finished.filter(m=>preds[m.id]?.saved).length===0&&<div style={{textAlign:'center',padding:32,color:C.muted,fontSize:13}}>No scored predictions yet</div>}
          {[...finished].filter(m=>preds[m.id]?.saved).reverse().map(m=>{
            const p=preds[m.id];
            const hg2=m.score?.fullTime?.home, ag2=m.score?.fullTime?.away;
            const pts=calcPoints(p,{hg:hg2,ag:ag2});
            const hc=TCODE[m.homeTeam?.name]||'???', ac=TCODE[m.awayTeam?.name]||'???';
            const ptCol=pts===3?C.gold:pts===1?C.green:C.red;
            return(
              <div key={m.id} style={{background:C.d2,border:'1px solid '+C.d4,borderRadius:11,padding:'11px 13px',marginBottom:8,display:'flex',alignItems:'center',gap:10}}>
                <Badge code={hc} size={20}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:12,fontWeight:700,color:C.text,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{TSHORT[m.homeTeam?.name]} v {TSHORT[m.awayTeam?.name]}</div>
                  <div style={{fontSize:11,color:C.muted,marginTop:2}}>
                    Your pick: <span style={{color:C.text,fontWeight:700}}>{p.h}-{p.a}</span>
                    {' '} Result: <span style={{color:C.teal,fontWeight:700}}>{hg2}-{ag2}</span>
                  </div>
                </div>
                <Badge code={ac} size={20}/>
                <div style={{textAlign:'center',flexShrink:0,minWidth:36}}>
                  <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:22,color:ptCol,lineHeight:1}}>{pts!=null?'+'+pts:'?'}</div>
                  <div style={{fontSize:9,color:C.muted,fontWeight:700}}>PTS</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

//  QUIZ 
const QUIZZES=[
  // 1
  {id:'champions',title:'PL Champions',cat:'Premier League',questions:[
    {q:'Who won the Premier League in 2023-24?',a:['Manchester City','Man City'],mc:['Manchester City','Liverpool','Arsenal','Chelsea']},
    {q:'Which club has won the most PL titles?',a:['Manchester United','Man Utd'],mc:['Manchester United','Manchester City','Arsenal','Liverpool']},
    {q:'Who was PL top scorer in 2024-25?',a:['Mohamed Salah','Salah'],mc:['Mohamed Salah','Erling Haaland','Cole Palmer','Alexander Isak']},
    {q:'Which team won the 2015-16 title as 5000-1 outsiders?',a:['Leicester','Leicester City'],mc:['Leicester City','Burnley','Watford','Crystal Palace']},
    {q:'Who has scored the most PL goals in history?',a:['Alan Shearer','Shearer'],mc:['Alan Shearer','Wayne Rooney','Andrew Cole','Frank Lampard']},
    {q:'Which club won the first ever Premier League in 1992-93?',a:['Manchester United','Man Utd'],mc:['Manchester United','Blackburn Rovers','Arsenal','Leeds United']},
    {q:'Who won back-to-back titles in 2018-19 and 2019-20?',a:['Manchester City','Man City'],mc:['Manchester City','Liverpool','Chelsea','Arsenal']},
    {q:'Which team went unbeaten for the entire 2003-04 season?',a:['Arsenal'],mc:['Arsenal','Chelsea','Manchester United','Liverpool']},
    {q:'Who won the PL title in 2021-22?',a:['Manchester City','Man City'],mc:['Manchester City','Liverpool','Chelsea','Tottenham']},
    {q:'Who scored the most PL goals in a single season?',a:['Erling Haaland','Haaland'],mc:['Erling Haaland','Mohamed Salah','Harry Kane','Andy Cole']},
    {q:'Which manager has won the most PL titles?',a:['Alex Ferguson','Ferguson'],mc:['Alex Ferguson','Pep Guardiola','Jose Mourinho','Arsene Wenger']},
    {q:'Who was the first foreign player to win PL Player of the Season?',a:['Gianfranco Zola','Zola'],mc:['Gianfranco Zola','Eric Cantona','Dennis Bergkamp','Thierry Henry']},
  ]},
  // 2
  {id:'records',title:'PL Records',cat:'Premier League',questions:[
    {q:'What is the highest ever PL points tally in a season?',a:['100'],mc:['100','97','95','93']},
    {q:'What is the record PL winning scoreline?',a:['9-0','9'],mc:['9-0','8-0','7-0','10-0']},
    {q:'Who scored the fastest ever PL goal?',a:['Shane Long','Long'],mc:['Shane Long','Ledley King','Alan Shearer','Christian Eriksen']},
    {q:'Who has made the most PL appearances ever?',a:['Gareth Barry','Barry'],mc:['Gareth Barry','Ryan Giggs','David James','Frank Lampard']},
    {q:'Who scored the fastest PL hat-trick?',a:['Sadio Mane','Mane'],mc:['Sadio Mane','Robbie Fowler','Michael Owen','Alan Shearer']},
    {q:'Which goalkeeper has the most PL clean sheets?',a:['Petr Cech','Cech'],mc:['Petr Cech','David James','David Seaman','Edwin van der Sar']},
    {q:'Who has the most PL assists ever?',a:['Ryan Giggs','Giggs'],mc:['Ryan Giggs','Cesc Fabregas','Kevin De Bruyne','Dennis Bergkamp']},
    {q:'What is the highest scoring PL match ever?',a:['9-7'],mc:['9-7','8-5','7-5','6-6']},
    {q:'Who holds the record for most PL assists in a season?',a:['Kevin De Bruyne','De Bruyne'],mc:['Kevin De Bruyne','Thierry Henry','Ryan Giggs','Cesc Fabregas']},
    {q:'Which player has the most PL red cards ever?',a:['Richard Dunne','Dunne'],mc:['Richard Dunne','Patrick Vieira','Roy Keane','Duncan Ferguson']},
    {q:'Who scored the most PL goals in a calendar year?',a:['Erling Haaland','Haaland'],mc:['Erling Haaland','Mohamed Salah','Harry Kane','Cristiano Ronaldo']},
    {q:'Which player scored in the most consecutive PL games?',a:['Jamie Vardy','Vardy'],mc:['Jamie Vardy','Ruud van Nistelrooy','Daniel Sturridge','Thierry Henry']},
  ]},
  // 3
  {id:'managers',title:'PL Managers',cat:'Premier League',questions:[
    {q:'Who manages Arsenal in 2025-26?',a:['Mikel Arteta','Arteta'],mc:['Mikel Arteta','Unai Emery','Thomas Tuchel','Mauricio Pochettino']},
    {q:'Who manages Manchester City in 2025-26?',a:['Pep Guardiola','Guardiola'],mc:['Pep Guardiola','Jurgen Klopp','Jose Mourinho','Carlo Ancelotti']},
    {q:'Who manages Liverpool in 2025-26?',a:['Arne Slot','Slot'],mc:['Arne Slot','Jurgen Klopp','Brendan Rodgers','Rafael Benitez']},
    {q:'Who manages Chelsea in 2025-26?',a:['Enzo Maresca','Maresca'],mc:['Enzo Maresca','Thomas Tuchel','Graham Potter','Frank Lampard']},
    {q:'Which manager is known as The Special One?',a:['Jose Mourinho','Mourinho'],mc:['Jose Mourinho','Pep Guardiola','Alex Ferguson','Arsene Wenger']},
    {q:'Who managed Blackburn to the PL title in 1994-95?',a:['Kenny Dalglish','Dalglish'],mc:['Kenny Dalglish','Ray Harford','Brian Kidd','Joe Royle']},
    {q:'Which manager took Leicester to the 2015-16 title?',a:['Claudio Ranieri','Ranieri'],mc:['Claudio Ranieri','Nigel Pearson','Craig Shakespeare','Brendan Rodgers']},
    {q:'Who replaced Jurgen Klopp at Liverpool?',a:['Arne Slot','Slot'],mc:['Arne Slot','Graham Potter','Roberto De Zerbi','Ruben Amorim']},
    {q:'Who managed the Invincibles Arsenal side in 2003-04?',a:['Arsene Wenger','Wenger'],mc:['Arsene Wenger','George Graham','Bruce Rioch','Terry Neill']},
    {q:'Which manager won the PL with Chelsea twice in his first spell?',a:['Jose Mourinho','Mourinho'],mc:['Jose Mourinho','Carlo Ancelotti','Claudio Ranieri','Avram Grant']},
    {q:'Who was the first manager to win the PL in its inaugural season?',a:['Alex Ferguson','Ferguson'],mc:['Alex Ferguson','Howard Wilkinson','George Graham','Kenny Dalglish']},
    {q:'Who manages Spurs in 2025-26?',a:['Ange Postecoglou','Postecoglou'],mc:['Ange Postecoglou','Jose Mourinho','Nuno Espirito Santo','Antonio Conte']},
  ]},
  // 4
  {id:'clubs',title:'Club Knowledge',cat:'Premier League',questions:[
    {q:'Which PL club plays at the Amex Stadium?',a:['Brighton','Brighton & Hove Albion'],mc:['Brighton','Crystal Palace','Brentford','Luton Town']},
    {q:'Which club has the nickname The Toffees?',a:['Everton'],mc:['Everton','Burnley','Leicester City','Watford']},
    {q:'Which PL club plays at Selhurst Park?',a:['Crystal Palace','Palace'],mc:['Crystal Palace','Charlton Athletic','Millwall','Wimbledon']},
    {q:'Which club plays at the London Stadium?',a:['West Ham','West Ham United'],mc:['West Ham United','Leyton Orient','Charlton','Millwall']},
    {q:'What colour shirts do Wolves wear?',a:['Gold','Yellow','Old Gold'],mc:['Gold and Black','Red and White','Blue and White','Green and Yellow']},
    {q:'Which club plays at Craven Cottage?',a:['Fulham'],mc:['Fulham','QPR','Brentford','Chelsea']},
    {q:'Which PL club is nicknamed The Cherries?',a:['Bournemouth','AFC Bournemouth'],mc:['Bournemouth','Watford','Bristol City','Luton']},
    {q:'At which ground do Arsenal play?',a:['Emirates','Emirates Stadium'],mc:['Emirates Stadium','Highbury','Wembley','White Hart Lane']},
    {q:'Which club plays at Goodison Park?',a:['Everton'],mc:['Everton','Liverpool','Tranmere Rovers','Blackburn']},
    {q:'What is the nickname of Newcastle United?',a:['Magpies','The Magpies'],mc:['The Magpies','The Toon','The Geordies','Black and Whites']},
    {q:'Which PL club plays at Villa Park?',a:['Aston Villa','Villa'],mc:['Aston Villa','Birmingham City','West Bromwich Albion','Coventry City']},
    {q:'Which club has the nickname The Hornets?',a:['Watford'],mc:['Watford','Norwich City','Oxford United','Burton Albion']},
  ]},
  // 5
  {id:'players',title:'PL Players',cat:'Premier League',questions:[
    {q:'Which player scored 44 PL goals in 2023-24?',a:['Erling Haaland','Haaland'],mc:['Erling Haaland','Mohamed Salah','Ollie Watkins','Cole Palmer']},
    {q:'Who won PL Young Player of the Season in 2023-24?',a:['Cole Palmer','Palmer'],mc:['Cole Palmer','Bukayo Saka','Phil Foden','Kobbie Mainoo']},
    {q:'Who scored the famous bicycle kick for Man Utd vs Man City in 2011?',a:['Wayne Rooney','Rooney'],mc:['Wayne Rooney','Cristiano Ronaldo','Robin van Persie','Carlos Tevez']},
    {q:'Which Liverpool player scored 32 PL goals in 2017-18?',a:['Mohamed Salah','Salah'],mc:['Mohamed Salah','Roberto Firmino','Sadio Mane','Philippe Coutinho']},
    {q:'Who is the only player to win the PL with 3 different clubs?',a:['Nicolas Anelka','Anelka'],mc:['Nicolas Anelka','Ashley Cole','Sol Campbell','Robbie Keane']},
    {q:'Who scored 30 goals in 2022-23 for Tottenham?',a:['Harry Kane','Kane'],mc:['Harry Kane','Son Heung-min','Richarlison','Dejan Kulusevski']},
    {q:'Which player won PL Player of the Season in 2021-22?',a:['Kevin De Bruyne','De Bruyne'],mc:['Kevin De Bruyne','Mohamed Salah','Virgil van Dijk','Harry Kane']},
    {q:'Who was the first teenager to score in a PL north west derby?',a:['Wayne Rooney','Rooney'],mc:['Wayne Rooney','Phil Foden','Marcus Rashford','Ryan Giggs']},
    {q:'Which player has started the most PL games ever?',a:['Gareth Barry','Barry'],mc:['Gareth Barry','Ryan Giggs','Frank Lampard','David James']},
    {q:'Who scored the most PL goals for Arsenal?',a:['Thierry Henry','Henry'],mc:['Thierry Henry','Ian Wright','Robin van Persie','Olivier Giroud']},
    {q:'Which player scored 5 goals in a single PL game in 2022?',a:['Erling Haaland','Haaland'],mc:['Erling Haaland','Mohamed Salah','Jermain Defoe','Andy Cole']},
    {q:'Who wore the number 7 shirt for Man Utd before Cristiano Ronaldo?',a:['David Beckham','Beckham'],mc:['David Beckham','Eric Cantona','Bryan Robson','George Best']},
  ]},
  // 6
  {id:'ballon_dor_winners',title:'Ballon d\'Or Winners',cat:'World Football',questions:[
    {q:'Who won the Ballon d\'Or in 2023?',a:['Lionel Messi','Messi'],mc:['Lionel Messi','Erling Haaland','Kylian Mbappe','Vinicius Junior']},
    {q:'Who won the Ballon d\'Or in 2022?',a:['Karim Benzema','Benzema'],mc:['Karim Benzema','Kylian Mbappe','Luka Modric','Sadio Mane']},
    {q:'Who won the Ballon d\'Or in 2018?',a:['Luka Modric','Modric'],mc:['Luka Modric','Cristiano Ronaldo','Lionel Messi','Kylian Mbappe']},
    {q:'How many Ballons d\'Or has Lionel Messi won?',a:['8'],mc:['8','7','6','9']},
    {q:'How many Ballons d\'Or has Cristiano Ronaldo won?',a:['5'],mc:['5','4','6','7']},
    {q:'Who was the first player to win the Ballon d\'Or?',a:['Stanley Matthews','Matthews'],mc:['Stanley Matthews','Alfredo di Stefano','Raymond Kopa','Johan Cruyff']},
    {q:'Who won the Ballon d\'Or in 2024?',a:['Rodri'],mc:['Rodri','Vinicius Junior','Kylian Mbappe','Erling Haaland']},
    {q:'Which player won the Ballon d\'Or 3 times in a row from 2019-2021?',a:['Lionel Messi','Messi'],mc:['Lionel Messi','Cristiano Ronaldo','Luka Modric','Robert Lewandowski']},
    {q:'Who won the Ballon d\'Or in 2004 and 2005?',a:['Ronaldinho'],mc:['Ronaldinho','Ronaldo','Thierry Henry','Zinedine Zidane']},
    {q:'Who was the first non-European to win the Ballon d\'Or?',a:['George Weah','Weah'],mc:['George Weah','Ronaldo','Rivaldo','Ronaldinho']},
    {q:'Who won the Ballon d\'Or in 1998?',a:['Zinedine Zidane','Zidane'],mc:['Zinedine Zidane','Ronaldo','Roberto Baggio','Davor Suker']},
    {q:'Who won back-to-back Ballons d\'Or in 2007 and 2008?',a:['Kaka','Ricardo Kaka'],mc:['Kaka','Cristiano Ronaldo','Lionel Messi','Ronaldinho']},
  ]},
  // 7
  {id:'ballon_dor_nominees',title:'Ballon d\'Or Nominees',cat:'World Football',questions:[
    {q:'Who finished 2nd in the 2023 Ballon d\'Or?',a:['Erling Haaland','Haaland'],mc:['Erling Haaland','Kylian Mbappe','Vinicius Junior','Kevin De Bruyne']},
    {q:'Who finished 2nd in the 2022 Ballon d\'Or?',a:['Sadio Mane','Mane'],mc:['Sadio Mane','Kylian Mbappe','Mohamed Salah','Robert Lewandowski']},
    {q:'Which player finished 2nd to Luka Modric in 2018?',a:['Cristiano Ronaldo','Ronaldo'],mc:['Cristiano Ronaldo','Lionel Messi','Kylian Mbappe','Antoine Griezmann']},
    {q:'Who was controversially left off the 2021 Ballon d\'Or shortlist?',a:['Robert Lewandowski','Lewandowski'],mc:['Robert Lewandowski','Sergio Ramos','Harry Kane','Romelu Lukaku']},
    {q:'Which goalkeeper has been nominated for Ballon d\'Or most recently?',a:['Gianluigi Buffon','Buffon'],mc:['Gianluigi Buffon','Manuel Neuer','Iker Casillas','Thibaut Courtois']},
    {q:'Who finished 3rd in the 2023 Ballon d\'Or?',a:['Kylian Mbappe','Mbappe'],mc:['Kylian Mbappe','Vinicius Junior','Kevin De Bruyne','Rodri']},
    {q:'Which defender won the Ballon d\'Or in 2006?',a:['Fabio Cannavaro','Cannavaro'],mc:['Fabio Cannavaro','Rio Ferdinand','John Terry','Roberto Ayala']},
    {q:'Who was the youngest ever Ballon d\'Or nominee?',a:['Cesc Fabregas','Fabregas'],mc:['Cesc Fabregas','Kylian Mbappe','Wayne Rooney','Lionel Messi']},
    {q:'Which Brazilian won the Ballon d\'Or in 1997?',a:['Ronaldo'],mc:['Ronaldo','Rivaldo','Ronaldinho','Roberto Carlos']},
    {q:'Who finished 2nd in the 2024 Ballon d\'Or?',a:['Vinicius Junior','Vinicius'],mc:['Vinicius Junior','Kylian Mbappe','Erling Haaland','Lamine Yamal']},
    {q:'Which player has finished 2nd in the Ballon d\'Or the most times?',a:['Cristiano Ronaldo','Ronaldo'],mc:['Cristiano Ronaldo','Lionel Messi','Luka Modric','Thierry Henry']},
    {q:'Who won the 2020 Ballon d\'Or (not awarded due to COVID)?',a:['Robert Lewandowski','Lewandowski'],mc:['Robert Lewandowski','Lionel Messi','Cristiano Ronaldo','Neymar']},
  ]},
  // 8
  {id:'ucl_managers',title:'Champions League Managers',cat:'World Football',questions:[
    {q:'Who managed Real Madrid to 3 consecutive UCL titles from 2016-2018?',a:['Zinedine Zidane','Zidane'],mc:['Zinedine Zidane','Carlo Ancelotti','Jose Mourinho','Rafael Benitez']},
    {q:'Who managed Liverpool to the 2018-19 UCL title?',a:['Jurgen Klopp','Klopp'],mc:['Jurgen Klopp','Brendan Rodgers','Rafael Benitez','Roy Evans']},
    {q:'Who managed Chelsea to the 2020-21 UCL title?',a:['Thomas Tuchel','Tuchel'],mc:['Thomas Tuchel','Frank Lampard','Jose Mourinho','Roberto Di Matteo']},
    {q:'Who managed Man City to their first UCL title in 2023?',a:['Pep Guardiola','Guardiola'],mc:['Pep Guardiola','Roberto Mancini','Mark Hughes','Brian Kidd']},
    {q:'Who managed Bayern Munich to the 2019-20 UCL title?',a:['Hansi Flick','Flick'],mc:['Hansi Flick','Niko Kovac','Jupp Heynckes','Carlo Ancelotti']},
    {q:'Who managed Real Madrid to the 2021-22 UCL title?',a:['Carlo Ancelotti','Ancelotti'],mc:['Carlo Ancelotti','Zinedine Zidane','Jose Mourinho','Julen Lopetegui']},
    {q:'Who is the only manager to win the UCL with 3 different clubs?',a:['Carlo Ancelotti','Ancelotti'],mc:['Carlo Ancelotti','Jose Mourinho','Pep Guardiola','Alex Ferguson']},
    {q:'Who managed Barcelona to the treble in 2008-09?',a:['Pep Guardiola','Guardiola'],mc:['Pep Guardiola','Frank Rijkaard','Johan Cruyff','Louis van Gaal']},
    {q:'Who managed Chelsea to the 2011-12 UCL title?',a:['Roberto Di Matteo','Di Matteo'],mc:['Roberto Di Matteo','Jose Mourinho','Andre Villas-Boas','Guus Hiddink']},
    {q:'Who managed Borussia Dortmund to the 2012-13 UCL final?',a:['Jurgen Klopp','Klopp'],mc:['Jurgen Klopp','Thomas Tuchel','Peter Bosz','Lucien Favre']},
    {q:'Who managed Ajax to the 2018-19 UCL semi-final as underdogs?',a:['Erik ten Hag','ten Hag'],mc:['Erik ten Hag','Peter Bosz','Frank de Boer','Ronald Koeman']},
    {q:'Who managed Real Madrid to their record 14th UCL title in 2022?',a:['Carlo Ancelotti','Ancelotti'],mc:['Carlo Ancelotti','Zinedine Zidane','Fabio Capello','Vicente del Bosque']},
  ]},
  // 9
  {id:'world_cup',title:'World Cup General',cat:'World Football',questions:[
    {q:'Which country has won the most World Cups?',a:['Brazil'],mc:['Brazil','Germany','Italy','Argentina']},
    {q:'Who won the 2022 World Cup?',a:['Argentina'],mc:['Argentina','France','Croatia','Morocco']},
    {q:'Who is the all-time top scorer at World Cups?',a:['Miroslav Klose','Klose'],mc:['Miroslav Klose','Ronaldo','Gerd Muller','Just Fontaine']},
    {q:'Which country hosted the 2022 World Cup?',a:['Qatar'],mc:['Qatar','Russia','Brazil','South Africa']},
    {q:'Who scored the winning penalty in the 2022 World Cup final?',a:['Gonzalo Montiel','Montiel'],mc:['Gonzalo Montiel','Lionel Messi','Kylian Mbappe','Angel Di Maria']},
    {q:'Who won the 2018 World Cup?',a:['France'],mc:['France','Croatia','Belgium','England']},
    {q:'Which player has appeared in the most World Cup matches?',a:['Lothar Matthaus','Matthaus'],mc:['Lothar Matthaus','Lionel Messi','Cristiano Ronaldo','Paolo Maldini']},
    {q:'Who scored a hat-trick in the 2022 World Cup final?',a:['Kylian Mbappe','Mbappe'],mc:['Kylian Mbappe','Lionel Messi','Olivier Giroud','Antoine Griezmann']},
    {q:'Which country won the first ever World Cup in 1930?',a:['Uruguay'],mc:['Uruguay','Argentina','Brazil','Italy']},
    {q:'Who won the 2014 World Cup?',a:['Germany'],mc:['Germany','Argentina','Brazil','Netherlands']},
    {q:'How many World Cup goals did Just Fontaine score in one tournament?',a:['13'],mc:['13','11','9','10']},
    {q:'Which country has hosted the World Cup the most times?',a:['Brazil','Mexico'],mc:['Brazil','Italy','Germany','Mexico']},
  ]},
  // 10
  {id:'messi_ronaldo',title:'Messi vs Ronaldo',cat:'World Football',questions:[
    {q:'How many Ballons d\'Or has Messi won?',a:['8'],mc:['8','7','6','9']},
    {q:'How many Ballons d\'Or has Ronaldo won?',a:['5'],mc:['5','4','6','7']},
    {q:'Who scored more PL goals - Messi or Ronaldo?',a:['Ronaldo','Cristiano Ronaldo'],mc:['Cristiano Ronaldo','Lionel Messi','Neither - equal','Neither - Messi never played in PL']},
    {q:'Who has more Champions League titles?',a:['Ronaldo','Cristiano Ronaldo'],mc:['Cristiano Ronaldo','Lionel Messi','Neither - equal','Both never won it']},
    {q:'Who won the 2022 World Cup?',a:['Messi','Lionel Messi'],mc:['Lionel Messi','Cristiano Ronaldo','Neither','Both']},
    {q:'Who scored more goals for their country?',a:['Ronaldo','Cristiano Ronaldo'],mc:['Cristiano Ronaldo','Lionel Messi','Neither - equal','Messi by one goal']},
    {q:'Who has more La Liga titles?',a:['Messi','Lionel Messi'],mc:['Lionel Messi','Cristiano Ronaldo','Neither - equal','Ronaldo by 2']},
    {q:'Who won the 2010 Ballon d\'Or?',a:['Messi','Lionel Messi'],mc:['Lionel Messi','Cristiano Ronaldo','Xavi','Andres Iniesta']},
    {q:'At which club did Ronaldo win his first Champions League?',a:['Manchester United','Man Utd'],mc:['Manchester United','Real Madrid','Juventus','Sporting CP']},
    {q:'Which club did Messi leave Barcelona for in 2021?',a:['PSG','Paris Saint-Germain','Paris SG'],mc:['PSG','Manchester City','Inter Miami','Bayern Munich']},
    {q:'Who has more Serie A goals?',a:['Ronaldo','Cristiano Ronaldo'],mc:['Cristiano Ronaldo','Lionel Messi','Neither - equal','Messi never played in Serie A']},
    {q:'Who scored a hat-trick against the other in El Clasico?',a:['Both','Messi and Ronaldo','Neither - both'],mc:['Both have done it','Only Messi','Only Ronaldo','Neither has done it']},
  ]},
  // 11
  {id:'transfers',title:'Transfer Fees',cat:'World Football',questions:[
    {q:'Who is the most expensive player transfer of all time?',a:['Neymar'],mc:['Neymar','Kylian Mbappe','Cristiano Ronaldo','Gareth Bale']},
    {q:'How much did PSG pay for Neymar in 2017?',a:['222 million','222'],mc:['222 million euros','150 million euros','180 million euros','200 million euros']},
    {q:'Who became the most expensive British player ever when joining Man City?',a:['Jack Grealish','Grealish'],mc:['Jack Grealish','Raheem Sterling','John Stones','Kyle Walker']},
    {q:'Which club paid a record fee for Kylian Mbappe in 2024?',a:['Real Madrid'],mc:['Real Madrid','Manchester City','Liverpool','Bayern Munich']},
    {q:'How much did Man Utd pay for Paul Pogba in 2016?',a:['89 million','89'],mc:['89 million','75 million','100 million','65 million']},
    {q:'Which player cost Chelsea 115 million euros in 2023?',a:['Moises Caicedo','Caicedo'],mc:['Moises Caicedo','Enzo Fernandez','Mykhailo Mudryk','Romeo Lavia']},
    {q:'How much did Real Madrid pay for Gareth Bale in 2013?',a:['100 million','100'],mc:['100 million','85 million','91 million','95 million']},
    {q:'Which player did Arsenal buy for a then club-record 72 million in 2023?',a:['Declan Rice','Rice'],mc:['Declan Rice','Kai Havertz','Leandro Trossard','Thomas Partey']},
    {q:'Who did Liverpool sign for 75 million in 2018 as a goalkeeper?',a:['Alisson','Alisson Becker'],mc:['Alisson','Jordan Pickford','Ederson','David De Gea']},
    {q:'Which player joined Chelsea for a British record fee of 97 million in 2023?',a:['Enzo Fernandez','Fernandez'],mc:['Enzo Fernandez','Moises Caicedo','Mykhailo Mudryk','Wesley Fofana']},
    {q:'How much did Man City pay for Erling Haaland in 2022?',a:['51 million','51'],mc:['51 million','75 million','100 million','60 million']},
    {q:'Which club signed Cristiano Ronaldo from Sporting CP in 2003?',a:['Manchester United','Man Utd'],mc:['Manchester United','Real Madrid','Arsenal','Liverpool']},
  ]},
  // 12
  {id:'arsenal',title:'Arsenal Quiz',cat:'Club Quizzes',questions:[
    {q:'Who is Arsenal\'s all-time top scorer?',a:['Thierry Henry','Henry'],mc:['Thierry Henry','Ian Wright','Robin van Persie','Olivier Giroud']},
    {q:'In what year did Arsenal move to the Emirates Stadium?',a:['2006'],mc:['2006','2004','2008','2002']},
    {q:'Who managed Arsenal to the 2003-04 Invincibles season?',a:['Arsene Wenger','Wenger'],mc:['Arsene Wenger','George Graham','Bruce Rioch','Terry Neill']},
    {q:'What is Arsenal\'s nickname?',a:['The Gunners','Gunners'],mc:['The Gunners','The Cannon','The Reds','The North Londoners']},
    {q:'How many goals did Thierry Henry score for Arsenal?',a:['228'],mc:['228','208','175','250']},
    {q:'Which Arsenal player won the PL Golden Boot in 2022-23?',a:['Bukayo Saka','Saka'],mc:['Bukayo Saka','Martin Odegaard','Gabriel Martinelli','Leandro Trossard']},
    {q:'Who did Arsenal sign from Brighton for 65 million in 2022?',a:['Ben White','White'],mc:['Ben White','Oleksandr Zinchenko','Gabriel Magalhaes','Takehiro Tomiyasu']},
    {q:'What year did Arsenal last win the Premier League?',a:['2004'],mc:['2004','2002','1998','2005']},
    {q:'Who scored Arsenal\'s famous last-minute title winning goal in 1989?',a:['Michael Thomas','Thomas'],mc:['Michael Thomas','Alan Smith','Paul Merson','David Rocastle']},
    {q:'Which country is Arsenal captain Martin Odegaard from?',a:['Norway'],mc:['Norway','Sweden','Denmark','Netherlands']},
    {q:'Who is Arsenal\'s current manager in 2025-26?',a:['Mikel Arteta','Arteta'],mc:['Mikel Arteta','Unai Emery','Patrick Vieira','Freddie Ljungberg']},
    {q:'What squad number does Bukayo Saka wear at Arsenal?',a:['7'],mc:['7','11','29','14']},
  ]},
  // 13
  {id:'liverpool',title:'Liverpool Quiz',cat:'Club Quizzes',questions:[
    {q:'Who is Liverpool\'s all-time top scorer?',a:['Ian Rush','Rush'],mc:['Ian Rush','Mohamed Salah','Steven Gerrard','Robbie Fowler']},
    {q:'How many European Cups/Champions Leagues has Liverpool won?',a:['6'],mc:['6','5','7','4']},
    {q:'Who scored the famous goal in the 2005 UCL final comeback?',a:['Steven Gerrard','Gerrard'],mc:['Steven Gerrard','Djibril Cisse','Vladimir Smicer','Xabi Alonso']},
    {q:'In which year did Liverpool win the Champions League in Istanbul?',a:['2005'],mc:['2005','2007','2001','2003']},
    {q:'Who manages Liverpool in 2025-26?',a:['Arne Slot','Slot'],mc:['Arne Slot','Jurgen Klopp','Brendan Rodgers','Roy Hodgson']},
    {q:'What is Anfield\'s famous standing section called?',a:['The Kop','Kop'],mc:['The Kop','The Reds End','The Shankly Stand','The Hillsborough End']},
    {q:'Who signed Mohamed Salah for Liverpool?',a:['Jurgen Klopp','Klopp'],mc:['Jurgen Klopp','Brendan Rodgers','Rafael Benitez','Roy Evans']},
    {q:'Which player scored 32 goals in Liverpool\'s 2017-18 PL season?',a:['Mohamed Salah','Salah'],mc:['Mohamed Salah','Roberto Firmino','Sadio Mane','Philippe Coutinho']},
    {q:'How many league titles has Liverpool won in total?',a:['19'],mc:['19','18','20','17']},
    {q:'Who scored a hat-trick for Liverpool against Leeds on his debut in 2021?',a:['Diogo Jota','Jota'],mc:['Diogo Jota','Roberto Firmino','Mohamed Salah','Sadio Mane']},
    {q:'Which legendary manager said This is Anfield?',a:['Bill Shankly','Shankly'],mc:['Bill Shankly','Bob Paisley','Kenny Dalglish','Joe Fagan']},
    {q:'In what year did Liverpool win their first Premier League title?',a:['2020'],mc:['2020','2019','2018','2022']},
  ]},
  // 14
  {id:'man_utd',title:'Manchester United Quiz',cat:'Club Quizzes',questions:[
    {q:'Who is Manchester United\'s all-time top scorer?',a:['Wayne Rooney','Rooney'],mc:['Wayne Rooney','Bobby Charlton','Denis Law','George Best']},
    {q:'How many Premier League titles has Man Utd won?',a:['13'],mc:['13','11','14','10']},
    {q:'Which year did Man Utd win the treble?',a:['1999'],mc:['1999','1997','2001','2003']},
    {q:'Who scored the winning goal in the 1999 UCL final?',a:['Ole Gunnar Solskjaer','Solskjaer'],mc:['Ole Gunnar Solskjaer','Teddy Sheringham','Andy Cole','Peter Schmeichel']},
    {q:'What is Old Trafford\'s nickname?',a:['Theatre of Dreams'],mc:['Theatre of Dreams','Red Cathedral','The Fortress','Pride of Manchester']},
    {q:'Which number shirt did Cristiano Ronaldo wear at Man Utd?',a:['7'],mc:['7','11','10','9']},
    {q:'Who was Man Utd manager when they last won the PL in 2012-13?',a:['Alex Ferguson','Ferguson','Sir Alex Ferguson'],mc:['Alex Ferguson','David Moyes','Jose Mourinho','Louis van Gaal']},
    {q:'Which player made the most PL appearances for Man Utd?',a:['Ryan Giggs','Giggs'],mc:['Ryan Giggs','Paul Scholes','Gary Neville','Roy Keane']},
    {q:'Who did Man Utd beat in the 1999 UCL final?',a:['Bayern Munich','Bayern'],mc:['Bayern Munich','Juventus','Real Madrid','Arsenal']},
    {q:'Which Man Utd player won the 2003 Ballon d\'Or?',a:['Pavel Nedved','Nedved'],mc:['Pavel Nedved','Thierry Henry','Zinedine Zidane','Ronaldinho']},
    {q:'Who scored Man Utd\'s famous injury time winner vs Sheffield Wednesday in 1993?',a:['Steve Bruce','Bruce'],mc:['Steve Bruce','Mark Hughes','Eric Cantona','Brian McClair']},
    {q:'In which year was Manchester United founded?',a:['1878'],mc:['1878','1902','1885','1892']},
  ]},
  // 15
  {id:'man_city',title:'Manchester City Quiz',cat:'Club Quizzes',questions:[
    {q:'Who has managed Man City the longest?',a:['Pep Guardiola','Guardiola'],mc:['Pep Guardiola','Roberto Mancini','Manuel Pellegrini','Brian Horton']},
    {q:'What is Man City\'s nickname?',a:['The Citizens','Citizens','Blues'],mc:['The Citizens','The Blue Moons','The Sky Blues','City Blues']},
    {q:'Who scored the famous 93:20 title-winning goal in 2012?',a:['Sergio Aguero','Aguero'],mc:['Sergio Aguero','Mario Balotelli','Edin Dzeko','Carlos Tevez']},
    {q:'How many consecutive PL titles did Man City win from 2020-2024?',a:['4'],mc:['4','3','5','2']},
    {q:'Who is Man City\'s all-time top scorer?',a:['Sergio Aguero','Aguero'],mc:['Sergio Aguero','Colin Bell','Tommy Johnson','Erling Haaland']},
    {q:'What year did Man City win their first Champions League?',a:['2023'],mc:['2023','2019','2021','2022']},
    {q:'Who scored the winning goal in the 2023 UCL final?',a:['Rodri'],mc:['Rodri','Kevin De Bruyne','Bernardo Silva','Phil Foden']},
    {q:'Which stadium do Man City play at?',a:['Etihad','Etihad Stadium'],mc:['Etihad Stadium','City of Manchester Stadium','Maine Road','Wembley']},
    {q:'Who did Man City sign from Borussia Dortmund in 2022 for 51 million?',a:['Erling Haaland','Haaland'],mc:['Erling Haaland','Jadon Sancho','Jude Bellingham','Julian Brandt']},
    {q:'Who scored 36 PL goals for Man City in 2022-23?',a:['Erling Haaland','Haaland'],mc:['Erling Haaland','Phil Foden','Kevin De Bruyne','Riyad Mahrez']},
    {q:'Which country does Kevin De Bruyne play for?',a:['Belgium'],mc:['Belgium','Netherlands','Germany','France']},
    {q:'Who did Man City sign from Atletico Madrid in 2023?',a:['Matheus Nunes','Nunes'],mc:['Matheus Nunes','Joao Felix','Julian Alvarez','Rodri']},
  ]},
  // 16
  {id:'chelsea',title:'Chelsea Quiz',cat:'Club Quizzes',questions:[
    {q:'Who is Chelsea\'s all-time top scorer?',a:['Frank Lampard','Lampard'],mc:['Frank Lampard','Bobby Tambling','Kerry Dixon','Didier Drogba']},
    {q:'How many UCL titles has Chelsea won?',a:['2'],mc:['2','1','3','4']},
    {q:'Which owner transformed Chelsea into a superclub from 2003?',a:['Roman Abramovich','Abramovich'],mc:['Roman Abramovich','Todd Boehly','Ken Bates','Bruce Buck']},
    {q:'Who scored Chelsea\'s winning penalty in the 2012 UCL final?',a:['Didier Drogba','Drogba'],mc:['Didier Drogba','Juan Mata','Frank Lampard','Ashley Cole']},
    {q:'What is Chelsea\'s nickname?',a:['The Blues','Blues'],mc:['The Blues','The Pensioners','The Lions','The Stamford Boys']},
    {q:'Who managed Chelsea to the 2020-21 UCL title?',a:['Thomas Tuchel','Tuchel'],mc:['Thomas Tuchel','Frank Lampard','Jose Mourinho','Antonio Conte']},
    {q:'How many PL titles has Chelsea won?',a:['6'],mc:['6','5','4','7']},
    {q:'Who scored the most goals for Chelsea in a single season?',a:['Jimmy Greaves','Greaves'],mc:['Jimmy Greaves','Frank Lampard','Didier Drogba','Kerry Dixon']},
    {q:'Which player did Chelsea sign from Brighton for 115 million in 2023?',a:['Moises Caicedo','Caicedo'],mc:['Moises Caicedo','Enzo Fernandez','Mykhailo Mudryk','Wesley Fofana']},
    {q:'Who is Chelsea\'s current manager in 2025-26?',a:['Enzo Maresca','Maresca'],mc:['Enzo Maresca','Mauricio Pochettino','Frank Lampard','Graham Potter']},
    {q:'In which year was Chelsea Football Club founded?',a:['1905'],mc:['1905','1892','1899','1910']},
    {q:'Who scored the famous header in the 2021 UCL final?',a:['Kai Havertz','Havertz'],mc:['Kai Havertz','Timo Werner','Christian Pulisic','Mason Mount']},
  ]},
  // 17
  {id:'real_madrid',title:'Real Madrid Quiz',cat:'Club Quizzes',questions:[
    {q:'How many Champions Leagues has Real Madrid won?',a:['15'],mc:['15','14','13','12']},
    {q:'Who is Real Madrid\'s all-time top scorer?',a:['Cristiano Ronaldo','Ronaldo'],mc:['Cristiano Ronaldo','Raul','Karim Benzema','Alfredo di Stefano']},
    {q:'What is Real Madrid\'s stadium called?',a:['Santiago Bernabeu','Bernabeu'],mc:['Santiago Bernabeu','Estadio Metropolitano','Nou Camp','Ramon Sanchez Pizjuan']},
    {q:'Who managed Real Madrid to 3 consecutive UCL titles 2016-2018?',a:['Zinedine Zidane','Zidane'],mc:['Zinedine Zidane','Carlo Ancelotti','Jose Mourinho','Rafael Benitez']},
    {q:'For how much did Real Madrid sign Gareth Bale in 2013?',a:['100 million','100'],mc:['100 million','91 million','85 million','75 million']},
    {q:'Who scored the winning goal in the 2022 UCL final?',a:['Vinicius Junior','Vinicius'],mc:['Vinicius Junior','Karim Benzema','Federico Valverde','Luka Modric']},
    {q:'Who did Kylian Mbappe join from PSG in 2024?',a:['Real Madrid'],mc:['Real Madrid','Manchester City','Liverpool','Bayern Munich']},
    {q:'What colour shirts does Real Madrid traditionally wear?',a:['White'],mc:['White','Yellow','Red','Blue']},
    {q:'Who won the Ballon d\'Or while at Real Madrid in 2022?',a:['Karim Benzema','Benzema'],mc:['Karim Benzema','Luka Modric','Vinicius Junior','Toni Kroos']},
    {q:'How many La Liga titles did Cristiano Ronaldo win with Real Madrid?',a:['2'],mc:['2','3','4','1']},
    {q:'Who is Real Madrid\'s captain in 2025-26?',a:['Luka Modric','Modric'],mc:['Luka Modric','Sergio Ramos','Karim Benzema','Dani Carvajal']},
    {q:'Who scored in 5 consecutive UCL finals?',a:['Cristiano Ronaldo','Ronaldo'],mc:['Cristiano Ronaldo','Karim Benzema','Gareth Bale','Raul']},
  ]},
  // 18
  {id:'barcelona',title:'Barcelona Quiz',cat:'Club Quizzes',questions:[
    {q:'Who is Barcelona\'s all-time top scorer?',a:['Lionel Messi','Messi'],mc:['Lionel Messi','Ronaldo','Samuel Etoo','Johan Cruyff']},
    {q:'How many Champions Leagues has Barcelona won?',a:['5'],mc:['5','6','4','7']},
    {q:'What is Barcelona\'s stadium called?',a:['Camp Nou','Nou Camp'],mc:['Camp Nou','Wanda Metropolitano','El Bernabeu','Estadio Olimpic']},
    {q:'Who managed Barcelona to 2 UCL titles in 2006 and 2009?',a:['Pep Guardiola','Guardiola'],mc:['Pep Guardiola','Frank Rijkaard','Johan Cruyff','Tito Vilanova']},
    {q:'Which year did Barcelona complete the treble under Guardiola?',a:['2009'],mc:['2009','2011','2006','2013']},
    {q:'Who scored the winning goal in the 2009 UCL final?',a:['Samuel Etoo','Etoo'],mc:['Samuel Etoo','Lionel Messi','Thierry Henry','Xavi']},
    {q:'Which player did Barcelona sign from Neymar\'s fee money in 2017?',a:['Philippe Coutinho','Coutinho'],mc:['Philippe Coutinho','Ousmane Dembele','Nelson Semedo','Paulinho']},
    {q:'Who left Barcelona for PSG in 2021 due to financial problems?',a:['Lionel Messi','Messi'],mc:['Lionel Messi','Antoine Griezmann','Luis Suarez','Sergio Busquets']},
    {q:'Who is Barcelona\'s president in 2025-26?',a:['Joan Laporta','Laporta'],mc:['Joan Laporta','Josep Maria Bartomeu','Sandro Rosell','Enric Masip']},
    {q:'What is Barcelona\'s famous youth academy called?',a:['La Masia'],mc:['La Masia','La Cantera','El Barca','La Academia']},
    {q:'Which player scored the iconic goal against Getafe in 2007?',a:['Lionel Messi','Messi'],mc:['Lionel Messi','Ronaldinho','Samuel Etoo','Thierry Henry']},
    {q:'Who did Barcelona beat in the 2015 UCL final?',a:['Juventus'],mc:['Juventus','Real Madrid','Bayern Munich','Chelsea']},
  ]},
  // 19
  {id:'ucl_general',title:'Champions League General',cat:'World Football',questions:[
    {q:'Which club has won the most Champions Leagues?',a:['Real Madrid'],mc:['Real Madrid','AC Milan','Bayern Munich','Liverpool']},
    {q:'Who is the all-time top scorer in UCL history?',a:['Cristiano Ronaldo','Ronaldo'],mc:['Cristiano Ronaldo','Lionel Messi','Raul','Karim Benzema']},
    {q:'Which city hosted the 2023 UCL final?',a:['Istanbul'],mc:['Istanbul','London','Paris','Madrid']},
    {q:'Who scored the fastest UCL goal?',a:['Roy Makaay','Makaay'],mc:['Roy Makaay','Sergio Aguero','Ryan Giggs','Raul']},
    {q:'Which club won the first ever Champions League in 1956?',a:['Real Madrid'],mc:['Real Madrid','AC Milan','Benfica','Barcelona']},
    {q:'Who scored for Man Utd in the 2008 UCL final?',a:['Cristiano Ronaldo','Ronaldo'],mc:['Cristiano Ronaldo','Wayne Rooney','Carlos Tevez','Paul Scholes']},
    {q:'Which team did Liverpool beat 4-0 in a UCL semi-final comeback in 2019?',a:['Barcelona'],mc:['Barcelona','PSG','Bayern Munich','Roma']},
    {q:'Who scored the bicycle kick winner in the 2018 UCL final?',a:['Gareth Bale','Bale'],mc:['Gareth Bale','Karim Benzema','Cristiano Ronaldo','Marcelo']},
    {q:'How many times has an English club won the UCL?',a:['15'],mc:['15','12','10','18']},
    {q:'Which player has won the UCL the most times?',a:['Paco Gento','Gento'],mc:['Paco Gento','Cristiano Ronaldo','Clarence Seedorf','Karim Benzema']},
    {q:'Who managed Liverpool to the 2019 UCL title?',a:['Jurgen Klopp','Klopp'],mc:['Jurgen Klopp','Rafael Benitez','Brendan Rodgers','Bob Paisley']},
    {q:'Which club lost 3 consecutive UCL finals from 2013-2015?',a:['Atletico Madrid','Atletico'],mc:['Atletico Madrid','PSG','Borussia Dortmund','Bayer Leverkusen']},
  ]},
  // 20
  {id:'world_football',title:'World Football General',cat:'World Football',questions:[
    {q:'Which country won Euro 2024?',a:['Spain'],mc:['Spain','England','France','Germany']},
    {q:'Who is the all-time top scorer for England?',a:['Wayne Rooney','Rooney'],mc:['Wayne Rooney','Bobby Charlton','Gary Lineker','Harry Kane']},
    {q:'Which club did Zinedine Zidane retire from as a player?',a:['Real Madrid'],mc:['Real Madrid','Juventus','Bordeaux','Marseille']},
    {q:'Who won the 2016 European Championship?',a:['Portugal'],mc:['Portugal','France','Wales','Germany']},
    {q:'Which country does Erling Haaland play for?',a:['Norway'],mc:['Norway','Denmark','Sweden','Iceland']},
    {q:'Who won the Copa America 2024?',a:['Argentina'],mc:['Argentina','Colombia','Uruguay','Brazil']},
    {q:'Which club did Kylian Mbappe join in 2024?',a:['Real Madrid'],mc:['Real Madrid','Manchester City','Liverpool','Arsenal']},
    {q:'Who is the most capped international player of all time?',a:['Cristiano Ronaldo','Ronaldo'],mc:['Cristiano Ronaldo','Lionel Messi','Luka Modric','Sergio Ramos']},
    {q:'Which country won the first ever European Championship in 1960?',a:['Soviet Union','USSR'],mc:['Soviet Union','Yugoslavia','France','Spain']},
    {q:'Who scored the fastest international goal ever?',a:['Hakan Sukur','Sukur'],mc:['Hakan Sukur','Clint Dempsey','Robbie Fowler','Marc Wilmots']},
    {q:'Which country has appeared in the most World Cup finals?',a:['Germany','West Germany'],mc:['Germany','Brazil','Argentina','Italy']},
    {q:'Who won the 2021 Copa America?',a:['Argentina'],mc:['Argentina','Brazil','Colombia','Chile']},
  ]},
];

function matchAnswer(typed, accepted) {
  const t = typed.trim().toLowerCase();
  const ALIASES = {
    'manchester city':['man city','city'],
    'manchester united':['man utd','man united','man u','united'],
    'tottenham hotspur':['spurs','tottenham'],
    'wolverhampton wanderers':['wolves','wolverhampton'],
    'west ham united':['west ham','hammers'],
    'nottingham forest':['nottm forest','forest'],
    'newcastle united':['newcastle'],
    'brighton & hove albion':['brighton'],
    'leicester city':['leicester'],
    'aston villa':['villa'],
    'crystal palace':['palace'],
    'leeds united':['leeds'],
  };
  const expand = (s) => {
    const low = s.toLowerCase();
    const extras = [];
    Object.entries(ALIASES).forEach(([full, shorts]) => {
      if (low === full || shorts.includes(low)) extras.push(full, ...shorts);
    });
    return [low, ...extras];
  };
  const tVariants = expand(t);
  return accepted.some(a => {
    const aVariants = expand(a);
    return tVariants.some(tv => aVariants.some(av => tv === av || tv.includes(av) || av.includes(tv)));
  });
}

function MultipleChoiceQuiz({quiz,onFinish}){
  const [idx,setIdx]=useState(0);
  const [answers,setAnswers]=useState({});
  const [chosen,setChosen]=useState(null);
  const [score,setScore]=useState(0);
  const [opts]=useState(()=>quiz.questions.map((q,i)=>{
    if(q.mc&&q.mc.length>=4) return [...q.mc].sort(()=>Math.random()-0.5);
    const correct=q.a[0];
    const pool=[...new Set(quiz.questions.filter((_,j)=>j!==i).map(x=>x.a[0]))];
    return [correct,...pool.filter(p=>p!==correct).sort(()=>Math.random()-0.5).slice(0,3)].sort(()=>Math.random()-0.5);
  }));
  function pick(opt){
    if(chosen!==null) return;
    const q=quiz.questions[idx];
    const ok=matchAnswer(opt,q.a);
    const ns=score+(ok?1:0);
    if(ok) setScore(ns);
    setChosen(opt);
    setAnswers(a=>({...a,[idx]:ok?'correct':'wrong'}));
    setTimeout(()=>{setChosen(null);if(idx<quiz.questions.length-1)setIdx(i=>i+1);else onFinish(ns,quiz.questions.length);},900);
  }
  const q=quiz.questions[idx];
  return(
    <div style={{padding:16,paddingBottom:60}}>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:12}}>
        <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:16,color:C.white}}>{quiz.title}</div>
        <div style={{fontSize:13,fontWeight:700,color:C.teal}}>{score}/{idx}</div>
      </div>
      <div style={{height:4,background:C.d4,borderRadius:2,overflow:'hidden',marginBottom:18}}>
        <div style={{width:Math.round(idx/quiz.questions.length*100)+'%',height:'100%',background:C.teal,transition:'width .3s'}}/>
      </div>
      <div style={{background:C.d2,border:'1px solid '+C.d4,borderRadius:14,padding:'18px 16px',marginBottom:14}}>
        <div style={{fontSize:10,fontWeight:700,color:C.teal,letterSpacing:.8,textTransform:'uppercase',marginBottom:8}}>Q{idx+1} of {quiz.questions.length}</div>
        <div style={{fontSize:16,fontWeight:700,color:C.white,lineHeight:1.5}}>{q.q}</div>
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        {opts[idx].map((opt,i)=>{
          let bg=C.d3,border=C.d4,col=C.text;
          if(chosen!==null){if(matchAnswer(opt,q.a)){bg='rgba(0,230,118,.12)';border=C.green;col=C.green;}else if(opt===chosen){bg='rgba(255,61,61,.1)';border=C.red;col=C.red;}}
          return<button key={i} onClick={()=>pick(opt)} style={{padding:'13px 16px',borderRadius:10,border:'2px solid '+border,background:bg,color:col,fontFamily:'DM Sans,sans-serif',fontSize:14,fontWeight:600,cursor:chosen?'default':'pointer',textAlign:'left',transition:'all .2s'}}><span style={{fontFamily:'Bebas Neue,sans-serif',fontSize:13,color:C.muted,marginRight:10}}>{['A','B','C','D'][i]}</span>{opt}</button>;
        })}
      </div>
    </div>
  );
}

function QuickFireQuiz({quiz,onFinish}){
  const TIME=8;
  const [idx,setIdx]=useState(0);
  const [timeLeft,setTimeLeft]=useState(TIME);
  const [draft,setDraft]=useState('');
  const [answers,setAnswers]=useState({});
  const [flash,setFlash]=useState(null);
  const [score,setScore]=useState(0);
  const [frozen,setFrozen]=useState(false);
  const inputRef=useRef(null);
  useEffect(()=>{if(inputRef.current)inputRef.current.focus();setTimeLeft(TIME);setDraft('');},[idx]);
  useEffect(()=>{
    if(frozen) return;
    const iv=setInterval(()=>setTimeLeft(t=>{if(t<=1){clearInterval(iv);go(true);return TIME;}return t-1;}),1000);
    return()=>clearInterval(iv);
  },[idx,frozen]);
  function go(forceWrong){
    if(frozen) return;
    setFrozen(true);
    const q=quiz.questions[idx];
    const ok=!forceWrong&&matchAnswer(draft,q.a);
    setScore(s=>{
      const ns=s+(ok?1:0);
      setAnswers(a=>({...a,[idx]:ok?'correct':'wrong'}));
      setFlash(ok?'correct':'wrong');
      setTimeout(()=>{setFlash(null);setFrozen(false);setDraft('');if(idx<quiz.questions.length-1)setIdx(i=>i+1);else onFinish(ns,quiz.questions.length);},600);
      return ns;
    });
  }
  const q=quiz.questions[idx];
  const tc=timeLeft<=3?C.red:timeLeft<=5?C.yellow:C.green;
  return(
    <div style={{padding:16,paddingBottom:60}}>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:10}}>
        <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:16,color:C.white}}>{quiz.title}</div>
        <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:22,color:tc,animation:timeLeft<=3?'blink 1s infinite':undefined}}>{timeLeft}</div>
      </div>
      <div style={{height:5,background:C.d4,borderRadius:3,overflow:'hidden',marginBottom:14}}>
        <div style={{width:(timeLeft/TIME*100)+'%',height:'100%',background:tc,transition:'width 1s linear'}}/>
      </div>
      {flash&&<div style={{position:'fixed',inset:0,background:flash==='correct'?'rgba(0,230,118,.2)':'rgba(255,61,61,.2)',zIndex:500,pointerEvents:'none',display:'flex',alignItems:'center',justifyContent:'center'}}><div style={{fontSize:80,color:flash==='correct'?C.green:C.red,fontWeight:700}}>{flash==='correct'?'OK':'X'}</div></div>}
      <div style={{background:C.d2,border:'1px solid '+C.d4,borderRadius:14,padding:'18px 16px',marginBottom:12}}>
        <div style={{fontSize:10,fontWeight:700,color:C.teal,letterSpacing:.8,textTransform:'uppercase',marginBottom:8}}>Q{idx+1} of {quiz.questions.length}</div>
        <div style={{fontSize:17,fontWeight:700,color:C.white,lineHeight:1.5}}>{q.q}</div>
      </div>
      <div style={{display:'flex',gap:8}}>
        <input ref={inputRef} value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&draft.trim()&&!frozen)go(false);}} placeholder="Quick! Type your answer..." style={{flex:1,background:C.d3,border:'1px solid '+C.d4,borderRadius:10,color:C.text,fontFamily:'DM Sans,sans-serif',fontSize:14,padding:'12px 13px',outline:'none'}} autoFocus/>
        <button onClick={()=>draft.trim()&&!frozen&&go(false)} style={{padding:'0 16px',borderRadius:10,border:'none',background:C.teal,color:C.dark,fontFamily:'DM Sans,sans-serif',fontWeight:700,fontSize:13,cursor:'pointer',flexShrink:0}}>Go</button>
      </div>
    </div>
  );
}

function TypeAnswerQuiz({quiz,onFinish}){
  const [idx,setIdx]=useState(0);
  const [draft,setDraft]=useState('');
  const [revealed,setRevealed]=useState({});
  const [results,setResults]=useState({});
  const [score,setScore]=useState(0);
  const q=quiz.questions[idx];
  function check(){
    const ok=matchAnswer(draft,q.a);
    const ns=score+(ok?1:0);
    if(ok) setScore(ns);
    setRevealed(r=>({...r,[idx]:true}));
    setResults(r=>({...r,[idx]:ok?'correct':'wrong'}));
    setTimeout(()=>{setDraft('');if(idx<quiz.questions.length-1)setIdx(i=>i+1);else onFinish(ns,quiz.questions.length);},800);
  }
  return(
    <div style={{padding:16,paddingBottom:60}}>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:12}}>
        <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:16,color:C.white}}>{quiz.title}</div>
        <div style={{fontSize:13,fontWeight:700,color:C.teal}}>{score}/{idx}</div>
      </div>
      <div style={{height:4,background:C.d4,borderRadius:2,overflow:'hidden',marginBottom:18}}>
        <div style={{width:Math.round(idx/quiz.questions.length*100)+'%',height:'100%',background:C.teal,transition:'width .3s'}}/>
      </div>
      <div style={{background:C.d2,border:'1px solid '+(revealed[idx]?results[idx]==='correct'?C.green:C.red:C.d4),borderRadius:14,padding:'18px 16px',marginBottom:14,transition:'border-color .3s'}}>
        <div style={{fontSize:10,fontWeight:700,color:C.teal,letterSpacing:.8,textTransform:'uppercase',marginBottom:8}}>Q{idx+1} of {quiz.questions.length}</div>
        <div style={{fontSize:16,fontWeight:700,color:C.white,lineHeight:1.5}}>{q.q}</div>
        {revealed[idx]&&results[idx]==='wrong'&&<div style={{fontSize:12,color:C.red,marginTop:8,fontWeight:700}}>Answer: {q.a[0]}</div>}
      </div>
      <div style={{display:'flex',gap:8}}>
        <input value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&draft.trim())check();}} placeholder="Type your answer..." style={{flex:1,background:C.d3,border:'1px solid '+C.d4,borderRadius:10,color:C.text,fontFamily:'DM Sans,sans-serif',fontSize:14,padding:'12px 13px',outline:'none'}} autoFocus/>
        <button onClick={check} disabled={!draft.trim()} style={{padding:'0 16px',borderRadius:10,border:'none',background:draft.trim()?C.teal:C.d4,color:draft.trim()?C.dark:C.muted,fontFamily:'DM Sans,sans-serif',fontWeight:700,fontSize:13,cursor:draft.trim()?'pointer':'default',flexShrink:0}}>Check</button>
      </div>
    </div>
  );
}

function Quiz(){
  const [view,setView]=useState('list');
  const [activeQuiz,setActiveQuiz]=useState(null);
  const [format,setFormat]=useState('type');
  const [finalScore,setFinalScore]=useState(null);

  function handleFinish(score,total){
    setFinalScore({score,total});
    setView('result');
  }

  if(view==='format'&&activeQuiz){
    const formats=[
      {id:'type',label:'Type Answer',sub:'Type your answer, partial matches count'},
      {id:'mc',label:'Multiple Choice',sub:'4 options - pick the right one'},
      {id:'qf',label:'Quick Fire',sub:'8 seconds per question - beat the clock'},
    ];
    return(
      <div style={{padding:16,paddingBottom:80}}>
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:20}}>
          <button onClick={()=>setView('list')} style={{background:'transparent',border:'none',color:C.muted,fontSize:18,cursor:'pointer'}}>{'<'}</button>
          <div>
            <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:22,color:C.white,letterSpacing:1}}>{activeQuiz.title}</div>
            <div style={{fontSize:12,color:C.muted}}>{activeQuiz.questions.length} questions</div>
          </div>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {formats.map(f=>(
            <div key={f.id} onClick={()=>{setFormat(f.id);setView('playing');}} style={{background:C.d2,border:'1px solid '+C.d4,borderRadius:12,padding:'14px 16px',display:'flex',alignItems:'center',gap:12,cursor:'pointer'}}>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:15,color:C.white,marginBottom:2}}>{f.label}</div>
                <div style={{fontSize:12,color:C.muted}}>{f.sub}</div>
              </div>
              <div style={{color:C.muted,fontSize:16}}>{'>'}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if(view==='playing'&&activeQuiz){
    if(format==='mc') return <MultipleChoiceQuiz quiz={activeQuiz} onFinish={handleFinish}/>;
    if(format==='qf') return <QuickFireQuiz quiz={activeQuiz} onFinish={handleFinish}/>;
    return <TypeAnswerQuiz quiz={activeQuiz} onFinish={handleFinish}/>;
  }

  if(view==='result'&&finalScore){
    const pct=Math.round(finalScore.score/finalScore.total*100);
    const grade=pct>=90?'S':pct>=70?'A':pct>=50?'B':pct>=30?'C':'D';
    const gradeCol=pct>=70?C.green:pct>=50?C.yellow:C.red;
    return(
      <div style={{padding:24,paddingBottom:80,textAlign:'center'}}>
        <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:80,color:gradeCol,lineHeight:1,marginBottom:8}}>{grade}</div>
        <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:32,color:C.white,marginBottom:4}}>{finalScore.score}/{finalScore.total}</div>
        <div style={{fontSize:14,color:C.muted,marginBottom:24}}>{pct}% correct</div>
        <div style={{display:'flex',gap:10,justifyContent:'center'}}>
          <button onClick={()=>{setView('playing');setFinalScore(null);}} style={{padding:'10px 20px',borderRadius:9,border:'1px solid '+C.d4,background:C.d2,color:C.text,fontFamily:'DM Sans,sans-serif',fontWeight:700,fontSize:13,cursor:'pointer'}}>Play Again</button>
          <button onClick={()=>{setView('list');setActiveQuiz(null);setFinalScore(null);}} style={{padding:'10px 20px',borderRadius:9,border:'none',background:C.teal,color:C.dark,fontFamily:'DM Sans,sans-serif',fontWeight:700,fontSize:13,cursor:'pointer'}}>All Quizzes</button>
        </div>
      </div>
    );
  }

  const cats=[...new Set(QUIZZES.map(q=>q.cat))];
  return(
    <div style={{padding:16,paddingBottom:80}}>
      <div style={{marginBottom:14}}>
        <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:28,color:C.white,letterSpacing:1.5}}>QUIZ</div>
        <div style={{fontSize:11,color:C.muted}}>{QUIZZES.length} quizzes - test your football knowledge</div>
      </div>
      {cats.map(cat=>(
        <div key={cat} style={{marginBottom:16}}>
          <div style={{fontSize:10,fontWeight:700,color:C.teal,letterSpacing:.8,textTransform:'uppercase',marginBottom:8}}>{cat}</div>
          {QUIZZES.filter(q=>q.cat===cat).map(q=>(
            <div key={q.id} onClick={()=>{setActiveQuiz(q);setView('format');}} style={{background:C.d2,border:'1px solid '+C.d4,borderRadius:12,padding:'13px 16px',marginBottom:6,display:'flex',alignItems:'center',gap:12,cursor:'pointer'}}>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:14,color:C.white,marginBottom:1}}>{q.title}</div>
                <div style={{fontSize:11,color:C.muted}}>{q.questions.length} questions</div>
              </div>
              <div style={{color:C.muted,fontSize:16}}>{'>'}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}


function StatBar({label, home, away, homeCol, awayCol}) {
  const hv = parseFloat(home) || 0;
  const av = parseFloat(away) || 0;
  const total = hv + av || 1;
  const hPct = Math.round((hv/total)*100);
  const aPct = 100 - hPct;
  return(
    <div style={{marginBottom:10}}>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
        <span style={{fontWeight:700,fontSize:12,color:homeCol||C.teal}}>{home}</span>
        <span style={{fontSize:11,color:C.muted,textAlign:'center'}}>{label}</span>
        <span style={{fontWeight:700,fontSize:12,color:awayCol||C.orange}}>{away}</span>
      </div>
      <div style={{display:'flex',height:5,borderRadius:3,overflow:'hidden',gap:1}}>
        <div style={{width:hPct+'%',background:homeCol||C.teal,borderRadius:'3px 0 0 3px'}}/>
        <div style={{width:aPct+'%',background:awayCol||C.orange,borderRadius:'0 3px 3px 0'}}/>
      </div>
    </div>
  );
}

function PitchLineup({lineup, side, teamCol: tc}) {
  if (!lineup) return null;
  const W = 160, H = 300;
  const col = tc || C.teal;
  const lc = 'rgba(255,255,255,.25)';

  // Use API-Football grid positions: "row:col" e.g. "1:1" = GK, "2:1" = leftmost defender
  // Row 1 = GK, higher rows = further up pitch
  // We want GK at BOTTOM for both teams, so we invert: yPct = 1 - (row-1)/(maxRow-1)
  const players = (lineup.startXI || []).map(p => {
    const grid = p.player?.grid || '';
    const [r, c] = grid.split(':').map(Number);
    return { ...p.player, gridRow: r||1, gridCol: c||1 };
  });

  const maxRow = Math.max(...players.map(p => p.gridRow), 1);

  // Group by row
  const byRow = {};
  players.forEach(p => {
    if (!byRow[p.gridRow]) byRow[p.gridRow] = [];
    byRow[p.gridRow].push(p);
  });

  // Sort each row by gridCol (left to right)
  Object.values(byRow).forEach(row => row.sort((a,b) => a.gridCol - b.gridCol));

  const rowNums = Object.keys(byRow).map(Number).sort((a,b) => a-b);

  return(
    <div style={{position:'relative',width:W,height:H,flexShrink:0}}>
      <svg width={W} height={H} viewBox={"0 0 "+W+" "+H} style={{position:'absolute',top:0,left:0}}>
        <rect width={W} height={H} fill="#1e6b3c" rx="4"/>
        {[0,1,2,3,4,5,6].map(i=>(
          <rect key={i} x={0} y={i*(H/7)} width={W} height={H/14} fill="rgba(0,0,0,.06)"/>
        ))}
        <rect x="4" y="6" width={W-8} height={H-12} fill="none" stroke={lc} strokeWidth="1.5" rx="2"/>
        <line x1="4" y1={H/2} x2={W-4} y2={H/2} stroke={lc} strokeWidth="1.2"/>
        <circle cx={W/2} cy={H/2} r="28" fill="none" stroke={lc} strokeWidth="1.2"/>
        <circle cx={W/2} cy={H/2} r="2" fill={lc}/>
        {/* Top box */}
        <rect x={W*0.2} y="6" width={W*0.6} height={H*0.2} fill="none" stroke={lc} strokeWidth="1.2"/>
        <rect x={W*0.35} y="6" width={W*0.3} height={H*0.08} fill="none" stroke={lc} strokeWidth="1.2"/>
        <rect x={W*0.41} y="2" width={W*0.18} height="6" fill="none" stroke={lc} strokeWidth="1.5"/>
        <circle cx={W/2} cy={H*0.14} r="2" fill={lc}/>
        {/* Top penalty arc - exact arc outside the box, bulging into pitch */}
        <path d={"M 57 66 A 33 33 0 0 1 103 66"} fill="none" stroke={lc} strokeWidth="1.2"/>
        {/* Bottom box */}
        <rect x={W*0.2} y={H-6-H*0.2} width={W*0.6} height={H*0.2} fill="none" stroke={lc} strokeWidth="1.2"/>
        <rect x={W*0.35} y={H-6-H*0.08} width={W*0.3} height={H*0.08} fill="none" stroke={lc} strokeWidth="1.2"/>
        <rect x={W*0.41} y={H-8} width={W*0.18} height="6" fill="none" stroke={lc} strokeWidth="1.5"/>
        <circle cx={W/2} cy={H-H*0.14} r="2" fill={lc}/>
        {/* Bottom penalty arc - exact arc outside the box, bulging into pitch */}
        <path d={"M 57 234 A 33 33 0 0 0 103 234"} fill="none" stroke={lc} strokeWidth="1.2"/>
        {/* Corners */}
        <path d="M 4 16 A 10 10 0 0 1 14 6" fill="none" stroke={lc} strokeWidth="1"/>
        <path d={"M "+(W-4)+" 16 A 10 10 0 0 0 "+(W-14)+" 6"} fill="none" stroke={lc} strokeWidth="1"/>
        <path d={"M 4 "+(H-16)+" A 10 10 0 0 0 14 "+(H-6)} fill="none" stroke={lc} strokeWidth="1"/>
        <path d={"M "+(W-4)+" "+(H-16)+" A 10 10 0 0 1 "+(W-14)+" "+(H-6)} fill="none" stroke={lc} strokeWidth="1"/>
      </svg>

      {/* Players - GK at bottom (row 1 = highest yPct) */}
      {rowNums.map(rowNum => {
        // GK (row 1) at bottom = high yPct, attackers (maxRow) at top = low yPct
        const yPct = 92 - ((rowNum - 1) / Math.max(maxRow - 1, 1)) * 84;
        const row = byRow[rowNum];
        return row.map((player, pi) => {
          const spread = row.length <= 2 ? 42 : row.length === 3 ? 56 : row.length === 4 ? 68 : 76;
          const xPct = row.length === 1 ? 50 : (50 - spread/2) + (pi / (row.length - 1)) * spread;
          return(
            <div key={player?.id||pi} style={{
              position:'absolute',
              left: xPct+'%', top: yPct+'%',
              transform:'translate(-50%,-50%)',
              textAlign:'center', zIndex:2,
            }}>
              <div style={{
                width:26,height:26,borderRadius:'50%',
                background:col,
                border:'2px solid rgba(255,255,255,.85)',
                display:'flex',alignItems:'center',justifyContent:'center',
                fontSize:9,fontWeight:700,color:'#fff',
                margin:'0 auto',
                boxShadow:'0 2px 4px rgba(0,0,0,.5)',
              }}>{player?.number||''}</div>
              <div style={{
                fontSize:7,color:'#fff',marginTop:1,lineHeight:1.2,
                whiteSpace:'nowrap',textShadow:'0 1px 3px rgba(0,0,0,.9)',
                maxWidth:44,overflow:'hidden',textOverflow:'ellipsis',
                marginLeft:-9,
              }}>{(player?.name||'').split(' ').pop()}</div>
            </div>
          );
        });
      })}
    </div>
  );
}

function MatchModal({match, onClose}) {
  const [afId, setAfId] = useState(null);
  const [afLoading, setAfLoading] = useState(true);
  const [stats, setStats] = useState([]);
  const [lineups, setLineups] = useState([]);
  const [events, setEvents] = useState([]);
  const [h2h, setH2h] = useState(null);
  const [hForm, setHForm] = useState(null);
  const [aForm, setAForm] = useState(null);
  const [tab, setTab] = useState('stats');
  const [lineupView, setLineupView] = useState('pitch');
  const [understatXG, setUnderstatXG] = useState(null);

  const hc = TCODE[match.homeTeam?.name]||'???';
  const ac = TCODE[match.awayTeam?.name]||'???';
  const hg = match.score?.fullTime?.home;
  const ag = match.score?.fullTime?.away;
  const finished = match.status==='FINISHED';
  const [homeCol, awayCol] = safeTeamCols(hc, ac);
  const homeTxt = contrastCol(hc);
  const awayTxt = contrastCol(ac);

  // Find API-Football ID then fetch all data
  useEffect(()=>{
    setAfLoading(true);
    findAFFixture(match).then(id => {
      setAfId(id);
      if (id) {
        Promise.all([
          fetch('/api/af/stats/'+id).then(r=>r.json()),
          fetch('/api/af/lineups/'+id).then(r=>r.json()),
          fetch('/api/af/events/'+id).then(r=>r.json()),
        ]).then(([s,l,e]) => {
          setStats(s.response || []);
          setLineups(l.response || []);
          setEvents(e.response || []);
        }).catch(()=>{});
      }
      setAfLoading(false);
    }).catch(()=>setAfLoading(false));
    // Fetch Understat xG for this match
    const hn2 = TSHORT[match.homeTeam?.name]||match.homeTeam?.name||'';
    const an2 = TSHORT[match.awayTeam?.name]||match.awayTeam?.name||'';
    const matchDate = match.utcDate ? match.utcDate.split('T')[0] : '';
    fetch('/api/xg/match?home='+encodeURIComponent(hn2)+'&away='+encodeURIComponent(an2)+'&date='+matchDate)
      .then(r=>r.json()).then(d=>{ if(d.found) setUnderstatXG(d); }).catch(()=>{});
    // Also fetch fd.org h2h and form
    fetch('/api/h2h/'+match.id).then(r=>r.json()).then(setH2h).catch(()=>{});
    if(match.homeTeam?.id){
      fetch('/api/team/'+match.homeTeam.id+'/matches').then(r=>r.json()).then(setHForm).catch(()=>{});
      fetch('/api/team/'+match.awayTeam.id+'/matches').then(r=>r.json()).then(setAForm).catch(()=>{});
    }
  },[match.id]);

  // Parse stats into a map
  const homeStats = {};
  const awayStats = {};
  if (stats && stats.length >= 2) {
    (stats[0]?.statistics||[]).forEach(s => homeStats[s.type] = s.value);
    (stats[1]?.statistics||[]).forEach(s => awayStats[s.type] = s.value);
  }

  const LEXPAND = {
    'spurs':'tottenham','man utd':'manchester','man city':'manchester',
    'nottm forest':'nottingham','wolves':'wolverhampton',
    'west ham':'westham','newcastle':'newcastle',
    'brighton':'brighton','aston villa':'astonvilla',
  };
  const normL = s => (s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const expandL = s => { const n=s.toLowerCase().trim(); return normL(LEXPAND[n]||n); };
  const hns2 = expandL(TSHORT[match.homeTeam?.name]||match.homeTeam?.name||'');
  const ans2 = expandL(TSHORT[match.awayTeam?.name]||match.awayTeam?.name||'');
  const lineupMatch = (lName, ourNorm) => {
    const fn = normL(lName||'');
    return fn.includes(ourNorm.slice(0,5)) || ourNorm.includes(fn.slice(0,5));
  };
  const homeLineup = lineups.find(l => lineupMatch(l.team?.name, hns2)) || null;
  const awayLineup = lineups.find(l => lineupMatch(l.team?.name, ans2)) || null;

  const goals = (events||[]).filter(e=>e.type==='Goal');
  const cards = (events||[]).filter(e=>e.type==='Card');
  const subs = (events||[]).filter(e=>e.type==='subst');

  function getForm(fd2,tid){
    return (fd2?.matches||[]).slice(-5).reverse().map(m=>{
      const ih=m.homeTeam?.id===tid, mh=m.score?.fullTime?.home, ma=m.score?.fullTime?.away;
      if(mh==null) return null;
      return mh===ma?'D':(ih?mh>ma:ma>mh)?'W':'L';
    }).filter(Boolean);
  }

  const tS={padding:'6px 10px',borderRadius:7,border:'1px solid '+C.d4,background:'transparent',color:C.muted,fontFamily:'DM Sans,sans-serif',fontSize:11,fontWeight:700,cursor:'pointer'};
  const tA={...tS,borderColor:C.teal,color:C.teal,background:'rgba(10,191,184,.08)'};

  const STAT_ROWS = [
    ['Ball Possession','Possession'],
    ['Total Shots','Shots'],
    ['Shots on Goal','On Target'],
    ['Shots off Goal','Off Target'],
    ['Blocked Shots','Blocked'],
    ['Big Chances','Big Chances'],
    ['Corner Kicks','Corners'],
    ['Fouls','Fouls'],
    ['Offsides','Offsides'],
    ['Yellow Cards','Yellows'],
    ['Red Cards','Reds'],
    ['Saves','Saves'],
    ['Total passes','Passes'],
    ['Passes accurate','Acc. Passes'],
    ['Pass accuracy','Pass %'],
    ['Goalkeeper Saves','GK Saves'],
  ];
  // xG key varies by API-Football version - check all possible keys
  const xGHome = homeStats['expected_goals'] ?? homeStats['Expected Goals'] ?? homeStats['xG'] ?? null;
  const xGAway = awayStats['expected_goals'] ?? awayStats['Expected Goals'] ?? awayStats['xG'] ?? null;

  return(
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.88)',zIndex:500,display:'flex',alignItems:'flex-end',justifyContent:'center'}} onClick={onClose}>
      <div style={{background:C.d2,borderRadius:'18px 18px 0 0',width:'100%',maxWidth:520,maxHeight:'90vh',overflowY:'auto',animation:'slideUp .25s ease'}} onClick={e=>e.stopPropagation()}>

        {/* Header */}
        <div style={{padding:'16px 16px 12px',borderBottom:'1px solid '+C.d4,position:'sticky',top:0,background:C.d2,zIndex:1}}>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
            <div style={{flex:1,display:'flex',alignItems:'center',gap:8}}>
              <Badge code={hc} size={30}/>
              <div>
                <div style={{fontWeight:700,fontSize:14,color:C.white}}>{TSHORT[match.homeTeam?.name]}</div>
                {homeLineup&&<div style={{fontSize:10,color:C.muted}}>{homeLineup.formation}</div>}
              </div>
            </div>
            <div style={{textAlign:'center',flexShrink:0}}>
              <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:34,color:C.white,letterSpacing:4,lineHeight:1}}>
                {finished?hg+'-'+ag:'vs'}
              </div>
              <div style={{fontSize:10,color:C.muted,marginTop:2}}>
                {finished?'Full Time':new Date(match.utcDate).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})}
              </div>
            </div>
            <div style={{flex:1,display:'flex',alignItems:'flex-end',flexDirection:'column',gap:2}}>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <div style={{textAlign:'right'}}>
                  <div style={{fontWeight:700,fontSize:14,color:C.white}}>{TSHORT[match.awayTeam?.name]}</div>
                  {awayLineup&&<div style={{fontSize:10,color:C.muted,textAlign:'right'}}>{awayLineup.formation}</div>}
                </div>
                <Badge code={ac} size={30}/>
              </div>
            </div>
          </div>
          <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
            {['stats','lineup','events','h2h','form'].map(t=>(
              <button key={t} onClick={()=>setTab(t)} style={tab===t?tA:tS}>{t.toUpperCase()}</button>
            ))}
            <button onClick={onClose} style={{...tS,marginLeft:'auto'}}>Close</button>
          </div>
        </div>

        <div style={{padding:16}}>

          {/* STATS TAB */}
          {tab==='stats'&&(
            <div>
              {afLoading&&<div style={{textAlign:'center',padding:20}}><Spinner size={24}/></div>}
              {!afLoading&&!afId&&<div style={{color:C.muted,fontSize:13,textAlign:'center',padding:20}}>Match stats not available</div>}
              {!afLoading&&afId&&Object.keys(homeStats).length===0&&<div style={{textAlign:'center',padding:20}}><Spinner size={24}/></div>}
              {!afLoading&&afId&&Object.keys(homeStats).length>0&&(
                <div>
                  {/* Team headers */}
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
                    <div style={{display:'flex',alignItems:'center',gap:6}}>
                      <Badge code={hc} size={20}/>
                      <span style={{fontSize:12,fontWeight:700,color:homeCol}}>{TSHORT[match.homeTeam?.name]}</span>
                    </div>
                    <span style={{fontSize:10,color:C.muted}}>STATS</span>
                    <div style={{display:'flex',alignItems:'center',gap:6}}>
                      <span style={{fontSize:12,fontWeight:700,color:awayCol}}>{TSHORT[match.awayTeam?.name]}</span>
                      <Badge code={ac} size={20}/>
                    </div>
                  </div>
                  {/* xG - shown if available from either source */}
                  {(xGHome!=null||xGAway!=null)&&(
                    <div style={{marginBottom:4}}>
                      <StatBar label="xG (Official)" home={xGHome??0} away={xGAway??0} homeCol={homeCol} awayCol={awayCol}/>
                    </div>
                  )}
                  {understatXG&&(
                    <div style={{marginBottom:4}}>
                      <StatBar label="xG (Understat)" home={understatXG.home?.xg} away={understatXG.away?.xg} homeCol={homeCol} awayCol={awayCol}/>
                    </div>
                  )}
                  {!xGHome&&!xGAway&&!understatXG&&(
                    <div style={{padding:'6px 0 10px',fontSize:11,color:C.muted,textAlign:'center'}}>xG data loading...</div>
                  )}
                  {STAT_ROWS.map(([key,label])=>{
                    const hv = homeStats[key];
                    const av = awayStats[key];
                    if(hv==null&&av==null) return null;
                    return <StatBar key={key} label={label} home={hv??0} away={av??0} homeCol={homeCol} awayCol={awayCol}/>;
                  })}
                </div>
              )}
            </div>
          )}

          {/* LINEUP TAB */}
          {tab==='lineup'&&(
            <div>
              {afLoading&&<div style={{textAlign:'center',padding:20}}><Spinner size={24}/></div>}
              {!afLoading&&(!homeLineup||!awayLineup)&&<div style={{color:C.muted,fontSize:13,textAlign:'center',padding:20}}>Lineups not available</div>}
              {!afLoading&&homeLineup&&awayLineup&&(
                <>
                  {/* View toggle */}
                  <div style={{display:'flex',gap:6,marginBottom:14}}>
                    <button onClick={()=>setLineupView('pitch')} style={lineupView==='pitch'?tA:tS}>Pitch</button>
                    <button onClick={()=>setLineupView('list')} style={lineupView==='list'?tA:tS}>List</button>
                  </div>

                  {lineupView==='pitch'&&(
                    <div>
                      <div style={{display:'flex',gap:8,justifyContent:'center',marginBottom:14}}>
                        <div style={{textAlign:'center'}}>
                          <div style={{fontSize:11,fontWeight:700,color:C.teal,marginBottom:4}}>{TSHORT[match.homeTeam?.name]}</div>
                          <div style={{fontSize:10,color:C.muted,marginBottom:6}}>{homeLineup.formation}</div>
                          <PitchLineup lineup={homeLineup} side="home" teamCol={homeCol}/>
                        </div>
                        <div style={{textAlign:'center'}}>
                          <div style={{fontSize:11,fontWeight:700,color:C.orange,marginBottom:4}}>{TSHORT[match.awayTeam?.name]}</div>
                          <div style={{fontSize:10,color:C.muted,marginBottom:6}}>{awayLineup.formation}</div>
                          <PitchLineup lineup={awayLineup} side="away" teamCol={awayCol}/>
                        </div>
                      </div>
                      {/* Subs */}
                      <div style={{fontSize:10,fontWeight:700,color:C.muted,letterSpacing:.6,textTransform:'uppercase',marginBottom:8}}>Substitutes</div>
                      <div style={{display:'flex',gap:8}}>
                        <div style={{flex:1}}>
                          {(homeLineup.substitutes||[]).map((s,i)=>(
                            <div key={i} style={{fontSize:11,color:C.muted,padding:'3px 0',borderBottom:'1px solid rgba(255,255,255,.04)'}}>
                              <span style={{color:C.teal,fontWeight:700,marginRight:4}}>{s.player?.number}</span>{s.player?.name}
                            </div>
                          ))}
                        </div>
                        <div style={{flex:1}}>
                          {(awayLineup.substitutes||[]).map((s,i)=>(
                            <div key={i} style={{fontSize:11,color:C.muted,padding:'3px 0',borderBottom:'1px solid rgba(255,255,255,.04)',textAlign:'right'}}>
                              {s.player?.name}<span style={{color:C.orange,fontWeight:700,marginLeft:4}}>{s.player?.number}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {lineupView==='list'&&(
                    <div style={{display:'flex',gap:10}}>
                      {[{lineup:homeLineup,code:hc,col:C.teal,name:TSHORT[match.homeTeam?.name]},
                        {lineup:awayLineup,code:ac,col:C.orange,name:TSHORT[match.awayTeam?.name]}].map(({lineup,code,col,name})=>(
                        <div key={code} style={{flex:1}}>
                          <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:8}}>
                            <Badge code={code} size={18}/>
                            <div>
                              <div style={{fontSize:11,fontWeight:700,color:col}}>{name}</div>
                              <div style={{fontSize:10,color:C.muted}}>{lineup.formation}</div>
                            </div>
                          </div>
                          <div style={{fontSize:9,fontWeight:700,color:C.muted,letterSpacing:.5,marginBottom:4}}>STARTING XI</div>
                          {(lineup.startXI||[]).map((p,i)=>(
                            <div key={i} style={{display:'flex',alignItems:'center',gap:5,padding:'4px 0',borderBottom:'1px solid rgba(255,255,255,.04)'}}>
                              <div style={{width:16,height:16,borderRadius:'50%',background:col,display:'flex',alignItems:'center',justifyContent:'center',fontSize:8,fontWeight:700,color:C.dark,flexShrink:0}}>{p.player?.number}</div>
                              <div style={{flex:1,minWidth:0}}>
                                <div style={{fontSize:11,color:C.white,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{p.player?.name}</div>
                                <div style={{fontSize:9,color:C.muted}}>{p.player?.pos}</div>
                              </div>
                            </div>
                          ))}
                          <div style={{fontSize:9,fontWeight:700,color:C.muted,letterSpacing:.5,margin:'8px 0 4px'}}>SUBS</div>
                          {(lineup.substitutes||[]).map((p,i)=>(
                            <div key={i} style={{display:'flex',alignItems:'center',gap:5,padding:'3px 0',borderBottom:'1px solid rgba(255,255,255,.04)'}}>
                              <div style={{width:16,height:16,borderRadius:'50%',background:C.d4,display:'flex',alignItems:'center',justifyContent:'center',fontSize:8,fontWeight:700,color:C.muted,flexShrink:0}}>{p.player?.number}</div>
                              <div style={{fontSize:11,color:C.muted,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{p.player?.name}</div>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* EVENTS TAB - goals, cards, subs timeline */}
          {tab==='events'&&(
            <div>
              {afLoading&&<div style={{textAlign:'center',padding:20}}><Spinner size={24}/></div>}
              {!afLoading&&(!events||events.length===0)&&<div style={{color:C.muted,fontSize:13,textAlign:'center',padding:20}}>No events recorded</div>}
              {!afLoading&&events&&events.length>0&&[...events].sort((a,b)=>a.time?.elapsed-b.time?.elapsed).map((e,i)=>{
                const norm = s => (s||'').toLowerCase().replace(/[^a-z]/g,'');
                const hn = norm(TSHORT[match.homeTeam?.name]||match.homeTeam?.name);
                const en = norm(e.team?.name||'');
                const isHome = en.length>0 && (en.includes(hn.slice(0,5)) || hn.includes(en.slice(0,5)));
                const icon = e.type==='Goal'?'':e.type==='Card'?(e.detail==='Red Card'?'':''):e.type==='subst'?'':'';
                const detail = e.type==='subst'?'On: '+e.assist?.name+' Off: '+e.player?.name:
                               e.type==='Goal'?(e.detail==='Own Goal'?'Own Goal':e.assist?.name?'Assist: '+e.assist.name:''):
                               e.detail||'';
                return(
                  <div key={i} style={{display:'flex',alignItems:'flex-start',gap:10,padding:'8px 0',borderBottom:'1px solid rgba(255,255,255,.05)'}}>
                    {isHome?(
                      <>
                        <div style={{flex:1,textAlign:'left'}}>
                          <div style={{fontWeight:700,fontSize:13,color:C.white}}>{e.player?.name}</div>
                          {detail&&<div style={{fontSize:11,color:C.muted,marginTop:1}}>{detail}</div>}
                        </div>
                        <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:13,color:C.teal,width:32,textAlign:'center',flexShrink:0}}>{e.time?.elapsed}{e.time?.extra?'+'+e.time.extra:''}&apos;</div>
                        <div style={{fontSize:15,flexShrink:0,width:20,textAlign:'center'}}>{icon}</div>
                        <div style={{width:'40%'}}/>
                      </>
                    ):(
                      <>
                        <div style={{width:'40%'}}/>
                        <div style={{fontSize:15,flexShrink:0,width:20,textAlign:'center'}}>{icon}</div>
                        <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:13,color:C.orange,width:32,textAlign:'center',flexShrink:0}}>{e.time?.elapsed}{e.time?.extra?'+'+e.time.extra:''}&apos;</div>
                        <div style={{flex:1,textAlign:'right'}}>
                          <div style={{fontWeight:700,fontSize:13,color:C.white}}>{e.player?.name}</div>
                          {detail&&<div style={{fontSize:11,color:C.muted,marginTop:1}}>{detail}</div>}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* H2H TAB */}
          {tab==='h2h'&&(
            <div>
              {!h2h&&<div style={{textAlign:'center',padding:20}}><Spinner size={24}/></div>}
              {h2h&&<>
                {h2h.aggregates&&<div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:14}}>
                  {[[h2h.aggregates.homeTeam?.wins||0,TSHORT[match.homeTeam?.name],hc],
                    [h2h.aggregates.numberOfMatches||0,'Played',null],
                    [h2h.aggregates.awayTeam?.wins||0,TSHORT[match.awayTeam?.name],ac]].map(([v,l,code],i)=>(
                    <div key={i} style={{background:C.d3,borderRadius:9,padding:'10px 8px',textAlign:'center'}}>
                      {code&&<div style={{display:'flex',justifyContent:'center',marginBottom:4}}><Badge code={code} size={18}/></div>}
                      <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:24,color:C.teal,lineHeight:1}}>{v}</div>
                      <div style={{fontSize:10,color:C.muted,marginTop:2}}>{l}</div>
                    </div>
                  ))}
                </div>}
                {(h2h.matches||[]).slice(0,5).map((m,i)=>{
                  const mhc=TCODE[m.homeTeam?.name]||'???', mac=TCODE[m.awayTeam?.name]||'???';
                  return(<div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 10px',background:C.d3,borderRadius:8,marginBottom:4}}>
                    <div style={{fontSize:10,color:C.muted,flexShrink:0,minWidth:60}}>{new Date(m.utcDate).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'2-digit'})}</div>
                    <Badge code={mhc} size={18}/>
                    <span style={{fontSize:12,fontWeight:700,flex:1,color:C.text,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{TSHORT[m.homeTeam?.name]||m.homeTeam?.name}</span>
                    <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:16,color:C.white,letterSpacing:2,flexShrink:0}}>{m.score?.fullTime?.home}-{m.score?.fullTime?.away}</div>
                    <span style={{fontSize:12,fontWeight:700,flex:1,textAlign:'right',color:C.text,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{TSHORT[m.awayTeam?.name]||m.awayTeam?.name}</span>
                    <Badge code={mac} size={18}/>
                  </div>);
                })}
              </>}
            </div>
          )}

          {/* FORM TAB */}
          {tab==='form'&&(
            <div>
              {(!hForm||!aForm)&&<div style={{textAlign:'center',padding:20}}><Spinner size={24}/></div>}
              {hForm&&aForm&&[[match.homeTeam,hForm,hc],[match.awayTeam,aForm,ac]].map(([team,fd2,code])=>{
                const form=getForm(fd2,team?.id);
                const ms=(fd2?.matches||[]).slice(-5).reverse();
                return(<div key={code} style={{background:C.d3,borderRadius:10,padding:14,marginBottom:10}}>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
                    <Badge code={code} size={22}/>
                    <div style={{fontWeight:700,fontSize:14,color:C.white,flex:1}}>{TSHORT[team?.name]||team?.name}</div>
                    <div style={{display:'flex',gap:4}}>{form.map((r,i)=><div key={i} style={{width:20,height:20,borderRadius:'50%',background:r==='W'?C.green:r==='D'?C.yellow:C.red,display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,fontWeight:700,color:C.dark}}>{r}</div>)}</div>
                  </div>
                  {ms.map((m,i)=>{
                    const ih=m.homeTeam?.id===team?.id, opp=ih?m.awayTeam:m.homeTeam, oc=TCODE[opp?.name]||'???';
                    const mh=m.score?.fullTime?.home, ma=m.score?.fullTime?.away;
                    const r=mh===ma?'D':(ih?mh>ma:ma>mh)?'W':'L';
                    return(<div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 0',borderTop:'1px solid rgba(255,255,255,.05)'}}>
                      <div style={{fontSize:10,color:C.muted,flexShrink:0,minWidth:55}}>{new Date(m.utcDate).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</div>
                      <div style={{fontSize:10,color:C.muted,flexShrink:0}}>{ih?'H':'A'}</div>
                      <Badge code={oc} size={16}/>
                      <span style={{fontSize:12,flex:1,color:C.text,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{TSHORT[opp?.name]||opp?.name}</span>
                      <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:14,color:C.white,letterSpacing:1,flexShrink:0}}>{mh}-{ma}</div>
                      <div style={{width:18,height:18,borderRadius:'50%',background:r==='W'?C.green:r==='D'?C.yellow:C.red,display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,fontWeight:700,color:C.dark,flexShrink:0}}>{r}</div>
                    </div>);
                  })}
                </div>);
              })}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

function GKCleanSheets(){
  const {data,loading,error}=useApi('/api/gk-cleansheets',300000);
  const gks=(data?.goalkeepers||[]).slice(0,20);
  if(loading)return<div style={{textAlign:'center',padding:40}}><Spinner/></div>;
  if(error)return<div style={{padding:12,color:C.red,fontSize:13}}>{error}</div>;
  return(
    <div>
      <div style={{fontSize:11,color:C.muted,marginBottom:10}}>Golden Glove race 2025-26 (based on team clean sheets)</div>
      {gks.map((gk,i)=>{
        const code=TCODE[gk.team]||TCODE[Object.keys(TSHORT).find(k=>TSHORT[k]===gk.team||k===gk.team)||'']||'???';
        const tc=teamCol(code);
        return(
          <div key={i} style={{display:'flex',alignItems:'center',gap:8,background:C.d2,borderRadius:9,padding:'9px 12px',marginBottom:5,borderLeft:'3px solid '+(i===0?C.gold:i===1?'#C0C0C0':i===2?'#CD7F32':C.d4)}}>
            <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:15,color:C.muted,width:20,flexShrink:0,textAlign:'right'}}>{i+1}</div>
            <Badge code={code} size={22}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:700,fontSize:13,color:C.white,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{gk.name}</div>
              <div style={{fontSize:10,color:C.muted,marginTop:1}}>{TSHORT[gk.team]||gk.team}  {gk.gamesPlayed} apps</div>
            </div>
            <div style={{textAlign:'right',flexShrink:0,marginRight:8}}>
              <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:26,color:tc,lineHeight:1}}>{gk.cleanSheets}</div>
              <div style={{fontSize:9,color:C.muted,fontWeight:700,letterSpacing:.4}}>CLEAN SHEETS</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Stats(){
  const {data:scorersData,loading:sLoad,error:sErr}=useApi('/api/scorers?limit=100',600000);
  const {data:standData,loading:tLoad}=useApi('/api/standings',300000);
  const {data:xgData,loading:xgLoad}=useApi('/api/xg/players',1800000);
  const {data:xgTeams,loading:xgTLoad}=useApi('/api/xg/teams',1800000);
  const [view,setView]=useState('scorers');
  const [showFull,setShowFull]=useState(false);

  const allScorers=scorersData?.scorers||[];
  const table=standData?.standings?.[0]?.table||[];

  // Top 50 scorers sorted by goals
  const scorers=[...allScorers].sort((a,b)=>b.goals-a.goals).slice(0,50);
  // Top 50 assisters - fetch all and sort by assists
  const assisters=[...allScorers].filter(s=>s.assists>0).sort((a,b)=>b.assists-a.assists).slice(0,50);

  // Clean sheets - from standings goalsAgainst
  const cleanSheets=[...table].sort((a,b)=>a.goalsAgainst-b.goalsAgainst).slice(0,20);

  // xG players
  const xgPlayers=(xgData?.players||[]).slice(0,showFull?50:20);
  // xG teams
  const xgTeamList=xgTeams?.teams||[];

  const limit=showFull?50:20;

  const tS={padding:'6px 10px',borderRadius:7,border:'1px solid '+C.d4,background:'transparent',color:C.muted,fontFamily:'DM Sans,sans-serif',fontSize:11,fontWeight:700,cursor:'pointer',flexShrink:0};
  const tA={...tS,borderColor:C.teal,color:C.teal,background:'rgba(10,191,184,.08)'};

  function PlayerRow({p,i,stat,statCol,statLabel,stat2,stat2Col,stat2Label}){
    const code=TCODE[p.team?.name]||'???';
    const tc=teamCol(code);
    return(
      <div style={{display:'flex',alignItems:'center',gap:8,background:C.d2,borderRadius:9,padding:'9px 12px',marginBottom:5,borderLeft:'3px solid '+(i===0?C.gold:i===1?'#C0C0C0':i===2?'#CD7F32':C.d4)}}>
        <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:15,color:C.muted,width:20,flexShrink:0,textAlign:'right'}}>{i+1}</div>
        <Badge code={code} size={22}/>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontWeight:700,fontSize:13,color:C.white,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{p.player?.name||p.name}</div>
          <div style={{fontSize:10,color:C.muted,marginTop:1}}>{TSHORT[p.team?.name]||p.team||p.team?.name}</div>
        </div>
        <div style={{textAlign:'right',flexShrink:0}}>
          <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:24,color:statCol||tc,lineHeight:1}}>{stat}</div>
          <div style={{fontSize:9,color:C.muted,fontWeight:700,letterSpacing:.4}}>{statLabel}</div>
        </div>
        {stat2!=null&&<div style={{textAlign:'right',flexShrink:0,marginLeft:5}}>
          <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:17,color:stat2Col||C.muted,lineHeight:1}}>{stat2}</div>
          <div style={{fontSize:9,color:C.muted,fontWeight:700,letterSpacing:.4}}>{stat2Label}</div>
        </div>}
      </div>
    );
  }

    const loading=sLoad||tLoad;
  if(loading)return<div style={{padding:40,textAlign:'center'}}><Spinner/></div>;
  if(sErr)return<div style={{padding:24,color:C.red,fontSize:13}}>{sErr}</div>;

  return(
    <div style={{padding:16,paddingBottom:80}}>
      <div style={{marginBottom:14}}>
        <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:28,color:C.white,letterSpacing:1.5}}>PL <span style={{color:C.teal}}>STATS</span></div>
        <div style={{fontSize:11,color:C.muted}}>2025-26 Premier League</div>
      </div>
      <div style={{display:'flex',gap:5,marginBottom:14,overflowX:'auto',paddingBottom:4}}>
        {[['scorers','Top Scorers'],['assists','Assists'],['xgtable','xG Table']].map(([id,label])=>(
          <button key={id} onClick={()=>{setView(id);setShowFull(false);}} style={view===id?tA:tS}>{label}</button>
        ))}
      </div>

      {/* TOP SCORERS */}
      {view==='scorers'&&<>
        {scorers.slice(0,limit).map((s,i)=>(
          <PlayerRow key={i} p={s} i={i} stat={s.goals} statLabel="GOALS" stat2={s.assists} stat2Col={C.orange} stat2Label="AST"/>
        ))}
        {scorers.length>20&&<button onClick={()=>setShowFull(f=>!f)} style={{width:'100%',marginTop:8,padding:'10px 0',borderRadius:9,border:'1px solid '+C.d4,background:'transparent',color:C.muted,fontFamily:'DM Sans,sans-serif',fontWeight:700,fontSize:12,cursor:'pointer'}}>
          {showFull?'Show Less':'View Full Top 50'}
        </button>}
      </>}

      {/* TOP ASSISTERS */}
      {view==='assists'&&<>
        {assisters.slice(0,limit).map((s,i)=>(
          <PlayerRow key={i} p={s} i={i} stat={s.assists} statCol={C.orange} statLabel="ASSISTS" stat2={s.goals} stat2Label="GOALS"/>
        ))}
        {assisters.length>20&&<button onClick={()=>setShowFull(f=>!f)} style={{width:'100%',marginTop:8,padding:'10px 0',borderRadius:9,border:'1px solid '+C.d4,background:'transparent',color:C.muted,fontFamily:'DM Sans,sans-serif',fontWeight:700,fontSize:12,cursor:'pointer'}}>
          {showFull?'Show Less':'View Full Top 50'}
        </button>}
      </>}



      {/* xG TABLE */}
      {view==='xgtable'&&(
        <div>
          {xgLoad&&xgTLoad&&<div style={{textAlign:'center',padding:40}}><Spinner/></div>}
          {/* Team xG */}
          {!xgTLoad&&xgTeamList.length>0&&<>
            <div style={{fontSize:11,fontWeight:700,color:C.teal,letterSpacing:.6,textTransform:'uppercase',marginBottom:8}}>Team xG 2025-26</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 44px 44px 44px 44px',gap:4,padding:'4px 10px',marginBottom:4}}>
              {['Team','xG','xGA','xGD','xPts'].map((h,i)=><div key={i} style={{fontSize:10,fontWeight:700,color:C.muted,textAlign:i>0?'center':'left'}}>{h}</div>)}
            </div>
            {xgTeamList.map((t,i)=>{
              const xgd=+(t.xG-t.xGA).toFixed(1);
              const normName = s => (s||'').toLowerCase().replace(/[^a-z]/g,'');
              const code = Object.entries(TSHORT).find(([k,v])=>normName(v)===normName(t.name)||normName(k)===normName(t.name))?.[0];
              const tcode = code?TCODE[code]:null;
              return(
                <div key={i} style={{display:'grid',gridTemplateColumns:'1fr 44px 44px 44px 44px',gap:4,padding:'8px 10px',background:C.d2,borderRadius:8,marginBottom:3,borderLeft:'3px solid '+(xgd>0?C.teal:C.red),alignItems:'center'}}>
                  <div style={{display:'flex',alignItems:'center',gap:6,minWidth:0}}>
                    {tcode&&<Badge code={tcode} size={18}/>}
                    <span style={{fontSize:12,fontWeight:700,color:C.white,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{t.name}</span>
                  </div>
                  <div style={{textAlign:'center',fontFamily:'Bebas Neue,sans-serif',fontSize:15,color:C.teal}}>{t.xG}</div>
                  <div style={{textAlign:'center',fontFamily:'Bebas Neue,sans-serif',fontSize:15,color:C.red}}>{t.xGA}</div>
                  <div style={{textAlign:'center',fontFamily:'Bebas Neue,sans-serif',fontSize:15,color:xgd>0?C.green:C.red}}>{xgd>0?'+':''}{xgd}</div>
                  <div style={{textAlign:'center',fontFamily:'Bebas Neue,sans-serif',fontSize:15,color:C.yellow}}>{t.xPts}</div>
                </div>
              );
            })}
          </>}
          {/* Player xG */}
          {!xgLoad&&xgPlayers.length>0&&<>
            <div style={{fontSize:11,fontWeight:700,color:C.teal,letterSpacing:.6,textTransform:'uppercase',margin:'16px 0 8px'}}>Player xG 2025-26</div>
            <div style={{display:'grid',gridTemplateColumns:'28px 1fr 44px 32px 44px 32px',gap:4,padding:'4px 10px',marginBottom:4}}>
              {['#','','xG','G','xA','A'].map((h,i)=><div key={i} style={{fontSize:10,fontWeight:700,color:C.muted,textAlign:i>1?'center':'left'}}>{h}</div>)}
            </div>
            {xgPlayers.map((p,i)=>{
              const overPerf=+(p.goals-p.xG).toFixed(1);
              const normName = s => (s||'').toLowerCase().replace(/[^a-z]/g,'');
              const code = Object.entries(TSHORT).find(([k,v])=>normName(v)===normName(p.team)||normName(k).includes(normName(p.team).slice(0,5)))?.[0];
              const tcode = code?TCODE[code]:null;
              return(
                <div key={i} style={{background:C.d2,borderRadius:8,marginBottom:3,padding:'8px 10px',borderLeft:'3px solid '+(overPerf>2?C.green:overPerf<-2?C.red:C.d4)}}>
                  <div style={{display:'grid',gridTemplateColumns:'28px 1fr 44px 32px 44px 32px',gap:4,alignItems:'center',marginBottom:4}}>
                    <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:13,color:C.muted}}>{i+1}</div>
                    <div style={{minWidth:0}}>
                      <div style={{fontWeight:700,fontSize:12,color:C.white,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{p.name}</div>
                      <div style={{fontSize:10,color:C.muted}}>{p.team}</div>
                    </div>
                    <div style={{textAlign:'center',fontFamily:'Bebas Neue,sans-serif',fontSize:15,color:C.teal}}>{p.xG}</div>
                    <div style={{textAlign:'center',fontFamily:'Bebas Neue,sans-serif',fontSize:14,color:overPerf>0?C.green:overPerf<0?C.red:C.white}}>{p.goals}</div>
                    <div style={{textAlign:'center',fontFamily:'Bebas Neue,sans-serif',fontSize:15,color:C.orange}}>{p.xA}</div>
                    <div style={{textAlign:'center',fontFamily:'Bebas Neue,sans-serif',fontSize:14,color:C.white}}>{p.assists}</div>
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:5}}>
                    <div style={{fontSize:8,color:C.teal,width:16}}>xG</div>
                    <div style={{flex:1,height:3,background:C.d4,borderRadius:2,overflow:'hidden'}}>
                      <div style={{width:Math.min(100,(p.xG/(xgPlayers[0]?.xG||1))*100)+'%',height:'100%',background:C.teal}}/>
                    </div>
                    <div style={{fontSize:8,color:overPerf>0?C.green:C.red,width:28,textAlign:'right'}}>{overPerf>0?'+':''}{overPerf}</div>
                  </div>
                </div>
              );
            })}
            <button onClick={()=>setShowFull(f=>!f)} style={{width:'100%',marginTop:8,padding:'10px 0',borderRadius:9,border:'1px solid '+C.d4,background:'transparent',color:C.muted,fontFamily:'DM Sans,sans-serif',fontWeight:700,fontSize:12,cursor:'pointer'}}>
              {showFull?'Show Less':'View Full Top 50'}
            </button>
          </>}
          {!xgLoad&&!xgTLoad&&xgPlayers.length===0&&xgTeamList.length===0&&(
            <div style={{textAlign:'center',padding:32,color:C.muted,fontSize:13}}>xG data unavailable</div>
          )}
        </div>
      )}
    </div>
  );
}


function XGStats(){
  const [view, setView] = useState('players');
  const {data:pData, loading:pLoad, error:pErr} = useApi('/api/xg/players', 30*60000);
  const {data:tData, loading:tLoad, error:tErr} = useApi('/api/xg/teams', 30*60000);
  const players = pData?.players || [];
  const teams = tData?.teams || [];
  const tS={padding:'7px 14px',borderRadius:8,border:'1px solid '+C.d4,background:'transparent',color:C.muted,fontFamily:'DM Sans,sans-serif',fontSize:12,fontWeight:700,cursor:'pointer'};
  const tA={...tS,borderColor:C.teal,color:C.teal,background:'rgba(10,191,184,.08)'};

  function Bar({val, max, col}){
    const pct = max > 0 ? Math.min(100, (val/max)*100) : 0;
    return(
      <div style={{flex:1,height:4,background:C.d4,borderRadius:2,overflow:'hidden'}}>
        <div style={{width:pct+'%',height:'100%',background:col,borderRadius:2,transition:'width .4s'}}/>
      </div>
    );
  }

  return(
    <div style={{padding:16,paddingBottom:80}}>
      <div style={{marginBottom:14}}>
        <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:28,color:C.white,letterSpacing:1.5,lineHeight:1}}>
          xG <span style={{color:C.teal}}>STATS</span>
        </div>
        <div style={{fontSize:11,color:C.muted,marginTop:2}}>Expected goals data via Understat</div>
      </div>
      <div style={{display:'flex',gap:6,marginBottom:14}}>
        <button onClick={()=>setView('players')} style={view==='players'?tA:tS}>Players</button>
        <button onClick={()=>setView('teams')} style={view==='teams'?tA:tS}>Teams</button>
      </div>

      {view==='players'&&(
        <div>
          {pLoad&&<div style={{textAlign:'center',padding:40}}><Spinner/></div>}
          {pErr&&<div style={{color:C.red,fontSize:13,padding:16}}>{pErr}</div>}
          {!pLoad&&!pErr&&(
            <>
              {/* Header */}
              <div style={{display:'grid',gridTemplateColumns:'28px 1fr 44px 44px 44px 44px',gap:4,padding:'4px 10px',marginBottom:4}}>
                {['#','','xG','G','xA','A'].map((h,i)=>(
                  <div key={i} style={{fontSize:10,fontWeight:700,color:C.muted,textAlign:i>1?'center':'left'}}>{h}</div>
                ))}
              </div>
              {players.slice(0,30).map((p,i)=>{
                const maxXG = players[0]?.xG || 1;
                const overPerf = p.goals - p.xG;
                return(
                  <div key={i} style={{background:C.d2,borderRadius:9,marginBottom:4,padding:'9px 10px',borderLeft:'3px solid '+(overPerf>2?C.green:overPerf<-2?C.red:C.d4)}}>
                    <div style={{display:'grid',gridTemplateColumns:'28px 1fr 44px 44px 44px 44px',gap:4,alignItems:'center',marginBottom:6}}>
                      <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:14,color:C.muted}}>{i+1}</div>
                      <div style={{minWidth:0}}>
                        <div style={{fontWeight:700,fontSize:13,color:C.white,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{p.name}</div>
                        <div style={{fontSize:10,color:C.muted}}>{p.team}  {p.position}</div>
                      </div>
                      <div style={{textAlign:'center'}}>
                        <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:16,color:C.teal,lineHeight:1}}>{p.xG}</div>
                        <div style={{fontSize:8,color:C.muted}}>xG</div>
                      </div>
                      <div style={{textAlign:'center'}}>
                        <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:16,color:overPerf>0?C.green:overPerf<0?C.red:C.white,lineHeight:1}}>{p.goals}</div>
                        <div style={{fontSize:8,color:C.muted}}>G</div>
                      </div>
                      <div style={{textAlign:'center'}}>
                        <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:16,color:C.orange,lineHeight:1}}>{p.xA}</div>
                        <div style={{fontSize:8,color:C.muted}}>xA</div>
                      </div>
                      <div style={{textAlign:'center'}}>
                        <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:16,color:C.white,lineHeight:1}}>{p.assists}</div>
                        <div style={{fontSize:8,color:C.muted}}>A</div>
                      </div>
                    </div>
                    {/* xG vs Goals bar */}
                    <div style={{display:'flex',alignItems:'center',gap:6}}>
                      <div style={{fontSize:9,color:C.muted,flexShrink:0,width:20}}>xG</div>
                      <Bar val={p.xG} max={maxXG} col={C.teal}/>
                      <div style={{fontSize:9,color:C.muted,flexShrink:0,width:20}}>G</div>
                      <Bar val={p.goals} max={maxXG} col={overPerf>0?C.green:overPerf<0?C.red:C.white}/>
                      <div style={{fontSize:9,fontWeight:700,color:overPerf>0?C.green:overPerf<0?C.red:C.muted,flexShrink:0,minWidth:28,textAlign:'right'}}>
                        {overPerf>0?'+':''}{overPerf.toFixed(1)}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div style={{fontSize:11,color:C.muted,textAlign:'center',padding:'12px 0'}}>
                Green border = overperforming xG  Red = underperforming
              </div>
            </>
          )}
        </div>
      )}

      {view==='teams'&&(
        <div>
          {tLoad&&<div style={{textAlign:'center',padding:40}}><Spinner/></div>}
          {tErr&&<div style={{color:C.red,fontSize:13,padding:16}}>{tErr}</div>}
          {!tLoad&&!tErr&&(
            <>
              <div style={{display:'grid',gridTemplateColumns:'1fr 50px 50px 50px 50px 50px',gap:4,padding:'4px 10px',marginBottom:4}}>
                {['Team','xG','xGA','npxG','PPDA','xPts'].map((h,i)=>(
                  <div key={i} style={{fontSize:10,fontWeight:700,color:C.muted,textAlign:i>0?'center':'left'}}>{h}</div>
                ))}
              </div>
              {teams.map((t,i)=>{
                const code = Object.entries(TSHORT).find(([k,v])=>v===t.name||k.includes(t.name)||t.name.includes(v))?.[0];
                const tcode = code ? TCODE[code] : null;
                const xGD = +(t.xG - t.xGA).toFixed(2);
                return(
                  <div key={i} style={{background:C.d2,borderRadius:9,marginBottom:4,padding:'10px 10px',
                    borderLeft:'3px solid '+(xGD>0?C.teal:xGD<0?C.red:C.d4)}}>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 50px 50px 50px 50px 50px',gap:4,alignItems:'center',marginBottom:6}}>
                      <div style={{display:'flex',alignItems:'center',gap:7,minWidth:0}}>
                        {tcode&&<Badge code={tcode} size={18}/>}
                        <span style={{fontWeight:700,fontSize:12,color:C.white,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{t.name}</span>
                      </div>
                      <div style={{textAlign:'center',fontFamily:'Bebas Neue,sans-serif',fontSize:15,color:C.teal}}>{t.xG}</div>
                      <div style={{textAlign:'center',fontFamily:'Bebas Neue,sans-serif',fontSize:15,color:C.red}}>{t.xGA}</div>
                      <div style={{textAlign:'center',fontFamily:'Bebas Neue,sans-serif',fontSize:15,color:C.muted}}>{t.npxG}</div>
                      <div style={{textAlign:'center',fontFamily:'Bebas Neue,sans-serif',fontSize:15,color:C.orange}}>{t.ppda||'-'}</div>
                      <div style={{textAlign:'center',fontFamily:'Bebas Neue,sans-serif',fontSize:15,color:C.yellow}}>{t.xPts}</div>
                    </div>
                    {/* xG vs xGA bar */}
                    <div style={{display:'flex',alignItems:'center',gap:4}}>
                      <div style={{fontSize:8,color:C.teal,flexShrink:0,width:16}}>xG</div>
                      <div style={{flex:1,height:4,background:C.d4,borderRadius:2,overflow:'hidden'}}>
                        <div style={{width:Math.min(100,(t.xG/80)*100)+'%',height:'100%',background:C.teal,borderRadius:2}}/>
                      </div>
                      <div style={{fontSize:8,color:C.red,flexShrink:0,width:24}}>xGA</div>
                      <div style={{flex:1,height:4,background:C.d4,borderRadius:2,overflow:'hidden'}}>
                        <div style={{width:Math.min(100,(t.xGA/80)*100)+'%',height:'100%',background:C.red,borderRadius:2}}/>
                      </div>
                      <div style={{fontSize:9,fontWeight:700,color:xGD>0?C.teal:C.red,flexShrink:0,minWidth:32,textAlign:'right'}}>
                        {xGD>0?'+':''}{xGD}
                      </div>
                    </div>
                    <div style={{fontSize:9,color:C.muted,marginTop:3}}>xGD: {xGD>0?'+':''}{xGD}  PPDA: {t.ppda||'n/a'} (lower = more pressing)</div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// -- APP ---------------------------------------------------
const TABS=[
  {id:'live',label:'Live',path:'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z'},
  {id:'predict',label:'Predict',path:'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 3c1.93 0 3.5 1.57 3.5 3.5S13.93 13 12 13s-3.5-1.57-3.5-3.5S10.07 6 12 6zm7 13H5v-.23c0-.62.28-1.2.76-1.58C7.47 15.82 9.64 15 12 15s4.53.82 6.24 2.19c.48.38.76.97.76 1.58V19z'},
  {id:'fixtures',label:'Fixtures',path:'M19 3h-1V1h-2v2H8V1H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11z'},
  {id:'table',label:'Table',path:'M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z'},
  {id:'stats',label:'Stats',path:'M5 9.2h3V19H5V9.2zM10.6 5h2.8v14h-2.8V5zm5.6 8H19v6h-2.8v-6z'},
  {id:'quiz',label:'Quiz',path:'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z'}
];






function App(){
  const [tab,setTab]=useState('live');
  useCrests();
  return(
    <div style={{minHeight:'100vh',background:C.dark}}>
      <nav style={{background:C.d2,borderBottom:'1px solid '+C.d4,padding:'0 16px',height:52,display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,zIndex:100}}>
        <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:20,color:C.white,letterSpacing:.5,lineHeight:1}}>
          H<span style={{color:C.teal}}>&amp;</span>V
          <div style={{fontSize:8,letterSpacing:3,color:C.teal,fontFamily:'DM Sans,sans-serif',fontWeight:700,marginTop:1,opacity:.8,textTransform:'uppercase'}}>HEADERS &amp; VOLLEYS</div>
        </div>
        <div style={{background:C.d3,border:'1px solid '+C.d4,borderRadius:6,padding:'3px 9px',fontSize:11,fontWeight:600,color:C.muted}}>LIVE <span style={{color:C.green,marginLeft:4}}>*</span></div>
      </nav>
      <div style={{animation:'fadeIn .2s ease'}}>
        {tab==='live'&&<Live/>}
        {tab==='predict'&&<Predictions/>}
        {tab==='fixtures'&&<Fixtures/>}
        {tab==='table'&&<Table/>}
        {tab==='stats'&&<Stats/>}
        {tab==='quiz'&&<Quiz/>}
      </div>
      <div style={{position:'fixed',bottom:0,left:0,right:0,zIndex:200,background:C.d2,borderTop:'1px solid '+C.d4,display:'flex',height:58,maxWidth:520,margin:'0 auto'}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:2,background:'transparent',border:'none',cursor:'pointer',padding:'6px 2px',position:'relative'}}>
            {tab===t.id&&<div style={{position:'absolute',top:0,left:'20%',right:'20%',height:2,borderRadius:'0 0 2px 2px',background:t.id==='live'?C.orange:C.teal}}/>}
            <svg width={18} height={18} viewBox="0 0 24 24" fill={tab===t.id?(t.id==='live'?C.orange:C.teal):C.muted}><path d={t.path}/></svg>
            <span style={{fontSize:8,fontWeight:tab===t.id?700:500,color:tab===t.id?(t.id==='live'?C.orange:C.teal):C.muted,letterSpacing:.3}}>{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));


//  MATCH DETAIL MODAL 
// Finds API-Football fixture ID by matching date + team names
async function findAFFixture(match) {
  const dt = new Date(match.utcDate);
  const date = dt.toISOString().split('T')[0];
  const hn = TSHORT[match.homeTeam?.name] || match.homeTeam?.name || '';
  const an = TSHORT[match.awayTeam?.name] || match.awayTeam?.name || '';
  const r = await fetch('/api/af/lookup?date=' + date + '&home=' + encodeURIComponent(hn) + '&away=' + encodeURIComponent(an));
  const d = await r.json();
  return d.fixtureId || null;
}
</script>
</body>
</html>`);
});

app.listen(PORT, () => console.log('H&V running on port ' + PORT));
