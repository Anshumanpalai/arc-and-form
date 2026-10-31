package com.arcandform.category;

public record CategoryResponse(
        Long id,
        String name,
        String slug
) {
    public static CategoryResponse fromEntity(Category category) {
        if (category == null) return null;
        return new CategoryResponse(
                category.getId(),
                category.getName(),
                category.getSlug()
        );
    }
}
