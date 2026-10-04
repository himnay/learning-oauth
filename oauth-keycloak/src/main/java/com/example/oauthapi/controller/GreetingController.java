package com.example.oauthapi.controller;

import java.time.Instant;

import com.example.oauthapi.model.GreetingResponse;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class GreetingController {

    // Only reached when Spring Security has validated the JWT and the caller has ROLE_api-user.
    @GetMapping("/greeting")
    public GreetingResponse greeting(JwtAuthenticationToken authentication) {
        Jwt jwt = authentication.getToken();
        return new GreetingResponse(
                "Hello " + authentication.getName() + ", your token was validated by oauth-keycloak (Spring Security)",
                authentication.getName(),
                jwt.getClaimAsString("email"),
                jwt.getSubject(),
                authentication.getAuthorities().stream().map(GrantedAuthority::getAuthority).sorted().toList(),
                jwt.getAudience(),
                jwt.getIssuedAt(),
                jwt.getExpiresAt(),
                Instant.now());
    }
}
