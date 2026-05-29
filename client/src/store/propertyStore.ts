import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface PropertyState {
  propertyId: number | null;
  buildingId: number | null;
  floorId: number | null;
  setPropertyId: (id: number | null) => void;
  setBuildingId: (id: number | null) => void;
  setFloorId: (id: number | null) => void;
}

export const usePropertyStore = create<PropertyState>()(
  persist(
    (set) => ({
      propertyId: null,
      buildingId: null,
      floorId: null,
      setPropertyId: (propertyId) => set({ propertyId }),
      setBuildingId: (buildingId) => set({ buildingId, floorId: null }),
      setFloorId: (floorId) => set({ floorId }),
    }),
    { name: 'rentspace-property' }
  )
);
