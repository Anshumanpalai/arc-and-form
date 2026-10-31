package com.arcandform.order;

import com.arcandform.common.ApiException;
import com.arcandform.payment.PaymentService;
import com.arcandform.payment.ProcessedStripeEvent;
import com.arcandform.payment.ProcessedStripeEventRepository;
import com.arcandform.product.Product;
import com.arcandform.product.ProductRepository;
import com.arcandform.user.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class OrderServiceTest {

    @Mock
    private OrderRepository orderRepository;

    @Mock
    private ProductRepository productRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private ProcessedStripeEventRepository processedStripeEventRepository;

    @Mock
    private PaymentService paymentService;

    @InjectMocks
    private OrderService orderService;

    private Product product1;
    private ShippingAddressRequest shippingAddress;

    @BeforeEach
    void setUp() {
        product1 = new Product();
        product1.setId(10L);
        product1.setName("Japanese Selvedge Denim");
        product1.setPrice(new BigDecimal("120.00"));
        product1.setStock(15);

        shippingAddress = new ShippingAddressRequest(
                "Eleanor Vance",
                "123 Architectural Way",
                "Suite 4B",
                "New York",
                "NY",
                "10001",
                "US"
        );
    }

    @Test
    @DisplayName("Create Checkout: recalculates total server-side and creates pending order")
    void createCheckout_RecalculatesPriceServerSide() {
        CreateOrderItemRequest item = new CreateOrderItemRequest(10L, 2, "32");
        CreateCheckoutRequest request = new CreateCheckoutRequest(List.of(item), shippingAddress);

        when(productRepository.findById(10L)).thenReturn(Optional.of(product1));
        when(orderRepository.save(any(Order.class))).thenAnswer(inv -> inv.getArgument(0));
        when(paymentService.createCheckoutSession(any(Order.class), anyList()))
                .thenReturn(new PaymentService.CheckoutSessionResult("sess_123", "https://checkout.stripe.com/pay/sess_123"));

        CheckoutResponse response = orderService.createCheckout(request, null);

        assertThat(response).isNotNull();
        assertThat(response.orderNumber()).startsWith("AF-");
        assertThat(response.checkoutUrl()).isEqualTo("https://checkout.stripe.com/pay/sess_123");
        assertThat(response.sessionId()).isEqualTo("sess_123");

        verify(orderRepository, atLeastOnce()).save(argThat(savedOrder ->
                savedOrder.getTotal().compareTo(new BigDecimal("240.00")) == 0 &&
                savedOrder.getStatus() == OrderStatus.PENDING
        ));
    }

    @Test
    @DisplayName("Create Checkout: throws 400 when requested quantity exceeds available stock")
    void createCheckout_InsufficientStock_ThrowsBadRequest() {
        CreateOrderItemRequest item = new CreateOrderItemRequest(10L, 20, "32"); // requested 20, stock is 15
        CreateCheckoutRequest request = new CreateCheckoutRequest(List.of(item), shippingAddress);

        when(productRepository.findById(10L)).thenReturn(Optional.of(product1));

        assertThatThrownBy(() -> orderService.createCheckout(request, null))
                .isInstanceOf(ApiException.class)
                .satisfies(ex -> {
                    ApiException apiEx = (ApiException) ex;
                    assertThat(apiEx.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
                    assertThat(apiEx.getMessage()).contains("Insufficient stock");
                });

        verify(orderRepository, never()).save(any(Order.class));
    }

    @Test
    @DisplayName("Webhook Idempotency: first delivery processes order and decrements stock")
    void completePayment_FirstDelivery_CompletesOrder() {
        String eventId = "evt_test_first_001";
        String orderNumber = "AF-123456";

        Order order = new Order();
        order.setId(1L);
        order.setOrderNumber(orderNumber);
        order.setStatus(OrderStatus.PENDING);
        order.setTotal(new BigDecimal("240.00"));

        OrderItem orderItem = new OrderItem();
        orderItem.setProduct(product1);
        orderItem.setQuantity(2);
        orderItem.setUnitPrice(new BigDecimal("120.00"));
        order.getItems().add(orderItem);

        when(processedStripeEventRepository.existsById(eventId)).thenReturn(false);
        when(orderRepository.findByOrderNumber(orderNumber)).thenReturn(Optional.of(order));
        when(productRepository.decrementStockConditionally(10L, 2)).thenReturn(1);
        when(orderRepository.save(any(Order.class))).thenReturn(order);

        orderService.completePayment(orderNumber, "sess_123", eventId);

        assertThat(order.getStatus()).isEqualTo(OrderStatus.PAID);
        verify(productRepository).decrementStockConditionally(10L, 2);
        verify(processedStripeEventRepository).save(any(ProcessedStripeEvent.class));
        verify(orderRepository, atLeastOnce()).save(order);
    }

    @Test
    @DisplayName("Webhook Idempotency: duplicate delivery skips processing without double-decrementing stock")
    void completePayment_DuplicateDelivery_SkipsIdempotently() {
        String eventId = "evt_test_duplicate_002";
        String orderNumber = "AF-123456";

        when(processedStripeEventRepository.existsById(eventId)).thenReturn(true);

        orderService.completePayment(orderNumber, "sess_123", eventId);

        verify(orderRepository, never()).findByOrderNumber(anyString());
        verify(productRepository, never()).decrementStockConditionally(anyLong(), anyInt());
        verify(orderRepository, never()).save(any(Order.class));
    }
}
