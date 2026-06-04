const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3001;
const API_KEY = process.env.FOOTBALL_DATA_API_KEY || '';
const BASE = 'https://api.football-data.org/v4';

app.use(cors());
app.use(express.json());

const cache = {};
const TTL = { live: 60000, standings: 300000, scorers: 600000, matches: 300000 };

async function fd(endpoint, ttl) {
  const now = Date.now();
  if (cache[endpoint] && now - cache[endpoint].ts < ttl) return cache[endpoint].data;
  const res = await fetch(`${BASE}${endpoint}`, { headers: { 'X-Auth-Token': API_KEY } });
  if (!res.ok) throw new Error(`API ${res.status}`);
  const data = await res.json();
  cache[endpoint] = { data, ts: now };
  return data;
}

app.get('/api/matches', async (req, res) => {
  try { res.json(await fd('/competitions/PL/matches?season=2025', TTL.matches)); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/matches/live', async (req, res) => {
  try { res.json(await fd('/competitions/PL/matches?status=IN_PLAY,PAUSED,LIVE', TTL.live)); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/matches/today', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    res.json(await fd(`/competitions/PL/matches?dateFrom=${today}&dateTo=${today}`, TTL.live));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/standings', async (req, res) => {
  try { res.json(await fd('/competitions/PL/standings?season=2025', TTL.standings)); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/scorers', async (req, res) => {
  try { res.json(await fd('/competitions/PL/scorers?season=2025&limit=20', TTL.scorers)); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/match/:id', async (req, res) => {
  try { res.json(await fd(`/matches/${req.params.id}`, TTL.live)); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

// Serve the frontend
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
body{background:#070B10;color:#E8F0FA;font-family:'DM Sans',sans-serif;max-width:520px;margin:0 auto}
::-webkit-scrollbar{width:4px;height:4px}::-webkit-scrollbar-thumb{background:#1C2738;border-radius:2px}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes blink{0%,100%{opacity:1}50%{opacity:.4}}
@keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
</style>
</head>
<body><div id="root"></div>
<script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
<script type="text/babel">
const {useState,useEffect,useCallback,useRef} = React;
const C={dark:'#070B10',d2:'#0D1420',d3:'#141D2C',d4:'#1C2738',white:'#fff',text:'#E8F0FA',muted:'#8899AA',teal:'#00FFD4',green:'#00E676',red:'#FF3D3D',yellow:'#FFD600',orange:'#FF8000',blue:'#2979FF'};
const TCODE={'Arsenal':'ARS','Aston Villa':'AVL','Brighton & Hove Albion':'BHA','AFC Bournemouth':'BOU','Brentford':'BRE','Burnley':'BUR','Chelsea':'CHE','Crystal Palace':'CRY','Everton':'EVE','Fulham':'FUL','Leeds United':'LEE','Liverpool':'LIV','Manchester City':'MCI','Manchester United':'MUN','Newcastle United':'NEW','Nottingham Forest':'NFO','Sunderland AFC':'SUN','Tottenham Hotspur':'TOT','West Ham United':'WHU','Wolverhampton Wanderers':'WOL'};
const TSHORT={'Arsenal':'Arsenal','Aston Villa':'Aston Villa','Brighton & Hove Albion':'Brighton','AFC Bournemouth':'Bournemouth','Brentford':'Brentford','Burnley':'Burnley','Chelsea':'Chelsea','Crystal Palace':'Crystal Palace','Everton':'Everton','Fulham':'Fulham','Leeds United':'Leeds','Liverpool':'Liverpool','Manchester City':'Man City','Manchester United':'Man Utd','Newcastle United':'Newcastle','Nottingham Forest':'Nott\'m Forest','Sunderland AFC':'Sunderland','Tottenham Hotspur':'Spurs','West Ham United':'West Ham','Wolverhampton Wanderers':'Wolves'};
const CC={'ARS':['#EF0107','#FFD700'],'AVL':['#670E36','#95BFE5'],'BHA':['#0057B8','#fff'],'BOU':['#DA291C','#000'],'BRE':['#E30613','#fff'],'BUR':['#6C1D45','#97D700'],'CHE':['#034694','#FFD700'],'CRY':['#1B458F','#C4122E'],'EVE':['#003399','#FFD700'],'FUL':['#CC0000','#fff'],'LEE':['#FFCD00','#1D428A'],'LIV':['#C8102E','#FFD700'],'MCI':['#6CABDD','#1C2C5B'],'MUN':['#DA291C','#FFD700'],'NEW':['#241F20','#fff'],'NFO':['#DD0000','#fff'],'SUN':['#EB172B','#fff'],'TOT':['#132257','#fff'],'WHU':['#7A263A','#60CDFF'],'WOL':['#231F20','#FDB913']};

function Badge({code,size=24}){
  const [bg,acc]=CC[code]||['#333','#fff'];
  return React.createElement('svg',{width:size,height:size,viewBox:'0 0 40 40',style:{flexShrink:0,display:'block'}},
    React.createElement('circle',{cx:20,cy:20,r:19,fill:bg,stroke:acc,strokeWidth:2.5}),
    React.createElement('text',{x:20,y:26,textAnchor:'middle',fontSize:11,fontWeight:900,fontFamily:'Arial,sans-serif',fill:acc,letterSpacing:-0.5},(code||'?').slice(0,3))
  );
}

function Spinner(){return <div style={{width:36,height:36,border:'3px solid '+C.d4,borderTop:'3px solid '+C.teal,borderRadius:'50%',margin:'0 auto',animation:'spin 1s linear infinite'}}/>;}

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
  return{data,loading,error};
}

function MatchRow({m}){
  const hc=TCODE[m.homeTeam?.name]||'???';
  const ac=TCODE[m.awayTeam?.name]||'???';
  const hs=TSHORT[m.homeTeam?.name]||m.homeTeam?.name||'';
  const as2=TSHORT[m.awayTeam?.name]||m.awayTeam?.name||'';
  const hg=m.score?.fullTime?.home;
  const ag=m.score?.fullTime?.away;
  const live=m.status==='IN_PLAY'||m.status==='PAUSED';
  const fin=m.status==='FINISHED';
  const col=live?C.orange:fin?(hg>ag?C.teal:ag>hg?C.red:C.yellow):C.d4;
  const dt=new Date(m.utcDate);
  const dateStr=dt.toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'});
  const timeStr=dt.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
  return(
    <div style={{background:C.d2,borderLeft:'3px solid '+col,borderRadius:9,marginBottom:5,padding:'10px 12px',display:'flex',alignItems:'center',gap:8}}>
      <div style={{fontSize:10,fontWeight:700,color:live?C.orange:C.muted,flexShrink:0,minWidth:72}}>{live?'LIVE':fin?dateStr:dateStr+' '+timeStr}</div>
      <Badge code={hc} size={20}/>
      <span style={{fontWeight:700,fontSize:13,flex:1,color:fin&&hg>ag?C.white:C.text,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{hs}</span>
      <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:22,color:live?C.orange:fin?C.white:C.muted,letterSpacing:3,flexShrink:0,minWidth:50,textAlign:'center'}}>{fin||live?hg+'-'+ag:'v'}</div>
      <span style={{fontWeight:700,fontSize:13,flex:1,textAlign:'right',color:fin&&ag>hg?C.white:C.text,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{as2}</span>
      <Badge code={ac} size={20}/>
    </div>
  );
}

function Live(){
  const {data,loading}=useApi('/api/matches/today',60000);
  const {data:liveData}=useApi('/api/matches/live',30000);
  const liveIds=new Set((liveData?.matches||[]).map(m=>m.id));
  const matches=(data?.matches||[]).map(m=>liveIds.has(m.id)?{...m,status:'IN_PLAY'}:m);
  const live=matches.filter(m=>m.status==='IN_PLAY'||m.status==='PAUSED');
  const upcoming=matches.filter(m=>m.status==='SCHEDULED'||m.status==='TIMED');
  const finished=matches.filter(m=>m.status==='FINISHED');
  return(
    <div style={{padding:16,paddingBottom:80}}>
      <div style={{marginBottom:16}}>
        <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:28,color:C.white,letterSpacing:1.5}}>LIVE <span style={{color:C.orange}}>SCORES</span></div>
        <div style={{fontSize:11,color:C.muted}}>Auto-refreshes every 30 seconds</div>
      </div>
      {loading&&<div style={{textAlign:'center',padding:40}}><Spinner/></div>}
      {!loading&&live.length===0&&upcoming.length===0&&finished.length===0&&<div style={{textAlign:'center',padding:40,color:C.muted,fontSize:13}}>No matches today</div>}
      {live.length>0&&<><div style={{fontSize:10,fontWeight:700,color:C.orange,letterSpacing:.8,marginBottom:8,textTransform:'uppercase'}}>● Live Now</div>{live.map(m=><MatchRow key={m.id} m={m}/>)}</>}
      {upcoming.length>0&&<><div style={{fontSize:10,fontWeight:700,color:C.muted,letterSpacing:.8,marginBottom:8,marginTop:12,textTransform:'uppercase'}}>Upcoming Today</div>{upcoming.map(m=><MatchRow key={m.id} m={m}/>)}</>}
      {finished.length>0&&<><div style={{fontSize:10,fontWeight:700,color:C.muted,letterSpacing:.8,marginBottom:8,marginTop:12,textTransform:'uppercase'}}>Full Time</div>{finished.map(m=><MatchRow key={m.id} m={m}/>)}</>}
    </div>
  );
}

function Fixtures(){
  const {data,loading,error}=useApi('/api/matches',300000);
  const [filter,setFilter]=useState('ALL');
  const [openGW,setOpenGW]=useState(null);
  const CLUBS=Object.keys(CC);
  const matches=data?.matches||[];
  const byGW={};
  matches.forEach(m=>{const g=m.matchday;if(!byGW[g])byGW[g]=[];byGW[g].push(m);});
  const shown=filter==='ALL'?matches:matches.filter(m=>TCODE[m.homeTeam?.name]===filter||TCODE[m.awayTeam?.name]===filter);
  const shownByGW={};
  shown.forEach(m=>{const g=m.matchday;if(!shownByGW[g])shownByGW[g]=[];shownByGW[g].push(m);});
  const gws=Object.keys(shownByGW).map(Number).sort((a,b)=>b-a);
  useEffect(()=>{if(gws.length&&openGW===null)setOpenGW(gws[0]);},[gws.length]);
  if(loading)return<div style={{padding:40,textAlign:'center'}}><Spinner/></div>;
  if(error)return<div style={{padding:24,color:C.red,fontSize:13}}>{error}</div>;
  return(
    <div style={{padding:16,paddingBottom:80}}>
      <div style={{marginBottom:14}}>
        <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:28,color:C.white,letterSpacing:1.5}}>FIXTURES <span style={{color:C.teal}}>2025-26</span></div>
        <div style={{fontSize:11,color:C.muted}}>{matches.length} matches from football-data.org</div>
      </div>
      <div style={{display:'flex',gap:4,overflowX:'auto',paddingBottom:6,marginBottom:12,alignItems:'center'}}>
        <button onClick={()=>setFilter('ALL')} style={{flexShrink:0,padding:'4px 10px',borderRadius:7,cursor:'pointer',fontSize:11,fontWeight:700,border:'1px solid '+(filter==='ALL'?C.teal:C.d4),background:filter==='ALL'?'rgba(0,255,212,.1)':C.d2,color:filter==='ALL'?C.teal:C.muted}}>All</button>
        {CLUBS.map(s=><div key={s} onClick={()=>setFilter(s===filter?'ALL':s)} style={{flexShrink:0,borderRadius:6,padding:2,cursor:'pointer',border:'2px solid '+(filter===s?C.teal:C.d4),background:filter===s?'rgba(0,255,212,.08)':C.d2}}><Badge code={s} size={22}/></div>)}
      </div>
      {gws.map(gw=>(
        <div key={gw} style={{marginBottom:6}}>
          <div onClick={()=>setOpenGW(openGW===gw?null:gw)} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 12px',background:C.d3,borderRadius:8,cursor:'pointer',marginBottom:openGW===gw?4:0}}>
            <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:15,color:C.white,letterSpacing:.5}}>MATCHDAY {gw}</div>
            <div style={{color:C.muted,fontSize:13}}>{openGW===gw?'▲':'▼'}</div>
          </div>
          {openGW===gw&&shownByGW[gw].map(m=><MatchRow key={m.id} m={m}/>)}
        </div>
      ))}
    </div>
  );
}

function Table(){
  const {data,loading,error}=useApi('/api/standings',300000);
  const table=data?.standings?.[0]?.table||[];
  const ZC={4:C.blue,5:C.orange,6:C.yellow,18:C.red,19:C.red,20:C.red};
  if(loading)return<div style={{padding:40,textAlign:'center'}}><Spinner/></div>;
  if(error)return<div style={{padding:24,color:C.red,fontSize:13}}>{error}</div>;
  return(
    <div style={{padding:16,paddingBottom:80}}>
      <div style={{marginBottom:14}}>
        <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:28,color:C.white,letterSpacing:1.5}}>PL <span style={{color:C.teal}}>TABLE</span></div>
        <div style={{fontSize:11,color:C.muted}}>Live standings 2025-26</div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'24px 1fr 28px 28px 28px 36px 46px',gap:4,padding:'4px 10px',marginBottom:4}}>
        {['#','','P','W','D','GD','Pts'].map((h,i)=><div key={i} style={{fontSize:10,fontWeight:700,color:C.muted,textAlign:i>1?'center':'left'}}>{h}</div>)}
      </div>
      {table.map(row=>{
        const code=TCODE[row.team?.name]||'???';
        const zc=ZC[row.position];
        return(
          <div key={row.position} style={{display:'grid',gridTemplateColumns:'24px 1fr 28px 28px 28px 36px 46px',gap:4,padding:'8px 10px',alignItems:'center',background:C.d2,borderRadius:8,marginBottom:3,borderLeft:'3px solid '+(zc||C.d4)}}>
            <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:13,color:zc||C.muted}}>{row.position}</div>
            <div style={{display:'flex',alignItems:'center',gap:6,minWidth:0}}>
              <Badge code={code} size={18}/>
              <span style={{fontSize:12,fontWeight:700,color:C.text,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{TSHORT[row.team?.name]||row.team?.name}</span>
            </div>
            <div style={{fontSize:11,color:C.muted,textAlign:'center'}}>{row.playedGames}</div>
            <div style={{fontSize:11,color:C.green,textAlign:'center',fontWeight:600}}>{row.won}</div>
            <div style={{fontSize:11,color:C.yellow,textAlign:'center',fontWeight:600}}>{row.draw}</div>
            <div style={{fontSize:11,color:row.goalDifference>=0?C.text:C.red,textAlign:'center'}}>{row.goalDifference>0?'+':''}{row.goalDifference}</div>
            <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:18,color:C.white,textAlign:'center'}}>{row.points}</div>
          </div>
        );
      })}
      <div style={{marginTop:10,display:'flex',gap:10,flexWrap:'wrap'}}>
        {[['Champions League',C.blue],['Europa League',C.orange],['Conference League',C.yellow],['Relegation',C.red]].map(([l,c])=>(
          <div key={l} style={{display:'flex',alignItems:'center',gap:4,fontSize:10,color:C.muted}}>
            <div style={{width:8,height:8,borderRadius:'50%',background:c}}/>{l}
          </div>
        ))}
      </div>
    </div>
  );
}

