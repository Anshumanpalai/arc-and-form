package com.arcandform.admin;

import com.arcandform.admin.dto.AdminProductRequest;
import com.arcandform.admin.dto.AdminSummaryResponse;
import com.arcandform.category.CategoryResponse;
import com.arcandform.product.ProductResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AdminControllerSecurityTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockBean
    private AdminService adminService;

    @MockBean
    private CloudinaryService cloudinaryService;

    @Test
    @DisplayName("Admin Summary: rejects unauthenticated guest request with 401/403")
    void getSummary_Unauthenticated_Denied() throws Exception {
        mockMvc.perform(get("/api/admin/summary"))
                .andExpect(status().isForbidden());
    }

    @Test
    @WithMockUser(roles = "CUSTOMER")
    @DisplayName("Admin Summary: rejects customer role with 403 Forbidden")
    void getSummary_CustomerRole_Forbidden() throws Exception {
        mockMvc.perform(get("/api/admin/summary"))
                .andExpect(status().isForbidden());
    }

    @Test
    @WithMockUser(roles = "ADMIN")
    @DisplayName("Admin Summary: allows admin role with 200 OK")
    void getSummary_AdminRole_Allowed() throws Exception {
        AdminSummaryResponse summary = new AdminSummaryResponse(
                new BigDecimal("1200.00"),
                10L,
                2L,
                1L,
                List.of(),
                List.of()
        );
        when(adminService.getSummary()).thenReturn(summary);

        mockMvc.perform(get("/api/admin/summary"))
                .andExpect(status().isOk());
    }

    @Test
    @WithMockUser(roles = "CUSTOMER")
    @DisplayName("Create Product: customer role cannot create products (403 Forbidden)")
    void createProduct_CustomerRole_Forbidden() throws Exception {
        AdminProductRequest request = new AdminProductRequest(
                "Raw Selvedge Denim",
                "raw-selvedge-denim",
                "Description",
                new BigDecimal("120.00"),
                10,
                false,
                1L,
                List.of("32"),
                List.of("https://example.com/img.jpg")
        );

        mockMvc.perform(post("/api/admin/products")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isForbidden());
    }

    @Test
    @WithMockUser(roles = "ADMIN")
    @DisplayName("Create Product: admin role successfully creates product (201 Created)")
    void createProduct_AdminRole_Created() throws Exception {
        AdminProductRequest request = new AdminProductRequest(
                "Raw Selvedge Denim",
                "raw-selvedge-denim",
                "Description",
                new BigDecimal("120.00"),
                10,
                false,
                1L,
                List.of("32"),
                List.of("https://example.com/img.jpg")
        );

        ProductResponse response = new ProductResponse(
                1L,
                "Raw Selvedge Denim",
                "raw-selvedge-denim",
                "Description",
                new BigDecimal("120.00"),
                10,
                false,
                new CategoryResponse(1L, "Apparel", "apparel"),
                List.of("32"),
                List.of("https://example.com/img.jpg"),
                Instant.now()
        );

        when(adminService.createProduct(any(AdminProductRequest.class))).thenReturn(response);

        mockMvc.perform(post("/api/admin/products")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated());
    }
}
