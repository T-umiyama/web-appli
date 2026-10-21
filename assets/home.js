'use strict';
(function(){
const $=id=>document.getElementById(id), grid=$('app-grid'), search=$('search'), category=$('category');
const el=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls||'';if(text!==undefined)n.textContent=text;return n;};
let apps;
try { apps=AppCatalog.validateApps(globalThis.WEB_APPS); }
catch(error){$('empty-state').hidden=false;$('empty-state').replaceChildren(el('h3','', 'アプリ一覧を読み込めませんでした。'),el('p','',error.message));search.disabled=true;category.disabled=true;return;}
$('app-count').textContent=String(apps.length);
for(const name of [...new Set(apps.map(a=>a.category))].sort()){const n=el('option','',name);n.value=name;category.append(n);}
function render(){
const found=AppCatalog.filterApps(apps,search.value,category.value);
grid.replaceChildren(...found.map(app=>{
const card=el('a','app-card');card.href=app.href;
const cover=el('div','card-cover'),symbol=el('span','card-symbol',app.id==='ui-review-tool'?'↖':app.id==='screenshot-annotator'?'⌗':'↗');symbol.setAttribute('aria-hidden','true');
cover.append(symbol,el('span','card-category',app.category));
const body=el('div','card-body');body.append(el('h3','',app.name),el('p','',app.description));
const footer=el('div','card-footer');for(const tag of app.tags)footer.append(el('span','tag',tag));
const arrow=el('span','card-arrow','↗');arrow.setAttribute('aria-hidden','true');footer.append(arrow);body.append(footer);card.append(cover,body);return card;
}));
$('empty-state').hidden=found.length>0;
$('result-status').textContent=apps.length+'件中'+found.length+'件を表示しています。';
}
search.addEventListener('input',render);category.addEventListener('change',render);$('reset-search').addEventListener('click',()=>{search.value='';category.value='';render();search.focus();});render();
})();
