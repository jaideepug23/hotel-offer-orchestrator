export type Supplier = 'Supplier A' | 'Supplier B';
export interface SupplierHotel {
  hotelId: string;
  name: string;
  price: number;
  city: string;
  commissionPct: number;
}
export interface HotelOffer {
  name: string;
  price: number;
  supplier: Supplier;
  commissionPct: number;
}
export interface HotelQuery {
  city: string;
  minPrice?: number;
  maxPrice?: number;
}
export interface SupplierResult {
  supplier: Supplier;
  hotels: SupplierHotel[];
}
