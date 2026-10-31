package com.arcandform.product;

import com.arcandform.category.CategoryResponse;
import com.arcandform.common.ResourceNotFoundException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ProductControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private ProductService productService;

    @Test
    @DisplayName("List Products: returns paginated catalog response")
    void listProducts_Success() throws Exception {
        ProductResponse prod = new ProductResponse(
                1L,
                "Heavyweight Cotton Tee",
                "heavyweight-cotton-tee",
                "Description",
                new BigDecimal("48.00"),
                10,
                true,
                new CategoryResponse(1L, "Essentials", "essentials"),
                List.of("M", "L"),
                List.of("https://example.com/img.jpg"),
                Instant.now()
        );

        ProductListResponse.PaginationMeta pagination = new ProductListResponse.PaginationMeta(1, 12, 1, 1);
        ProductListResponse listResponse = new ProductListResponse(List.of(prod), pagination);

        when(productService.getProducts(any(), any(), anyString(), anyInt(), anyInt()))
                .thenReturn(listResponse);

        mockMvc.perform(get("/api/products"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.products[0].name").value("Heavyweight Cotton Tee"))
                .andExpect(jsonPath("$.products[0].slug").value("heavyweight-cotton-tee"))
                .andExpect(jsonPath("$.products[0].price").value(48.00))
                .andExpect(jsonPath("$.pagination.total").value(1));
    }

    @Test
    @DisplayName("Get By Slug: returns 200 with product details")
    void getBySlug_Found() throws Exception {
        ProductResponse prod = new ProductResponse(
                1L,
                "Heavyweight Cotton Tee",
                "heavyweight-cotton-tee",
                "Description",
                new BigDecimal("48.00"),
                10,
                true,
                new CategoryResponse(1L, "Essentials", "essentials"),
                List.of("M", "L"),
                List.of("https://example.com/img.jpg"),
                Instant.now()
        );

        when(productService.getProductBySlug("heavyweight-cotton-tee")).thenReturn(prod);

        mockMvc.perform(get("/api/products/heavyweight-cotton-tee"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.product.name").value("Heavyweight Cotton Tee"));
    }

    @Test
    @DisplayName("Get By Slug: returns 404 Not Found for non-existent piece")
    void getBySlug_NotFound() throws Exception {
        when(productService.getProductBySlug("non-existent-piece"))
                .thenThrow(new ResourceNotFoundException("Product not found with slug: non-existent-piece"));

        mockMvc.perform(get("/api/products/non-existent-piece"))
                .andExpect(status().isNotFound());
    }
}
