export type AnalysisMode='linear'|'nonlinear';
export type LayerCorrection='none'|'georgiadis';
export interface UltimateProfile {
  atSurfaceKnM:number;
  gradientKnM2:number;
  capKnM:number;
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
  kind:'linear'|'hyperbolic';initialKnM2:number;ultimateKnM:number|null;
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
