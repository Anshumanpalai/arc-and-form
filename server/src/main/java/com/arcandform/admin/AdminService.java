package com.arcandform.admin;

import com.arcandform.admin.dto.AdminOrderResponse;
import com.arcandform.admin.dto.AdminProductRequest;
import com.arcandform.admin.dto.AdminSummaryResponse;
import com.arcandform.admin.dto.UpdateOrderStatusRequest;
import com.arcandform.category.Category;
import com.arcandform.category.CategoryRepository;
import com.arcandform.common.ApiException;
import com.arcandform.order.Order;
import com.arcandform.order.OrderRepository;
import com.arcandform.order.OrderStatus;
import com.arcandform.product.Product;
import com.arcandform.product.ProductRepository;
import com.arcandform.product.ProductResponse;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.text.Normalizer;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

@Service
@Transactional
public class AdminService {
    private static final Pattern NON_LATIN = Pattern.compile("[^\\w-]");
    private static final Pattern WHITESPACE = Pattern.compile("[\\s]");

    private final OrderRepository orderRepository;
    private final ProductRepository productRepository;
    private final CategoryRepository categoryRepository;

    public AdminService(
            OrderRepository orderRepository,
            ProductRepository productRepository,
            CategoryRepository categoryRepository
    ) {
        this.orderRepository = orderRepository;
        this.productRepository = productRepository;
        this.categoryRepository = categoryRepository;
    }

    @Transactional(readOnly = true)
    public AdminSummaryResponse getSummary() {
        BigDecimal totalRevenue = orderRepository.sumTotalByStatusIn(
                List.of(OrderStatus.PAID, OrderStatus.SHIPPED, OrderStatus.DELIVERED)
        );
        long totalOrders = orderRepository.count();
        long pendingShipments = orderRepository.countByStatus(OrderStatus.PAID);
        long lowStockAlerts = productRepository.countByStockLessThanEqual(3);

        List<AdminOrderResponse> recentOrders = orderRepository.findAll(
                PageRequest.of(0, 5, Sort.by(Sort.Direction.DESC, "createdAt"))
        ).stream().map(AdminOrderResponse::fromEntity).toList();

        List<ProductResponse> lowStockProducts = productRepository.findByStockLessThanEqualOrderByStockAsc(3)
                .stream().map(ProductResponse::fromEntity).toList();

        return new AdminSummaryResponse(
                totalRevenue != null ? totalRevenue : BigDecimal.ZERO,
                totalOrders,
                pendingShipments,
                lowStockAlerts,
                recentOrders,
                lowStockProducts
        );
    }

    @Transactional(readOnly = true)
    public Page<AdminOrderResponse> getOrders(OrderStatus status, String query, Pageable pageable) {
        String cleanQuery = (query != null && !query.isBlank()) ? query.trim() : null;
        return orderRepository.findForAdmin(status, cleanQuery, pageable)
                .map(AdminOrderResponse::fromEntity);
    }

    public AdminOrderResponse updateOrderStatus(Long orderId, UpdateOrderStatusRequest request) {
        Order order = orderRepository.findById(orderId)
                .orElseThrow(() -> new ApiException("Order not found with id: " + orderId, HttpStatus.NOT_FOUND));

        order.setStatus(request.status());
        if (request.trackingNumber() != null) {
            order.setTrackingNumber(request.trackingNumber().trim());
        }

        Order saved = orderRepository.save(order);
        return AdminOrderResponse.fromEntity(saved);
    }

    @Transactional(readOnly = true)
    public Page<ProductResponse> getProducts(String search, Long categoryId, Pageable pageable) {
        Specification<Product> spec = (root, query, cb) -> cb.conjunction();

        if (search != null && !search.isBlank()) {
            String pattern = "%" + search.trim().toLowerCase() + "%";
            spec = spec.and((root, query, cb) -> cb.or(
                    cb.like(cb.lower(root.get("name")), pattern),
                    cb.like(cb.lower(root.get("description")), pattern),
                    cb.like(cb.lower(root.get("slug")), pattern)
            ));
        }

        if (categoryId != null) {
            spec = spec.and((root, query, cb) -> cb.equal(root.get("category").get("id"), categoryId));
        }

        return productRepository.findAll(spec, pageable).map(ProductResponse::fromEntity);
    }

    public ProductResponse createProduct(AdminProductRequest request) {
        Category category = categoryRepository.findById(request.categoryId())
                .orElseThrow(() -> new ApiException("Category not found with id: " + request.categoryId(), HttpStatus.NOT_FOUND));

        String slug = (request.slug() != null && !request.slug().isBlank())
                ? toSlug(request.slug())
                : toSlug(request.name());

        if (productRepository.existsBySlug(slug)) {
            slug = slug + "-" + System.currentTimeMillis() % 10000;
        }

        Product product = new Product();
        product.setName(request.name().trim());
        product.setSlug(slug);
        product.setDescription(request.description().trim());
        product.setPrice(request.price());
        product.setStock(request.stock());
        product.setFeatured(request.featured());
        product.setCategory(category);
        product.setSizes(request.sizes() != null ? request.sizes() : List.of());
        product.setImages(request.images() != null ? request.images() : List.of());

        Product saved = productRepository.save(product);
        return ProductResponse.fromEntity(saved);
    }

    public ProductResponse updateProduct(Long productId, AdminProductRequest request) {
        Product product = productRepository.findById(productId)
                .orElseThrow(() -> new ApiException("Product not found with id: " + productId, HttpStatus.NOT_FOUND));

        Category category = categoryRepository.findById(request.categoryId())
                .orElseThrow(() -> new ApiException("Category not found with id: " + request.categoryId(), HttpStatus.NOT_FOUND));

        String slug = (request.slug() != null && !request.slug().isBlank())
                ? toSlug(request.slug())
                : product.getSlug();

        if (!slug.equals(product.getSlug()) && productRepository.existsBySlug(slug)) {
            throw new ApiException("A product with slug '" + slug + "' already exists", HttpStatus.BAD_REQUEST);
        }

        product.setName(request.name().trim());
        product.setSlug(slug);
        product.setDescription(request.description().trim());
        product.setPrice(request.price());
        product.setStock(request.stock());
        product.setFeatured(request.featured());
        product.setCategory(category);
        if (request.sizes() != null) {
            product.setSizes(request.sizes());
        }
        if (request.images() != null) {
            product.setImages(request.images());
        }

        Product saved = productRepository.save(product);
        return ProductResponse.fromEntity(saved);
    }

    public void deleteProduct(Long productId) {
        Product product = productRepository.findById(productId)
                .orElseThrow(() -> new ApiException("Product not found with id: " + productId, HttpStatus.NOT_FOUND));

        productRepository.delete(product);
    }

    private String toSlug(String input) {
        String nowhitespace = WHITESPACE.matcher(input.trim()).replaceAll("-");
        String normalized = Normalizer.normalize(nowhitespace, Normalizer.Form.NFD);
        String slug = NON_LATIN.matcher(normalized).replaceAll("");
        return slug.toLowerCase(Locale.ENGLISH).replaceAll("-{2,}", "-").replaceAll("^-|-$", "");
    }
}
