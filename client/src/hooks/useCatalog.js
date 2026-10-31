import { useQuery } from '@tanstack/react-query';
import { getCategories, getProduct, getProducts } from '../services/catalog';

export function useProducts(filters) {
  return useQuery({ queryKey: ['products', filters], queryFn: () => getProducts(filters), placeholderData: (previous) => previous });
}
export function useProduct(slug) { return useQuery({ queryKey: ['product', slug], queryFn: () => getProduct(slug), enabled: Boolean(slug) }); }
export function useCategories() { return useQuery({ queryKey: ['categories'], queryFn: getCategories, staleTime: 5 * 60 * 1000 }); }
