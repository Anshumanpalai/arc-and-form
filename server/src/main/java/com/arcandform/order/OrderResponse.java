package com.arcandform.order;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

public record OrderResponse(
        Long id,
        String orderNumber,
        OrderStatus status,
        ShippingAddress shippingAddress,
        BigDecimal total,
        String trackingNumber,
        Instant createdAt,
        List<OrderItemResponse> items
) {
    public static OrderResponse fromEntity(Order order) {
        if (order == null) return null;
        List<OrderItemResponse> itemDtos = order.getItems() != null
                ? order.getItems().stream().map(OrderItemResponse::fromEntity).toList()
                : List.of();

        return new OrderResponse(
                order.getId(),
                order.getOrderNumber(),
                order.getStatus(),
                order.getShippingAddress(),
                order.getTotal(),
                order.getTrackingNumber(),
                order.getCreatedAt(),
                itemDtos
        );
    }
}
