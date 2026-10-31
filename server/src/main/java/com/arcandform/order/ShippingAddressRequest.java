package com.arcandform.order;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ShippingAddressRequest(
        @NotBlank(message = "Recipient full name is required")
        @Size(max = 255)
        String fullName,

        @NotBlank(message = "Street address line 1 is required")
        @Size(max = 255)
        String addressLine1,

        @Size(max = 255)
        String addressLine2,

        @NotBlank(message = "City is required")
        @Size(max = 100)
        String city,

        @NotBlank(message = "State or Province is required")
        @Size(max = 100)
        String state,

        @NotBlank(message = "Postal / ZIP code is required")
        @Size(max = 50)
        String postalCode,

        @NotBlank(message = "Country is required")
        @Size(max = 100)
        String country
) {
    public ShippingAddress toEmbeddable() {
        return new ShippingAddress(
                fullName.trim(),
                addressLine1.trim(),
                addressLine2 != null ? addressLine2.trim() : null,
                city.trim(),
                state.trim(),
                postalCode.trim(),
                country.trim()
        );
    }
}
