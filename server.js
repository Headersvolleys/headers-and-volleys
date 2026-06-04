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
  try { res.json(await fd('/competitions/PL/scorers?season=2025&limit=20', 10*MIN)); }
  catch(e) { res.status(500).json({ error: e.message }); }
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
@keyframes slideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
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
const TSHORT={'Arsenal':'Arsenal','Aston Villa':'Aston Villa','Brighton & Hove Albion':'Brighton','AFC Bournemouth':'Bournemouth','Brentford':'Brentford','Burnley':'Burnley','Chelsea':'Chelsea','Crystal Palace':'Crystal Palace','Everton':'Everton','Fulham':'Fulham','Leeds United':'Leeds','Liverpool':'Liverpool','Manchester City':'Man City','Manchester United':'Man Utd','Newcastle United':'Newcastle','Nottingham Forest':'Nottm Forest','Sunderland AFC':'Sunderland','Tottenham Hotspur':'Spurs','West Ham United':'West Ham','Wolverhampton Wanderers':'Wolves'};
const CC={'ARS':['#EF0107','#FFD700'],'AVL':['#670E36','#95BFE5'],'BHA':['#0057B8','#fff'],'BOU':['#DA291C','#000'],'BRE':['#E30613','#fff'],'BUR':['#6C1D45','#97D700'],'CHE':['#034694','#FFD700'],'CRY':['#1B458F','#C4122E'],'EVE':['#003399','#FFD700'],'FUL':['#CC0000','#fff'],'LEE':['#FFCD00','#1D428A'],'LIV':['#C8102E','#FFD700'],'MCI':['#6CABDD','#1C2C5B'],'MUN':['#DA291C','#FFD700'],'NEW':['#241F20','#fff'],'NFO':['#DD0000','#fff'],'SUN':['#EB172B','#fff'],'TOT':['#132257','#fff'],'WHU':['#7A263A','#60CDFF'],'WOL':['#231F20','#FDB913']};

function Badge({code,size=24}){
  const [bg,acc]=CC[code]||['#333','#fff'];
  return React.createElement('svg',{width:size,height:size,viewBox:'0 0 40 40',style:{flexShrink:0,display:'block'}},
    React.createElement('circle',{cx:20,cy:20,r:19,fill:bg,stroke:acc,strokeWidth:2.5}),
    React.createElement('text',{x:20,y:26,textAnchor:'middle',fontSize:11,fontWeight:900,fontFamily:'Arial,sans-serif',fill:acc,letterSpacing:-0.5},(code||'?').slice(0,3))
  );
}

function Spinner({size=36}){return <div style={{width:size,height:size,border:'3px solid '+C.d4,borderTop:'3px solid '+C.teal,borderRadius:'50%',margin:'0 auto',animation:'spin 1s linear infinite'}}/>;}

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

// Form badge W/D/L
function FormBadge({result}){
  const col=result==='W'?C.green:result==='D'?C.yellow:C.red;
  return <div style={{width:22,height:22,borderRadius:'50%',background:col,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700,color:C.dark,flexShrink:0}}>{result}</div>;
}

