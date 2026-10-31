package com.arcandform.payment;

import com.arcandform.order.OrderService;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.stripe.model.Event;
import com.stripe.model.EventDataObjectDeserializer;
import com.stripe.model.checkout.Session;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/webhooks")
@Tag(name = "Webhooks", description = "Stripe and payment gateway webhook receivers")
public class WebhookController {
    private static final Logger log = LoggerFactory.getLogger(WebhookController.class);

    private final PaymentService paymentService;
    private final OrderService orderService;

    public WebhookController(PaymentService paymentService, OrderService orderService) {
        this.paymentService = paymentService;
        this.orderService = orderService;
    }

    @PostMapping("/stripe")
    @Operation(summary = "Stripe webhook endpoint verified with signing secret")
    public ResponseEntity<Map<String, Boolean>> handleStripeWebhook(
            @RequestBody String payload,
            @RequestHeader(value = "Stripe-Signature", required = false) String sigHeader
    ) {
        Event event = paymentService.constructEvent(payload, sigHeader);

        log.info("Received Stripe webhook event: id={}, type={}", event.getId(), event.getType());

        if ("checkout.session.completed".equals(event.getType())) {
            Session session = null;

            try {
                EventDataObjectDeserializer deserializer = event.getDataObjectDeserializer();
                if (deserializer != null && deserializer.getObject().isPresent()) {
                    session = (Session) deserializer.getObject().get();
                }
            } catch (Exception e) {
                log.debug("EventDataObjectDeserializer failed, falling back to direct JSON: {}", e.getMessage());
            }

            if (session == null) {
                try {
                    JsonObject root = JsonParser.parseString(payload).getAsJsonObject();
                    if (root.has("data") && root.getAsJsonObject("data").has("object")) {
                        session = Event.GSON.fromJson(root.getAsJsonObject("data").get("object"), Session.class);
                    }
                } catch (Exception e) {
                    log.warn("Direct JSON Session extraction failed: {}", e.getMessage());
                }
            }

            if (session != null) {
                String orderNumber = session.getMetadata() != null ? session.getMetadata().get("orderNumber") : null;
                if (orderNumber == null || orderNumber.isBlank()) {
                    orderNumber = session.getClientReferenceId();
                }
                String sessionId = session.getId();

                log.info("Processing checkout.session.completed for orderNumber={}, sessionId={}", orderNumber, sessionId);
                orderService.completePayment(orderNumber, sessionId, event.getId());
            } else {
                log.warn("Could not deserialize checkout Session from webhook event {}", event.getId());
            }
        }

        return ResponseEntity.ok(Map.of("received", true));
    }
}