function Stats(){
  const {data,loading,error}=useApi('/api/scorers',600000);
  const scorers=data?.scorers||[];
  if(loading)return<div style={{padding:40,textAlign:'center'}}><Spinner/></div>;
  if(error)return<div style={{padding:24,color:C.red,fontSize:13}}>{error}</div>;
  return(
    <div style={{padding:16,paddingBottom:80}}>
      <div style={{marginBottom:14}}>
        <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:28,color:C.white,letterSpacing:1.5}}>TOP <span style={{color:C.teal}}>SCORERS</span></div>
        <div style={{fontSize:11,color:C.muted}}>2025-26 Premier League</div>
      </div>
      {scorers.map((s,i)=>{
        const code=TCODE[s.team?.name]||'???';
        return(
          <div key={i} style={{display:'flex',alignItems:'center',gap:10,background:C.d2,borderRadius:9,padding:'11px 13px',marginBottom:6,borderLeft:'3px solid '+(i===0?C.yellow:i===1?'#C0C0C0':i===2?'#CD7F32':C.d4)}}>
            <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:18,color:C.muted,width:22,flexShrink:0}}>{i+1}</div>
            <Badge code={code} size={26}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:700,fontSize:14,color:C.white,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{s.player?.name}</div>
              <div style={{fontSize:11,color:C.muted,marginTop:1}}>{TSHORT[s.team?.name]||s.team?.name}</div>
            </div>
            <div style={{textAlign:'right',flexShrink:0}}>
              <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:28,color:C.teal,lineHeight:1}}>{s.goals}</div>
              <div style={{fontSize:9,color:C.muted,fontWeight:700,letterSpacing:.5}}>GOALS</div>
            </div>
            {s.assists!=null&&<div style={{textAlign:'right',flexShrink:0}}>
              <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:20,color:C.orange,lineHeight:1}}>{s.assists}</div>
              <div style={{fontSize:9,color:C.muted,fontWeight:700,letterSpacing:.5}}>AST</div>
            </div>}
          </div>
        );
      })}
    </div>
  );
}

