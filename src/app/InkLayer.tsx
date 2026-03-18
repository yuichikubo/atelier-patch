'use client'
/**
 * ATELIER — Ink Layer (PatchEngine統合版)
 *
 * PatchEngineのイベントと連動し、編集行動の痕跡として落ちる。
 *   block-updated  → 該当ブロック位置に小さなインク
 *   block-added    → 追加ブロック位置に大きなスプラッシュ
 *   section-added  → セクション中央に大きなスプラッシュ
 *   click (canvas) → 余白クリックにインク
 */

import { useEffect, useRef } from 'react'
import { patchEventBus }     from '@/core/patch/eventBus'

const INKS = [
  [0.43, 0.16, 0.12],
  [0.04, 0.28, 0.62],
  [0.06, 0.44, 0.18],
  [0.50, 0.10, 0.55],
  [0.56, 0.36, 0.06],
  [0.04, 0.40, 0.46],
  [0.44, 0.14, 0.30],
]

function getBlockRect(id: string): DOMRect | null {
  const el = document.querySelector(`[data-block-id="${id}"]`)
  return el ? el.getBoundingClientRect() : null
}
function getSectionRect(id: string): DOMRect | null {
  const el = document.querySelector(`[data-section-id="${id}"]`)
  return el ? el.getBoundingClientRect() : null
}

interface InkEngine { splash(x:number,y:number,sz:'xs'|'sm'|'md'|'lg'):void; destroy():void }

