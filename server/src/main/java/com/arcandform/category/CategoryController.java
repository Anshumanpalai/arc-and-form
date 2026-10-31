package com.arcandform.category;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/categories")
@Tag(name = "Categories", description = "Product category browsing endpoints")
public class CategoryController {
    private final CategoryService categoryService;

    public CategoryController(CategoryService categoryService) {
        this.categoryService = categoryService;
    }

    @GetMapping
    @Operation(summary = "List all product categories ordered alphabetically")
    public ResponseEntity<Map<String, List<CategoryResponse>>> listCategories() {
        return ResponseEntity.ok(Map.of("categories", categoryService.getAllCategories()));
    }
}
