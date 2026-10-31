package com.arcandform.auth;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class RateLimiterService {
    private final Map<String, Bucket> buckets = new ConcurrentHashMap<>();

    @Value("${app.rate-limit.capacity:20}")
    private long capacity;

    @Value("${app.rate-limit.refill-tokens:20}")
    private long refillTokens;

    @Value("${app.rate-limit.refill-duration-seconds:60}")
    private long refillDurationSeconds;

    public boolean tryConsume(String key) {
        Bucket bucket = buckets.computeIfAbsent(key, k -> createNewBucket());
        return bucket.tryConsume(1);
    }

    private Bucket createNewBucket() {
        Bandwidth limit = Bandwidth.builder()
                .capacity(capacity)
                .refillGreedy(refillTokens, Duration.ofSeconds(refillDurationSeconds))
                .build();
        return Bucket.builder()
                .addLimit(limit)
                .build();
    }
}
