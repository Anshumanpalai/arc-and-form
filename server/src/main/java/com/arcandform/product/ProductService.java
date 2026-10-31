package com.arcandform.product;

import com.arcandform.common.ResourceNotFoundException;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;

@Service
public class ProductService {
    private final ProductRepository productRepository;

    public ProductService(ProductRepository productRepository) {
        this.productRepository = productRepository;
    }

    @Transactional(readOnly = true)
    public ProductListResponse getProducts(String categorySlug, String search, String sort, int page, int limit) {
        int pageIndex = Math.max(0, page - 1);
        int pageSize = Math.min(Math.max(1, limit), 48);

        Sort sorting = switch (sort != null ? sort : "newest") {
            case "price_asc" -> Sort.by(Sort.Direction.ASC, "price");
            case "price_desc" -> Sort.by(Sort.Direction.DESC, "price");
            default -> Sort.by(Sort.Direction.DESC, "createdAt");
        };

        Pageable pageable = PageRequest.of(pageIndex, pageSize, sorting);

        Specification<Product> spec = (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();

            if (categorySlug != null && !categorySlug.isBlank()) {
                predicates.add(cb.equal(root.get("category").get("slug"), categorySlug.trim()));
            }

            if (search != null && !search.isBlank()) {
                String searchPattern = "%" + search.trim().toLowerCase() + "%";
                predicates.add(cb.like(cb.lower(root.get("name")), searchPattern));
            }

            return cb.and(predicates.toArray(new Predicate[0]));
        };

        Page<Product> productPage = productRepository.findAll(spec, pageable);

        List<ProductResponse> dtos = productPage.getContent().stream()
                .map(ProductResponse::fromEntity)
                .toList();

        ProductListResponse.PaginationMeta meta = new ProductListResponse.PaginationMeta(
                page,
                pageSize,
                productPage.getTotalElements(),
                productPage.getTotalPages()
        );

        return new ProductListResponse(dtos, meta);
    }

    @Transactional(readOnly = true)
    public ProductResponse getProductBySlug(String slug) {
        Product product = productRepository.findBySlugWithDetails(slug)
                .orElseThrow(() -> new ResourceNotFoundException("Product not found with slug: " + slug));
        return ProductResponse.fromEntity(product);
    }
}
