package com.arcandform.payment;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "processed_stripe_events")
public class ProcessedStripeEvent {
    @Id
    @Column(name = "event_id", nullable = false, length = 255)
    private String eventId;

    @Column(name = "processed_at", nullable = false, updatable = false)
    private Instant processedAt = Instant.now();

    public ProcessedStripeEvent() {}

    public ProcessedStripeEvent(String eventId) {
        this.eventId = eventId;
        this.processedAt = Instant.now();
    }

    public String getEventId() { return eventId; }
    public void setEventId(String eventId) { this.eventId = eventId; }

    public Instant getProcessedAt() { return processedAt; }
    public void setProcessedAt(Instant processedAt) { this.processedAt = processedAt; }
}
