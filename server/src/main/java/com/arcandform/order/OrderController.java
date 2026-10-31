package com.arcandform.order;

import com.arcandform.auth.UserPrincipal;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/orders")
@Tag(name = "Orders", description = "Customer checkout and order retrieval endpoints")
public class OrderController {
    private final OrderService orderService;

    public OrderController(OrderService orderService) {
        this.orderService = orderService;
    }

    @PostMapping("/checkout")
    @Operation(summary = "Create pending order and initiate Stripe Checkout session")
    public ResponseEntity<CheckoutResponse> createCheckout(
            @Valid @RequestBody CreateCheckoutRequest request,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        Long userId = principal != null ? principal.id() : null;
        CheckoutResponse response = orderService.createCheckout(request, userId);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @GetMapping
    @Operation(summary = "List order history for authenticated customer")
    public ResponseEntity<Page<OrderResponse>> listMyOrders(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int limit
    ) {
        Long userId = principal.id();
        Page<OrderResponse> orders = orderService.getOrdersForUser(userId, page, limit);
        return ResponseEntity.ok(orders);
    }

    @GetMapping("/{orderNumber}")
    @Operation(summary = "Get order details and item breakdown by order number")
    public ResponseEntity<Map<String, OrderResponse>> getOrderByOrderNumber(
            @PathVariable String orderNumber,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        Long userId = principal != null ? principal.id() : null;
        boolean isAdmin = principal != null && "ADMIN".equalsIgnoreCase(principal.role());
        OrderResponse order = orderService.getOrderByOrderNumber(orderNumber, userId, isAdmin);
        return ResponseEntity.ok(Map.of("order", order));
    }
}
