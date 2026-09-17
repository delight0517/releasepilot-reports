'use strict';
const KEY='app-studio-marketplace-drafts-v1';
const draftsEl=document.getElementById('drafts');
let drafts=JSON.parse(localStorage.getItem(KEY)||'[]');
function save(){localStorage.setItem(KEY,JSON.stringify(drafts));render()}
function card(d){const el=document.createElement('article');el.className='draft';el.innerHTML=`<p class="eyebrow">${d.type==='client'?'고객 요청':'개발자 프로필'}</p><h3></h3><p class="meta"></p><p class="body"></p>`;el.querySelector('h3').textContent=d.title||d.name;el.querySelector('.meta').textContent=d.type==='client'?`${d.platform} · 예산 ${Number(d.budget||0).toLocaleString()}원`:`${d.platform} · ${Number(d.price||0).toLocaleString()}원부터`;el.querySelector('.body').textContent=d.need||`${d.skills}${d.url?' · '+d.url:''}`;return el}
function render(){draftsEl.replaceChildren(...(drafts.length?drafts.map(card):[Object.assign(document.createElement('p'),{className:'empty',textContent:'아직 초안이 없습니다. 위에서 하나 만들어보세요.'})]))}
function bind(form,type){form.addEventListener('submit',e=>{e.preventDefault();if(!form.reportValidity())return;const d={type,...Object.fromEntries(new FormData(form)),createdAt:new Date().toISOString()};drafts.unshift(d);save();form.reset();const out=document.getElementById(type==='client'?'client-output':'dev-output');out.hidden=false;out.textContent='초안을 저장했어요. 이 데이터는 현재 브라우저 안에만 있습니다.'})}
bind(document.getElementById('client-form'),'client');bind(document.getElementById('dev-form'),'developer');document.getElementById('clear').addEventListener('click',()=>{drafts=[];save()});render();
