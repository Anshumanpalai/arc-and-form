import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useCartStore = create(
  persist(
    (set, get) => ({
      items: [],
      isOpen: false,

      openCart: () => set({ isOpen: true }),
      closeCart: () => set({ isOpen: false }),

      addItem: (product, quantity = 1, selectedSize = null) =>
        set((state) => {
          const productId = product.id || product._id;
          const key = selectedSize ? `${productId}-${selectedSize}` : `${productId}`;
          const existing = state.items.find((item) => item.key === key);

          const maxStock = product.stock || 0;
          if (maxStock <= 0) return { isOpen: true }; // out of stock

          const currentQty = existing ? existing.quantity : 0;
          const nextQuantity = Math.min(currentQty + quantity, maxStock);

          const imgUrl = Array.isArray(product.images) && product.images.length > 0
            ? (typeof product.images[0] === 'string' ? product.images[0] : product.images[0]?.url)
            : '';

          if (existing) {
            return {
              items: state.items.map((item) =>
                item.key === key
                  ? { ...item, quantity: nextQuantity, stock: maxStock, price: product.price }
                  : item
              ),
              isOpen: true,
            };
          }

          const newItem = {
            key,
            productId,
            slug: product.slug,
            name: product.name,
            selectedSize,
            image: imgUrl,
            price: Number(product.price),
            stock: maxStock,
            quantity: Math.min(quantity, maxStock),
          };

          return {
            items: [...state.items, newItem],
            isOpen: true,
          };
        }),

      updateQuantity: (key, quantity) =>
        set((state) => ({
          items:
            quantity < 1
              ? state.items.filter((item) => item.key !== key)
              : state.items.map((item) =>
                  item.key === key ? { ...item, quantity: Math.min(quantity, item.stock) } : item
                ),
        })),

      removeItem: (key) =>
        set((state) => ({
          items: state.items.filter((item) => item.key !== key),
        })),

      clearCart: () => set({ items: [] }),
    }),
    {
      name: 'arc-form-cart',
      version: 2,
    }
  )
);

export const cartSubtotal = (items) =>
  items.reduce((total, item) => total + Number(item.price || 0) * Number(item.quantity || 0), 0);

export const cartTotalCount = (items) =>
  items.reduce((total, item) => total + Number(item.quantity || 0), 0);