const TABS=[
  {id:'live',label:'Live',path:'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z'},
  {id:'fixtures',label:'Fixtures',path:'M19 3h-1V1h-2v2H8V1H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11z'},
  {id:'table',label:'Table',path:'M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z'},
  {id:'stats',label:'Stats',path:'M5 9.2h3V19H5V9.2zM10.6 5h2.8v14h-2.8V5zm5.6 8H19v6h-2.8v-6z'},
];

function App(){
  const [tab,setTab]=useState('live');
  return(
    <div style={{minHeight:'100vh',background:C.dark}}>
      <nav style={{background:C.d2,borderBottom:'1px solid '+C.d4,padding:'0 16px',height:52,display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,zIndex:100}}>
        <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:20,color:C.white,letterSpacing:.5,lineHeight:1}}>
          H<span style={{color:C.teal}}>&amp;</span>V
          <div style={{fontSize:8,letterSpacing:3,color:C.teal,fontFamily:'DM Sans,sans-serif',fontWeight:700,marginTop:1,opacity:.8,textTransform:'uppercase'}}>HEADERS &amp; VOLLEYS</div>
        </div>
        <div style={{background:C.d3,border:'1px solid '+C.d4,borderRadius:6,padding:'3px 9px',fontSize:11,fontWeight:600,color:C.muted}}>
          LIVE <span style={{color:C.green,marginLeft:4}}>●</span>
        </div>
      </nav>
      <div style={{animation:'fadeIn .2s ease'}}>
        {tab==='live'&&<Live/>}
        {tab==='fixtures'&&<Fixtures/>}
        {tab==='table'&&<Table/>}
        {tab==='stats'&&<Stats/>}
      </div>
      <div style={{position:'fixed',bottom:0,left:0,right:0,zIndex:200,background:C.d2,borderTop:'1px solid '+C.d4,display:'flex',height:58,maxWidth:520,margin:'0 auto'}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:3,background:'transparent',border:'none',cursor:'pointer',padding:'6px 2px',position:'relative'}}>
            {tab===t.id&&<div style={{position:'absolute',top:0,left:'20%',right:'20%',height:2,borderRadius:'0 0 2px 2px',background:t.id==='live'?C.orange:C.teal}}/>}
            <svg width={20} height={20} viewBox="0 0 24 24" fill={tab===t.id?(t.id==='live'?C.orange:C.teal):C.muted}><path d={t.path}/></svg>
            <span style={{fontSize:9,fontWeight:tab===t.id?700:500,color:tab===t.id?(t.id==='live'?C.orange:C.teal):C.muted,letterSpacing:.3}}>{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
</script>
</body>
</html>`);
});

app.listen(PORT, () => console.log('H&V running on port ' + PORT));
