package com.example.oauthapi.model;

import java.time.Instant;
import java.util.List;

public record GreetingResponse(
        String message,
        String username,
        String email,
        String subject,
        List<String> authorities,
        List<String> audience,
        Instant tokenIssuedAt,
        Instant tokenExpiresAt,
        Instant serverTime) {
}
