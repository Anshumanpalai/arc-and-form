# Multi-stage Dockerfile for ARC & FORM Spring Boot API
# Stage 1: Build the application with Maven
FROM eclipse-temurin:21-jdk-alpine AS builder
WORKDIR /workspace

# Copy Maven wrapper and pom.xml first to take advantage of Docker layer caching
COPY mvnw pom.xml ./
COPY .mvn .mvn

# Download dependencies
RUN chmod +x ./mvnw && ./mvnw dependency:go-offline -B

# Copy application source code and compile
COPY src src
RUN ./mvnw clean package -DskipTests -B

# Stage 2: Lightweight production JRE runtime
FROM eclipse-temurin:21-jre-alpine AS runtime
WORKDIR /app

# Create unprivileged application user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy compiled JAR artifact from builder
COPY --from=builder /workspace/target/*.jar app.jar

# Set ownership
RUN chown -R appuser:appgroup /app
USER appuser

# Expose default HTTP port
EXPOSE 5000

# Container health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/health || exit 1

# Optimized container JVM parameters
ENV JAVA_TOOL_OPTIONS="-XX:+UseG1GC -XX:MaxRAMPercentage=75.0 -XX:+ExitOnOutOfMemoryError"

ENTRYPOINT ["java", "-jar", "app.jar"]
