import { useEnergyStore, MAX_ENERGY, REGEN_INTERVAL_MS } from '../../src/state/energyStore';

describe('energyStore', () => {
  beforeEach(() => {
    useEnergyStore.getState().resetEnergy();
  });

  it('initializes at MAX_ENERGY', () => {
    const energy = useEnergyStore.getState().getEnergy();
    expect(energy).toBe(MAX_ENERGY);
  });

  it('consumes energy successfully', () => {
    const success = useEnergyStore.getState().consumeEnergy();
    expect(success).toBe(true);
    expect(useEnergyStore.getState().getEnergy()).toBe(MAX_ENERGY - 1);
  });

  it('regenerates 1 heart after 20 minutes', () => {
    const now = Date.now();
    useEnergyStore.getState().consumeEnergy(now);
    expect(useEnergyStore.getState().getEnergy(now)).toBe(4);

    const twentyMinsLater = now + REGEN_INTERVAL_MS;
    expect(useEnergyStore.getState().getEnergy(twentyMinsLater)).toBe(5);
  });

  it('refills energy instantly', () => {
    useEnergyStore.getState().consumeEnergy();
    useEnergyStore.getState().consumeEnergy();
    expect(useEnergyStore.getState().getEnergy()).toBe(3);

    useEnergyStore.getState().refillEnergy();
    expect(useEnergyStore.getState().getEnergy()).toBe(MAX_ENERGY);
  });
});
