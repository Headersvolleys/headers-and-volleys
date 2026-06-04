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


app.post('/api/ai-reply', async (req, res) => {
  try {
    const {channel, messages} = req.body;
    const context = (messages||[]).map(m => m.name+': '+m.text).join('\n');
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {'Content-Type':'application/json','x-api-key': process.env.ANTHROPIC_API_KEY||''},
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 150,
        messages: [{role:'user',content:'You are a football fan chatbot. Reply naturally to this Premier League chat in 1-2 sentences:\n'+context}]
      })
    });
    const d = await r.json();
    res.json({reply: d.content?.[0]?.text || 'No reply'});
  } catch(e) { res.status(500).json({error: e.message}); }
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
const C={dark:'#070B10',d2:'#0D1420',d3:'#141D2C',d4:'#1C2738',white:'#fff',text:'#E8F0FA',muted:'#8899AA',teal:'#00FFD4',green:'#00E676',red:'#FF3D3D',yellow:'#FFD600',orange:'#FF8000',blue:'#2979FF',gold:'#FFD700'};
const TCODE={'Arsenal':'ARS','Aston Villa':'AVL','Brighton & Hove Albion':'BHA','AFC Bournemouth':'BOU','Brentford':'BRE','Burnley':'BUR','Chelsea':'CHE','Crystal Palace':'CRY','Everton':'EVE','Fulham':'FUL','Leeds United':'LEE','Liverpool':'LIV','Manchester City':'MCI','Manchester United':'MUN','Newcastle United':'NEW','Nottingham Forest':'NFO','Sunderland AFC':'SUN','Tottenham Hotspur':'TOT','West Ham United':'WHU','Wolverhampton Wanderers':'WOL'};
const TSHORT={'Arsenal':'Arsenal','Aston Villa':'Aston Villa','Brighton & Hove Albion':'Brighton','AFC Bournemouth':'Bournemouth','Brentford':'Brentford','Burnley':'Burnley','Chelsea':'Chelsea','Crystal Palace':'Crystal Palace','Everton':'Everton','Fulham':'Fulham','Leeds United':'Leeds','Liverpool':'Liverpool','Manchester City':'Man City','Manchester United':'Man Utd','Newcastle United':'Newcastle','Nottingham Forest':'Nottm Forest','Sunderland AFC':'Sunderland','Tottenham Hotspur':'Spurs','West Ham United':'West Ham','Wolverhampton Wanderers':'Wolves'};
const CC={'ARS':['#EF0107','#FFD700'],'AVL':['#670E36','#95BFE5'],'BHA':['#0057B8','#fff'],'BOU':['#DA291C','#000'],'BRE':['#E30613','#fff'],'BUR':['#6C1D45','#97D700'],'CHE':['#034694','#FFD700'],'CRY':['#1B458F','#C4122E'],'EVE':['#003399','#FFD700'],'FUL':['#CC0000','#fff'],'LEE':['#FFCD00','#1D428A'],'LIV':['#C8102E','#FFD700'],'MCI':['#6CABDD','#1C2C5B'],'MUN':['#DA291C','#FFD700'],'NEW':['#241F20','#fff'],'NFO':['#DD0000','#fff'],'SUN':['#EB172B','#fff'],'TOT':['#132257','#fff'],'WHU':['#7A263A','#60CDFF'],'WOL':['#231F20','#FDB913']};

// Global crest cache - populated from football-data.org /teams endpoint
const CRESTS = {};

