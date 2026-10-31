package com.arcandform.product;

import java.util.List;

public record ProductListResponse(
        List<ProductResponse> products,
        PaginationMeta pagination
) {
    public record PaginationMeta(
            int page,
            int limit,
            long total,
            int pages
    ) {}
}
