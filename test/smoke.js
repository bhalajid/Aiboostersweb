// ---------------------------------------------------------------
// AIBoosters — automated smoke test
// Loads each page in jsdom, executes its inline JS, and asserts that
// the interactive features actually work. No browser required.
// ---------------------------------------------------------------
const fs=require('fs'), path=require('path');
const {JSDOM,VirtualConsole}=require('jsdom');

const DIR=process.argv[2]||'..';
const PAGES=['index.html','services.html','products.html','approach.html','work.html','contact.html'];
let pass=0, fail=0;
const failures=[];

function check(page,name,cond,detail=''){
  if(cond){pass++;}
  else{fail++;failures.push(`${page} :: ${name}${detail?'  ('+detail+')':''}`);}
}

async function load(file){
  const html=fs.readFileSync(path.join(DIR,file),'utf8');
  const vc=new VirtualConsole();
  const errors=[];
  vc.on('jsdomError',e=>errors.push(e.message));
  vc.on('error',(...a)=>errors.push(a.join(' ')));
  const dom=new JSDOM(html,{
    runScripts:'dangerously', pretendToBeVisual:true, virtualConsole:vc,
    resources:undefined, url:'https://aiboosters.guru/'+file,
    beforeParse(w){
      // stubs jsdom lacks — must exist BEFORE page scripts run
      w.matchMedia=q=>({matches:false,media:q,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});
      w.IntersectionObserver=class{
        constructor(cb){this.cb=cb;}
        observe(el){setTimeout(()=>this.cb([{isIntersecting:true,target:el}],this),0);}
        unobserve(){} disconnect(){}
      };
      w.requestAnimationFrame=cb=>setTimeout(()=>cb(Date.now()),16);
      w.cancelAnimationFrame=id=>clearTimeout(id);
      w.scrollTo=()=>{};
      Object.defineProperty(w,'devicePixelRatio',{value:1});
      // no WebGL in jsdom: the page's capability gate should catch this
      w.HTMLCanvasElement.prototype.getContext=function(){return null;};
    }
  });
  const w=dom.window;
  await new Promise(r=>setTimeout(r,200));
  return {w,d:w.document,errors};
}

(async()=>{
for(const page of PAGES){
  const {w,d,errors}=await load(page);

  // ---- no runtime errors ----
  check(page,'no JS runtime errors',errors.length===0,errors[0]);

  // ---- structure ----
  check(page,'has <main>',!!d.querySelector('main'));
  check(page,'exactly one <h1>',d.querySelectorAll('h1').length===1,
        d.querySelectorAll('h1').length+' found');
  check(page,'skip link present',!!d.querySelector('a.skip'));
  check(page,'favicon present',!!d.querySelector('link[rel="icon"]'));
  check(page,'og:title present',!!d.querySelector('meta[property="og:title"]'));
  check(page,'canonical present',!!d.querySelector('link[rel="canonical"]'));

  // ---- nav links resolve to real files ----
  const links=[...d.querySelectorAll('a[href$=".html"]')].map(a=>a.getAttribute('href'));
  const bad=[...new Set(links)].filter(h=>!fs.existsSync(path.join(DIR,h)));
  check(page,'all internal links resolve',bad.length===0,bad.join(','));

  // ---- images have alt ----
  const noalt=[...d.querySelectorAll('img')].filter(i=>!i.hasAttribute('alt'));
  check(page,'all images have alt',noalt.length===0);

  // ---- assistant panel ----
  const fab=d.getElementById('aiFab'), panel=d.getElementById('aiPanel');
  if(fab&&panel){
    check(page,'assistant closed by default',!panel.classList.contains('open'));
    fab.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
    check(page,'assistant opens on click',panel.classList.contains('open'));
    check(page,'aria-expanded syncs',fab.getAttribute('aria-expanded')==='true');
    const chip=d.querySelector('.chip');
    check(page,'chips keyboard-accessible',chip&&chip.getAttribute('role')==='button'&&chip.hasAttribute('tabindex'));
    if(chip){
      chip.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
      await new Promise(r=>setTimeout(r,50));
      check(page,'chip posts a user message',!!d.querySelector('.ai-msg.user'));
    }
    w.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape'}));
    check(page,'Escape closes assistant',!panel.classList.contains('open'));
  }

  // ---- homepage-only: automation demo ----
  if(page==='index.html'){
    const tabs=[...d.querySelectorAll('.demo-tab')];
    check(page,'demo has 5 scenarios',tabs.length===5,tabs.length+' tabs');
    check(page,'tabs have role=tab',tabs.every(t=>t.getAttribute('role')==='tab'));
    check(page,'tabs focusable',tabs.every(t=>t.hasAttribute('tabindex')));
    const btn=d.getElementById('demoBtn');
    check(page,'automate button disabled before steps load',btn&&btn.disabled===true);
    await new Promise(r=>setTimeout(r,4200));   // let all 5 steps reveal
    check(page,'automate button enabled after reveal',btn&&btn.disabled===false);
    const timer=d.getElementById('demoTimer');
    check(page,'timer accumulated real time',timer&&/h|m|s/.test(timer.textContent)&&timer.textContent!=='0s',
          timer&&timer.textContent);
    if(btn&&!btn.disabled){
      btn.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
      await new Promise(r=>setTimeout(r,1800));
      const badge=d.getElementById('resultBadge');
      check(page,'result badge shows after automating',badge&&badge.classList.contains('show'));
      check(page,'result shows a reduction',badge&&/%/.test(badge.textContent),badge&&badge.textContent.slice(0,40));
    }
    // switching tabs resets
    if(tabs[2]){
      tabs[2].dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
      await new Promise(r=>setTimeout(r,60));
      check(page,'tab switch sets aria-selected',tabs[2].getAttribute('aria-selected')==='true');
      check(page,'tab switch resets button',d.getElementById('demoBtn').textContent.includes('Automate'));
    }
    // nine principles rendered
    check(page,'nine principles rendered',d.querySelectorAll('.nine-row').length===9,
          d.querySelectorAll('.nine-row').length+' rows');
    // sphere label element exists
    check(page,'sphere label element exists',!!d.getElementById('sphereLabel'));
    // hero stays uncluttered: a single capability line, not a pill inventory
    check(page,'hero has no pill inventory',d.querySelectorAll('.hero-pills .pill').length===0);
    const caps=d.querySelector('.hero-caps');
    check(page,'hero capability line present',!!caps);
    check(page,'capability line mentions nine',/nine/i.test(caps?caps.textContent:''));
    check(page,'capability line links to services',!!d.querySelector('.hero-caps a[href="services.html"]'));
  }

  // ---- contact form ----
  if(page==='contact.html'){
    const f=d.getElementById('briefForm');
    check(page,'form present',!!f);
    check(page,'name has autocomplete',d.getElementById('f-name')?.hasAttribute('autocomplete'));
    check(page,'email has autocomplete',d.getElementById('f-email')?.hasAttribute('autocomplete'));
  }

  w.close();
}

console.log('='.repeat(64));
console.log(`SMOKE TEST:  ${pass} passed, ${fail} failed`);
console.log('='.repeat(64));
if(failures.length){console.log('\nFAILURES:');failures.forEach(f=>console.log('  ✗ '+f));}
process.exit(fail?1:0);
})();
