import type { Supplier, SupplierHotel } from './types';

export const fixtures: Record<Supplier, SupplierHotel[]> = {
  'Supplier A': [
    { hotelId: 'a1', name: 'Holtin', price: 6000, city: 'delhi', commissionPct: 10 },
    { hotelId: 'a2', name: 'Radison', price: 5900, city: 'delhi', commissionPct: 13 },
    { hotelId: 'a3', name: 'City Garden', price: 3200, city: 'delhi', commissionPct: 8 },
    { hotelId: 'a4', name: 'The Imperial', price: 12000, city: 'delhi', commissionPct: 15 },
    { hotelId: 'a5', name: 'Harbour View', price: 7200, city: 'mumbai', commissionPct: 12 },
    { hotelId: 'a6', name: 'Garden Residency', price: 4100, city: 'bengaluru', commissionPct: 9 },
  ],
  'Supplier B': [
    { hotelId: 'b1', name: 'Holtin', price: 5340, city: 'delhi', commissionPct: 20 },
    { hotelId: 'b2', name: 'Radison', price: 6200, city: 'delhi', commissionPct: 11 },
    { hotelId: 'b3', name: 'Lotus Palace', price: 4500, city: 'delhi', commissionPct: 12 },
    { hotelId: 'b4', name: '  THE IMPERIAL  ', price: 12000, city: 'delhi', commissionPct: 18 },
    { hotelId: 'b5', name: 'Harbour View', price: 6900, city: 'mumbai', commissionPct: 14 },
    { hotelId: 'b6', name: 'Marine Retreat', price: 8500, city: 'mumbai', commissionPct: 10 },
    { hotelId: 'b7', name: 'Garden Residency', price: 3900, city: 'bengaluru', commissionPct: 11 },
  ],
};
