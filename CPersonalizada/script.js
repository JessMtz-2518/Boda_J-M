const audio = document.getElementById("song");
const playBtn = document.getElementById("playBtn");
const seek = document.getElementById("seek");
const current = document.getElementById("current");
const duration = document.getElementById("duration");
const card = document.querySelector(".player-card");

function fmt(s){
  if (!Number.isFinite(s)) return "--:--";
  const m = Math.floor(s/60);
  const sec = Math.floor(s%60).toString().padStart(2,"0");
  return `${m}:${sec}`;
}
audio.addEventListener("loadedmetadata",()=> duration.textContent=fmt(audio.duration));
playBtn.addEventListener("click",async()=>{
  if(audio.paused){ await audio.play(); }
  else{ audio.pause(); }
});
audio.addEventListener("play",()=>{
  playBtn.textContent="❚❚"; playBtn.setAttribute("aria-label","Pausar canción"); card.classList.add("playing");
});
audio.addEventListener("pause",()=>{
  playBtn.textContent="▶"; playBtn.setAttribute("aria-label","Reproducir canción"); card.classList.remove("playing");
});
audio.addEventListener("timeupdate",()=>{
  current.textContent=fmt(audio.currentTime);
  seek.value=audio.duration ? (audio.currentTime/audio.duration)*100 : 0;
});
seek.addEventListener("input",()=>{
  if(audio.duration) audio.currentTime=(seek.value/100)*audio.duration;
});