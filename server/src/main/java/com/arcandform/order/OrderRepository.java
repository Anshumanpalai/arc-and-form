package com.arcandform.order;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.util.Optional;

@Repository
public interface OrderRepository extends JpaRepository<Order, Long>, JpaSpecificationExecutor<Order> {
    Optional<Order> findByOrderNumber(String orderNumber);

    Optional<Order> findByStripeSessionId(String stripeSessionId);

    @Query("SELECT o FROM Order o LEFT JOIN FETCH o.items WHERE o.orderNumber = :orderNumber")
    Optional<Order> findByOrderNumberWithItems(@Param("orderNumber") String orderNumber);

    Page<Order> findByUserIdOrderByCreatedAtDesc(Long userId, Pageable pageable);

    @Query("SELECT o FROM Order o WHERE (:status IS NULL OR o.status = :status) AND (:query IS NULL OR LOWER(o.orderNumber) LIKE LOWER(CONCAT('%', :query, '%')) OR (o.user IS NOT NULL AND LOWER(o.user.email) LIKE LOWER(CONCAT('%', :query, '%'))))")
    Page<Order> findForAdmin(@Param("status") OrderStatus status, @Param("query") String query, Pageable pageable);

    @Query("SELECT COALESCE(SUM(o.total), 0) FROM Order o WHERE o.status = :status")
    BigDecimal sumTotalByStatus(@Param("status") OrderStatus status);

    @Query("SELECT COALESCE(SUM(o.total), 0) FROM Order o WHERE o.status IN :statuses")
    BigDecimal sumTotalByStatusIn(@Param("statuses") java.util.List<OrderStatus> statuses);

    long countByStatus(OrderStatus status);
}
