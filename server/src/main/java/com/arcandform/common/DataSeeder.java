package com.arcandform.common;

import com.arcandform.category.Category;
import com.arcandform.category.CategoryRepository;
import com.arcandform.product.Product;
import com.arcandform.product.ProductRepository;
import com.arcandform.user.Role;
import com.arcandform.user.User;
import com.arcandform.user.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;

@Component
public class DataSeeder implements CommandLineRunner {
    private static final Logger log = LoggerFactory.getLogger(DataSeeder.class);

    private final CategoryRepository categoryRepository;
    private final ProductRepository productRepository;
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    @Value("${app.admin.seed-email:admin@arcandform.com}")
    private String adminEmail;

    @Value("${app.admin.seed-password:Admin@123!}")
    private String adminPassword;

    public DataSeeder(
            CategoryRepository categoryRepository,
            ProductRepository productRepository,
            UserRepository userRepository,
            PasswordEncoder passwordEncoder
    ) {
        this.categoryRepository = categoryRepository;
        this.productRepository = productRepository;
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    @Transactional
    public void run(String... args) {
        seedAdminUser();
        if (categoryRepository.count() == 0 && productRepository.count() == 0) {
            seedCatalog();
        }
    }

    private void seedAdminUser() {
        String normalizedEmail = adminEmail.toLowerCase().trim();
        if (!userRepository.existsByEmailIgnoreCase(normalizedEmail)) {
            User admin = new User(
                    normalizedEmail,
                    passwordEncoder.encode(adminPassword),
                    "Arc & Form Admin",
                    Role.ADMIN
            );
            userRepository.save(admin);
            log.info("Seeded initial administrator account: {}", normalizedEmail);
        }

        // Demo customer account
        String customerEmail = "customer@arcandform.com";
        if (!userRepository.existsByEmailIgnoreCase(customerEmail)) {
            User customer = new User(
                    customerEmail,
                    passwordEncoder.encode("Customer@123!"),
                    "Demo Customer",
                    Role.CUSTOMER
            );
            userRepository.save(customer);
            log.info("Seeded demo customer account: {}", customerEmail);
        }
    }

    private void seedCatalog() {
        log.info("Seeding ARC & FORM product catalog...");

        // 1. Categories
        Category essentials = categoryRepository.save(new Category("Essentials", "essentials"));
        Category outerwear = categoryRepository.save(new Category("Outerwear", "outerwear"));
        Category accessories = categoryRepository.save(new Category("Accessories", "accessories"));
        Category homeAndDesk = categoryRepository.save(new Category("Home & Desk", "home-and-desk"));

        // 2. Essentials (5 products)
        createProduct(
                "Heavyweight Organic Cotton Tee",
                "heavyweight-organic-cotton-tee",
                "Crafted from 280 GSM combed organic cotton. Features a bound ribbed collar, dropped shoulder seams, and a tailored relaxed drape.",
                new BigDecimal("42.00"),
                24,
                true,
                essentials,
                List.of("XS", "S", "M", "L", "XL"),
                List.of("https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=1200&q=80",
                        "https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?auto=format&fit=crop&w=1200&q=80")
        );

        createProduct(
                "Pima Crewneck Longsleeve",
                "pima-crewneck-longsleeve",
                "Peruvian long-staple pima cotton jersey with reinforced flatlock seams and ribbed cuffs. Exceptionally soft with low pilling.",
                new BigDecimal("54.00"),
                18,
                false,
                essentials,
                List.of("S", "M", "L", "XL"),
                List.of("https://images.unsplash.com/photo-1618354691373-d851c5c3a990?auto=format&fit=crop&w=1200&q=80")
        );

        createProduct(
                "Raw Selvedge Denim Trouser",
                "raw-selvedge-denim-trouser",
                "13.5 oz Japanese Kurabo selvedge denim in an unwashed deep indigo. Mid-rise straight cut finished with antique copper rivets.",
                new BigDecimal("135.00"),
                12,
                true,
                essentials,
                List.of("30", "32", "34", "36"),
                List.of("https://images.unsplash.com/photo-1541099649105-f69ad21f3246?auto=format&fit=crop&w=1200&q=80")
        );

        createProduct(
                "Mercerized Boxy Overshirt",
                "mercerized-boxy-overshirt",
                "High-density double-mercerized cotton poplin. Clean spread collar, concealed horn-button placket, and dual chest patch pockets.",
                new BigDecimal("88.00"),
                15,
                false,
                essentials,
                List.of("S", "M", "L"),
                List.of("https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&w=1200&q=80")
        );

        createProduct(
                "Minimal French Terry Sweatshirt",
                "minimal-french-terry-sweatshirt",
                "400 GSM brushed loopback French terry with architectural raglan sleeves, ribbed side gussets, and seamless tubular hem.",
                new BigDecimal("78.00"),
                3, // LOW STOCK
                false,
                essentials,
                List.of("S", "M", "L", "XL"),
                List.of("https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&w=1200&q=80")
        );

        // 3. Outerwear (5 products)
        createProduct(
                "Structured Twill Trench",
                "structured-twill-trench",
                "Weather-resistant compact cotton-nylon twill with storm flap, storm collar latch, and genuine buffalo horn buckles.",
                new BigDecimal("148.00"),
                8,
                true,
                outerwear,
                List.of("38", "40", "42"),
                List.of("https://images.unsplash.com/photo-1544441893-675973e31985?auto=format&fit=crop&w=1200&q=80")
        );

        createProduct(
                "Boiled Wool Chore Jacket",
                "boiled-wool-chore-jacket",
                "100% Austrian boiled virgin wool. Unlined for natural thermal regulation with three external patch pockets and horn buttons.",
                new BigDecimal("142.00"),
                2, // LOW STOCK
                true,
                outerwear,
                List.of("S", "M", "L"),
                List.of("https://images.unsplash.com/photo-1591047139829-d91aecb6caea?auto=format&fit=crop&w=1200&q=80")
        );

        createProduct(
                "Technical Shell Parka",
                "technical-shell-parka",
                "Three-layer laminated recycled nylon membrane with taped seams, internal storm skirt, and waterproof matte YKK AquaGuard zips.",
                new BigDecimal("150.00"),
                0, // OUT OF STOCK
                false,
                outerwear,
                List.of("S", "M", "L"),
                List.of("https://images.unsplash.com/photo-1548883354-7622d03aca27?auto=format&fit=crop&w=1200&q=80")
        );

        createProduct(
                "Quilted Ripstop Overshirt",
                "quilted-ripstop-overshirt",
                "Diamond-quilted matte micro-ripstop insulated with 60 GSM recycled PrimaLoft Gold. Lightweight, water-repellent, and packable.",
                new BigDecimal("115.00"),
                14,
                false,
                outerwear,
                List.of("S", "M", "L", "XL"),
                List.of("https://images.unsplash.com/photo-1578587018452-892bacefd3f2?auto=format&fit=crop&w=1200&q=80")
        );

        createProduct(
                "Canvas Workwear Blouson",
                "canvas-workwear-blouson",
                "Heavy 12 oz cotton duck canvas pre-washed for soft hand feel. Corduroy-faced collar and antique brass zip closure.",
                new BigDecimal("128.00"),
                9,
                false,
                outerwear,
                List.of("M", "L", "XL"),
                List.of("https://images.unsplash.com/photo-1509631179647-0177331693ae?auto=format&fit=crop&w=1200&q=80")
        );

        // 4. Accessories (5 products)
        createProduct(
                "Vegetable Tanned Leather Cardholder",
                "vegetable-tanned-leather-cardholder",
                "Full-grain Italian Tuscan vegetable-tanned leather. Features four card slots and central notes pocket with hand-burnished wax edges.",
                new BigDecimal("38.00"),
                35,
                true,
                accessories,
                List.of(),
                List.of("https://images.unsplash.com/photo-1627123424574-724758594e93?auto=format&fit=crop&w=1200&q=80")
        );

        createProduct(
                "Matte Titanium Key Carabiner",
                "matte-titanium-key-carabiner",
                "Machined grade-5 titanium alloy with sandblasted anodized finish and integrated stainless steel wire gate.",
                new BigDecimal("28.00"),
                40,
                false,
                accessories,
                List.of(),
                List.of("https://images.unsplash.com/photo-1608256246200-53e635b5b65f?auto=format&fit=crop&w=1200&q=80")
        );

        createProduct(
                "Minimalist Nylon Crossbody Pack",
                "minimalist-nylon-crossbody-pack",
                "Cordura 500D ballistic nylon shell with Fidlock magnetic V-buckle, waterproof zips, and an internal padded key leash.",
                new BigDecimal("64.00"),
                22,
                true,
                accessories,
                List.of(),
                List.of("https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=1200&q=80")
        );

        createProduct(
                "Merino Wool Ribbed Beanie",
                "merino-wool-ribbed-beanie",
                "Extra-fine 19.5 micron merino wool knitted in a compact 7-gauge 2x2 rib. Naturally temperature-regulating and itch-free.",
                new BigDecimal("34.00"),
                28,
                false,
                accessories,
                List.of("One Size"),
                List.of("https://images.unsplash.com/photo-1576871337632-b9aef4c17ab9?auto=format&fit=crop&w=1200&q=80")
        );

        createProduct(
                "Waxed Cotton Canvas Tote",
                "waxed-cotton-canvas-tote",
                "14 oz dry-waxed Scottish canvas with English bridle leather handles, solid copper rivets, and internal brass key clip.",
                new BigDecimal("48.00"),
                19,
                false,
                accessories,
                List.of(),
                List.of("https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=1200&q=80")
        );

        // 5. Home & Desk (5 products)
        createProduct(
                "Solid Walnut Desk Tray",
                "solid-walnut-desk-tray",
                "Milled from a single block of FSC-certified American black walnut. Finished with natural plant oils and matte beeswax.",
                new BigDecimal("52.00"),
                16,
                true,
                homeAndDesk,
                List.of(),
                List.of("https://images.unsplash.com/photo-1584992236310-6edddc08acff?auto=format&fit=crop&w=1200&q=80")
        );

        createProduct(
                "Cast Iron Incense Burner",
                "cast-iron-incense-burner",
                "Sand-cast raw iron with subtle tactile texture. Includes a solid brass dual-size incense holder insert.",
                new BigDecimal("36.00"),
                30,
                false,
                homeAndDesk,
                List.of(),
                List.of("https://images.unsplash.com/photo-1602874801007-bd458bb1b8b8?auto=format&fit=crop&w=1200&q=80")
        );

        createProduct(
                "Anodized Aluminum Pen Stand",
                "anodized-aluminum-pen-stand",
                "Precision CNC-machined aerospace aluminum block with a micro-bead blasted surface and non-slip silicone base.",
                new BigDecimal("24.00"),
                45,
                false,
                homeAndDesk,
                List.of(),
                List.of("https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?auto=format&fit=crop&w=1200&q=80")
        );

        createProduct(
                "Stoneware Ceramic Tumbler",
                "stoneware-ceramic-tumbler",
                "Wheel-thrown stoneware glazed in a matte oatmeal reactive mineral wash with an exposed raw clay grog foot.",
                new BigDecimal("22.00"),
                32,
                false,
                homeAndDesk,
                List.of(),
                List.of("https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=1200&q=80")
        );

        createProduct(
                "Linen Bound Grid Journal",
                "linen-bound-grid-journal",
                "192 pages of 100 GSM acid-free fountain pen-friendly paper. Bound in tactile Belgian bookcloth linen with silk ribbon.",
                new BigDecimal("26.00"),
                50,
                false,
                homeAndDesk,
                List.of(),
                List.of("https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=1200&q=80")
        );

        log.info("Finished seeding 20 products across 4 categories.");
    }

    private void createProduct(
            String name,
            String slug,
            String description,
            BigDecimal price,
            int stock,
            boolean featured,
            Category category,
            List<String> sizes,
            List<String> images
    ) {
        Product p = new Product();
        p.setName(name);
        p.setSlug(slug);
        p.setDescription(description);
        p.setPrice(price);
        p.setStock(stock);
        p.setFeatured(featured);
        p.setCategory(category);
        p.setSizes(sizes);
        p.setImages(images);
        productRepository.save(p);
    }
}
