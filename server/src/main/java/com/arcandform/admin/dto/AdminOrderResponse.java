package com.arcandform.admin.dto;

import com.arcandform.order.Order;
import com.arcandform.order.OrderItemResponse;
import com.arcandform.order.OrderStatus;
import com.arcandform.order.ShippingAddress;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

public record AdminOrderResponse(
        Long id,
        String orderNumber,
        OrderStatus status,
        String customerEmail,
        String customerName,
        ShippingAddress shippingAddress,
        BigDecimal total,
        String trackingNumber,
        Instant createdAt,
        List<OrderItemResponse> items
) {
    public static AdminOrderResponse fromEntity(Order order) {
        if (order == null) return null;
        String email = order.getUser() != null ? order.getUser().getEmail() : "Guest Checkout";
        String name = order.getShippingAddress() != null && order.getShippingAddress().getFullName() != null
                ? order.getShippingAddress().getFullName()
                : (order.getUser() != null ? order.getUser().getName() : "Customer");
        List<OrderItemResponse> itemDtos = order.getItems() != null
                ? order.getItems().stream().map(OrderItemResponse::fromEntity).toList()
                : List.of();

        return new AdminOrderResponse(
                order.getId(),
                order.getOrderNumber(),
                order.getStatus(),
                email,
                name,
                order.getShippingAddress(),
                order.getTotal(),
                order.getTrackingNumber(),
                order.getCreatedAt(),
                itemDtos
        );
    }
}
