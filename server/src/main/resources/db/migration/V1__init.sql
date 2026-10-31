-- ARC & FORM - Database Schema Migration V1
-- Production-ready relational schema with optimistic locking & audit timestamps

-- 1. Users table
CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'CUSTOMER',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_users_email UNIQUE (email)
);

-- 2. Categories table
CREATE TABLE IF NOT EXISTS categories (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL,
    CONSTRAINT uk_categories_slug UNIQUE (slug)
);

-- 3. Products table
CREATE TABLE IF NOT EXISTS products (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    price NUMERIC(10, 2) NOT NULL,
    stock INT NOT NULL DEFAULT 0,
    featured BOOLEAN NOT NULL DEFAULT FALSE,
    category_id BIGINT NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_products_slug UNIQUE (slug),
    CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE RESTRICT
);

-- 4. Product Sizes (Element Collection)
CREATE TABLE IF NOT EXISTS product_sizes (
    product_id BIGINT NOT NULL,
    size VARCHAR(50) NOT NULL,
    PRIMARY KEY (product_id, size),
    CONSTRAINT fk_product_sizes_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
);

-- 5. Product Images (Element Collection)
CREATE TABLE IF NOT EXISTS product_images (
    product_id BIGINT NOT NULL,
    image_url VARCHAR(1024) NOT NULL,
    display_order INT NOT NULL DEFAULT 0,
    PRIMARY KEY (product_id, image_url),
    CONSTRAINT fk_product_images_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
);

-- 6. Orders table
CREATE TABLE IF NOT EXISTS orders (
    id BIGSERIAL PRIMARY KEY,
    order_number VARCHAR(64) NOT NULL,
    user_id BIGINT,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    shipping_full_name VARCHAR(255) NOT NULL,
    shipping_address_line1 VARCHAR(255) NOT NULL,
    shipping_address_line2 VARCHAR(255),
    shipping_city VARCHAR(100) NOT NULL,
    shipping_state VARCHAR(100) NOT NULL,
    shipping_postal_code VARCHAR(50) NOT NULL,
    shipping_country VARCHAR(100) NOT NULL,
    total NUMERIC(10, 2) NOT NULL,
    tracking_number VARCHAR(100),
    stripe_session_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_orders_order_number UNIQUE (order_number),
    CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
);

-- 7. Order Items table
CREATE TABLE IF NOT EXISTS order_items (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL,
    product_id BIGINT,
    quantity INT NOT NULL,
    unit_price NUMERIC(10, 2) NOT NULL,
    product_name VARCHAR(255) NOT NULL,
    selected_size VARCHAR(50),
    CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
    CONSTRAINT fk_order_items_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE SET NULL
);

-- 8. Processed Stripe Events table for idempotency
CREATE TABLE IF NOT EXISTS processed_stripe_events (
    event_id VARCHAR(255) PRIMARY KEY,
    processed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_products_category_id ON products (category_id);
CREATE INDEX IF NOT EXISTS idx_products_featured ON products (featured);
CREATE INDEX IF NOT EXISTS idx_products_created_at ON products (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders (user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items (order_id);
