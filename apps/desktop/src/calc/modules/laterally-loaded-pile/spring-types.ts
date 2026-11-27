/** linear: p = k0 y; nonlinear: p = pu tanh(k0 y / pu); elastoplastic: p = min(k0 |y|, pu) met het teken van y. */
export type AnalysisMode='linear'|'nonlinear'|'elastoplastic';
/** Rekent de analyse met een grensweerstand pu (niet-lineair of elastoplastisch). */
export const usesUltimate=(mode:AnalysisMode|undefined)=>mode==='nonlinear'||mode==='elastoplastic';
export type LayerCorrection='none'|'georgiadis';
export interface UltimateProfile {
  atSurfaceKnM:number;
  gradientKnM2:number;
  capKnM:number;
  /**
   * Grensweerstand volgens Brinch Hansen (1961) in plaats van het lineaire profiel: pu(z) = K_q(z) · γ′ · z · D, met
   * φ′ [°], het effectieve volumegewicht γ′ [kN/m³] en de breedte D [m] (de werkende breedte, door de rekenkern ingevuld).
   */
  brinchHansen?:{phiDeg:number;gammaEffKnM3:number;widthM?:number};
}
export interface SoilSpringProfile {
  topM:number;bottomM:number;initialKnM2:number;
  ultimate:UltimateProfile;
}
export interface EquivalentLayer {
  topEquivalentM:number;bottomEquivalentM:number;
  cumulativeUltimateKn:number;
}
export interface SpringLaw {
  kind:'linear'|'hyperbolic'|'elastoplastic';initialKnM2:number;ultimateKnM:number|null;
}
export interface SpringResponse {
  resistanceKnM:number;tangentKnM2:number;secantKnM2:number;
}
export interface SpringState extends SpringResponse {
  id:string;elementIndex:number;gaussIndex:number;layerIndex:number;
  zM:number;equivalentDepthM:number;displacementM:number;tributaryLengthM:number;
  initialKnM2:number;ultimateKnM:number|null;
  mode:AnalysisMode;correction:LayerCorrection;modelLabel:string;source:string;formula:string;
  curvePoints:Array<{yM:number;pKnM:number}>;
}
export interface ConvergenceInfo {
  converged:true;iterations:number;loadSteps:number;residualKn:number;relativeResidual:number;
}
