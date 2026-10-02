const a=document.getElementById("song"),b=document.getElementById("playBtn"),s=document.getElementById("seek"),c=document.getElementById("current"),d=document.getElementById("duration"),card=document.querySelector(".player-card");
const f=x=>Number.isFinite(x)?`${Math.floor(x/60)}:${Math.floor(x%60).toString().padStart(2,"0")}`:"--:--";
a.addEventListener("loadedmetadata",()=>d.textContent=f(a.duration));
b.addEventListener("click",async()=>a.paused?await a.play():a.pause());
a.addEventListener("play",()=>{b.textContent="❚❚";card.classList.add("playing")});
a.addEventListener("pause",()=>{b.textContent="▶";card.classList.remove("playing")});
a.addEventListener("timeupdate",()=>{c.textContent=f(a.currentTime);s.value=a.duration?a.currentTime/a.duration*100:0});
s.addEventListener("input",()=>{if(a.duration)a.currentTime=s.value/100*a.duration});