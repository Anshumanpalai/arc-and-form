package com.arcandform.product;

import com.arcandform.category.CategoryResponse;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

public record ProductResponse(
        Long id,
        String name,
        String slug,
        String description,
        BigDecimal price,
        int stock,
        boolean featured,
        CategoryResponse category,
        List<String> sizes,
        List<String> images,
        Instant createdAt
) {
    public static ProductResponse fromEntity(Product product) {
        if (product == null) return null;
        return new ProductResponse(
                product.getId(),
                product.getName(),
                product.getSlug(),
                product.getDescription(),
                product.getPrice(),
                product.getStock(),
                product.isFeatured(),
                CategoryResponse.fromEntity(product.getCategory()),
                product.getSizes() != null ? List.copyOf(product.getSizes()) : List.of(),
                product.getImages() != null ? List.copyOf(product.getImages()) : List.of(),
                product.getCreatedAt()
        );
    }
}
