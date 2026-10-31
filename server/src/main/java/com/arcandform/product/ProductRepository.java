package com.arcandform.product;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ProductRepository extends JpaRepository<Product, Long>, JpaSpecificationExecutor<Product> {
    Optional<Product> findBySlug(String slug);

    boolean existsBySlug(String slug);

    @Query("SELECT p FROM Product p LEFT JOIN FETCH p.category LEFT JOIN FETCH p.images WHERE p.slug = :slug")
    Optional<Product> findBySlugWithDetails(@Param("slug") String slug);

    @Query("SELECT p FROM Product p LEFT JOIN FETCH p.category LEFT JOIN FETCH p.images WHERE p.id = :id")
    Optional<Product> findByIdWithDetails(@Param("id") Long id);

    @Modifying
    @Query("UPDATE Product p SET p.stock = p.stock - :quantity WHERE p.id = :id AND p.stock >= :quantity")
    int decrementStockConditionally(@Param("id") Long id, @Param("quantity") int quantity);

    List<Product> findByStockLessThanEqualOrderByStockAsc(int threshold);

    long countByStockLessThanEqual(int threshold);
}
