import { useEffect, useRef, useState, type ReactNode } from 'react';
import { MATERIAL_COLORS } from '../pile-bearing-capacity/parts/material-colors';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { LateralInput } from './compute';
import type { BeamResult } from './beam';
import type { SpringState } from './spring-types';
import { useTranslation } from 'react-i18next';
import { numberLocale } from '../../i18n';
import { soilColor } from './report-data';
import { soilKey } from './soil';
import { SpringLegend } from './SpringLegend';
import { mobilisation, mobilisationMix, soilStroke, springLength } from './spring-visual';

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

/** Elke hoeveelste veer zichtbaar is: ~12 bij de startafstand, meer bij inzoomen. */
export function springStride(count:number,startDistance:number,distance:number):number {
  const target=12*Math.max(1,startDistance/Math.max(distance,1e-9));
  return Math.max(1,Math.ceil(count/target));
}
export function PileScene3D({input,beam,springs,selectedId,onSelect,scale,fallback}:Props) {
  const {t}=useTranslation('calcLateral');
  const host=useRef<HTMLDivElement>(null),select=useRef(onSelect),selected=useRef(selectedId);
  const sceneLabel=t('scene.aria','3D-paalmodel; draaien met slepen, zoomen met scrollen');
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
    // Iets ruimer dan de paal: boven de kop blijft plaats voor de belastingpijl en zijn label.
    camera.position.set(reach*1.8,L*.12,L*1.62+maxY*2);
    const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,-L*.43,0);controls.minDistance=diameter;controls.maxDistance=maxDistance;controls.update();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));container.appendChild(renderer.domElement);
    renderer.domElement.setAttribute('aria-label',sceneLabel);
    const projected=new THREE.Vector3();
    const render=()=>{
      renderer.render(scene,camera);
      // Labels volgen hun punt in het model; achter de camera of buiten beeld verdwijnen ze.
      const width=container.clientWidth,height=container.clientHeight;
      for(const label of labels){
        projected.copy(label.position).project(camera);
        const x=(projected.x+1)/2*width,y=(1-projected.y)/2*height,visible=projected.z<1&&x>4&&x<width-4&&y>8&&y<height-8;
        label.element.style.display=visible?'':'none';
        if(visible)label.element.style.transform=`translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
      }
    };
    scene.add(new THREE.AmbientLight(0xffffff,2));
    const light=new THREE.DirectionalLight(0xffffff,2);light.position.set(5,5,10);scene.add(light);
    const token=(name:string)=>new THREE.Color(getComputedStyle(container).getPropertyValue(name).trim());
    const concrete=new THREE.MeshStandardMaterial({color:new THREE.Color(MATERIAL_COLORS.concrete.fill),roughness:.85,side:THREE.DoubleSide});
    const steel=new THREE.MeshStandardMaterial({color:new THREE.Color(MATERIAL_COLORS.steel.fill),metalness:.5,roughness:.35,side:THREE.DoubleSide});
    const kind=input.section.kind,tube=kind==='steel-tube'||kind==='filled-tube';
    const inner=Math.max(0,diameter/2-input.section.wallMm/1000);
    scene.add(new THREE.Mesh(pileGeometry(beam.samples,scale,diameter/2,kind==='concrete-square',tube?inner:0),tube?steel:concrete));
    if(kind==='filled-tube')scene.add(new THREE.Mesh(pileGeometry(beam.samples,scale,inner,false),concrete));
    const edgeMaterials:THREE.LineBasicMaterial[]=[],accentMaterials:Array<THREE.LineBasicMaterial|THREE.MeshBasicMaterial>=[];
    // Labels als HTML over het beeld: scherp, in het lettertype en de kleuren van het thema.
    const overlay=document.createElement('div');overlay.className='pile-scene-labels';container.appendChild(overlay);
    const labels:Array<{element:HTMLElement;position:THREE.Vector3}>=[];
    const addLabel=(text:string,position:THREE.Vector3,kind:string)=>{const element=document.createElement('span');element.className=`pile-scene-label pile-scene-label-${kind}`;element.textContent=text;overlay.appendChild(element);labels.push({element,position});};
    const srgb=([r,g,b]:[number,number,number])=>new THREE.Color().setRGB(r/255,g/255,b/255,THREE.SRGBColorSpace);
    const headNap=input.headNap??0,napText=(z:number)=>(headNap-z).toLocaleString(numberLocale(),{minimumFractionDigits:2,maximumFractionDigits:2});
    const soilName=(id:string)=>id==='manual'?t('soils.manual','Eigen waarde'):t(soilKey(id),id).split(' (')[0];
    const ordered0=[...input.layers].sort((a,b)=>a.topM-b.topM);
    // Elke laag als doorschijnend blok in de kleur van de grondsoort, met de laaggrenzen als lijnen.
    ordered0.forEach(layer=>{
      const material=new THREE.MeshBasicMaterial({color:srgb(soilColor(layer.springId).rgb),transparent:true,opacity:.3,depthWrite:false,side:THREE.DoubleSide});
      const soil=new THREE.Mesh(new THREE.BoxGeometry(reach*2,layer.bottomM-layer.topM,reach*1.2),material);soil.position.set(0,-(layer.topM+layer.bottomM)/2,0);soil.renderOrder=0;scene.add(soil);
      const edgeMaterial=new THREE.LineBasicMaterial({color:token('--oa-border-strong'),transparent:true,opacity:.8});edgeMaterials.push(edgeMaterial);
      const outline=new THREE.LineSegments(new THREE.EdgesGeometry(soil.geometry),edgeMaterial);outline.position.copy(soil.position);scene.add(outline);
      addLabel(t('scene.layerLabel','{{soil}} · NAP {{top}} tot {{bottom}}',{soil:soilName(layer.springId),top:napText(layer.topM),bottom:napText(layer.bottomM)}),new THREE.Vector3(-reach,-(layer.topM+layer.bottomM)/2,reach*.6),'layer');
    });
    // Maaiveld: de bovenkant van de bovenste laag, als doorgetrokken rand.
    if(ordered0.length){
      const zTop=ordered0[0].topM,surfaceMaterial=new THREE.LineBasicMaterial({color:token('--oa-text')});accentMaterials.push(surfaceMaterial);
      const corners=[[-1,-1],[1,-1],[1,1],[-1,1],[-1,-1]].map(([a,b])=>new THREE.Vector3(a*reach*1.08,-zTop,b*reach*.66));
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(corners),surfaceMaterial));
      addLabel(t('scene.surfaceLabel','Maaiveld NAP {{nap}}',{nap:napText(zTop)}),new THREE.Vector3(reach*1.08,-zTop,reach*.66),'surface');
    }
    // Belasting op de kop: kracht H als pijl, moment M als boog met pijlpunt.
    const loadColor=()=>token('--oa-accent-text'),loadLength=Math.max(reach*.55,diameter*2),headY=beam.samples.length?beam.samples.reduce((a,p)=>p.zM<a.zM?p:a).yM*scale:0;
    let forceArrow:THREE.ArrowHelper|undefined;
    if(input.headForceKn!==0){
      const sign=Math.sign(input.headForceKn);
      forceArrow=new THREE.ArrowHelper(new THREE.Vector3(sign,0,0),new THREE.Vector3(headY-sign*(loadLength+diameter*.6),0,0),loadLength,loadColor().getHex(),loadLength*.28,loadLength*.14);scene.add(forceArrow);
      addLabel(`H = ${input.headForceKn.toLocaleString(numberLocale(),{maximumFractionDigits:1})} kN`,new THREE.Vector3(headY-sign*(loadLength+diameter*.6),loadLength*.16,0),'load');
    }
    if(input.headMomentKnM!==0&&!input.headFixedRotation){
      // Positief M = rotatie dy/dz > 0 (z omlaag): van voren gezien tegen de klok in.
      const sign=Math.sign(input.headMomentKnM),radius=Math.max(diameter*1.4,L*.06),centre=new THREE.Vector3(headY,radius*.2,0);
      const angle=(k:number)=>(-.25+1.5*k/40)*Math.PI*sign+(sign<0?Math.PI:0);
      const arc=Array.from({length:41},(_,k)=>new THREE.Vector3(centre.x+radius*Math.cos(angle(k)),centre.y+radius*Math.sin(angle(k)),0));
      const arcMaterial=new THREE.LineBasicMaterial({color:loadColor()});accentMaterials.push(arcMaterial);
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(arc),arcMaterial));
      const tipMaterial=new THREE.MeshBasicMaterial({color:loadColor()});accentMaterials.push(tipMaterial);
      const tip=new THREE.Mesh(new THREE.ConeGeometry(radius*.16,radius*.42,12),tipMaterial),end=arc[40],direction=end.clone().sub(arc[38]).normalize();
      tip.position.copy(end);tip.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction);scene.add(tip);
      addLabel(`M = ${input.headMomentKnM.toLocaleString(numberLocale(),{maximumFractionDigits:1})} kNm`,new THREE.Vector3(centre.x,centre.y+radius*1.25,0),'load');
    }
    const original=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0),new THREE.Vector3(0,-L,0)]),new THREE.LineDashedMaterial({color:token('--oa-text-secondary'),dashSize:L/70,gapSize:L/100}));original.computeLineDistances();scene.add(original);
    // Gronddruk: de reactie van de grond op de paal als vlak achter de paalas.
    const ordered=[...springs].sort((a,b)=>a.zM-b.zM),pMax=Math.max(1e-9,...ordered.map(s=>Math.abs(s.resistanceKnM)));
    const pScale=reach*.55/pMax,pressureMaterials:THREE.Material[]=[];
    if(ordered.length>1){
      const shape=new THREE.Shape();shape.moveTo(0,-ordered[0].zM);ordered.forEach(s=>shape.lineTo(-s.resistanceKnM*pScale,-s.zM));shape.lineTo(0,-ordered[ordered.length-1].zM);shape.closePath();
      const fill=new THREE.MeshBasicMaterial({color:token('--oa-accent'),transparent:true,opacity:.22,depthWrite:false,side:THREE.DoubleSide});
      const edge=new THREE.LineBasicMaterial({color:token('--oa-accent-text')});pressureMaterials.push(fill,edge);
      const area=new THREE.Mesh(new THREE.ShapeGeometry(shape),fill);area.position.z=-diameter;area.renderOrder=1;scene.add(area);
      const outline=new THREE.Line(new THREE.BufferGeometry().setFromPoints(ordered.map(s=>new THREE.Vector3(-s.resistanceKnM*pScale,-s.zM,-diameter))),edge);scene.add(outline);
      // Een paar pijlen op vaste afstand geven de richting van de gronddruk.
      const step=Math.max(1,Math.round(ordered.length/9));
      ordered.filter((_,k)=>k%step===0).forEach(s=>{const len=Math.abs(s.resistanceKnM)*pScale;if(len<pMax*pScale*.08)return;
        const dir=new THREE.Vector3(-Math.sign(s.resistanceKnM),0,0),arrow=new THREE.ArrowHelper(dir,new THREE.Vector3(-s.resistanceKnM*pScale,-s.zM,-diameter),len,token('--oa-accent-text').getHex(),Math.min(len*.35,L*.02),Math.min(len*.25,L*.012));scene.add(arrow);});
    }
    const markers:THREE.Mesh<THREE.SphereGeometry,THREE.MeshBasicMaterial>[]=[],springLines:THREE.Line[]=[],springMaterials:THREE.LineBasicMaterial[]=[],markerRadius=Math.max(diameter*.14,L*.004);
    // Veer: lengte naar de beginstijfheid, kleur van de grondsoort, verlopend naar de foutkleur bij hoge mobilisatie.
    const kMax=Math.max(1e-12,...ordered.map(s=>s.initialKnM2)),springBase=Math.max(diameter*2.4,L*.09),amplitude=Math.max(diameter*.16,L*.006);
    const springColor=(s:SpringState)=>srgb(soilStroke(input.layers[s.layerIndex]?.springId??'manual')).lerp(token('--oa-error'),mobilisationMix(mobilisation(s)));
    ordered.forEach(s=>{
      const marker=new THREE.Mesh(new THREE.SphereGeometry(markerRadius,10,8),new THREE.MeshBasicMaterial({color:springColor(s),depthTest:false}));
      marker.position.set(s.displacementM*scale,-s.zM,diameter/2+markerRadius);marker.userData.springId=s.id;marker.renderOrder=3;markers.push(marker);scene.add(marker);
      const start=new THREE.Vector3(s.displacementM*scale,-s.zM,diameter/2+markerRadius),length=springBase*springLength(s.initialKnM2,kMax),lead=length*.12,coils=Math.max(3,Math.round(8*springLength(s.initialKnM2,kMax)));
      const points=[start.clone(),start.clone().add(new THREE.Vector3(lead,0,0))];
      for(let k=0;k<2*coils;k++)points.push(start.clone().add(new THREE.Vector3(lead+(length-2*lead)*(k+.5)/(2*coils),(k%2?-1:1)*amplitude,0)));
      points.push(start.clone().add(new THREE.Vector3(length-lead,0,0)),start.clone().add(new THREE.Vector3(length,0,0)));
      const springMaterial=new THREE.LineBasicMaterial({color:springColor(s),depthTest:false});springMaterials.push(springMaterial);
      const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),springMaterial);line.renderOrder=2;springLines.push(line);scene.add(line);
    });
    // Detailniveau: uitgezoomd een veer of twaalf, inzoomen toont er steeds meer.
    const startDistance=camera.position.distanceTo(controls.target);
    const applyDensity=()=>{const stride=springStride(ordered.length,startDistance,camera.position.distanceTo(controls.target));
      markers.forEach((m,k)=>{const show=k%stride===0||m.userData.springId===selected.current;m.visible=show;springLines[k].visible=show;});};
    const updateSelection=()=>{applyDensity();markers.forEach((marker,k)=>{const active=marker.userData.springId===selected.current;marker.scale.setScalar(active?1.8:1);marker.material.color.copy(active?token('--oa-text'):springColor(ordered[k]));});render();};
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
      
      original.material.color.copy(token('--oa-text-secondary'));edgeMaterials.forEach(material=>material.color.copy(token('--oa-border-strong')));(pressureMaterials as Array<THREE.MeshBasicMaterial|THREE.LineBasicMaterial>).forEach((m,k)=>m.color.copy(token(k?'--oa-accent-text':'--oa-accent')));springMaterials.forEach((material,k)=>material.color.copy(springColor(ordered[k])));
      accentMaterials.forEach((material,k)=>material.color.copy(k===0&&ordered0.length?token('--oa-text'):loadColor()));forceArrow?.setColor(loadColor());updateSelection();
    });themeObserver.observe(document.documentElement,{attributes:true,subtree:true,attributeFilter:['class','data-theme','data-oa-theme']});
    const onCamera=()=>{applyDensity();render();};controls.addEventListener('change',onCamera);renderer.domElement.addEventListener('pointerdown',down);renderer.domElement.addEventListener('pointerup',up);renderer.domElement.addEventListener('webglcontextlost',lost);resize();updateSelection();
    return ()=>{
      refreshSelection.current=undefined;resizeObserver.disconnect();themeObserver.disconnect();controls.removeEventListener('change',onCamera);controls.dispose();
      renderer.domElement.removeEventListener('pointerdown',down);renderer.domElement.removeEventListener('pointerup',up);renderer.domElement.removeEventListener('webglcontextlost',lost);
      const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>([concrete,steel]);
      scene.traverse(object=>{const mesh=object as THREE.Mesh;if(mesh.geometry)geometries.add(mesh.geometry);if(mesh.material)(Array.isArray(mesh.material)?mesh.material:[mesh.material]).forEach(m=>materials.add(m));});
      geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());scene.clear();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();overlay.remove();
    };
  },[input,beam,springs,scale,unavailable,sceneLabel,t]);
  if(unavailable)return <div><p className="pile-webgl-fallback" role="status">{t('scene.unavailable', '3D is op dit apparaat niet beschikbaar. Gebruik het rekenmodel en de veerinspectie hieronder.')}</p>{fallback}</div>;
  return <><div className="pile-scene" ref={host}/><SpringLegend layers={input.layers}/><p className="pile-orbit-help">{t('scene.help', 'Sleep om te draaien · scroll om te zoomen · rechtermuis om te verschuiven · klik een veerpunt. De dieptelijst biedt dezelfde selectie met het toetsenbord.')}</p></>;
}
