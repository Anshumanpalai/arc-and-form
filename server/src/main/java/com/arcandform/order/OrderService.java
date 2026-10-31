package com.arcandform.order;

import com.arcandform.common.ApiException;
import com.arcandform.common.ResourceNotFoundException;
import com.arcandform.payment.PaymentService;
import com.arcandform.payment.ProcessedStripeEvent;
import com.arcandform.payment.ProcessedStripeEventRepository;
import com.arcandform.product.Product;
import com.arcandform.product.ProductRepository;
import com.arcandform.user.Role;
import com.arcandform.user.User;
import com.arcandform.user.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.List;

@Service
public class OrderService {
    private static final Logger log = LoggerFactory.getLogger(OrderService.class);
    private static final SecureRandom RANDOM = new SecureRandom();

    private final OrderRepository orderRepository;
    private final ProductRepository productRepository;
    private final UserRepository userRepository;
    private final ProcessedStripeEventRepository processedStripeEventRepository;
    private final PaymentService paymentService;

    public OrderService(
            OrderRepository orderRepository,
            ProductRepository productRepository,
            UserRepository userRepository,
            ProcessedStripeEventRepository processedStripeEventRepository,
            PaymentService paymentService
    ) {
        this.orderRepository = orderRepository;
        this.productRepository = productRepository;
        this.userRepository = userRepository;
        this.processedStripeEventRepository = processedStripeEventRepository;
        this.paymentService = paymentService;
    }

    @Transactional
    public CheckoutResponse createCheckout(CreateCheckoutRequest request, Long userId) {
        if (request.items() == null || request.items().isEmpty()) {
            throw new ApiException("Cannot create an order without items", HttpStatus.BAD_REQUEST);
        }

        Order order = new Order();
        order.setOrderNumber(generateOrderNumber());
        order.setStatus(OrderStatus.PENDING);
        order.setShippingAddress(request.shippingAddress().toEmbeddable());

        if (userId != null) {
            userRepository.findById(userId).ifPresent(order::setUser);
        }

        BigDecimal calculatedTotal = BigDecimal.ZERO;
        List<OrderItem> items = new ArrayList<>();

        // Server-side price recalculation & stock availability verification
        for (CreateOrderItemRequest itemReq : request.items()) {
            Product product = productRepository.findById(itemReq.productId())
                    .orElseThrow(() -> new ResourceNotFoundException("Product not found with ID: " + itemReq.productId()));

            if (product.getStock() < itemReq.quantity()) {
                throw new ApiException(
                        "Insufficient stock for piece '" + product.getName() + "'. Available: " + product.getStock() + ", requested: " + itemReq.quantity(),
                        HttpStatus.BAD_REQUEST
                );
            }

            BigDecimal itemSubtotal = product.getPrice().multiply(BigDecimal.valueOf(itemReq.quantity()));
            calculatedTotal = calculatedTotal.add(itemSubtotal);

            OrderItem orderItem = new OrderItem(
                    order,
                    product,
                    itemReq.quantity(),
                    product.getPrice(), // Snapshot unit price at purchase time
                    product.getName(),  // Snapshot product name
                    itemReq.selectedSize()
            );
            items.add(orderItem);
        }

        order.setTotal(calculatedTotal);
        order.setItems(items);

        Order savedOrder = orderRepository.save(order);

        // Initiate Stripe Checkout session
        PaymentService.CheckoutSessionResult sessionResult = paymentService.createCheckoutSession(savedOrder, items);
        savedOrder.setStripeSessionId(sessionResult.sessionId());
        orderRepository.save(savedOrder);

        log.info("Created pending order {} for total ${}", savedOrder.getOrderNumber(), savedOrder.getTotal());

        return new CheckoutResponse(
                savedOrder.getOrderNumber(),
                sessionResult.checkoutUrl(),
                sessionResult.sessionId(),
                savedOrder.getTotal()
        );
    }

    @Transactional
    public void completePayment(String orderNumber, String stripeSessionId, String stripeEventId) {
        // Idempotency check: A repeated event does nothing
        if (processedStripeEventRepository.existsById(stripeEventId)) {
            log.info("Stripe event {} already processed. Idempotent return.", stripeEventId);
            return;
        }

        Order order = null;
        if (orderNumber != null && !orderNumber.isBlank()) {
            order = orderRepository.findByOrderNumber(orderNumber).orElse(null);
        }
        if (order == null && stripeSessionId != null && !stripeSessionId.isBlank()) {
            order = orderRepository.findByStripeSessionId(stripeSessionId).orElse(null);
        }

        if (order == null) {
            log.error("Order not found for completion: orderNumber={}, sessionId={}", orderNumber, stripeSessionId);
            throw new ResourceNotFoundException("Order not found for Stripe completion");
        }

        if (order.getStatus() == OrderStatus.PAID) {
            log.info("Order {} is already marked as PAID.", order.getOrderNumber());
            processedStripeEventRepository.save(new ProcessedStripeEvent(stripeEventId));
            return;
        }

        // Update status to PAID
        order.setStatus(OrderStatus.PAID);
        orderRepository.save(order);

        // Stock conditional update inside the same transaction
        for (OrderItem item : order.getItems()) {
            if (item.getProduct() != null) {
                int rows = productRepository.decrementStockConditionally(item.getProduct().getId(), item.getQuantity());
                if (rows == 0) {
                    log.warn("Conditional stock update did not decrement stock for product {} (insufficient stock at fulfillment)", item.getProduct().getId());
                } else {
                    log.info("Decremented stock by {} for product {}", item.getQuantity(), item.getProduct().getId());
                }
            }
        }

        // Record processed event in idempotency ledger
        processedStripeEventRepository.save(new ProcessedStripeEvent(stripeEventId));
        log.info("Successfully completed order {} and recorded webhook event {}", order.getOrderNumber(), stripeEventId);
    }

    @Transactional(readOnly = true)
    public OrderResponse getOrderByOrderNumber(String orderNumber, Long currentUserId, boolean isAdmin) {
        Order order = orderRepository.findByOrderNumberWithItems(orderNumber)
                .orElseThrow(() -> new ResourceNotFoundException("Order not found: " + orderNumber));

        // Authorization check: User can view their own orders; admin can view all
        if (!isAdmin && order.getUser() != null && (currentUserId == null || !order.getUser().getId().equals(currentUserId))) {
            throw new ApiException("You do not have permission to view this order", HttpStatus.FORBIDDEN);
        }

        return OrderResponse.fromEntity(order);
    }

    @Transactional(readOnly = true)
    public Page<OrderResponse> getOrdersForUser(Long userId, int page, int limit) {
        Pageable pageable = PageRequest.of(Math.max(0, page - 1), Math.min(Math.max(1, limit), 50));
        return orderRepository.findByUserIdOrderByCreatedAtDesc(userId, pageable)
                .map(OrderResponse::fromEntity);
    }

    private String generateOrderNumber() {
        int randomCode = 100000 + RANDOM.nextInt(900000);
        return "AF-" + randomCode;
    }
}
