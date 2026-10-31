package com.arcandform.admin.dto;

import com.arcandform.order.OrderStatus;
import jakarta.validation.constraints.NotNull;

public record UpdateOrderStatusRequest(
        @NotNull(message = "Order status is required")
        OrderStatus status,
        String trackingNumber
) {}
