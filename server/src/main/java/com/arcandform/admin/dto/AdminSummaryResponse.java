package com.arcandform.admin.dto;

import com.arcandform.product.ProductResponse;
import java.math.BigDecimal;
import java.util.List;

public record AdminSummaryResponse(
        BigDecimal totalRevenue,
        long totalOrders,
        long pendingShipments,
        long lowStockAlerts,
        List<AdminOrderResponse> recentOrders,
        List<ProductResponse> lowStockProducts
) {}