function Badge({code,size=24}){
  const [bg,acc]=CC[code]||['#333','#fff'];
  const [err,setErr]=useState(false);
  const crest=CRESTS[code];
  if(crest&&!err){
    return(
      <div style={{width:size,height:size,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center'}}>
        <img src={crest} width={size} height={size} style={{objectFit:'contain',display:'block'}}
          onError={()=>setErr(true)} alt={code}/>
      </div>
    );
  }
  return React.createElement('svg',{width:size,height:size,viewBox:'0 0 40 40',style:{flexShrink:0,display:'block'}},
    React.createElement('circle',{cx:20,cy:20,r:19,fill:bg,stroke:acc,strokeWidth:2.5}),
    React.createElement('text',{x:20,y:26,textAnchor:'middle',fontSize:11,fontWeight:900,fontFamily:'Arial,sans-serif',fill:acc,letterSpacing:-0.5},(code||'?').slice(0,3))
  );
}

// Load crests once on app start
function useCrests(){
  useEffect(()=>{
    if(Object.keys(CRESTS).length>0) return;
    fetch('/api/teams').then(r=>r.json()).then(d=>{
      (d.teams||[]).forEach(t=>{
        const code=TCODE[t.name];
        if(code&&t.crest) CRESTS[code]=t.crest;
      });
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

// -- MATCH DETAIL MODAL ------------------------------------
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
  const goals=detail?.goals||[];
  const bookings=detail?.bookings||[];
  function getForm(fd,tid){
    return (fd?.matches||[]).slice(-5).reverse().map(m=>{
      const ih=m.homeTeam?.id===tid;
      const mh=m.score?.fullTime?.home, ma=m.score?.fullTime?.away;
      if(mh==null) return null;
      return mh===ma?'D':(ih?mh>ma:ma>mh)?'W':'L';
    }).filter(Boolean);
  }
  const tS={padding:'6px 10px',borderRadius:7,border:'1px solid '+C.d4,background:'transparent',color:C.muted,fontFamily:'DM Sans,sans-serif',fontSize:11,fontWeight:700,cursor:'pointer'};
  const tA={...tS,borderColor:C.teal,color:C.teal,background:'rgba(0,255,212,.08)'};
  return(
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.85)',zIndex:500,display:'flex',alignItems:'flex-end',justifyContent:'center'}} onClick={onClose}>
      <div style={{background:C.d2,borderRadius:'18px 18px 0 0',width:'100%',maxWidth:520,maxHeight:'85vh',overflowY:'auto',animation:'slideUp .25s ease'}} onClick={e=>e.stopPropagation()}>
        <div style={{padding:'16px 16px 12px',borderBottom:'1px solid '+C.d4,position:'sticky',top:0,background:C.d2,zIndex:1}}>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
            <div style={{flex:1,display:'flex',alignItems:'center',gap:8}}><Badge code={hc} size={28}/><span style={{fontWeight:700,fontSize:15,color:C.white}}>{TSHORT[match.homeTeam?.name]}</span></div>
            <div style={{textAlign:'center',flexShrink:0}}>
              <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:32,color:C.white,letterSpacing:4,lineHeight:1}}>{finished?hg+'-'+ag:'vs'}</div>
              <div style={{fontSize:10,color:C.muted,marginTop:2}}>{finished?'Full Time':new Date(match.utcDate).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})}</div>
            </div>
            <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'flex-end',gap:8}}><span style={{fontWeight:700,fontSize:15,color:C.white,textAlign:'right'}}>{TSHORT[match.awayTeam?.name]}</span><Badge code={ac} size={28}/></div>
          </div>
          <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
            {['goals','h2h','form','cards'].map(t=><button key={t} onClick={()=>setTab(t)} style={tab===t?tA:tS}>{t.toUpperCase()}</button>)}
            <button onClick={onClose} style={{...tS,marginLeft:'auto'}}>Close</button>
          </div>
        </div>
        <div style={{padding:16}}>
          {tab==='goals'&&(
            <div>
              {goals.length===0&&!detail&&<div style={{textAlign:'center',padding:20}}><Spinner size={24}/></div>}
              {goals.length===0&&detail&&<div style={{color:C.muted,fontSize:13,textAlign:'center',padding:20}}>{finished?'No goals recorded':'Match not yet played'}</div>}
              {goals.map((g,i)=>{
                const ih=g.team?.id===match.homeTeam?.id;
                return(<div key={i} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 0',borderBottom:'1px solid rgba(255,255,255,.05)'}}>
                  {ih?(<><div style={{flex:1}}><div style={{fontWeight:700,fontSize:13,color:C.white}}>{g.scorer?.name}</div>{g.assist?.name&&<div style={{fontSize:11,color:C.muted}}>Assist: {g.assist.name}</div>}</div><div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:14,color:C.teal,flexShrink:0}}>{g.minute}&apos;</div><div style={{fontSize:16}}>[G]</div><div style={{width:55}}/></>)
                  :(<><div style={{width:55}}/><div style={{fontSize:16}}>[G]</div><div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:14,color:C.teal,flexShrink:0}}>{g.minute}&apos;</div><div style={{flex:1,textAlign:'right'}}><div style={{fontWeight:700,fontSize:13,color:C.white}}>{g.scorer?.name}</div>{g.assist?.name&&<div style={{fontSize:11,color:C.muted}}>Assist: {g.assist.name}</div>}</div></>)}
                </div>);
              })}
              {detail?.score?.halfTime?.home!=null&&<div style={{textAlign:'center',marginTop:12,fontSize:12,color:C.muted}}>Half time: {detail.score.halfTime.home} - {detail.score.halfTime.away}</div>}
            </div>
          )}
          {tab==='h2h'&&(
            <div>
              {!h2h&&<div style={{textAlign:'center',padding:20}}><Spinner size={24}/></div>}
              {h2h&&<>
                {h2h.aggregates&&<div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:14}}>
                  {[[h2h.aggregates.homeTeam?.wins||0,TSHORT[match.homeTeam?.name],hc],[h2h.aggregates.numberOfMatches||0,'Played',null],[h2h.aggregates.awayTeam?.wins||0,TSHORT[match.awayTeam?.name],ac]].map(([v,l,code],i)=>(
                    <div key={i} style={{background:C.d3,borderRadius:9,padding:'10px 8px',textAlign:'center'}}>
                      {code&&<div style={{display:'flex',justifyContent:'center',marginBottom:4}}><Badge code={code} size={18}/></div>}
                      <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:24,color:C.teal,lineHeight:1}}>{v}</div>
                      <div style={{fontSize:10,color:C.muted,marginTop:2}}>{l}</div>
                    </div>
                  ))}
                </div>}
                <div style={{fontSize:10,fontWeight:700,color:C.muted,letterSpacing:.6,textTransform:'uppercase',marginBottom:8}}>Last 5 Meetings</div>
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
          {tab==='cards'&&(
            <div>
              {!detail&&<div style={{textAlign:'center',padding:20}}><Spinner size={24}/></div>}
              {detail&&bookings.length===0&&<div style={{color:C.muted,fontSize:13,textAlign:'center',padding:20}}>No bookings recorded</div>}
              {bookings.map((b,i)=>{
                const ih=b.team?.id===match.homeTeam?.id;
                return(<div key={i} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 0',borderBottom:'1px solid rgba(255,255,255,.05)'}}>
                  <div style={{width:10,height:14,background:b.card==='RED_CARD'?C.red:C.yellow,borderRadius:2,flexShrink:0}}/>
                  <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:13,color:C.teal,flexShrink:0,width:30}}>{b.minute}&apos;</div>
                  <div style={{fontWeight:700,fontSize:13,color:C.white,flex:1}}>{b.player?.name}</div>
                  <Badge code={ih?hc:ac} size={18}/>
                </div>);
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// -- TEAM MODAL --------------------------------------------
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
      <div style={{fontSize:10,fontWeight:700,color:live?C.orange:C.muted,flexShrink:0,minWidth:72}}>{live?'* LIVE':fin?dateStr:dateStr+' '+timeStr}</div>
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
          <div key={i} style={{display:'flex',alignItems:'center',gap:10,background:C.d2,borderRadius:9,padding:'11px 13px',marginBottom:6,borderLeft:'3px solid '+(i===0?C.gold:i===1?'#C0C0C0':i===2?'#CD7F32':C.d4)}}>
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

// -- PREDICTIONS + LEAGUE ----------------------------------
function Predictions(){
  const {data:allMatches,loading}=useApi('/api/matches',300000);
  const [preds,setPreds]=useState(()=>{try{return JSON.parse(localStorage.getItem('hav_preds')||'{}')}catch(e){return{}}});
  const [name,setName]=useState(()=>localStorage.getItem('hav_name')||'');
  const [nameInput,setNameInput]=useState('');
  const [view,setView]=useState('predict'); // predict | league
  const [gw,setGw]=useState(null);

  // Get upcoming + recent matches
  const matches=allMatches?.matches||[];
  // Find current/next matchday with unpredicted or upcoming fixtures
  const upcoming=matches.filter(m=>m.status==='SCHEDULED'||m.status==='TIMED');
  const finished=matches.filter(m=>m.status==='FINISHED');

  // Group upcoming by matchday
  const upcomingGWs=[...new Set(upcoming.map(m=>m.matchday))].sort((a,b)=>a-b);
  const activeGW=gw||upcomingGWs[0]||null;
  const gwMatches=activeGW?upcoming.filter(m=>m.matchday===activeGW):[];

  // Auto-score predictions against real results from football-data.org
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

  // League - build leaderboard from all users stored predictions
  // In a real multi-user app this would be server-side; here we show personal stats
  const leagueData=[
    {name:name||'You',pts:totalPoints,exact:exactScores,correct:correctOutcomes,you:true},
  ];

  const tS={padding:'7px 14px',borderRadius:8,border:'1px solid '+C.d4,background:'transparent',color:C.muted,fontFamily:'DM Sans,sans-serif',fontSize:12,fontWeight:700,cursor:'pointer'};
  const tA={...tS,borderColor:C.teal,color:C.teal,background:'rgba(0,255,212,.08)'};

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
      {/* Header */}
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

      {/* Sub nav */}
      <div style={{display:'flex',gap:6,marginBottom:14}}>
        <button onClick={()=>setView('predict')} style={view==='predict'?tA:tS}>Predict</button>
        <button onClick={()=>setView('league')} style={view==='league'?tA:tS}>League</button>
        <button onClick={()=>setView('results')} style={view==='results'?tA:tS}>My Results</button>
      </div>

      {/* PREDICT VIEW */}
      {view==='predict'&&(
        <div>
          {loading&&<div style={{textAlign:'center',padding:40}}><Spinner/></div>}
          {!loading&&gwMatches.length===0&&<div style={{textAlign:'center',padding:32,color:C.muted,fontSize:13}}>No upcoming fixtures to predict</div>}
          {/* GW selector */}
          {upcomingGWs.length>1&&(
            <div style={{display:'flex',gap:4,overflowX:'auto',paddingBottom:4,marginBottom:12}}>
              {upcomingGWs.map(g=>(
                <button key={g} onClick={()=>setGw(g)} style={{flexShrink:0,padding:'4px 10px',borderRadius:7,border:'1px solid '+(activeGW===g?C.teal:C.d4),background:activeGW===g?'rgba(0,255,212,.1)':C.d2,color:activeGW===g?C.teal:C.muted,fontSize:11,fontWeight:700,cursor:'pointer'}}>GW{g}</button>
              ))}
            </div>
          )}
          {gwMatches.map(m=>{
            const hc=TCODE[m.homeTeam?.name]||'???', ac=TCODE[m.awayTeam?.name]||'???';
            const p=preds[m.id]||{};
            const saved=p.saved;
            return(
              <div key={m.id} style={{background:saved?'rgba(0,255,212,.04)':C.d2,border:'1px solid '+(saved?C.teal:C.d4),borderRadius:13,padding:'12px 14px',marginBottom:10}}>
                <div style={{fontSize:10,fontWeight:700,color:C.muted,marginBottom:8}}>
                  {new Date(m.utcDate).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})} - {new Date(m.utcDate).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}
                  {saved&&<span style={{marginLeft:8,color:C.teal}}>OK Saved</span>}
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

      {/* LEAGUE VIEW */}
      {view==='league'&&(
        <div>
          <div style={{background:C.d3,borderRadius:12,padding:'14px 16px',marginBottom:14,textAlign:'center'}}>
            <div style={{fontSize:12,color:C.muted,marginBottom:4}}>Your total score</div>
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
            Points are awarded automatically when matches finish using live data from football-data.org.
            <br/>3pts = exact score - 1pt = correct result - 0pts = wrong
          </div>
        </div>
      )}

      {/* RESULTS VIEW */}
      {view==='results'&&(
        <div>
          {finished.filter(m=>preds[m.id]?.saved).length===0&&<div style={{textAlign:'center',padding:32,color:C.muted,fontSize:13}}>No scored predictions yet</div>}
          {finished.filter(m=>preds[m.id]?.saved).reverse().map(m=>{
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
                    {' '}- Result: <span style={{color:C.teal,fontWeight:700}}>{hg2}-{ag2}</span>
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

// -- QUIZ --------------------------------------------------
// Answer matching - accepts abbreviations and common alternatives
function matchAnswer(typed, accepted) {
  const t = typed.trim().toLowerCase();
  const ALIASES = {
    'manchester city':['man city','city','man c'],
    'manchester united':['man utd','man united','man u','united'],
    'tottenham hotspur':['spurs','tottenham','thfc'],
    'wolverhampton wanderers':['wolves','wolverhampton'],
    'west ham united':['west ham','hammers'],
    'nottingham forest':['nottm forest','forest'],
    'newcastle united':['newcastle','newcastle utd','the toon'],
    'brighton & hove albion':['brighton','bhafc'],
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

const QUIZZES=[
  {id:'champions',title:'PL Champions',cat:'History',questions:[
    {q:'Who won the Premier League in 2023-24?',a:['Manchester City','Man City','City'],hint:'Pep Guardiola'},
    {q:'Which club has won the most Premier League titles?',a:['Manchester United','Man Utd','Man United','United'],hint:'13 titles'},
    {q:'Who was the PL top scorer in 2024-25?',a:['Mohamed Salah','Salah','Mo Salah'],hint:'Liverpool forward'},
    {q:'Which club was relegated from the PL in 2024-25?',a:['Leicester','Leicester City','Ipswich','Southampton'],hint:'Multiple correct answers'},
    {q:'Who has scored the most PL goals in history?',a:['Alan Shearer','Shearer'],hint:'260 goals'},
    {q:'Which club won the first ever Premier League in 1992-93?',a:['Manchester United','Man Utd','Man United']},
    {q:'Which team won the 2015-16 title as 5000-1 outsiders?',a:['Leicester','Leicester City']},
    {q:'Who won back-to-back titles in 2018-19 and 2019-20?',a:['Manchester City','Man City','City']},
  ]},
  {id:'managers',title:'PL Managers',cat:'Managers',questions:[
    {q:'Who manages Arsenal in 2025-26?',a:['Mikel Arteta','Arteta']},
    {q:'Who manages Manchester City in 2025-26?',a:['Pep Guardiola','Guardiola']},
    {q:'Which manager has won the most PL titles?',a:['Alex Ferguson','Sir Alex Ferguson','Ferguson']},
    {q:'Who manages Liverpool in 2025-26?',a:['Arne Slot','Slot']},
    {q:'Who replaced Jurgen Klopp at Liverpool?',a:['Arne Slot','Slot']},
    {q:'Who manages Chelsea in 2025-26?',a:['Enzo Maresca','Maresca']},
    {q:'Which manager is known as The Special One?',a:['Jose Mourinho','Mourinho']},
    {q:'Who managed the Invincibles Arsenal side in 2003-04?',a:['Arsene Wenger','Wenger']},
  ]},
  {id:'records',title:'PL Records',cat:'Stats',questions:[
    {q:'What is the highest ever PL season points tally?',a:['100'],hint:'Man City 2017-18'},
    {q:'Who holds the PL record for most assists in a season?',a:['Kevin De Bruyne','De Bruyne','KDB'],hint:'16 assists'},
    {q:'Which club went unbeaten in the entire 2003-04 season?',a:['Arsenal'],hint:'The Invincibles'},
    {q:'Who scored the most goals in a single PL season?',a:['Erling Haaland','Haaland'],hint:'36 goals in 2022-23'},
    {q:'Who scored the fastest PL hat-trick?',a:['Sadio Mane','Mane'],hint:'2 minutes 56 seconds'},
    {q:'Who has made the most PL appearances ever?',a:['Gareth Barry','Barry'],hint:'653 appearances'},
    {q:'What is the record PL winning scoreline?',a:['9-0','9'],hint:'Southampton vs Leicester'},
    {q:'Which club has won the PL most times after Man Utd?',a:['Manchester City','Man City','City'],hint:'6 titles'},
  ]},
  {id:'clubs',title:'Club Knowledge',cat:'Clubs',questions:[
    {q:'Which PL club plays at the Amex Stadium?',a:['Brighton','Brighton & Hove Albion','Brighton and Hove Albion']},
    {q:'Which club has the nickname The Toffees?',a:['Everton']},
    {q:'Which PL club plays at Selhurst Park?',a:['Crystal Palace','Palace']},
    {q:'Which club plays at the London Stadium?',a:['West Ham','West Ham United','Hammers']},
    {q:'Which club has the nickname The Foxes?',a:['Leicester','Leicester City']},
    {q:'What colour shirts do Wolves wear?',a:['Gold','Yellow','Old Gold'],hint:'Old Gold'},
    {q:'Which club plays at Craven Cottage?',a:['Fulham']},
    {q:'Which PL club is nicknamed The Cherries?',a:['Bournemouth','AFC Bournemouth']},
  ]},
];

function MultipleChoiceQuiz({quiz,onFinish}){
  const [idx,setIdx]=useState(0);
  const [answers,setAnswers]=useState({});
  const [chosen,setChosen]=useState(null);
  const [score,setScore]=useState(0);
  const [opts]=useState(()=>quiz.questions.map((q,i)=>{
    const correct=q.a[0];
    const pool=quiz.questions.filter((_,j)=>j!==i).map(x=>x.a[0]);
    return [correct,...pool.sort(()=>Math.random()-0.5).slice(0,3)].sort(()=>Math.random()-0.5);
  }));
  function pick(opt){
    if(chosen!==null) return;
    const q=quiz.questions[idx], ok=opt===q.a[0], ns=score+(ok?1:0);
    if(ok) setScore(ns);
    setChosen(opt); setAnswers(a=>({...a,[idx]:ok?'correct':'wrong'}));
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
        {q.hint&&<div style={{fontSize:11,color:C.muted,marginTop:6,fontStyle:'italic'}}>Hint: {q.hint}</div>}
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        {opts[idx].map((opt,i)=>{
          let bg=C.d3,border=C.d4,col=C.text;
          if(chosen!==null){if(opt===q.a[0]){bg='rgba(0,230,118,.12)';border=C.green;col=C.green;}else if(opt===chosen){bg='rgba(255,61,61,.1)';border=C.red;col=C.red;}}
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
    const q=quiz.questions[idx], typed=draft.trim().toLowerCase();
    const ok=!forceWrong&&matchAnswer(draft,q.a);
    setScore(s=>{const ns=s+(ok?1:0);setAnswers(a=>({...a,[idx]:ok?'correct':'wrong'}));setFlash(ok?'correct':'wrong');setTimeout(()=>{setFlash(null);setFrozen(false);setDraft('');if(idx<quiz.questions.length-1)setIdx(i=>i+1);else onFinish(ns,quiz.questions.length);},600);return ns;});
  }
  const q=quiz.questions[idx], tc=timeLeft<=3?C.red:timeLeft<=5?C.yellow:C.green;
  return(
    <div style={{padding:16,paddingBottom:60}}>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:10}}>
        <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:16,color:C.white}}>{quiz.title}</div>
        <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:22,color:tc,animation:timeLeft<=3?'blink 1s infinite':undefined}}>{timeLeft}</div>
      </div>
      <div style={{height:5,background:C.d4,borderRadius:3,overflow:'hidden',marginBottom:14}}>
        <div style={{width:(timeLeft/TIME*100)+'%',height:'100%',background:tc,transition:'width 1s linear'}}/>
      </div>
      {flash&&<div style={{position:'fixed',inset:0,background:flash==='correct'?'rgba(0,230,118,.2)':'rgba(255,61,61,.2)',zIndex:500,pointerEvents:'none',display:'flex',alignItems:'center',justifyContent:'center'}}><div style={{fontSize:80,color:flash==='correct'?C.green:C.red}}>{flash==='correct'?'OK':'X'}</div></div>}
      <div style={{background:C.d2,border:'1px solid '+C.d4,borderRadius:14,padding:'18px 16px',marginBottom:12}}>
        <div style={{fontSize:10,fontWeight:700,color:C.teal,letterSpacing:.8,textTransform:'uppercase',marginBottom:8}}>Q{idx+1} of {quiz.questions.length}</div>
        <div style={{fontSize:17,fontWeight:700,color:C.white,lineHeight:1.5}}>{q.q}</div>
        {q.hint&&<div style={{fontSize:11,color:C.muted,marginTop:6,fontStyle:'italic'}}>Hint: {q.hint}</div>}
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
  const [answers,setAnswers]=useState({});
  const [revealed,setRevealed]=useState({});
  const [score,setScore]=useState(0);
  const q=quiz.questions[idx];
  function check(){
    const typed=draft.trim().toLowerCase();
    const ok=matchAnswer(draft,q.a);
    const ns=score+(ok?1:0);
    if(ok) setScore(ns);
    setAnswers(a=>({...a,[idx]:ok?'correct':'wrong'}));
    setRevealed(r=>({...r,[idx]:true}));
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
      <div style={{background:C.d2,border:'1px solid '+(revealed[idx]?answers[idx]==='correct'?C.green:C.red:C.d4),borderRadius:14,padding:'18px 16px',marginBottom:14,transition:'border-color .3s'}}>
        <div style={{fontSize:10,fontWeight:700,color:C.teal,letterSpacing:.8,textTransform:'uppercase',marginBottom:8}}>Q{idx+1} of {quiz.questions.length}</div>
        <div style={{fontSize:16,fontWeight:700,color:C.white,lineHeight:1.5}}>{q.q}</div>
        {q.hint&&<div style={{fontSize:11,color:C.muted,marginTop:6,fontStyle:'italic'}}>Hint: {q.hint}</div>}
        {revealed[idx]&&answers[idx]==='wrong'&&<div style={{fontSize:12,color:C.red,marginTop:8,fontWeight:700}}>Answer: {q.a[0]}</div>}
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
            <div key={f.id} onClick={()=>{setFormat(f.id);setView('playing');}} style={{background:C.d2,border:'1px solid '+C.d4,borderRadius:12,padding:'14px 16px',display:'flex',alignItems:'center',gap:12,cursor:'pointer'}} onMouseEnter={e=>e.currentTarget.style.borderColor=C.teal} onMouseLeave={e=>e.currentTarget.style.borderColor=C.d4}>
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

  return(
    <div style={{padding:16,paddingBottom:80}}>
      <div style={{marginBottom:14}}>
        <div style={{fontFamily:'Bebas Neue,sans-serif',fontSize:28,color:C.white,letterSpacing:1.5}}>QUIZ</div>
        <div style={{fontSize:11,color:C.muted}}>Test your football knowledge</div>
      </div>
      {QUIZZES.map(q=>(
        <div key={q.id} onClick={()=>{setActiveQuiz(q);setView('format');}} style={{background:C.d2,border:'1px solid '+C.d4,borderRadius:12,padding:'14px 16px',marginBottom:8,display:'flex',alignItems:'center',gap:12,cursor:'pointer'}} onMouseEnter={e=>e.currentTarget.style.borderColor=C.teal} onMouseLeave={e=>e.currentTarget.style.borderColor=C.d4}>
          <div style={{flex:1}}>
            <div style={{fontWeight:700,fontSize:15,color:C.white,marginBottom:2}}>{q.title}</div>
            <div style={{fontSize:11,color:C.muted}}>{q.questions.length} questions - {q.cat}</div>
          </div>
          <div style={{color:C.muted,fontSize:16}}>{'>'}</div>
        </div>
      ))}
    </div>
  );
}

// -- FORUM -------------------------------------------------
const CHANNELS=[
  {id:'general',name:'General',icon:''},
  {id:'ARS',name:'Arsenal',icon:''},
  {id:'LIV',name:'Liverpool',icon:''},
  {id:'MCI',name:'Man City',icon:''},
  {id:'MUN',name:'Man Utd',icon:''},
  {id:'CHE',name:'Chelsea',icon:''},
  {id:'TOT',name:'Spurs',icon:''},
  {id:'AVL',name:'Aston Villa',icon:''},
  {id:'NEW',name:'Newcastle',icon:''},
  {id:'BHA',name:'Brighton',icon:''},
  {id:'NFO',name:'Nottm Forest',icon:''},
];

const SEED_MSGS={
  general:[
    {name:'FootballFan',text:'What a season so far! Who do you think wins it?',ts:Date.now()-3600000},
    {name:'PremierHead',text:'The top 4 race is so tight this year',ts:Date.now()-1800000},
  ],
  ARS:[
    {name:'GunnerForLife',text:'Arteta has us playing amazing football this season',ts:Date.now()-7200000},
    {name:'NorthLondon',text:'Saka is genuinely world class',ts:Date.now()-3600000},
  ],
  LIV:[
    {name:'KopEnd',text:'Slot has done a brilliant job taking over from Klopp',ts:Date.now()-5400000},
    {name:'AnfieldRoad',text:'Salah still the best in the league',ts:Date.now()-2700000},
  ],
};

function Forum(){
  const [channel,setChannel]=useState('general');
  const [messages,setMessages]=useState(()=>{
    try{return JSON.parse(localStorage.getItem('hav_forum')||'null')||SEED_MSGS;}
    catch(e){return SEED_MSGS;}
  });
  const [draft,setDraft]=useState('');
  const [userName,setUserName]=useState(()=>localStorage.getItem('hav_name')||'You');
  const [aiLoading,setAiLoading]=useState(false);
  const bottomRef=useRef(null);

  const channelMsgs=messages[channel]||[];

  function send(){
    if(!draft.trim()) return;
    const msg={name:userName,text:draft.trim(),ts:Date.now(),you:true};
    const next={...messages,[channel]:[...channelMsgs,msg]};
    setMessages(next);
    localStorage.setItem('hav_forum',JSON.stringify(next));
    setDraft('');
    setTimeout(()=>bottomRef.current?.scrollIntoView({behavior:'smooth'}),100);
  }

  async function getAiReply(){
    setAiLoading(true);
    try{
      const r=await fetch('/api/ai-reply',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({channel,messages:channelMsgs.slice(-5)})});
      const d=await r.json();
      if(d.reply){
        const msg={name:'H&V Bot',text:d.reply,ts:Date.now(),bot:true};
        const next={...messages,[channel]:[...channelMsgs,msg]};
        setMessages(next);
        localStorage.setItem('hav_forum',JSON.stringify(next));
      }
    }catch(e){}
    setAiLoading(false);
  }

  return(
    <div style={{display:'flex',flexDirection:'column',height:'calc(100vh - 110px)',paddingBottom:0}}>
      {/* Channel list */}
      <div style={{display:'flex',gap:4,overflowX:'auto',padding:'12px 16px 8px',borderBottom:'1px solid '+C.d4,flexShrink:0}}>
        {CHANNELS.map(ch=>(
          <button key={ch.id} onClick={()=>setChannel(ch.id)} style={{flexShrink:0,padding:'5px 10px',borderRadius:8,border:'1px solid '+(channel===ch.id?C.teal:C.d4),background:channel===ch.id?'rgba(0,255,212,.08)':C.d2,color:channel===ch.id?C.teal:C.muted,fontFamily:'DM Sans,sans-serif',fontSize:11,fontWeight:700,cursor:'pointer',whiteSpace:'nowrap'}}>
            {ch.icon} {ch.name}
          </button>
        ))}
      </div>
      {/* Messages */}
      <div style={{flex:1,overflowY:'auto',padding:'12px 16px',display:'flex',flexDirection:'column',gap:8}}>
        {channelMsgs.map((m,i)=>(
          <div key={i} style={{display:'flex',flexDirection:'column',alignItems:m.you?'flex-end':'flex-start'}}>
            <div style={{fontSize:10,color:C.muted,marginBottom:2,fontWeight:700}}>{m.name} {m.bot&&<span style={{color:C.teal}}>BOT</span>}</div>
            <div style={{background:m.you?'rgba(0,255,212,.12)':m.bot?'rgba(41,121,255,.12)':C.d3,border:'1px solid '+(m.you?C.teal:m.bot?C.blue:C.d4),borderRadius:10,padding:'8px 12px',maxWidth:'80%',fontSize:13,color:C.text,lineHeight:1.5}}>
              {m.text}
            </div>
          </div>
        ))}
        <div ref={bottomRef}/>
      </div>
      {/* Input */}
      <div style={{padding:'8px 16px 16px',borderTop:'1px solid '+C.d4,flexShrink:0,background:C.dark}}>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          <input value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>e.key==='Enter'&&send()} placeholder={'Message #'+(CHANNELS.find(c=>c.id===channel)?.name||channel)+'...'} style={{flex:1,background:C.d3,border:'1px solid '+C.d4,borderRadius:10,color:C.text,fontFamily:'DM Sans,sans-serif',fontSize:13,padding:'10px 12px',outline:'none'}}/>
          <button onClick={getAiReply} disabled={aiLoading} style={{padding:'10px 10px',borderRadius:10,border:'1px solid rgba(41,121,255,.3)',background:'rgba(41,121,255,.08)',color:C.blue,fontFamily:'DM Sans,sans-serif',fontSize:11,fontWeight:700,cursor:'pointer',flexShrink:0,whiteSpace:'nowrap'}}>{aiLoading?'...':'AI'}</button>
          <button onClick={send} disabled={!draft.trim()} style={{width:40,height:40,borderRadius:'50%',border:'none',background:draft.trim()?C.teal:C.d4,color:C.dark,cursor:draft.trim()?'pointer':'default',fontSize:18,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>&uarr;</button>
        </div>
      </div>
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
  {id:'quiz',label:'Quiz',path:'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z'},
  {id:'forum',label:'Forum',path:'M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z'},
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
        {tab==='forum'&&<Forum/>}
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

</script>
</body>
</html>`);
});

app.listen(PORT, () => console.log('H&V running on port ' + PORT));
