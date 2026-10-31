package com.arcandform.order;

public enum OrderStatus {
    PENDING,
    PAID,
    SHIPPED,
    DELIVERED,
    CANCELLED;

    public boolean canTransitionTo(OrderStatus next) {
        if (this == next) return true;
        return switch (this) {
            case PENDING -> next == PAID || next == CANCELLED;
            case PAID -> next == SHIPPED || next == CANCELLED;
            case SHIPPED -> next == DELIVERED || next == CANCELLED;
            case DELIVERED, CANCELLED -> false;
        };
    }
}
