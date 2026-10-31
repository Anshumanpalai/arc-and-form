package com.arcandform.admin.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.util.List;

public record AdminProductRequest(
        @NotBlank(message = "Product name is required")
        String name,
        String slug,
        @NotBlank(message = "Product description is required")
        String description,
        @NotNull(message = "Price is required")
        @DecimalMin(value = "0.01", message = "Price must be greater than zero")
        BigDecimal price,
        @Min(value = 0, message = "Stock cannot be negative")
        int stock,
        boolean featured,
        @NotNull(message = "Category ID is required")
        Long categoryId,
        List<String> sizes,
        List<String> images
) {}
