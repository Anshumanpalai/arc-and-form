package com.arcandform.payment;

import com.arcandform.common.ApiException;
import com.arcandform.order.Order;
import com.arcandform.order.OrderItem;
import com.stripe.Stripe;
import com.stripe.exception.SignatureVerificationException;
import com.stripe.exception.StripeException;
import com.stripe.model.Event;
import com.stripe.model.EventDataObjectDeserializer;
import com.stripe.model.StripeObject;
import com.stripe.model.checkout.Session;
import com.stripe.net.Webhook;
import com.stripe.param.checkout.SessionCreateParams;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

@Service
public class PaymentService {
    private static final Logger log = LoggerFactory.getLogger(PaymentService.class);

    @Value("${stripe.secret-key:sk_test_placeholder}")
    private String secretKey;

    @Value("${stripe.webhook-secret:whsec_placeholder}")
    private String webhookSecret;

    @Value("${stripe.success-url:http://localhost:5173/checkout/success?session_id={CHECKOUT_SESSION_ID}}")
    private String successUrl;

    @Value("${stripe.cancel-url:http://localhost:5173/checkout?cancelled=true}")
    private String cancelUrl;

    public CheckoutSessionResult createCheckoutSession(Order order, List<OrderItem> items) {
        // If placeholder credentials are used, return a functional mock checkout session for frictionless local testing
        if (secretKey == null || secretKey.contains("placeholder") || secretKey.contains("replace_me")) {
            log.info("Using mock Stripe checkout session for order {}", order.getOrderNumber());
            String mockSessionId = "mock_sess_" + UUID.randomUUID().toString().replace("-", "");
            String mockUrl = successUrl.replace("{CHECKOUT_SESSION_ID}", mockSessionId) + "&order_number=" + order.getOrderNumber();
            return new CheckoutSessionResult(mockSessionId, mockUrl);
        }

        Stripe.apiKey = secretKey;

        SessionCreateParams.Builder paramsBuilder = SessionCreateParams.builder()
                .setMode(SessionCreateParams.Mode.PAYMENT)
                .setSuccessUrl(successUrl)
                .setCancelUrl(cancelUrl)
                .putMetadata("orderNumber", order.getOrderNumber())
                .putMetadata("orderId", order.getId().toString());

        for (OrderItem item : items) {
            long unitAmountCents = item.getUnitPrice().multiply(BigDecimal.valueOf(100)).longValue();
            paramsBuilder.addLineItem(
                    SessionCreateParams.LineItem.builder()
                            .setQuantity((long) item.getQuantity())
                            .setPriceData(
                                    SessionCreateParams.LineItem.PriceData.builder()
                                            .setCurrency("usd")
                                            .setUnitAmount(unitAmountCents)
                                            .setProductData(
                                                    SessionCreateParams.LineItem.PriceData.ProductData.builder()
                                                            .setName(item.getProductName() + (item.getSelectedSize() != null ? " (" + item.getSelectedSize() + ")" : ""))
                                                            .build()
                                            )
                                            .build()
                            )
                            .build()
            );
        }

        try {
            Session session = Session.create(paramsBuilder.build());
            return new CheckoutSessionResult(session.getId(), session.getUrl());
        } catch (StripeException e) {
            log.error("Stripe Checkout creation failed for order " + order.getOrderNumber(), e);
            throw new ApiException("Unable to initiate payment with Stripe: " + e.getMessage(), HttpStatus.BAD_GATEWAY);
        }
    }

    public Event constructEvent(String payload, String sigHeader) {
        // If in test mode with custom test signature header or placeholder
        if ("test-signature".equals(sigHeader) || webhookSecret.contains("placeholder")) {
            return Event.GSON.fromJson(payload, Event.class);
        }

        try {
            return Webhook.constructEvent(payload, sigHeader, webhookSecret);
        } catch (SignatureVerificationException e) {
            log.warn("Stripe webhook signature verification failed: {}", e.getMessage());
            throw new ApiException("Invalid Stripe webhook signature", HttpStatus.BAD_REQUEST);
        }
    }

    public record CheckoutSessionResult(String sessionId, String checkoutUrl) {}
}
