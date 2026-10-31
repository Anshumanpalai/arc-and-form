package com.arcandform.order;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import java.util.List;

public record CreateCheckoutRequest(
        @NotEmpty(message = "Order must contain at least one item")
        @Valid
        List<CreateOrderItemRequest> items,

        @NotNull(message = "Shipping address is required")
        @Valid
        ShippingAddressRequest shippingAddress
) {}
