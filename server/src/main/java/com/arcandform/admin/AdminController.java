package com.arcandform.admin;

import com.arcandform.admin.dto.*;
import com.arcandform.order.OrderStatus;
import com.arcandform.product.ProductResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/admin")
@PreAuthorize("hasRole('ADMIN')")
@Tag(name = "Admin", description = "Storefront administration endpoints")
public class AdminController {

    private final AdminService adminService;
    private final CloudinaryService cloudinaryService;

    public AdminController(AdminService adminService, CloudinaryService cloudinaryService) {
        this.adminService = adminService;
        this.cloudinaryService = cloudinaryService;
    }

    @GetMapping("/summary")
    @Operation(summary = "Get high-level overview metrics, recent orders, and stock alerts")
    public ResponseEntity<AdminSummaryResponse> getSummary() {
        return ResponseEntity.ok(adminService.getSummary());
    }

    @GetMapping("/orders")
    @Operation(summary = "Get paginated orders with optional status filter and customer search")
    public ResponseEntity<Page<AdminOrderResponse>> getOrders(
            @RequestParam(required = false) OrderStatus status,
            @RequestParam(required = false) String query,
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC) Pageable pageable
    ) {
        return ResponseEntity.ok(adminService.getOrders(status, query, pageable));
    }

    @PatchMapping("/orders/{id}/status")
    @Operation(summary = "Update order fulfillment status and optional carrier tracking number")
    public ResponseEntity<AdminOrderResponse> updateOrderStatus(
            @PathVariable Long id,
            @Valid @RequestBody UpdateOrderStatusRequest request
    ) {
        return ResponseEntity.ok(adminService.updateOrderStatus(id, request));
    }

    @GetMapping("/products")
    @Operation(summary = "Get all products with full admin details, search, and category filtering")
    public ResponseEntity<Page<ProductResponse>> getProducts(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) Long categoryId,
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC) Pageable pageable
    ) {
        return ResponseEntity.ok(adminService.getProducts(search, categoryId, pageable));
    }

    @PostMapping("/products")
    @Operation(summary = "Create a new catalog piece")
    public ResponseEntity<ProductResponse> createProduct(
            @Valid @RequestBody AdminProductRequest request
    ) {
        return ResponseEntity.status(HttpStatus.CREATED).body(adminService.createProduct(request));
    }

    @PutMapping("/products/{id}")
    @Operation(summary = "Update an existing catalog piece")
    public ResponseEntity<ProductResponse> updateProduct(
            @PathVariable Long id,
            @Valid @RequestBody AdminProductRequest request
    ) {
        return ResponseEntity.ok(adminService.updateProduct(id, request));
    }

    @DeleteMapping("/products/{id}")
    @Operation(summary = "Delete or archive a catalog piece")
    public ResponseEntity<Void> deleteProduct(@PathVariable Long id) {
        adminService.deleteProduct(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping(value = "/uploads/image", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(summary = "Upload product asset image via Cloudinary or development storage")
    public ResponseEntity<UploadImageResponse> uploadImage(@RequestParam("file") MultipartFile file) {
        return ResponseEntity.status(HttpStatus.CREATED).body(cloudinaryService.uploadImage(file));
    }
}
