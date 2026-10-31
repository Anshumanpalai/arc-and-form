package com.arcandform.order;

import java.math.BigDecimal;

public record CheckoutResponse(
        String orderNumber,
        String checkoutUrl,
        String sessionId,
        BigDecimal total
) {}