// Match detail modal - shows goals, cards, h2h
function MatchModal({match,onClose}){
  const [detail,setDetail]=useState(null);
  const [h2h,setH2h]=useState(null);
  const [hForm,setHForm]=useState(null);
  const [aForm,setAForm]=useState(null);
  const [tab,setTab]=useState('goals');

  const hc=TCODE[match.homeTeam?.name]||'???';
  const ac=TCODE[match.awayTeam?.name]||'???';
  const hg=match.score?.fullTime?.home;
  const ag=match.score?.fullTime?.away;
  const finished=match.status==='FINISHED';

  useEffect(()=>{
    fetch('/api/match/'+match.id).then(r=>r.json()).then(setDetail).catch(()=>{});
    fetch('/api/h2h/'+match.id).then(r=>r.json()).then(setH2h).catch(()=>{});
    if(match.homeTeam?.id){
      fetch('/api/team/'+match.homeTeam.id+'/matches').then(r=>r.json()).then(setHForm).catch(()=>{});
      fetch('/api/team/'+match.awayTeam.id+'/matches').then(r=>r.json()).then(setAForm).catch(()=>{});
    }
  },[match.id]);

  const goals=(detail?.goals||[]);
  const bookings=(detail?.bookings||[]);
  const homeGoals=goals.filter(g=>g.team?.id===match.homeTeam?.id);
  const awayGoals=goals.filter(g=>g.team?.id===match.awayTeam?.id);

  function getForm(formData,teamId){
    const matches=(formData?.matches||[]).slice(-5).reverse();
    return matches.map(m=>{
      const isHome=m.homeTeam?.id===teamId;
      const hg2=m.score?.fullTime?.home;
      const ag2=m.score?.fullTime?.away;
      if(hg2===null||ag2===null) return null;
      const won=isHome?hg2>ag2:ag2>hg2;
      const draw=hg2===ag2;
      return draw?'D':won?'W':'L';
    }).filter(Boolean);
  }

  const tS={padding:'6px 12px',borderRadius:7,border:'1px solid '+C.d4,background:'transparent',color:C.muted,fontFamily:'DM Sans,sans-serif',fontSize:11,fontWeight:700,cursor:'pointer'};
  const tA={...tS,borderColor:C.teal,color:C.teal,background:'rgba(0,255,212,.08)'};

  return(
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.85)',zIndex:500,display:'flex',alignItems:'flex-end',justifyContent:'center'}} onClick={onClose}>
      <div style={{background:C.d2,borderRadius:'18px 18px 0 0',width:'100%',maxWidth:520,maxHeight:'85vh',overflowY:'auto',animation:'slideUp .25s ease'}} onClick={e=>e.stopPropagation()}>
        {/* Header */}
        <div style={{padding:'16px 16px 12px',borderBottom:'1px solid '+C.d4,position:'sticky',top:0,background:C.d2,zIndex:1}}>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
            <div style={{flex:1,display:'flex',alignItems:'center',gap:8}}>
              <Badge code={hc} size={28}/>
              <span style={{fontWeight:700,fontSize:15,color:C.white}}>{TSHORT[match.homeTeam?.name]}</span>
            </div>
            <div style={{textAlign:'center',flexShrink:0}}>
              <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:32,color:C.white,letterSpacing:4,lineHeight:1}}>
                {finished?hg+'-'+ag:'vs'}
              </div>
              <div style={{fontSize:10,color:C.muted,marginTop:2}}>
                {finished?'Full Time':new Date(match.utcDate).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})}
              </div>
            </div>
            <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'flex-end',gap:8}}>
              <span style={{fontWeight:700,fontSize:15,color:C.white,textAlign:'right'}}>{TSHORT[match.awayTeam?.name]}</span>
              <Badge code={ac} size={28}/>
            </div>
          </div>
          <div style={{display:'flex',gap:6}}>
            {['goals','h2h','form','cards'].map(t=>(
              <button key={t} onClick={()=>setTab(t)} style={tab===t?tA:tS}>{t.toUpperCase()}</button>
            ))}
            <button onClick={onClose} style={{...tS,marginLeft:'auto'}}>Close</button>
          </div>
        </div>

        <div style={{padding:16}}>
          {/* GOALS TAB */}
          {tab==='goals'&&(
            <div>
              {goals.length===0&&!detail&&<div style={{textAlign:'center',padding:20}}><Spinner size={24}/></div>}
              {goals.length===0&&detail&&<div style={{color:C.muted,fontSize:13,textAlign:'center',padding:20}}>{finished?'No goals recorded':'Match not yet played'}</div>}
              {goals.map((g,i)=>{
                const isHome=g.team?.id===match.homeTeam?.id;
                return(
                  <div key={i} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 0',borderBottom:'1px solid rgba(255,255,255,.05)'}}>
                    {isHome?(
                      <>
                        <div style={{flex:1}}>
                          <div style={{fontWeight:700,fontSize:13,color:C.white}}>{g.scorer?.name}</div>
                          {g.assist?.name&&<div style={{fontSize:11,color:C.muted}}>Assist: {g.assist.name}</div>}
                        </div>
                        <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:14,color:C.teal,flexShrink:0}}>{g.minute}&apos;</div>
                        <div style={{fontSize:16,flexShrink:0}}>⚽</div>
                        <div style={{width:60}}/>
                      </>
                    ):(
                      <>
                        <div style={{width:60}}/>
                        <div style={{fontSize:16,flexShrink:0}}>⚽</div>
                        <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:14,color:C.teal,flexShrink:0}}>{g.minute}&apos;</div>
                        <div style={{flex:1,textAlign:'right'}}>
                          <div style={{fontWeight:700,fontSize:13,color:C.white}}>{g.scorer?.name}</div>
                          {g.assist?.name&&<div style={{fontSize:11,color:C.muted}}>Assist: {g.assist.name}</div>}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
              {/* Half time score */}
              {detail?.score?.halfTime?.home!=null&&(
                <div style={{textAlign:'center',marginTop:12,fontSize:12,color:C.muted}}>
                  Half time: {detail.score.halfTime.home} - {detail.score.halfTime.away}
                </div>
              )}
            </div>
          )}

          {/* H2H TAB */}
          {tab==='h2h'&&(
            <div>
              {!h2h&&<div style={{textAlign:'center',padding:20}}><Spinner size={24}/></div>}
              {h2h&&(
                <>
                  {/* Aggregate */}
                  {h2h.aggregates&&(
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:14}}>
                      {[
                        [h2h.aggregates.homeTeam?.wins||0,'Wins',hc],
                        [h2h.aggregates.awayTeam?.wins||0,'Wins',ac],
                        [h2h.aggregates.numberOfMatches||0,'Played',null],
                      ].map(([v,l,code],i)=>(
                        <div key={i} style={{background:C.d3,borderRadius:9,padding:'10px 8px',textAlign:'center'}}>
                          {code&&<div style={{display:'flex',justifyContent:'center',marginBottom:4}}><Badge code={code} size={20}/></div>}
                          <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:24,color:C.teal,lineHeight:1}}>{v}</div>
                          <div style={{fontSize:10,color:C.muted,marginTop:2}}>{l}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{fontSize:10,fontWeight:700,color:C.muted,letterSpacing:.6,textTransform:'uppercase',marginBottom:8}}>Last 5 Meetings</div>
                  {(h2h.matches||[]).slice(0,5).map((m,i)=>{
                    const mhg=m.score?.fullTime?.home;
                    const mag=m.score?.fullTime?.away;
                    const mhc=TCODE[m.homeTeam?.name]||'???';
                    const mac=TCODE[m.awayTeam?.name]||'???';
                    return(
                      <div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 10px',background:C.d3,borderRadius:8,marginBottom:4}}>
                        <div style={{fontSize:10,color:C.muted,flexShrink:0,minWidth:60}}>{new Date(m.utcDate).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'2-digit'})}</div>
                        <Badge code={mhc} size={18}/>
                        <span style={{fontSize:12,fontWeight:700,flex:1,color:C.text,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{TSHORT[m.homeTeam?.name]||m.homeTeam?.name}</span>
                        <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:16,color:C.white,letterSpacing:2,flexShrink:0}}>{mhg}-{mag}</div>
                        <span style={{fontSize:12,fontWeight:700,flex:1,textAlign:'right',color:C.text,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{TSHORT[m.awayTeam?.name]||m.awayTeam?.name}</span>
                        <Badge code={mac} size={18}/>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}

          {/* FORM TAB */}
          {tab==='form'&&(
            <div>
              {(!hForm||!aForm)&&<div style={{textAlign:'center',padding:20}}><Spinner size={24}/></div>}
              {hForm&&aForm&&(
                <>
                  {[[match.homeTeam,hForm,hc],[match.awayTeam,aForm,ac]].map(([team,formData,code])=>{
                    const form=getForm(formData,team?.id);
                    const matches=(formData?.matches||[]).slice(-5).reverse();
                    return(
                      <div key={code} style={{background:C.d3,borderRadius:10,padding:14,marginBottom:10}}>
                        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
                          <Badge code={code} size={24}/>
                          <div style={{fontWeight:700,fontSize:14,color:C.white}}>{TSHORT[team?.name]||team?.name}</div>
                          <div style={{display:'flex',gap:4,marginLeft:'auto'}}>
                            {form.map((r,i)=><FormBadge key={i} result={r}/>)}
                          </div>
                        </div>
                        {matches.map((m,i)=>{
                          const isHome=m.homeTeam?.id===team?.id;
                          const opp=isHome?m.awayTeam:m.homeTeam;
                          const oppCode=TCODE[opp?.name]||'???';
                          const mhg=m.score?.fullTime?.home;
                          const mag=m.score?.fullTime?.away;
                          const won=isHome?mhg>mag:mag>mhg;
                          const draw=mhg===mag;
                          const result=draw?'D':won?'W':'L';
                          const col=result==='W'?C.green:result==='D'?C.yellow:C.red;
                          return(
                            <div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 0',borderTop:'1px solid rgba(255,255,255,.05)'}}>
                              <div style={{fontSize:10,color:C.muted,flexShrink:0,minWidth:55}}>{new Date(m.utcDate).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</div>
                              <div style={{fontSize:10,color:C.muted,flexShrink:0}}>{isHome?'H':'A'}</div>
                              <Badge code={oppCode} size={16}/>
                              <span style={{fontSize:12,flex:1,color:C.text,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{TSHORT[opp?.name]||opp?.name}</span>
                              <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:14,color:C.white,letterSpacing:1,flexShrink:0}}>{mhg}-{mag}</div>
                              <div style={{width:20,height:20,borderRadius:'50%',background:col,display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,fontWeight:700,color:C.dark,flexShrink:0}}>{result}</div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}

          {/* CARDS TAB */}
          {tab==='cards'&&(
            <div>
              {!detail&&<div style={{textAlign:'center',padding:20}}><Spinner size={24}/></div>}
              {detail&&bookings.length===0&&<div style={{color:C.muted,fontSize:13,textAlign:'center',padding:20}}>No bookings recorded</div>}
              {bookings.map((b,i)=>{
                const isHome=b.team?.id===match.homeTeam?.id;
                const cardCol=b.card==='RED_CARD'?C.red:C.yellow;
                return(
                  <div key={i} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 0',borderBottom:'1px solid rgba(255,255,255,.05)'}}>
                    <div style={{width:10,height:14,background:cardCol,borderRadius:2,flexShrink:0}}/>
                    <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:13,color:C.teal,flexShrink:0,width:30}}>{b.minute}&apos;</div>
                    <div style={{fontWeight:700,fontSize:13,color:C.white,flex:1}}>{b.player?.name}</div>
                    <Badge code={isHome?hc:ac} size={18}/>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Team profile modal
function TeamModal({team,onClose}){
  const code=TCODE[team?.name]||'???';
  const {data:teamData,loading}=useApi('/api/team/'+team?.id);
  const {data:formData}=useApi('/api/team/'+team?.id+'/matches');

  const squad=(teamData?.squad||[]);
  const [pos,setPos]=useState('ALL');
  const positions=['ALL','Goalkeeper','Defence','Midfield','Offence'];
  const filtered=pos==='ALL'?squad:squad.filter(p=>p.position===pos);

  const tS={padding:'5px 10px',borderRadius:7,border:'1px solid '+C.d4,background:'transparent',color:C.muted,fontFamily:'DM Sans,sans-serif',fontSize:11,fontWeight:700,cursor:'pointer',flexShrink:0};
  const tA={...tS,borderColor:C.teal,color:C.teal,background:'rgba(0,255,212,.08)'};

  return(
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.85)',zIndex:500,display:'flex',alignItems:'flex-end',justifyContent:'center'}} onClick={onClose}>
      <div style={{background:C.d2,borderRadius:'18px 18px 0 0',width:'100%',maxWidth:520,maxHeight:'85vh',overflowY:'auto',animation:'slideUp .25s ease'}} onClick={e=>e.stopPropagation()}>
        {/* Header */}
        <div style={{padding:16,borderBottom:'1px solid '+C.d4,display:'flex',alignItems:'center',gap:12}}>
          <Badge code={code} size={44}/>
          <div style={{flex:1}}>
            <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:22,color:C.white,letterSpacing:.5,lineHeight:1}}>{TSHORT[team?.name]||team?.name}</div>
            {teamData&&<div style={{fontSize:11,color:C.muted,marginTop:3}}>{teamData.venue} · Est. {teamData.founded}</div>}
          </div>
          <button onClick={onClose} style={{...tS}}>Close</button>
        </div>

        <div style={{padding:16}}>
          {loading&&<div style={{textAlign:'center',padding:20}}><Spinner size={24}/></div>}

          {/* Coach */}
          {teamData?.coach?.name&&(
            <div style={{background:C.d3,borderRadius:9,padding:'10px 13px',marginBottom:12,display:'flex',alignItems:'center',gap:10}}>
              <div style={{fontSize:20}}>👔</div>
              <div>
                <div style={{fontSize:10,fontWeight:700,color:C.muted,letterSpacing:.5,textTransform:'uppercase'}}>Manager</div>
                <div style={{fontWeight:700,fontSize:14,color:C.white,marginTop:1}}>{teamData.coach.name}</div>
                {teamData.coach.nationality&&<div style={{fontSize:11,color:C.muted}}>{teamData.coach.nationality}</div>}
              </div>
            </div>
          )}

          {/* Squad */}
          {squad.length>0&&(
            <>
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
                  <div style={{fontSize:10,color:C.teal,fontWeight:700,flexShrink:0,textAlign:'right'}}>{p.position}</div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function MatchRow({m,onClick}){
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
    <div onClick={()=>onClick&&onClick(m)} style={{background:C.d2,borderLeft:'3px solid '+col,borderRadius:9,marginBottom:5,padding:'10px 12px',display:'flex',alignItems:'center',gap:8,cursor:onClick?'pointer':'default'}}>
      <div style={{fontSize:10,fontWeight:700,color:live?C.orange:C.muted,flexShrink:0,minWidth:72}}>{live?'● LIVE':fin?dateStr:dateStr+' '+timeStr}</div>
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
  const [selectedMatch,setSelectedMatch]=useState(null);
  const liveIds=new Set((liveData?.matches||[]).map(m=>m.id));
  const matches=(data?.matches||[]).map(m=>liveIds.has(m.id)?{...m,status:'IN_PLAY'}:m);
  const live=matches.filter(m=>m.status==='IN_PLAY'||m.status==='PAUSED');
  const upcoming=matches.filter(m=>m.status==='SCHEDULED'||m.status==='TIMED');
  const finished=matches.filter(m=>m.status==='FINISHED');
  return(
    <div style={{padding:16,paddingBottom:80}}>
      {selectedMatch&&<MatchModal match={selectedMatch} onClose={()=>setSelectedMatch(null)}/>}
      <div style={{marginBottom:16}}>
        <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:28,color:C.white,letterSpacing:1.5}}>LIVE <span style={{color:C.orange}}>SCORES</span></div>
        <div style={{fontSize:11,color:C.muted}}>Tap a match for goals, cards, form and H2H</div>
      </div>
      {loading&&<div style={{textAlign:'center',padding:40}}><Spinner/></div>}
      {!loading&&live.length===0&&upcoming.length===0&&finished.length===0&&<div style={{textAlign:'center',padding:40,color:C.muted,fontSize:13}}>No matches today</div>}
      {live.length>0&&<><div style={{fontSize:10,fontWeight:700,color:C.orange,letterSpacing:.8,marginBottom:8,textTransform:'uppercase'}}>● Live Now</div>{live.map(m=><MatchRow key={m.id} m={m} onClick={setSelectedMatch}/>)}</>}
      {upcoming.length>0&&<><div style={{fontSize:10,fontWeight:700,color:C.muted,letterSpacing:.8,marginBottom:8,marginTop:12,textTransform:'uppercase'}}>Upcoming Today</div>{upcoming.map(m=><MatchRow key={m.id} m={m} onClick={setSelectedMatch}/>)}</>}
      {finished.length>0&&<><div style={{fontSize:10,fontWeight:700,color:C.muted,letterSpacing:.8,marginBottom:8,marginTop:12,textTransform:'uppercase'}}>Full Time</div>{finished.map(m=><MatchRow key={m.id} m={m} onClick={setSelectedMatch}/>)}</>}
    </div>
  );
}

function Fixtures(){
  const {data,loading,error}=useApi('/api/matches',300000);
  const [filter,setFilter]=useState('ALL');
  const [openGW,setOpenGW]=useState(null);
  const [selectedMatch,setSelectedMatch]=useState(null);
  const CLUBS=Object.keys(CC);
  const matches=data?.matches||[];
  const shown=filter==='ALL'?matches:matches.filter(m=>TCODE[m.homeTeam?.name]===filter||TCODE[m.awayTeam?.name]===filter);
  const shownByGW={};
  shown.forEach(m=>{const g=m.matchday;if(!shownByGW[g])shownByGW[g]=[];shownByGW[g].push(m);});
  const gws=Object.keys(shownByGW).map(Number).sort((a,b)=>b-a);
  useEffect(()=>{if(gws.length&&openGW===null)setOpenGW(gws[0]);},[gws.length]);
  if(loading)return<div style={{padding:40,textAlign:'center'}}><Spinner/></div>;
  if(error)return<div style={{padding:24,color:C.red,fontSize:13}}>{error}</div>;
  return(
    <div style={{padding:16,paddingBottom:80}}>
      {selectedMatch&&<MatchModal match={selectedMatch} onClose={()=>setSelectedMatch(null)}/>}
      <div style={{marginBottom:14}}>
        <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:28,color:C.white,letterSpacing:1.5}}>FIXTURES <span style={{color:C.teal}}>2025-26</span></div>
        <div style={{fontSize:11,color:C.muted}}>{matches.length} matches — tap any result for details</div>
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
          {openGW===gw&&shownByGW[gw].map(m=><MatchRow key={m.id} m={m} onClick={setSelectedMatch}/>)}
        </div>
      ))}
    </div>
  );
}

function Table(){
  const {data,loading,error}=useApi('/api/standings',300000);
  const [selectedTeam,setSelectedTeam]=useState(null);
  const table=data?.standings?.[0]?.table||[];
  const ZC={4:C.blue,5:C.orange,6:C.yellow,18:C.red,19:C.red,20:C.red};
  if(loading)return<div style={{padding:40,textAlign:'center'}}><Spinner/></div>;
  if(error)return<div style={{padding:24,color:C.red,fontSize:13}}>{error}</div>;
  return(
    <div style={{padding:16,paddingBottom:80}}>
      {selectedTeam&&<TeamModal team={selectedTeam} onClose={()=>setSelectedTeam(null)}/>}
      <div style={{marginBottom:14}}>
        <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:28,color:C.white,letterSpacing:1.5}}>PL <span style={{color:C.teal}}>TABLE</span></div>
        <div style={{fontSize:11,color:C.muted}}>Live standings — tap a team for squad and stats</div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'24px 1fr 28px 28px 28px 28px 36px 46px',gap:3,padding:'4px 10px',marginBottom:4}}>
        {['#','','P','W','D','L','GD','Pts'].map((h,i)=><div key={i} style={{fontSize:10,fontWeight:700,color:C.muted,textAlign:i>1?'center':'left'}}>{h}</div>)}
      </div>
      {table.map(row=>{
        const code=TCODE[row.team?.name]||'???';
        const zc=ZC[row.position];
        return(
          <div key={row.position} onClick={()=>setSelectedTeam(row.team)} style={{display:'grid',gridTemplateColumns:'24px 1fr 28px 28px 28px 28px 36px 46px',gap:3,padding:'8px 10px',alignItems:'center',background:C.d2,borderRadius:8,marginBottom:3,borderLeft:'3px solid '+(zc||C.d4),cursor:'pointer'}}>
            <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:13,color:zc||C.muted}}>{row.position}</div>
            <div style={{display:'flex',alignItems:'center',gap:6,minWidth:0}}>
              <Badge code={code} size={18}/>
              <span style={{fontSize:12,fontWeight:700,color:C.text,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{TSHORT[row.team?.name]||row.team?.name}</span>
            </div>
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
            {s.assists!=null&&<div style={{textAlign:'right',flexShrink:0,marginLeft:4}}>
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
