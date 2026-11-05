import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { laterallyLoadedPileModule as module } from './module';
import { computeLateral, lateralExample } from './compute';
it('heeft eigen materiaal- en maaiveldinvoer en bewaart wijzigingen',()=>{
  const onChange=vi.fn(), result=computeLateral(lateralExample);
  render(<module.InputPanel input={lateralExample} result={result} onChange={onChange}/>);
  fireEvent.change(screen.getByLabelText('Paaltype'),{target:{value:'filled-tube'}});
  expect(onChange.mock.lastCall?.[0].section.kind).toBe('filled-tube');
  expect(screen.getByLabelText('Moment op de kop [kNm]')).toBeInTheDocument();
  expect(screen.getByLabelText('Bovenbelasting [kPa]')).toBeInTheDocument();
});
it('toont de begrensde doorsnedetoets en de status van referenties',()=>{
  render(<module.ResultPanel input={lateralExample} result={computeLateral(lateralExample)}/>);
  expect(screen.getByText(/N–M-doorsnedetoets/)).toBeInTheDocument();
  expect(screen.getByText(/Dwarskracht, scheurwijdte/)).toBeInTheDocument();
  expect(screen.getByText(/50 referentiegevallen/)).toBeInTheDocument();
});