function createInkEngine(): InkEngine | null {
  const THREE = (window as any).THREE
  if (!THREE) return null

  const W = window.innerWidth, H = window.innerHeight
  const GRAV = 2000

  const canvas = document.createElement('canvas')
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:0;'
  document.body.appendChild(canvas)

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: false })
  renderer.setSize(W, H); renderer.autoClear = true; renderer.setClearColor(0, 0)

  const cam = new THREE.OrthographicCamera(-W/2, W/2, H/2, -H/2, 1, 100)
  cam.position.z = 10
  const scene = new THREE.Scene()

  const VS = 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}'
  const FS = [
    'precision highp float;',
    'uniform vec3 uCol;uniform float uA;uniform float uPh;uniform float uLF;uniform float uFlow;uniform float uEdge;uniform float uSX;uniform float uSY;',
    'varying vec2 vUv;',
    'void main(){',
    '  vec2 c=(vUv-0.5)*vec2(uSX,uSY);float r=length(c);float a=atan(c.y,c.x);',
    '  float lobe=0.20*sin(a*uLF+uPh)+0.10*sin(a*(uLF+2.0)+uPh*1.7)+0.06*cos(a*(uLF*2.3)+uPh*0.9)+0.03*sin(a*(uLF*4.1)+uPh*2.4)+0.06*uFlow*sin(a*2.0+uPh*0.3);',
    '  float bnd=0.40+lobe;float t=r/bnd;if(t>1.0)discard;',
    '  float body=smoothstep(1.0,0.90,t);if(body<0.005)discard;',
    '  float em=mix(1.0,smoothstep(0.75,0.20,t),uEdge);',
    '  float hi=smoothstep(0.18*bnd,0.0,length(c-vec2(-0.10,0.13)*bnd))*0.20;',
    '  vec3 col=mix(uCol,min(uCol*1.4+0.06,vec3(1.0)),hi);',
    '  gl_FragColor=vec4(col,body*em*uA);',
    '}'
  ].join('\n')

  const particles: any[] = []

  function mat(rgb: number[], lf: number) {
    const v = (Math.random()-.5)*.06
    return new THREE.ShaderMaterial({
      uniforms: {
        uCol:{value:new THREE.Color(Math.min(1,Math.max(0,rgb[0]+v)),Math.min(1,Math.max(0,rgb[1]+v)),Math.min(1,Math.max(0,rgb[2]+v)))},
        uA:{value:0},uPh:{value:Math.random()*Math.PI*2},uLF:{value:lf},
        uFlow:{value:0},uEdge:{value:0},uSX:{value:1},uSY:{value:1},
      },
      vertexShader:VS,fragmentShader:FS,transparent:true,depthWrite:false,depthTest:false
    })
  }

  function falling(tx:number,ty:number,rgb:number[],sz:number) {
    const fh=70+Math.random()*100, lf=3+Math.floor(Math.random()*4)
    const m2=mat(rgb,lf)
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(sz*2,sz*2),m2)
    mesh.position.set(tx-W/2,H/2-(ty-fh),0); scene.add(mesh)
    return {mesh,u:m2.uniforms,state:'falling',x:tx,y:ty-fh,vx:(Math.random()-.5)*12,vy:0,sz,rgb,targetY:ty,lf,impactVy:0,born:performance.now()/1000} as any
  }

  function sat(ox:number,oy:number,vx:number,vy:number,sz:number,rgb:number[]) {
    const m2=mat(rgb,2+Math.floor(Math.random()*3))
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(sz*2,sz*2),m2)
    mesh.position.set(ox-W/2,H/2-oy,0); scene.add(mesh)
    return {mesh,u:m2.uniforms,state:'sat_fly',x:ox,y:oy,vx,vy,sz,rgb,targetY:oy+60+Math.random()*80,born:performance.now()/1000} as any
  }

  function landed(x:number,y:number,sz:number,rgb:number[],lf:number) {
    const m2=mat(rgb,lf)
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(sz*2,sz*2),m2)
    mesh.position.set(x-W/2,H/2-y,0); mesh.rotation.z=Math.random()*Math.PI*2; scene.add(mesh)
    return {mesh,u:m2.uniforms,state:'land_impact',x,y,sz,rgb,impactT:0,impactDur:0.022,flowTarget:0.6+Math.random()*.3,born:performance.now()/1000,life:2.2+Math.random()*.8} as any
  }

  function doSplash(x:number,y:number,ivy:number,rgb:number[]) {
    const spd=ivy*.0007
    for(let i=0;i<4+Math.floor(Math.random()*4);i++){
      const ang=Math.PI*(.5+Math.random()*1.0), s=spd*(.4+Math.random()*.7)
      const p=sat(x,y,Math.cos(ang)*s*200,Math.sin(ang)*s*200-s*70,3+Math.random()*8,rgb)
      p.targetY=y+60+Math.random()*100; particles.push(p)
    }
    for(let j=0;j<3;j++){
      const sd=Math.random()>.5?1:-1
      const p=sat(x,y,sd*(50+Math.random()*90),-(15+Math.random()*40),2+Math.random()*3,rgb)
      p.targetY=y+30+Math.random()*50; particles.push(p)
    }
  }

  const eOut=(t:number)=>{const f=t-1;return 1+f*f*f}
  const eIn3=(t:number)=>t*t*t
  const eOut2=(t:number)=>1-(1-t)*(1-t)

  let last=performance.now()/1000, running=true

  function tick(){
    if(!running)return; requestAnimationFrame(tick)
    const now=performance.now()/1000, dt=Math.min(now-last,.05); last=now
    const alive:any[]=[]

    for(const p of particles){
      if(p.state==='falling'){
        p.vy+=GRAV*dt; p.x+=p.vx*dt; p.y+=p.vy*dt
        p.mesh.position.set(p.x-W/2,H/2-p.y,0)
        const cp=Math.min(p.vy/900,.50)
        p.u.uSX.value=1-cp*.20; p.u.uSY.value=1+cp*.38; p.mesh.scale.set(p.u.uSX.value,p.u.uSY.value,1)
        p.u.uA.value=Math.min(1,p.vy/320)
        if(p.y>=p.targetY){
          p.impactVy=p.vy; p.x=p.x+(p.targetY-p.y)*(p.vx/p.vy); p.y=p.targetY
          p.mesh.position.set(p.x-W/2,H/2-p.y,0)
          p.state='impact'; p.impactT=0; p.impactDur=.022; p.born=now; p.life=2.2+Math.random()*.7; p.flowTarget=.7+Math.random()*.4
          doSplash(p.x,p.y,p.impactVy,p.rgb)
        }
        alive.push(p); continue
      }
      if(p.state==='sat_fly'){
        p.vy+=GRAV*dt*.8; p.x+=p.vx*dt; p.y+=p.vy*dt
        p.mesh.position.set(p.x-W/2,H/2-p.y,0); p.u.uA.value=.80
        if(p.y>=p.targetY||p.y>H+20||p.x<-30||p.x>W+30){
          if(p.y>=p.targetY){const lp=landed(p.x,Math.min(p.y,p.targetY),p.sz*.85,p.rgb,p.u.uLF.value);lp.born=now;alive.push(lp)}
          scene.remove(p.mesh);p.mesh.geometry.dispose();p.mesh.material.dispose()
        } else alive.push(p)
        continue
      }
      if(p.state==='impact'||p.state==='land_impact'){
        p.impactT=(p.impactT||0)+dt
        const ip=Math.min(p.impactT/(p.impactDur||.022),1)
        const sx=1+eOut2(ip)*.65, sy=1-eOut2(ip)*.32
        p.u.uSX.value=sx;p.u.uSY.value=sy;p.mesh.scale.set(sx,sy,1);p.u.uA.value=eOut2(ip)*.90
        if(p.impactT>=(p.impactDur||.022)){p.state='spread';p.spreadStart=now;p.spreadDur=.40}
        alive.push(p); continue
      }
      if(p.state==='spread'){
        const sp=Math.min((now-p.spreadStart)/p.spreadDur,1)
        p.u.uSX.value+=(p.u.uSX.value*(1+.28*sp)-p.u.uSX.value)*dt*2.5
        p.mesh.scale.set(p.u.uSX.value,p.u.uSY.value,1)
        p.u.uFlow.value=eOut(sp)*(p.flowTarget||.7); p.u.uA.value=.88
        if(sp>=1){p.state='rest';p.restStart=now}
        alive.push(p); continue
      }
      if(p.state==='rest'){
        const t=(now-p.restStart)/p.life
        if(t>=1){scene.remove(p.mesh);p.mesh.geometry.dispose();p.mesh.material.dispose();continue}
        if(t>.38){const ft=(t-.38)/.62;p.u.uEdge.value=Math.min(1,ft*1.8);p.u.uA.value=Math.max(0,.88*(1-eIn3(ft)))}
        p.u.uFlow.value=Math.min(1,p.u.uFlow.value+dt*.07)
        alive.push(p); continue
      }
    }
    particles.length=0; particles.push(...alive)
    renderer.render(scene,cam)
  }
  requestAnimationFrame(tick)

  return {
    splash(x:number,y:number,sz:'xs'|'sm'|'md'|'lg'='md'){
      const rgb=INKS[Math.floor(Math.random()*INKS.length)]
      const s=sz==='lg'?18+Math.random()*14:sz==='sm'?6+Math.random()*8:sz==='xs'?2+Math.random()*3:12+Math.random()*10
      particles.push(falling(x,y,rgb,s))
    },
    destroy(){ running=false; canvas.remove(); renderer.dispose() }
  }
}

