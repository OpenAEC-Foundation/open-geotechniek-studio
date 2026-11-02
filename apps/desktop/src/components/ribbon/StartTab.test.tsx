import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import StartTab from './StartTab';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { createInstance } from 'i18next';
const i18n = createInstance();
void i18n.use(initReactI18next).init({ lng: 'nl', resources: {}, initImmediate: false });
const startTab = () => <I18nextProvider i18n={i18n}><StartTab /></I18nextProvider>;

afterEach(cleanup);

describe('sonderingszoom in het hoofdblad', () => {
  it('start uit en bewaart de gekozen schaaloptie na heropenen', async () => {
    localStorage.clear();
    const view = render(startTab());
    const checkbox = await screen.findByRole('checkbox', { name: 'Sonderingen meeschalen' });
    expect(checkbox).not.toBeChecked();
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();
    expect(localStorage.getItem('ogs:chart.scaleColumns')).toBe('true');
    view.unmount();
    render(startTab());
    expect(await screen.findByRole('checkbox', { name: 'Sonderingen meeschalen' })).toBeChecked();
  });
});
