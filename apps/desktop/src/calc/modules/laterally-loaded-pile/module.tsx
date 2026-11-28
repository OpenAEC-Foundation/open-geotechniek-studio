// Invoer, rekenen, toetsen en rapport staan in headless.ts; hier komen de schermen bij.
import type { CalcModule } from '../../framework/types';
import type { LateralInput, LateralResult } from './compute';
import { lateralHeadless } from './headless';
import { LateralInputPanel } from './LateralInputPanel';
import { LateralSheet } from './LateralSheet';
import { LateralSettingsPanel } from './LateralSettingsPanel';
import { LateralTable } from './LateralTable';
import { defaultRows } from './pile-table';
import {LateralExplorer} from './LateralExplorer';
import '../settlement/styles.css';
import './styles.css';
const lateralModuleTyped:CalcModule<LateralInput,LateralResult>={
  ...lateralHeadless,InputPanel:LateralInputPanel,VisualPanel:LateralExplorer,ResultPanel:LateralSheet,SettingsPanel:LateralSettingsPanel,
  table:{label:'Paaltabel',Panel:LateralTable,items:(input)=>(input.pileTable?.rows?.length?input.pileTable.rows:defaultRows(input)).map(r=>({id:r.id,label:r.name}))},
};
export const laterallyLoadedPileModule=lateralModuleTyped as unknown as CalcModule;