export function InkLayer() {
  const engineRef = useRef<InkEngine|null>(null)

  useEffect(()=>{
    let cleanup:(()=>void)|undefined

    function init(){
      const eng=createInkEngine()
      if(!eng)return
      engineRef.current=eng

      // ── PRIMARY: pointerdown — fires < 16ms, pointer position ─────────────
      const handlePointerDown=(e:PointerEvent)=>{
        if(e.button !== 0) return
        eng.splash(e.clientX, e.clientY, 'sm')
      }
      document.addEventListener('pointerdown', handlePointerDown)

      // ── PRIMARY: keydown — caret position, throttled 80ms ─────────────────
      let lastKeyInk = 0
      const handleKeyDown=(e:KeyboardEvent)=>{
        const skip = e.metaKey || e.ctrlKey || e.altKey ||
                     (e.key.length > 1 && !['Enter','Backspace','Delete'].includes(e.key))
        if(skip) return
        const now = Date.now()
        if(now - lastKeyInk < 80) return
        lastKeyInk = now

        // Best: caret bounding rect
        const sel = window.getSelection()
        if(sel && sel.rangeCount > 0){
          const range = sel.getRangeAt(0)
          const rect  = range.getBoundingClientRect()
          if(rect.width > 0 || rect.height > 0){
            eng.splash(rect.left + rect.width/2, rect.top + rect.height/2, 'xs')
            return
          }
        }
        // Fallback: right edge of focused element
        const active = document.activeElement as HTMLElement | null
        if(active){
          const r = active.getBoundingClientRect()
          if(r.width > 0){ eng.splash(r.right - 16, r.top + r.height/2, 'xs'); return }
        }
      }
      document.addEventListener('keydown', handleKeyDown)

      // ── SECONDARY: block-added — patch-based, reduced intensity ───────────
      const u2=patchEventBus.on('block-added',(evt)=>{
        setTimeout(()=>{
          const r=getBlockRect(evt.payload?.blockId ?? ''); if(!r)return
          eng.splash(r.left+r.width/2, r.top+r.height/2, 'md')
        },80)
      })

      // ── SECONDARY: section-added — patch-based, reduced intensity ─────────
      const u3=patchEventBus.on('section-added',(evt)=>{
        setTimeout(()=>{
          const r=getSectionRect(evt.payload?.sectionId ?? ''); if(!r)return
          const cx=r.left+r.width/2, cy=r.top+r.height/2
          eng.splash(cx+(Math.random()-.5)*30, cy, 'md')
          setTimeout(()=>eng.splash(cx+(Math.random()-.5)*50, cy+20, 'sm'), 120)
        },100)
      })

      // block-updated REMOVED — was 300ms late, wrong position.
      // keydown now covers typing feedback immediately at caret.

      cleanup=()=>{
        u2(); u3()
        document.removeEventListener('pointerdown', handlePointerDown)
        document.removeEventListener('keydown', handleKeyDown)
        eng.destroy()
      }
    }

    if((window as any).THREE){
      init()
    } else {
      const s=document.createElement('script')
      s.src='https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'
      s.onload=()=>init()
      document.head.appendChild(s)
    }

    return ()=>{ cleanup?.() }
  },[])

  return null
}
