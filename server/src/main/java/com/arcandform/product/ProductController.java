package com.arcandform.product;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/products")
@Tag(name = "Products", description = "Storefront product browsing and search endpoints")
public class ProductController {
    private final ProductService productService;

    public ProductController(ProductService productService) {
        this.productService = productService;
    }

    @GetMapping
    @Operation(summary = "Browse products with category filter, search, sort, and pagination")
    public ResponseEntity<ProductListResponse> listProducts(
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String search,
            @RequestParam(defaultValue = "newest") String sort,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "12") int limit
    ) {
        ProductListResponse response = productService.getProducts(category, search, sort, page, limit);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/{slug}")
    @Operation(summary = "Get product details by unique slug")
    public ResponseEntity<Map<String, ProductResponse>> getProductBySlug(@PathVariable String slug) {
        ProductResponse product = productService.getProductBySlug(slug);
        return ResponseEntity.ok(Map.of("product", product));
    }
}
