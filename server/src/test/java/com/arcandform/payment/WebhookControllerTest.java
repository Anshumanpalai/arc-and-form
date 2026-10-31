package com.arcandform.payment;

import com.arcandform.common.ApiException;
import com.arcandform.order.OrderService;
import com.stripe.model.Event;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class WebhookControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private PaymentService paymentService;

    @MockBean
    private OrderService orderService;

    @Test
    @DisplayName("Webhook: successfully handles verified checkout.session.completed event")
    void handleStripeWebhook_Success() throws Exception {
        String payload = """
                {
                  "id": "evt_test_success_123",
                  "type": "checkout.session.completed",
                  "data": {
                    "object": {
                      "id": "cs_test_abc123",
                      "client_reference_id": "AF-998877",
                      "metadata": {
                        "orderNumber": "AF-998877"
                      },
                      "payment_status": "paid"
                    }
                  }
                }
                """;

        Event event = Event.GSON.fromJson(payload, Event.class);
        when(paymentService.constructEvent(anyString(), anyString())).thenReturn(event);

        mockMvc.perform(post("/api/webhooks/stripe")
                        .header("Stripe-Signature", "t=123,v1=valid_sig")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(payload))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.received").value(true));

        verify(orderService).completePayment("AF-998877", "cs_test_abc123", "evt_test_success_123");
    }

    @Test
    @DisplayName("Webhook: returns 400 Bad Request when signature is invalid or tampered")
    void handleStripeWebhook_InvalidSignature_Returns400() throws Exception {
        when(paymentService.constructEvent(anyString(), any()))
                .thenThrow(new ApiException("Invalid Stripe webhook signature", HttpStatus.BAD_REQUEST));

        mockMvc.perform(post("/api/webhooks/stripe")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest());

        verify(orderService, never()).completePayment(anyString(), anyString(), anyString());
    }
}
