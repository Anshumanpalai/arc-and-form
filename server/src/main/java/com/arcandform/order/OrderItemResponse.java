package com.arcandform.order;

import java.math.BigDecimal;

public record OrderItemResponse(
        Long id,
        Long productId,
        String productName,
        int quantity,
        BigDecimal unitPrice,
        String selectedSize,
        BigDecimal subtotal
) {
    public static OrderItemResponse fromEntity(OrderItem item) {
        if (item == null) return null;
        BigDecimal subtotal = item.getUnitPrice().multiply(BigDecimal.valueOf(item.getQuantity()));
        return new OrderItemResponse(
                item.getId(),
                item.getProduct() != null ? item.getProduct().getId() : null,
                item.getProductName(),
                item.getQuantity(),
                item.getUnitPrice(),
                item.getSelectedSize(),
                subtotal
        );
    }
}
