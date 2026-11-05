import { useEffect, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { LateralInput } from './compute';
import type { BeamResult } from './beam';
import type { SpringState } from './spring-types';

interface Props {
  input:LateralInput;beam:BeamResult;springs:SpringState[];selectedId:string|undefined;
  onSelect:(id:string)=>void;scale:number;fallback:ReactNode;
}

export function pileSceneExtent(lengthM:number,diameterM:number,maxDisplacementM:number) {
  const reach=Math.max(lengthM*.38,diameterM*4,maxDisplacementM*1.4);
  const maxDistance=Math.max(lengthM*20,reach*20);
  return {reach,maxDistance,far:Math.max(100,maxDistance+3*Math.max(lengthM,reach,maxDisplacementM))};
}

/** Sweep the physical cross-section along the displayed displacement curve. */
export function pileGeometry(sourceSamples:BeamResult['samples'],scale:number,radius:number,square:boolean,innerRadius=0) {
  // Element boundaries retain both diagnostic sides in the beam result; the mesh needs one ring.
  const samples:BeamResult['samples']=[];
  for(const sample of sourceSamples)if(!samples.length||Math.abs(sample.zM-samples[samples.length-1].zM)>1e-10)samples.push(sample);
  const sides=square?4:32,vertices:number[]=[],indices:number[]=[];
  const ringCount=innerRadius>0?2:1;
  for(let ring=0;ring<ringCount;ring++)for(let j=0;j<samples.length;j++) {
    const p=samples[j],before=samples[Math.max(0,j-1)],after=samples[Math.min(samples.length-1,j+1)];
    const dx=(after.yM-before.yM)*scale,dz=after.zM-before.zM,normal=new THREE.Vector3(dz,dx,0).normalize();
    for(let k=0;k<sides;k++) {
      const angle=2*Math.PI*k/sides+(square?Math.PI/4:0),r=(ring?innerRadius:radius)*(square?Math.SQRT2:1);
      vertices.push(p.yM*scale+normal.x*r*Math.cos(angle),-p.zM+normal.y*r*Math.cos(angle),r*Math.sin(angle));
    }
  }
  const ringSize=samples.length*sides;
  for(let ring=0;ring<ringCount;ring++)for(let j=0;j<samples.length-1;j++)for(let k=0;k<sides;k++) {
    const a=ring*ringSize+j*sides+k,b=ring*ringSize+j*sides+(k+1)%sides,c=b+sides,d=a+sides;
    if(ring)indices.push(a,d,b,b,d,c);else indices.push(a,b,d,b,c,d);
  }
  for(const end of [0,samples.length-1]) {
    const outer=end*sides;
    if(innerRadius>0)for(let k=0;k<sides;k++) {
      const a=outer+k,b=outer+(k+1)%sides,c=b+ringSize,d=a+ringSize;
      if(end===0)indices.push(a,d,b,b,d,c);else indices.push(a,b,d,b,c,d);
    } else {
      const centre=vertices.length/3,p=samples[end];vertices.push(p.yM*scale,-p.zM,0);
      for(let k=0;k<sides;k++)if(end===0)indices.push(centre,outer+(k+1)%sides,outer+k);else indices.push(centre,outer+k,outer+(k+1)%sides);
    }
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setIndex(indices);
  if(square){const flat=geometry.toNonIndexed();geometry.dispose();flat.computeVertexNormals();return flat;}
  geometry.computeVertexNormals();return geometry;
}

export function PileScene3D({input,beam,springs,selectedId,onSelect,scale,fallback}:Props) {
  const host=useRef<HTMLDivElement>(null),select=useRef(onSelect),selected=useRef(selectedId);
  const refreshSelection=useRef<(()=>void)|undefined>(undefined);
  const [unavailable,setUnavailable]=useState(false);
  select.current=onSelect;selected.current=selectedId;
  useEffect(()=>{refreshSelection.current?.();},[selectedId]);
  useEffect(()=>{
    const container=host.current;
    if(!container||unavailable)return;
    let renderer:THREE.WebGLRenderer;
    try {renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});} catch {setUnavailable(true);return;}
    const L=input.lengthM,diameter=input.section.diameterMm/1000;
    const maxY=Math.max(0,...beam.samples.map(p=>Math.abs(p.yM*scale)));
    const {reach,maxDistance,far}=pileSceneExtent(L,diameter,maxY);
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(38,1,.01,far);
    camera.position.set(reach*1.8,L*.1,L*1.4+maxY*2);
    const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,-L/2,0);controls.minDistance=diameter;controls.maxDistance=maxDistance;controls.update();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));container.appendChild(renderer.domElement);
    renderer.domElement.setAttribute('aria-label','3D-paalmodel; draaien met slepen, zoomen met scrollen');
    const render=()=>renderer.render(scene,camera);
    scene.add(new THREE.AmbientLight(0xffffff,2));
    const light=new THREE.DirectionalLight(0xffffff,2);light.position.set(5,5,10);scene.add(light);
    const token=(name:string)=>new THREE.Color(getComputedStyle(container).getPropertyValue(name).trim());
    const concrete=new THREE.MeshStandardMaterial({color:token('--oa-text-secondary'),roughness:.85,side:THREE.DoubleSide});
    const steel=new THREE.MeshStandardMaterial({color:token('--oa-text'),metalness:.5,roughness:.35,side:THREE.DoubleSide});
    const kind=input.section.kind,tube=kind==='steel-tube'||kind==='filled-tube';
    const inner=Math.max(0,diameter/2-input.section.wallMm/1000);
    scene.add(new THREE.Mesh(pileGeometry(beam.samples,scale,diameter/2,kind==='concrete-square',tube?inner:0),tube?steel:concrete));
    if(kind==='filled-tube')scene.add(new THREE.Mesh(pileGeometry(beam.samples,scale,inner,false),concrete));
    const soilMaterials:THREE.MeshBasicMaterial[]=[];
    const edgeMaterials:THREE.LineBasicMaterial[]=[];
    input.layers.forEach((layer,index)=>{
      const material=new THREE.MeshBasicMaterial({color:token(index%2?'--oa-hover':'--oa-selected'),transparent:true,opacity:.14,depthWrite:false,side:THREE.DoubleSide});soilMaterials.push(material);
      const soil=new THREE.Mesh(new THREE.BoxGeometry(reach*2,layer.bottomM-layer.topM,reach*1.2),material);soil.position.set(0,-(layer.topM+layer.bottomM)/2,0);scene.add(soil);
      const edgeMaterial=new THREE.LineBasicMaterial({color:token('--oa-border-strong'),transparent:true,opacity:.45});edgeMaterials.push(edgeMaterial);
      const outline=new THREE.LineSegments(new THREE.EdgesGeometry(soil.geometry),edgeMaterial);outline.position.copy(soil.position);scene.add(outline);
    });
    const original=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0),new THREE.Vector3(0,-L,0)]),new THREE.LineDashedMaterial({color:token('--oa-text-secondary'),dashSize:L/70,gapSize:L/100}));original.computeLineDistances();scene.add(original);
    const markers:THREE.Mesh<THREE.SphereGeometry,THREE.MeshBasicMaterial>[]=[],springMaterials:THREE.LineBasicMaterial[]=[],markerRadius=Math.max(diameter*.14,L*.004);
    springs.forEach(s=>{
      const marker=new THREE.Mesh(new THREE.SphereGeometry(markerRadius,10,8),new THREE.MeshBasicMaterial({color:token('--oa-accent-text'),depthTest:false}));
      marker.position.set(s.displacementM*scale,-s.zM,diameter/2+markerRadius);marker.userData.springId=s.id;marker.renderOrder=3;markers.push(marker);scene.add(marker);
      const start=new THREE.Vector3(s.displacementM*scale,-s.zM,diameter/2+markerRadius),end=start.clone().add(new THREE.Vector3(Math.max(diameter*.8,L*.025),0,0));
      const springMaterial=new THREE.LineBasicMaterial({color:token('--oa-accent-text'),transparent:true,opacity:.5});springMaterials.push(springMaterial);
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([start,end]),springMaterial));
    });
    const updateSelection=()=>{markers.forEach(marker=>{const active=marker.userData.springId===selected.current;marker.scale.setScalar(active?1.8:1);marker.material.color.copy(token(active?'--oa-text':'--oa-accent-text'));});render();};
    refreshSelection.current=updateSelection;
    const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();let downX=0,downY=0;
    const down=(event:PointerEvent)=>{downX=event.clientX;downY=event.clientY;};
    const up=(event:PointerEvent)=>{
      if(Math.hypot(event.clientX-downX,event.clientY-downY)>5)return;
      const rect=renderer.domElement.getBoundingClientRect();pointer.set(2*(event.clientX-rect.left)/rect.width-1,1-2*(event.clientY-rect.top)/rect.height);raycaster.setFromCamera(pointer,camera);
      const hit=raycaster.intersectObjects(markers,false)[0];if(hit)select.current(hit.object.userData.springId as string);
    };
    const lost=(event:Event)=>{event.preventDefault();setUnavailable(true);};
    const resize=()=>{const width=Math.max(1,container.clientWidth),height=Math.max(1,container.clientHeight);camera.aspect=width/height;camera.updateProjectionMatrix();renderer.setSize(width,height);render();};
    const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(container);
    const themeObserver=new MutationObserver(()=>{
      concrete.color.copy(token('--oa-text-secondary'));steel.color.copy(token('--oa-text'));
      original.material.color.copy(token('--oa-text-secondary'));edgeMaterials.forEach(material=>material.color.copy(token('--oa-border-strong')));springMaterials.forEach(material=>material.color.copy(token('--oa-accent-text')));
      soilMaterials.forEach((material,index)=>material.color.copy(token(index%2?'--oa-hover':'--oa-selected')));updateSelection();
    });themeObserver.observe(document.documentElement,{attributes:true,subtree:true,attributeFilter:['class','data-theme']});
    controls.addEventListener('change',render);renderer.domElement.addEventListener('pointerdown',down);renderer.domElement.addEventListener('pointerup',up);renderer.domElement.addEventListener('webglcontextlost',lost);resize();updateSelection();
    return ()=>{
      refreshSelection.current=undefined;resizeObserver.disconnect();themeObserver.disconnect();controls.removeEventListener('change',render);controls.dispose();
      renderer.domElement.removeEventListener('pointerdown',down);renderer.domElement.removeEventListener('pointerup',up);renderer.domElement.removeEventListener('webglcontextlost',lost);
      const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>([concrete,steel]);
      scene.traverse(object=>{const mesh=object as THREE.Mesh;if(mesh.geometry)geometries.add(mesh.geometry);if(mesh.material)(Array.isArray(mesh.material)?mesh.material:[mesh.material]).forEach(m=>materials.add(m));});
      geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());scene.clear();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();
    };
  },[input,beam,springs,scale,unavailable]);
  if(unavailable)return <div><p className="pile-webgl-fallback" role="status">3D is op dit apparaat niet beschikbaar. Gebruik het rekenmodel en de veerinspectie hieronder.</p>{fallback}</div>;
  return <><div className="pile-scene" ref={host}/><p className="pile-orbit-help">Sleep om te draaien · scroll om te zoomen · rechtermuis om te verschuiven · klik een veerpunt. De dieptelijst biedt dezelfde selectie met het toetsenbord.</p></>;
}
